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

type AcademicStandard = {
  tingkatan: number
  theme_name: string
  bidang_code: string
  bidang_name: string
  standard_kandungan_code: string
  standard_kandungan_name: string
  standard_pembelajaran_code: string
  standard_pembelajaran_name: string
}

type Construct = {
  construct_group: string
  construct_code: string
  aspect_name: string
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

function buildPrompt(payload: any, standards: AcademicStandard[], constructs: Construct[]) {
  const standardCatalog = standards
    .map(
      (s) =>
        `T${s.tingkatan} | ${s.theme_name} | ${s.bidang_code} ${s.bidang_name} | SK ${s.standard_kandungan_code} ${s.standard_kandungan_name} | SP ${s.standard_pembelajaran_code} ${s.standard_pembelajaran_name}`,
    )
    .join("\n")

  const constructCatalog = constructs
    .map((c) => `${c.construct_code} | ${c.construct_group} | ${c.aspect_name}`)
    .join("\n")

  return `
Anda ialah pembantu import item Sains SPM KSSM 1511.
Tugas: pecahkan teks mentah kepada item objektif Kertas 1 dan cadangkan metadata akademik.

Konteks:
- Subjek: Sains KSSM SPM 1511
- Kertas: Kertas 1
- Fail import boleh mengandungi campuran soalan Tingkatan 4 dan Tingkatan 5.
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
- Tentukan tingkatan setiap soalan berdasarkan topik, istilah, DSKP dan konteks soalan.
- Jika topik sangat tidak jelas, pilih tingkatan paling hampir daripada katalog DSKP.
- Metadata akademik mesti dipilih daripada katalog DSKP yang diberi. Jangan reka kod baharu.
- Konstruk mesti dipilih daripada katalog konstruk yang diberi. Jangan reka kod baharu.
- Jika tidak pasti konstruk, gunakan konstruk paling hampir.
- Aras kesukaran mestilah "rendah", "sederhana" atau "tinggi".
- Proses semua item objektif lengkap yang wujud dalam batch teks ini.

Katalog DSKP:
${standardCatalog}

Katalog Konstruk:
${constructCatalog}

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
          metadata: {
            type: "object",
            additionalProperties: false,
            properties: {
              tingkatan: { type: "integer", enum: [4, 5] },
              theme_name: { type: "string" },
              bidang_learning_code: { type: "string" },
              bidang_learning_name: { type: "string" },
              standard_kandungan: { type: "string" },
              standard_pembelajaran: { type: "string" },
              main_construct: { type: "string" },
              construct_code: { type: "string" },
              difficulty_level: { type: "string", enum: ["rendah", "sederhana", "tinggi"] },
            },
            required: [
              "tingkatan",
              "theme_name",
              "bidang_learning_code",
              "bidang_learning_name",
              "standard_kandungan",
              "standard_pembelajaran",
              "main_construct",
              "construct_code",
              "difficulty_level",
            ],
          },
        },
        required: ["questionNo", "stem", "options", "answer", "imageRefs", "metadata"],
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

function normalizeText(value: unknown) {
  return String(value || "").trim()
}

function normalizeDifficulty(value: unknown) {
  const difficulty = normalizeText(value).toLowerCase()
  return ["rendah", "sederhana", "tinggi"].includes(difficulty) ? difficulty : "sederhana"
}

function normalizeTingkatan(value: unknown) {
  const tingkatan = Number(value)
  if (tingkatan === 4 || tingkatan === 5) return tingkatan
  return 4
}

function findBestStandard(metadata: any, standards: AcademicStandard[]) {
  const spCode = normalizeText(metadata.standard_pembelajaran)
  const skCode = normalizeText(metadata.standard_kandungan)
  const bidangCode = normalizeText(metadata.bidang_learning_code)
  const themeName = normalizeText(metadata.theme_name).toLowerCase()
  const tingkatan = normalizeTingkatan(metadata.tingkatan)

  return (
    standards.find((row) => row.standard_pembelajaran_code === spCode) ||
    standards.find((row) => row.tingkatan === tingkatan && row.standard_kandungan_code === skCode) ||
    standards.find((row) => row.tingkatan === tingkatan && row.bidang_code === bidangCode) ||
    standards.find((row) => row.tingkatan === tingkatan && row.theme_name.toLowerCase() === themeName) ||
    standards.find((row) => row.tingkatan === tingkatan) ||
    standards[0]
  )
}

function findBestConstruct(metadata: any, constructs: Construct[]) {
  const constructCode = normalizeText(metadata.construct_code)
  const mainConstruct = normalizeText(metadata.main_construct).toLowerCase()

  return (
    constructs.find((row) => row.construct_code === constructCode) ||
    constructs.find((row) => row.construct_group.toLowerCase() === mainConstruct) ||
    constructs.find((row) => row.aspect_name.toLowerCase() === mainConstruct) ||
    constructs[0]
  )
}

function normalizeMetadata(
  metadata: any,
  standards: AcademicStandard[],
  constructs: Construct[],
) {
  const standard = findBestStandard(metadata, standards)
  const construct = findBestConstruct(metadata, constructs)

  return {
    tingkatan: standard?.tingkatan || normalizeTingkatan(metadata.tingkatan),
    theme_name: standard?.theme_name || normalizeText(metadata.theme_name),
    bidang_learning_code: standard?.bidang_code || normalizeText(metadata.bidang_learning_code),
    bidang_learning_name: standard?.bidang_name || normalizeText(metadata.bidang_learning_name),
    standard_kandungan: standard?.standard_kandungan_code || normalizeText(metadata.standard_kandungan),
    standard_kandungan_name: standard?.standard_kandungan_name || "",
    standard_pembelajaran: standard?.standard_pembelajaran_code || normalizeText(metadata.standard_pembelajaran),
    standard_pembelajaran_name: standard?.standard_pembelajaran_name || "",
    main_construct: construct?.construct_group || normalizeText(metadata.main_construct) || "Mengingat",
    construct_code: construct?.construct_code || normalizeText(metadata.construct_code),
    construct_aspect: construct?.aspect_name || "",
    difficulty_level: normalizeDifficulty(metadata.difficulty_level),
  }
}

async function callOpenAi(openAiKey: string, payload: any, standards: AcademicStandard[], constructs: Construct[]) {
  const requestBody = {
    model: "gpt-4o-mini",
    input: buildPrompt(payload, standards, constructs),
    max_output_tokens: 6000,
    temperature: 0.1,
    text: {
      format: {
        type: "json_schema",
        name: "bulk_import_items",
        strict: true,
        schema: itemSchema,
      },
    },
  }

  const openAiResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openAiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  })

  const openAiJson = await openAiResponse.json()
  if (!openAiResponse.ok) {
    console.error("OpenAI error", openAiJson)
    throw new Error("Gagal panggil OpenAI.")
  }

  const outputText =
    openAiJson.output_text ||
    openAiJson.output?.flatMap((item: any) => item.content || [])
      ?.map((content: any) => content.text || "")
      ?.join("\n")
      ?.trim()

  if (!outputText) throw new Error("AI tidak memulangkan output.")

  try {
    return {
      parsed: extractJson(outputText),
      tokensUsed: (openAiJson.usage?.input_tokens || 0) + (openAiJson.usage?.output_tokens || 0),
      usage: openAiJson.usage || null,
    }
  } catch (error) {
    console.error("Structured JSON parse failed, retrying loose JSON", error)
    return callOpenAiLoose(openAiKey, payload, standards, constructs, openAiJson.usage || null)
  }
}

async function callOpenAiLoose(
  openAiKey: string,
  payload: any,
  standards: AcademicStandard[],
  constructs: Construct[],
  firstUsage: any,
) {
  const openAiResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openAiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      input: `${buildPrompt(payload, standards, constructs)}

Pulangkan JSON sahaja dalam bentuk:
{"items":[{"questionNo":"","stem":"","options":{"A":"","B":"","C":"","D":""},"answer":"","imageRefs":[],"metadata":{"tingkatan":4,"theme_name":"","bidang_learning_code":"","bidang_learning_name":"","standard_kandungan":"","standard_pembelajaran":"","main_construct":"","construct_code":"","difficulty_level":"sederhana"}}]}
Jangan tambah markdown atau teks lain.`,
      max_output_tokens: 5000,
      temperature: 0,
    }),
  })

  const openAiJson = await openAiResponse.json()
  if (!openAiResponse.ok) {
    console.error("OpenAI loose retry error", openAiJson)
    throw new Error("Gagal panggil OpenAI.")
  }

  const outputText =
    openAiJson.output_text ||
    openAiJson.output?.flatMap((item: any) => item.content || [])
      ?.map((content: any) => content.text || "")
      ?.join("\n")
      ?.trim()

  if (!outputText) throw new Error("AI tidak memulangkan output.")

  const firstTokens = (firstUsage?.input_tokens || 0) + (firstUsage?.output_tokens || 0)
  const retryTokens = (openAiJson.usage?.input_tokens || 0) + (openAiJson.usage?.output_tokens || 0)

  return {
    parsed: extractJson(outputText),
    tokensUsed: firstTokens + retryTokens,
    usage: { firstAttempt: firstUsage, retry: openAiJson.usage || null },
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

    const { data: standards, error: standardsError } = await supabase
      .from("academic_standards")
      .select(`
        tingkatan,
        theme_name,
        bidang_code,
        bidang_name,
        standard_kandungan_code,
        standard_kandungan_name,
        standard_pembelajaran_code,
        standard_pembelajaran_name
      `)
      .order("tingkatan", { ascending: true })
      .order("standard_pembelajaran_code", { ascending: true })

    if (standardsError) throw standardsError

    const { data: constructs, error: constructsError } = await supabase
      .from("constructs")
      .select("construct_group, construct_code, aspect_name")
      .order("construct_code", { ascending: true })

    if (constructsError) throw constructsError

    const standardRows = ((standards || []) as AcademicStandard[])
    const constructRows = ((constructs || []) as Construct[])
    const batchResult = await callOpenAi(openAiKey, payload, standardRows, constructRows)
    const items = Array.isArray(batchResult.parsed.items) ? batchResult.parsed.items : []
    const normalized = items
      .filter((item: any) => item?.stem && item?.options)
      .map((item: any) => {
        const metadata = normalizeMetadata(item.metadata || {}, standardRows, constructRows)
        return {
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
          metadata,
        }
      })

    await supabase.from("ai_usage_logs").insert({
      profile_id: profile.id,
      usage_type: Number(payload.batchIndex || 0) === 0 ? "bulk_import_parse" : "bulk_import_parse_batch",
      input_snapshot: {
        languageMode: payload.languageMode || "bm_only",
        batchIndex: Number(payload.batchIndex || 0),
        batchCount: Number(payload.batchCount || 1),
        textLength: String(payload.rawText).length,
      },
      output_snapshot: { itemCount: normalized.length, model: "gpt-4o-mini", usage: batchResult.usage },
      tokens_used: batchResult.tokensUsed || null,
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
