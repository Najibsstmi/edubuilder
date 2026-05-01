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
Anda ialah pembantu pembinaan item Sains SPM KSSM 1511.
Tugas: jana cadangan jawapan ringkas untuk satu sub-soalan sahaja.

Peraturan:
- Jawab dalam Bahasa Melayu.
- Beri jawapan yang sesuai dengan markah.
- Jangan tulis penerangan panjang.
- Jangan cipta nombor soalan baharu.
- Jangan masukkan markah dalam jawapan.
- Jika ada beberapa jawapan alternatif yang lazim diterima, pisahkan dengan " / ".
- Output mestilah jawapan sahaja, tanpa bullet dan tanpa pendahuluan.

Konteks item:
Tingkatan: ${payload.tingkatan}
Kertas: ${payload.paper}
Bahagian: ${payload.section || "-"}
Tema: ${payload.dskp?.theme_name || "-"}
Bidang: ${payload.dskp?.bidang_code || "-"} ${payload.dskp?.bidang_name || ""}
Standard Kandungan: ${payload.dskp?.standard_kandungan || "-"}
Standard Pembelajaran: ${payload.dskp?.standard_pembelajaran || "-"}

Stem utama:
${payload.stemText || "-"}

Sub-soalan:
${payload.subQuestion?.label || "-"} ${payload.subQuestion?.questionText || "-"}

Konstruk: ${payload.subQuestion?.mainConstruct || "-"}
Kod konstruk: ${payload.subQuestion?.constructCode || "-"}
Aras: ${payload.subQuestion?.difficultyLevel || "-"}
Markah: ${payload.subQuestion?.marks || 1}
Jenis respons: ${payload.subQuestion?.responseType || "-"}
`.trim()
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
      .select("id, role, status")
      .eq("id", userData.user.id)
      .single<Profile>()

    if (profileError || !profile) return jsonResponse({ error: "Profil pengguna tidak dijumpai." }, 403)
    if (profile.status !== "active") return jsonResponse({ error: "Akaun belum aktif." }, 403)
    if (profile.role === "user") return jsonResponse({ error: "User tidak mempunyai akses jana AI." }, 403)

    const isUnlimited = profile.role === "master_admin"
    const monthlyLimit = 30

    if (!isUnlimited) {
      const { count, error: countError } = await supabase
        .from("ai_usage_logs")
        .select("id", { count: "exact", head: true })
        .eq("profile_id", profile.id)
        .eq("usage_type", "generate_marking_scheme")
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
        max_output_tokens: 220,
        temperature: 0.2,
      }),
    })

    const openAiJson = await openAiResponse.json()

    if (!openAiResponse.ok) {
      console.error("OpenAI error", openAiJson)
      return jsonResponse({ error: "Gagal panggil OpenAI." }, 502)
    }

    const answer =
      openAiJson.output_text ||
      openAiJson.output?.flatMap((item: any) => item.content || [])
        ?.map((content: any) => content.text || "")
        ?.join("\n")
        ?.trim()

    if (!answer) return jsonResponse({ error: "OpenAI tidak memulangkan jawapan." }, 502)

    const tokensUsed =
      (openAiJson.usage?.input_tokens || 0) +
      (openAiJson.usage?.output_tokens || 0)

    await supabase.from("ai_usage_logs").insert({
      profile_id: profile.id,
      usage_type: "generate_marking_scheme",
      input_snapshot: payload,
      output_snapshot: {
        answer,
        model: "gpt-4o-mini",
        usage: openAiJson.usage || null,
      },
      tokens_used: tokensUsed || null,
    })

    let quota = null
    if (isUnlimited) {
      quota = { unlimited: true, remainingText: "Cadangan jawapan AI diisi. Kuota master admin tidak terhad." }
    } else {
      const { count } = await supabase
        .from("ai_usage_logs")
        .select("id", { count: "exact", head: true })
        .eq("profile_id", profile.id)
        .eq("usage_type", "generate_marking_scheme")
        .gte("created_at", startOfMonthIso())

      const used = count || 0
      quota = {
        unlimited: false,
        limit: monthlyLimit,
        used,
        remaining: Math.max(monthlyLimit - used, 0),
        remainingText: `Cadangan jawapan AI diisi. Baki kuota bulan ini: ${Math.max(monthlyLimit - used, 0)}.`,
      }
    }

    return jsonResponse({ answer, quota })
  } catch (error) {
    console.error(error)
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Ralat tidak dijangka." },
      500,
    )
  }
})
