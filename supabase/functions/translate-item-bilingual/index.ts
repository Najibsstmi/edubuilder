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

type TranslationUnit = {
  id: string
  label: string
  kind: "stem" | "answer_scheme" | "explanation" | "option" | "sub_question"
  format: "html" | "text"
  text: string
}

function buildUnitPrompt(payload: any, units: TranslationUnit[], mode: "all" | "answer_scheme_retry" = "all") {
  return `
Anda ialah penterjemah profesional untuk item peperiksaan Sains SPM KSSM 1511.

Tugas:
- Terjemahkan SETIAP unit teks yang diberi di bawah. Jangan abaikan unit sub-soalan atau skema jawapan.
- Bilangan objek dalam output units mesti sama dengan input units, dan setiap id input mesti dipulangkan.
- Tambah terjemahan Bahasa Inggeris hanya untuk ayat/perenggan Bahasa Melayu yang belum mempunyai terjemahan BI.
- Untuk unit subQuestions[n].questionText, tambah terjemahan Bahasa Inggeris terus di bawah teks soalan asal.
- Untuk unit subQuestions[n].answerSchemeText, tambah terjemahan Bahasa Inggeris terus di bawah skema asal.
- Untuk unit kind="answer_scheme", terjemahkan juga frasa pendek, kata kunci, jawapan alternatif, dan poin pemarkahan yang dipisahkan dengan //, /, koma, atau baris baharu.
- Untuk kind="answer_scheme", JANGAN pulangkan teks yang sama jika teks asal belum ada terjemahan Inggeris yang jelas. Kekalkan teks BM dan tambah baris BI di bawahnya.
- Jika unit sudah dwi bahasa, pulangkan teks asal tanpa perubahan.
- Jika format ialah "html", kekalkan HTML dan tambah terjemahan BI sebagai perenggan baharu terus selepas perenggan BM asal.
- Jika format ialah "text", kekalkan teks BM dan tambah terjemahan BI pada baris seterusnya.
- Untuk terjemahan BI, gunakan italic HTML jika unit HTML: <em>English translation</em>. Untuk unit text, tidak perlu tag HTML.
- Jangan ubah maksud, nombor soalan, label pilihan, markah, formula, simbol, kod imej, tag <img>, jadual HTML, atau struktur item.
- Jangan terjemah istilah label seperti A, B, C, D, (a), (i), Rajah 1, Jadual 1, [IMAGE_1].
- Jangan kosongkan mana-mana unit. Jika tidak pasti, pulangkan teks asal.
- Output mesti JSON sah sahaja. Jangan tambah markdown.

Pulangkan JSON dalam bentuk:
{
  "units": [{ "id": "stemText", "text": "..." }],
  "notes": []
}

Contoh kind="answer_scheme":
Input: kehadiran tompok hitam// Pertumbuhan mikroorganisma/kulat/mukor
Output: kehadiran tompok hitam// Pertumbuhan mikroorganisma/kulat/mukor
Presence of black spots // Growth of microorganisms/fungi/mucor

Input: Membekalkan nutrien (yang mencukupi kepada pertumbuhan mikroorganisma)
Output: Membekalkan nutrien (yang mencukupi kepada pertumbuhan mikroorganisma)
Provides nutrients (sufficient for the growth of microorganisms)

Mod semasa: ${mode}

Konteks:
Subjek: ${payload.subject || "Sains KSSM SPM 1511"}
Kertas: ${payload.paper || "-"}
Bahagian: ${payload.section || "-"}
Tingkatan: ${payload.tingkatan || "-"}

Unit teks untuk diterjemah:
${JSON.stringify(units, null, 2)}
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

function readText(source: any, keys: string[]) {
  for (const key of keys) {
    const value = source?.[key]
    if (typeof value === "string") return value
  }
  return undefined
}

function readArray(source: any, keys: string[]) {
  for (const key of keys) {
    const value = source?.[key]
    if (Array.isArray(value)) return value
  }
  return []
}

function normalizeQuestionPart(value: unknown) {
  return String(value || "")
    .trim()
    .replace(/[()]/g, "")
    .toLowerCase()
}

function findTranslatedByQuestionPart(translatedItems: any[], original: any, index: number) {
  const byId = translatedItems.find((item) => item?.id && original?.id && String(item.id) === String(original.id))
  if (byId) return byId

  const originalKey = `${normalizeQuestionPart(original?.label)}::${normalizeQuestionPart(original?.subLabel ?? original?.sub_label)}`
  const byLabel = translatedItems.find((item) => {
    const label = item?.label ?? item?.question_label
    const subLabel = item?.subLabel ?? item?.sub_label ?? item?.question_sub_label
    return `${normalizeQuestionPart(label)}::${normalizeQuestionPart(subLabel)}` === originalKey
  })

  return byLabel || translatedItems[index]
}

function normalizeTranslatedItem(rawItem: any, originalItem: any) {
  const originalOptions = readArray(originalItem, ["options", "item_options"])
  const rawOptions = readArray(rawItem, ["options", "item_options"])
  const options = (originalOptions.length > 0 ? originalOptions : rawOptions).map((option: any, index: number) => {
    const translated =
      rawOptions.find(
        (item: any) =>
          normalizeQuestionPart(item?.label ?? item?.option_label) ===
          normalizeQuestionPart(option?.label ?? option?.option_label),
      ) || rawOptions[index]

    return {
      label: option?.label ?? option?.option_label ?? translated?.label ?? translated?.option_label ?? "",
      text:
        readText(translated, ["text", "option_text"]) ??
        readText(option, ["text", "option_text"]) ??
        "",
    }
  })

  const originalSubs = readArray(originalItem, ["subQuestions", "sub_questions", "item_subquestions"])
  const rawSubs = readArray(rawItem, ["subQuestions", "sub_questions", "item_subquestions"])
  const subQuestions = (originalSubs.length > 0 ? originalSubs : rawSubs).map((subQuestion: any, index: number) => {
    const translated = findTranslatedByQuestionPart(rawSubs, subQuestion, index)

    return {
      id: subQuestion?.id ?? translated?.id ?? "",
      label: subQuestion?.label ?? translated?.label ?? "",
      subLabel:
        subQuestion?.subLabel ??
        subQuestion?.sub_label ??
        translated?.subLabel ??
        translated?.sub_label ??
        "",
      questionText:
        readText(translated, ["questionText", "question_text", "text"]) ??
        readText(subQuestion, ["questionText", "question_text", "text"]) ??
        "",
      answerSchemeText:
        readText(translated, ["answerSchemeText", "answer_scheme_text", "scheme"]) ??
        readText(subQuestion, ["answerSchemeText", "answer_scheme_text", "scheme"]) ??
        "",
    }
  })

  return {
    stemText:
      readText(rawItem, ["stemText", "stem_text", "stem"]) ??
      readText(originalItem, ["stemText", "stem_text", "stem"]) ??
      "",
    answerSchemeText:
      readText(rawItem, ["answerSchemeText", "answer_scheme_text", "scheme"]) ??
      readText(originalItem, ["answerSchemeText", "answer_scheme_text", "scheme"]) ??
      "",
    explanationText:
      readText(rawItem, ["explanationText", "explanation_text", "explanation"]) ??
      readText(originalItem, ["explanationText", "explanation_text", "explanation"]) ??
      "",
    options,
    subQuestions,
  }
}

function stripToPlainText(value: string) {
  return String(value || "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
}

function hasMeaningfulText(value: unknown) {
  const plain = stripToPlainText(String(value || ""))
  return Boolean(plain && plain !== "-")
}

function detectFormat(value: string): "html" | "text" {
  return /<\/?[a-z][\s\S]*>/i.test(value) ? "html" : "text"
}

function formatSubQuestionLabel(subQuestion: any, fallbackIndex: number) {
  const label = subQuestion?.label || String.fromCharCode(97 + fallbackIndex)
  const subLabel = subQuestion?.subLabel || subQuestion?.sub_label || ""
  return subLabel ? `(${label})(${subLabel})` : `(${label})`
}

function createTranslationUnits(item: any): TranslationUnit[] {
  const units: TranslationUnit[] = []

  const addUnit = (id: string, label: string, kind: TranslationUnit["kind"], value: unknown) => {
    const text = String(value || "")
    if (!hasMeaningfulText(text)) return

    units.push({
      id,
      label,
      kind,
      format: detectFormat(text),
      text,
    })
  }

  addUnit("stemText", "Stem soalan", "stem", item.stemText)
  addUnit("answerSchemeText", "Skema jawapan utama", "answer_scheme", item.answerSchemeText)
  addUnit("explanationText", "Penerangan / rasional", "explanation", item.explanationText)

  for (const [index, option] of (item.options || []).entries()) {
    addUnit(`options.${index}.text`, `Pilihan ${option?.label || index + 1}`, "option", option?.text)
  }

  for (const [index, subQuestion] of (item.subQuestions || []).entries()) {
    const label = formatSubQuestionLabel(subQuestion, index)
    addUnit(`subQuestions.${index}.questionText`, `Teks soalan ${label}`, "sub_question", subQuestion?.questionText)
    addUnit(
      `subQuestions.${index}.answerSchemeText`,
      `Skema jawapan ${label}`,
      "answer_scheme",
      subQuestion?.answerSchemeText,
    )
  }

  return units
}

function applyTranslatedUnits(originalItem: any, originalUnits: TranslationUnit[], translatedUnits: any[]) {
  const nextItem = JSON.parse(JSON.stringify(originalItem))
  const translatedById = new Map<string, string>()

  for (const unit of translatedUnits || []) {
    if (typeof unit?.id === "string" && typeof unit?.text === "string") {
      translatedById.set(unit.id, unit.text)
    }
  }

  for (const unit of originalUnits) {
    const translatedText = translatedById.get(unit.id)
    if (typeof translatedText !== "string" || !translatedText.trim()) continue

    if (unit.id === "stemText") {
      nextItem.stemText = translatedText
      continue
    }

    if (unit.id === "answerSchemeText") {
      nextItem.answerSchemeText = translatedText
      continue
    }

    if (unit.id === "explanationText") {
      nextItem.explanationText = translatedText
      continue
    }

    const optionMatch = unit.id.match(/^options\.(\d+)\.text$/)
    if (optionMatch) {
      const index = Number(optionMatch[1])
      if (nextItem.options?.[index]) nextItem.options[index].text = translatedText
      continue
    }

    const subQuestionMatch = unit.id.match(/^subQuestions\.(\d+)\.(questionText|answerSchemeText)$/)
    if (subQuestionMatch) {
      const index = Number(subQuestionMatch[1])
      const field = subQuestionMatch[2]
      if (nextItem.subQuestions?.[index]) nextItem.subQuestions[index][field] = translatedText
    }
  }

  return nextItem
}

function normalizeComparableText(value: string) {
  return stripToPlainText(value)
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}

function findUnitsStillUntranslated(originalUnits: TranslationUnit[], translatedUnits: any[]) {
  const translatedById = new Map<string, string>()

  for (const unit of translatedUnits || []) {
    if (typeof unit?.id === "string" && typeof unit?.text === "string") {
      translatedById.set(unit.id, unit.text)
    }
  }

  return originalUnits.filter((unit) => {
    if (unit.kind !== "answer_scheme") return false

    const translatedText = translatedById.get(unit.id)
    if (typeof translatedText !== "string" || !translatedText.trim()) return true

    return normalizeComparableText(translatedText) === normalizeComparableText(unit.text)
  })
}

async function translateUnits(
  openAiKey: string,
  payload: any,
  units: TranslationUnit[],
  mode: "all" | "answer_scheme_retry" = "all",
) {
  const openAiResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openAiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      input: buildUnitPrompt(payload, units, mode),
      max_output_tokens: 12000,
      temperature: 0.1,
    }),
  })

  const openAiJson = await openAiResponse.json()

  if (!openAiResponse.ok) {
    console.error("OpenAI error", openAiJson)
    throw Object.assign(new Error("Gagal panggil OpenAI."), { statusCode: 502 })
  }

  const outputText = extractOutputText(openAiJson)
  if (!outputText) {
    throw Object.assign(new Error("OpenAI tidak memulangkan terjemahan."), { statusCode: 502 })
  }

  const translated = parseJsonOutput(outputText)
  if (!Array.isArray(translated?.units)) {
    throw Object.assign(new Error("Format terjemahan AI tidak lengkap."), { statusCode: 502 })
  }

  return {
    units: translated.units,
    notes: Array.isArray(translated.notes) ? translated.notes : [],
    usage: openAiJson.usage || null,
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
    const normalizedOriginalItem = normalizeTranslatedItem({}, payload.item || {})
    const translationUnits = createTranslationUnits(normalizedOriginalItem)

    if (translationUnits.length === 0) {
      return jsonResponse({
        item: normalizedOriginalItem,
        notes: ["Tiada kandungan teks untuk diterjemah."],
        quota: { unlimited: isUnlimited, remainingText: "Tiada kandungan teks untuk diterjemah." },
      })
    }

    const firstTranslation = await translateUnits(openAiKey, payload, translationUnits)
    let translatedUnits = firstTranslation.units
    const notes = [...firstTranslation.notes]
    const usages = [firstTranslation.usage]

    const returnedUnitIds = new Set(
      translatedUnits
        .filter((unit: any) => typeof unit?.id === "string" && typeof unit?.text === "string")
        .map((unit: any) => unit.id),
    )
    const missingUnits = translationUnits.filter((unit) => !returnedUnitIds.has(unit.id))

    if (missingUnits.length > 0) {
      const retryTranslation = await translateUnits(openAiKey, payload, missingUnits)
      translatedUnits = [...translatedUnits, ...retryTranslation.units]
      notes.push(...retryTranslation.notes)
      usages.push(retryTranslation.usage)
    }

    const untranslatedSchemeUnits = findUnitsStillUntranslated(translationUnits, translatedUnits)

    if (untranslatedSchemeUnits.length > 0) {
      const schemeRetryTranslation = await translateUnits(
        openAiKey,
        payload,
        untranslatedSchemeUnits,
        "answer_scheme_retry",
      )
      translatedUnits = [...translatedUnits, ...schemeRetryTranslation.units]
      notes.push(...schemeRetryTranslation.notes)
      usages.push(schemeRetryTranslation.usage)
    }

    const normalizedTranslatedItem = applyTranslatedUnits(
      normalizedOriginalItem,
      translationUnits,
      translatedUnits,
    )

    const tokensUsed = usages.reduce(
      (sum, usage: any) =>
        sum + (usage?.input_tokens || 0) + (usage?.output_tokens || 0),
      0,
    )

    await supabase.from("ai_usage_logs").insert({
      profile_id: profile.id,
      usage_type: "translate_item_bilingual",
      input_snapshot: payload,
      output_snapshot: {
        model: "gpt-4o-mini",
        unit_count: translationUnits.length,
        usage: usages,
        notes,
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

    return jsonResponse({ item: normalizedTranslatedItem, notes, quota })
  } catch (error) {
    console.error(error)
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Ralat tidak dijangka." },
      (error as any)?.statusCode || 500,
    )
  }
})
