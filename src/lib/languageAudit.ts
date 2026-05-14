export type LanguageStatus = "bm_only" | "bilingual" | "uncertain"

type TextSource = {
  stem_text?: string | null
  item_options?: Array<{ option_text?: string | null }>
  item_subquestions?: Array<{ question_text?: string | null; answer_scheme_text?: string | null }>
}

const malayMarkers = [
  "apakah",
  "manakah",
  "nyatakan",
  "terangkan",
  "jelaskan",
  "berdasarkan",
  "rajah",
  "jadual",
  "berikut",
  "murid",
  "bagi",
  "dalam",
  "pada",
  "yang",
  "dan",
  "dengan",
  "soalan",
  "jawapan",
]

const englishMarkers = [
  "what",
  "which",
  "state",
  "explain",
  "describe",
  "based",
  "diagram",
  "table",
  "following",
  "shows",
  "answer",
  "mark",
  "marks",
  "give",
  "name",
  "label",
  "why",
  "how",
  "observation",
  "experiment",
]

export function stripLanguageHtml(html: string) {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
}

function countMarkers(text: string, markers: string[]) {
  const normalized = ` ${text.toLowerCase()} `
  return markers.reduce((total, marker) => {
    const pattern = new RegExp(`\\b${escapeRegExp(marker)}\\b`, "g")
    return total + (normalized.match(pattern)?.length || 0)
  }, 0)
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export function auditLanguageText(text: string): LanguageStatus {
  const normalized = stripLanguageHtml(text)
  if (!normalized) return "uncertain"

  const bmScore = countMarkers(normalized, malayMarkers)
  const enScore = countMarkers(normalized, englishMarkers)

  if (bmScore >= 2 && enScore >= 2) return "bilingual"
  if (bmScore >= 2 && enScore < 2) return "bm_only"
  if (enScore >= 3) return "bilingual"
  return "uncertain"
}

export function auditItemLanguage(item: TextSource): LanguageStatus {
  const text = [
    item.stem_text || "",
    ...(item.item_options || []).map((option) => option.option_text || ""),
    ...(item.item_subquestions || []).flatMap((subQuestion) => [
      subQuestion.question_text || "",
      subQuestion.answer_scheme_text || "",
    ]),
  ].join(" ")

  return auditLanguageText(text)
}

export function languageStatusLabel(status: LanguageStatus) {
  if (status === "bm_only") return "BM sahaja"
  if (status === "bilingual") return "Dwi bahasa"
  return "Bahasa tidak pasti"
}

