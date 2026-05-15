import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

type Profile = {
  id: string
  role: "master_admin" | "admin" | "user"
  account_type: "free" | "full"
  status: "active" | "pending" | "suspended"
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  })
}

function startOfMonthIso() {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
}

function buildPrompt(payload: any) {
  return `
Anda ialah penterjemah profesional untuk item peperiksaan Sains SPM KSSM 1511.

Tugas:
- Tambah terjemahan Bahasa Inggeris hanya untuk ayat/perenggan Bahasa Melayu yang belum mempunyai terjemahan BI.
- Terjemahkan juga skema jawapan/panduan pemarkahan pada medan answerSchemeText, termasuk answerSchemeText di dalam setiap sub-soalan.
- Wajib semak dan pulangkan SEMUA item dalam array subQuestions satu demi satu. Jangan abaikan (a)(i), (a)(ii), (a)(iii), atau sub-soalan kecil walaupun stem utama sudah dwi bahasa.
- Untuk setiap subQuestions[n].questionText yang hanya Bahasa Melayu, tambah terjemahan Bahasa Inggeris terus di bawah teks asal.
- Untuk setiap subQuestions[n].answerSchemeText yang hanya Bahasa Melayu, tambah terjemahan Bahasa Inggeris terus di bawah skema asal.
- Jangan ubah maksud, nombor soalan, label pilihan, markah, formula, simbol, kod imej, tag <img>, jadual HTML, atau struktur item.
- Jika ayat sudah dwi bahasa, biarkan seperti asal.
- Jika kandungan ialah HTML, kekalkan HTML dan tambah terjemahan BI sebagai perenggan baharu terus selepas perenggan BM asal.
- Jika kandungan ialah teks biasa, kekalkan teks BM dan tambah terjemahan BI pada baris seterusnya.
- Untuk terjemahan BI, gunakan italic HTML jika sesuai: <em>English translation</em>.
- Jangan terjemah istilah label seperti A, B, C, D, (a), (i), Rajah 1, Jadual 1, [IMAGE_1].
- Jangan kosongkan mana-mana answerSchemeText asal.
- Output mesti JSON sah sahaja. Jangan tambah markdown.

Pulangkan JSON dalam bentuk:
{
  "item": {
    "stemText": "...",
    "answerSchemeText": "...",
    "explanationText": "...",
    "options": [{ "label": "A", "text": "..." }],
    "subQuestions": [{ "id": "...", "label": "a", "subLabel": "i", "questionText": "...", "answerSchemeText": "..." }]
  },
  "notes": []
}

Konteks:
Subjek: ${payload.subject || "Sains KSSM SPM 1511"}
Kertas: ${payload.paper || "-"}
Bahagian: ${payload.section || "-"}
Tingkatan: ${payload.tingkatan || "-"}

Data item:
${JSON.stringify(payload.item || {}, null, 2)}
`.trim()
}

function extractOutputText(openAiJson: any) {
  return (
    openAiJson.output_text ||
    openAiJson.output
      ?.flatMap((item: any) => item.content || [])
      ?.map((content: any) => content.text || "")
      ?.join("\n")
      ?.trim() ||
    ""
  )
}

function parseJsonOutput(text: string) {
  const trimmed = text.trim()
  try {
    return JSON.parse(trimmed)
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/)
    if (!match) throw new Error("AI tidak memulangkan JSON yang sah.")
    return JSON.parse(match[0])
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405)
  }

  try {
    const openAiKey = Deno.env.get("OPENAI_API_KEY")
    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

    if (!openAiKey) throw new Error("OPENAI_API_KEY belum diset pada Edge Function secrets.")
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY belum diset.")
    }

    const authHeader = req.headers.get("Authorization") || ""
    const token = authHeader.replace("Bearer ", "")
    if (!token) return jsonResponse({ error: "Unauthorized" }, 401)

    const supabase = createClient(supabaseUrl, serviceRoleKey)
    const { data: userData, error: userError } = await supabase.auth.getUser(token)
    if (userError || !userData.user) return jsonResponse({ error: "Unauthorized" }, 401)

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, role, status, account_type")
      .eq("id", userData.user.id)
      .single<Profile>()

    if (profileError || !profile) return jsonResponse({ error: "Profil pengguna tidak dijumpai." }, 403)
    if (profile.status !== "active") return jsonResponse({ error: "Akaun belum aktif." }, 403)
    if (profile.role === "user" && profile.account_type !== "full") {
      return jsonResponse({ error: "Fungsi terjemah BI hanya untuk admin dan pengguna premium." }, 403)
    }

    const isUnlimited = profile.role === "master_admin"
    const monthlyLimit = 30

    if (!isUnlimited) {
      const { count, error: countError } = await supabase
        .from("ai_usage_logs")
        .select("id", { count: "exact", head: true })
        .eq("profile_id", profile.id)
        .in("usage_type", ["generate_marking_scheme", "translate_item_bilingual"])
        .gte("created_at", startOfMonthIso())

      if (countError) throw countError
      if ((count || 0) >= monthlyLimit) {
        return jsonResponse({ error: "Kuota AI bulan ini telah habis." }, 429)
      }
    }

    const payload = await req.json()
    const prompt = buildPrompt(payload)

    const openAiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        input: prompt,
        max_output_tokens: 7000,
        temperature: 0.1,
      }),
    })

    const openAiJson = await openAiResponse.json()

    if (!openAiResponse.ok) {
      console.error("OpenAI error", openAiJson)
      return jsonResponse({ error: "Gagal panggil OpenAI." }, 502)
    }

    const outputText = extractOutputText(openAiJson)
    if (!outputText) return jsonResponse({ error: "OpenAI tidak memulangkan terjemahan." }, 502)

    const translated = parseJsonOutput(outputText)
    if (!translated?.item) return jsonResponse({ error: "Format terjemahan AI tidak lengkap." }, 502)

    const tokensUsed =
      (openAiJson.usage?.input_tokens || 0) +
      (openAiJson.usage?.output_tokens || 0)

    await supabase.from("ai_usage_logs").insert({
      profile_id: profile.id,
      usage_type: "translate_item_bilingual",
      input_snapshot: payload,
      output_snapshot: {
        model: "gpt-4o-mini",
        usage: openAiJson.usage || null,
        notes: translated.notes || [],
      },
      tokens_used: tokensUsed || null,
    })

    let quota = null
    if (isUnlimited) {
      quota = { unlimited: true, remainingText: "Terjemahan BI diisi. Kuota master admin tidak terhad." }
    } else {
      const { count } = await supabase
        .from("ai_usage_logs")
        .select("id", { count: "exact", head: true })
        .eq("profile_id", profile.id)
        .in("usage_type", ["generate_marking_scheme", "translate_item_bilingual"])
        .gte("created_at", startOfMonthIso())

      const used = count || 0
      quota = {
        unlimited: false,
        limit: monthlyLimit,
        used,
        remaining: Math.max(monthlyLimit - used, 0),
        remainingText: `Terjemahan BI diisi. Baki kuota AI bulan ini: ${Math.max(monthlyLimit - used, 0)}.`,
      }
    }

    return jsonResponse({ ...translated, quota })
  } catch (error) {
    console.error(error)
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Ralat tidak dijangka." },
      500,
    )
  }
})
