import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

type Profile = {
  id: string
  role: "master_admin" | "admin" | "user"
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
Anda ialah pembantu import item Sains SPM KSSM 1511.
Tugas: pecahkan teks mentah kepada item objektif Kertas 1.

Konteks:
- Subjek: Sains KSSM SPM 1511
- Kertas: Kertas 1
- Tingkatan sasaran: ${payload.tingkatan || "-"}
- Tetapan bahasa: ${payload.languageMode === "bm_only" ? "Bahasa Melayu sahaja" : "Kekalkan Bahasa Melayu dan Bahasa Inggeris"}

Peraturan penting:
- Jangan tambah penerangan luar JSON.
- Ambil hanya soalan objektif yang mempunyai pilihan A, B, C dan D.
- Jika jawapan betul tidak jelas, letakkan "answer": "".
- Kekalkan teks asal soalan sebanyak mungkin.
- Jangan reka fakta baharu.
- Jika ada nombor soalan, simpan dalam "questionNo".
- Jika tetapan bahasa ialah "Bahasa Melayu sahaja", buang ayat terjemahan Bahasa Inggeris yang mengulangi maksud ayat Bahasa Melayu dalam stem dan pilihan jawapan.
- Jika tetapan bahasa ialah "Kekalkan Bahasa Melayu dan Bahasa Inggeris", kekalkan bilingual BM/BI dalam stem dan pilihan jawapan.
- Jangan buang istilah, simbol, label rajah, unit, nama bahan atau perkataan Inggeris yang memang sebahagian kandungan sains.
- Jika terdapat marker gambar seperti [IMAGE_1], [IMAGE_2], masukkan marker berkaitan dalam array "imageRefs".
- Padankan marker gambar kepada soalan paling hampir berdasarkan kedudukan marker dalam teks.
- Jangan masukkan metadata akademik jika tidak pasti.
- Jika dokumen terlalu panjang, ambil maksimum 30 item pertama yang lengkap sahaja.

Teks mentah:
${payload.rawText || ""}
`.trim()
}

const itemSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          questionNo: { type: "string" },
          stem: { type: "string" },
          options: {
            type: "object",
            additionalProperties: false,
            properties: {
              A: { type: "string" },
              B: { type: "string" },
              C: { type: "string" },
              D: { type: "string" },
            },
            required: ["A", "B", "C", "D"],
          },
          answer: {
            type: "string",
            enum: ["", "A", "B", "C", "D"],
          },
          imageRefs: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["questionNo", "stem", "options", "answer", "imageRefs"],
      },
    },
  },
  required: ["items"],
}

function extractJson(text: string) {
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim()

  try {
    return JSON.parse(cleaned)
  } catch (_error) {
    const match = cleaned.match(/\{[\s\S]*\}/)
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
    if (!supabaseUrl || !serviceRoleKey) throw new Error("SUPABASE_URL atau SERVICE_ROLE belum diset.")

    const authHeader = req.headers.get("Authorization") || ""
    const token = authHeader.replace("Bearer ", "")
    if (!token) return jsonResponse({ error: "Unauthorized" }, 401)

    const supabase = createClient(supabaseUrl, serviceRoleKey)
    const { data: userData, error: userError } = await supabase.auth.getUser(token)
    if (userError || !userData.user) return jsonResponse({ error: "Unauthorized" }, 401)

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, role, status")
      .eq("id", userData.user.id)
      .single<Profile>()

    if (profileError || !profile) return jsonResponse({ error: "Profil pengguna tidak dijumpai." }, 403)
    if (profile.status !== "active") return jsonResponse({ error: "Akaun belum aktif." }, 403)
    if (profile.role === "user") return jsonResponse({ error: "User tidak mempunyai akses import AI." }, 403)

    const isUnlimited = profile.role === "master_admin"
    const monthlyLimit = 30

    if (!isUnlimited) {
      const { count, error: countError } = await supabase
        .from("ai_usage_logs")
        .select("id", { count: "exact", head: true })
        .eq("profile_id", profile.id)
        .eq("usage_type", "bulk_import_parse")
        .gte("created_at", startOfMonthIso())

      if (countError) throw countError
      if ((count || 0) >= monthlyLimit) {
        return jsonResponse({ error: "Kuota import AI bulan ini telah habis." }, 429)
      }
    }

    const payload = await req.json()
    if (!payload.rawText || String(payload.rawText).trim().length < 40) {
      return jsonResponse({ error: "Teks terlalu pendek untuk diproses." }, 400)
    }

    const openAiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        input: buildPrompt(payload),
        max_output_tokens: 8000,
        temperature: 0.1,
        text: {
          format: {
            type: "json_schema",
            name: "bulk_import_items",
            strict: true,
            schema: itemSchema,
          },
        },
      }),
    })

    const openAiJson = await openAiResponse.json()
    if (!openAiResponse.ok) {
      console.error("OpenAI error", openAiJson)
      return jsonResponse({ error: "Gagal panggil OpenAI." }, 502)
    }

    const outputText =
      openAiJson.output_text ||
      openAiJson.output?.flatMap((item: any) => item.content || [])
        ?.map((content: any) => content.text || "")
        ?.join("\n")
        ?.trim()

    if (!outputText) return jsonResponse({ error: "AI tidak memulangkan output." }, 502)

    const parsed = extractJson(outputText)
    const items = Array.isArray(parsed.items) ? parsed.items : []
    const normalized = items
      .filter((item: any) => item?.stem && item?.options)
      .map((item: any) => ({
        questionNo: String(item.questionNo || ""),
        stem: String(item.stem || "").trim(),
        options: {
          A: String(item.options?.A || "").trim(),
          B: String(item.options?.B || "").trim(),
          C: String(item.options?.C || "").trim(),
          D: String(item.options?.D || "").trim(),
        },
        answer: ["A", "B", "C", "D"].includes(String(item.answer || "").toUpperCase())
          ? String(item.answer || "").toUpperCase()
          : "",
        imageRefs: Array.isArray(item.imageRefs)
          ? item.imageRefs
              .map((ref: unknown) => String(ref || "").replace(/[\[\]]/g, "").trim())
              .filter((ref: string) => /^IMAGE_\d+$/i.test(ref))
          : [],
      }))

    const tokensUsed =
      (openAiJson.usage?.input_tokens || 0) +
      (openAiJson.usage?.output_tokens || 0)

    await supabase.from("ai_usage_logs").insert({
      profile_id: profile.id,
      usage_type: "bulk_import_parse",
      input_snapshot: {
        tingkatan: payload.tingkatan,
        languageMode: payload.languageMode || "bm_only",
        textLength: String(payload.rawText).length,
      },
      output_snapshot: { itemCount: normalized.length, model: "gpt-4o-mini", usage: openAiJson.usage || null },
      tokens_used: tokensUsed || null,
    })

    return jsonResponse({
      items: normalized,
      quota: isUnlimited
        ? { unlimited: true, remainingText: "Import AI berjaya. Kuota master admin tidak terhad." }
        : { unlimited: false, remainingText: "Import AI berjaya. Sila semak draft sebelum import." },
    })
  } catch (error) {
    console.error(error)
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Ralat tidak dijangka." },
      500,
    )
  }
})
