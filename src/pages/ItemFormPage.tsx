import { FormEvent, Suspense, lazy, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { supabase } from "../lib/supabase"
import { useUser } from "../context/UserContext"
import { AnswerSpace } from "../components/AnswerSpace"

const RichEditor = lazy(() => import("../components/RichEditor"))

type PaperType = "paper_1" | "paper_2"
type SectionType = "A" | "B" | "C" | ""
type ItemType = "mcq" | "structured" | "limited_response" | "open_response"
type DifficultyType = "rendah" | "sederhana" | "tinggi"
type McqOptionMode = "separate" | "in_stem"
type SubQuestionResponseType =
  | "instruction"
  | "short_text"
  | "structured_text"
  | "table"
  | "drawing"
  | "design"
  | "calculation"

type McqOption = {
  label: "A" | "B" | "C" | "D"
  text: string
}

type SubQuestion = {
  id: string
  label: string
  subLabel: string
  questionText: string
  answerSchemeText: string
  marks: number
  responseType: SubQuestionResponseType
  mainConstruct: string
  constructCode: string
  difficultyLevel: DifficultyType
}

type QuestionReferenceOption = {
  value: string
  label: string
  marks: number
}

type ConstructBlueprint = {
  label: string
  codePrefixes: string[]
}

const questionReferenceOptionsBySection: Record<Exclude<SectionType, "">, QuestionReferenceOption[]> = {
  A: [
    { value: "1", label: "Soalan 1 (5 markah)", marks: 5 },
    { value: "2", label: "Soalan 2 (5 markah)", marks: 5 },
    { value: "3", label: "Soalan 3 (5 markah)", marks: 5 },
    { value: "4", label: "Soalan 4 (5 markah)", marks: 5 },
  ],
  B: [
    { value: "5", label: "Soalan 5 (6 markah)", marks: 6 },
    { value: "6", label: "Soalan 6 (6 markah)", marks: 6 },
    { value: "7", label: "Soalan 7 (6 markah)", marks: 6 },
    { value: "8", label: "Soalan 8 (6 markah)", marks: 6 },
    { value: "9", label: "Soalan 9 (7 markah)", marks: 7 },
    { value: "10", label: "Soalan 10 (7 markah)", marks: 7 },
  ],
  C: [
    { value: "11", label: "Soalan 11 (10 markah)", marks: 10 },
    { value: "12", label: "Soalan 12 (12 markah)", marks: 12 },
    { value: "13", label: "Soalan 13 (12 markah)", marks: 12 },
  ],
}

const constructBlueprintByQuestionNo: Record<string, ConstructBlueprint> = {
  "1": { label: "Bahagian A: SS dan KS02", codePrefixes: ["SS", "KS02"] },
  "2": { label: "Bahagian A: SS dan KS02", codePrefixes: ["SS", "KS02"] },
  "3": { label: "Bahagian A: SS dan KS02", codePrefixes: ["SS", "KS02"] },
  "4": { label: "Bahagian A: SS dan KS02", codePrefixes: ["SS", "KS02"] },
  "5": { label: "Bahagian B: PS01, KS01, KS02, KS03", codePrefixes: ["PS01", "KS01", "KS02", "KS03"] },
  "6": { label: "Bahagian B: PS01, KS01, KS02, KS03", codePrefixes: ["PS01", "KS01", "KS02", "KS03"] },
  "7": { label: "Bahagian B: PS01, KS02, KS03, KS04", codePrefixes: ["PS01", "KS02", "KS03", "KS04"] },
  "8": { label: "Bahagian B: PS01, KS02, KS03, KS04", codePrefixes: ["PS01", "KS02", "KS03", "KS04"] },
  "9": { label: "Bahagian B: KS01, KS02, KS04, KS05", codePrefixes: ["KS01", "KS02", "KS04", "KS05"] },
  "10": { label: "Bahagian B: KS01, KS02, KS04, KS05", codePrefixes: ["KS01", "KS02", "KS04", "KS05"] },
  "11": { label: "Bahagian C: SS0112", codePrefixes: ["SS0112"] },
  "12": { label: "Bahagian C: PS01, KS01, KS02, KS04", codePrefixes: ["PS01", "KS01", "KS02", "KS04"] },
  "13": { label: "Bahagian C: PS01, KS01, KS02, KS04", codePrefixes: ["PS01", "KS01", "KS02", "KS04"] },
}

function SparklesIcon() {
  return (
    <span className="ai-generate-mark" aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <path d="M8 2l1.1 3.4L12.5 6.5 9.1 7.6 8 11 6.9 7.6 3.5 6.5l3.4-1.1L8 2z" />
        <path d="M18 4l.8 2.2L21 7l-2.2.8L18 10l-.8-2.2L15 7l2.2-.8L18 4z" />
      </svg>
      <strong>Ai</strong>
    </span>
  )
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 3h6l1 2h4v2H4V5h4l1-2z" />
      <path d="M6 9h12l-1 11H7L6 9zm4 2v7h2v-7h-2zm4 0v7h2v-7h-2z" />
    </svg>
  )
}

const initialOptions: McqOption[] = [
  { label: "A", text: "" },
  { label: "B", text: "" },
  { label: "C", text: "" },
  { label: "D", text: "" },
]

function createInitialOptions(): McqOption[] {
  return initialOptions.map((option) => ({ ...option }))
}

function createInitialSubQuestions(): SubQuestion[] {
  return [
    {
      id: crypto.randomUUID(),
      label: "a",
      subLabel: "",
      questionText: "",
      answerSchemeText: "",
      marks: 1,
      responseType: "short_text",
      mainConstruct: "",
      constructCode: "",
      difficultyLevel: "sederhana",
    },
  ]
}

function createBlankSubQuestion(overrides: Partial<SubQuestion> = {}): SubQuestion {
  return {
    id: crypto.randomUUID(),
    label: "a",
    subLabel: "",
    questionText: "",
    answerSchemeText: "",
    marks: 1,
    responseType: "short_text",
    mainConstruct: "",
    constructCode: "",
    difficultyLevel: "sederhana",
    ...overrides,
  }
}

const constructGroupOrder = [
  "Pengetahuan (Mengingat)",
  "Mengingat",
  "Kefahaman (Memahami)",
  "Memahami",
  "Aplikasi (Mengaplikasi)",
  "Mengaplikasi",
  "Analisis (Menganalisis)",
  "Menganalisis",
  "Menilai",
  "Mencipta",
  "Kemahiran Proses Sains",
  "Kemahiran Manipulatif",
  "Sikap Saintifik dan Nilai Murni",
]

function sortConstructGroups(a: string, b: string) {
  const aIndex = constructGroupOrder.indexOf(a)
  const bIndex = constructGroupOrder.indexOf(b)

  if (aIndex === -1 && bIndex === -1) return a.localeCompare(b)
  if (aIndex === -1) return 1
  if (bIndex === -1) return -1
  return aIndex - bIndex
}

export default function ItemFormPage() {
  const { profile } = useUser()
  const [searchParams] = useSearchParams()
  const editId = searchParams.get("id")
  const [loadingItem, setLoadingItem] = useState(false)
  const [profileSchoolName, setProfileSchoolName] = useState("")

  function isRichContentEmpty(html: string) {
    const stripped = html
      .replace(/<p><\/p>/g, "")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, "")
      .trim()

    return stripped.length === 0 && !html.includes("<img")
  }

  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")

  const [itemCode, setItemCode] = useState("")
  const [tingkatan, setTingkatan] = useState<4 | 5>(4)
  const [paper, setPaper] = useState<PaperType>("paper_1")
  const [section, setSection] = useState<SectionType>("")
  const [questionNoReference, setQuestionNoReference] = useState("")
  const [standards, setStandards] = useState<any[]>([])
  const [selectedTema, setSelectedTema] = useState("")
  const [selectedBidangCode, setSelectedBidangCode] = useState("")
  const [selectedSKCode, setSelectedSKCode] = useState("")
  const [selectedSPCode, setSelectedSPCode] = useState("")
  const [constructs, setConstructs] = useState<any[]>([])
  const [mainConstruct, setMainConstruct] = useState("")
  const [constructCode, setConstructCode] = useState("")
  const [difficultyLevel, setDifficultyLevel] = useState<DifficultyType>("sederhana")
  const [marks, setMarks] = useState<number>(1)
  const [stimulusType, setStimulusType] = useState("text")
  const [questionInstruction, setQuestionInstruction] = useState("")
  const [stemText, setStemText] = useState("")
  const [answerSchemeText, setAnswerSchemeText] = useState("")
  const [answerFinal, setAnswerFinal] = useState("")
  const [explanationText, setExplanationText] = useState("")
  const [sourceType, setSourceType] = useState("")
  const [sourceReference, setSourceReference] = useState("")
  const [sourceYear, setSourceYear] = useState("")
  const [sourceSchool, setSourceSchool] = useState("")
  const [status, setStatus] = useState("draft")
  const [options, setOptions] = useState<McqOption[]>(() => createInitialOptions())
  const [mcqOptionMode, setMcqOptionMode] = useState<McqOptionMode>("separate")
  const [metadataSuggestion, setMetadataSuggestion] = useState("")
  const [suggestingMetadata, setSuggestingMetadata] = useState(false)
  const [generatingSchemeId, setGeneratingSchemeId] = useState<string | null>(null)
  const [subQuestions, setSubQuestions] = useState<SubQuestion[]>(() => createInitialSubQuestions())

  const isPaper1 = paper === "paper_1"
  const isStemOptionMode = isPaper1 && mcqOptionMode === "in_stem"
  const totalSubQuestionMarks = useMemo(
    () =>
      subQuestions.reduce(
        (total, item) => total + (item.responseType === "instruction" ? 0 : Number(item.marks) || 0),
        0,
      ),
    [subQuestions],
  )
  const markedSubQuestions = useMemo(
    () => subQuestions.filter((item) => !isInstructionSubQuestion(item)),
    [subQuestions],
  )

  const itemType = useMemo<ItemType>(() => {
    if (paper === "paper_1") return "mcq"
    if (section === "A") return "structured"
    if (section === "B") return "limited_response"
    return "open_response"
  }, [paper, section])

  const selectedPaperLabel = paper === "paper_1" ? "Kertas 1" : "Kertas 2"
  const authorName = profile?.full_name || profile?.email || "Akaun semasa"
  const authorAuditText = profileSchoolName ? `${authorName} / ${profileSchoolName}` : authorName
  const questionReferenceOptions = section ? questionReferenceOptionsBySection[section] : []
  const selectedQuestionReference = questionReferenceOptions.find(
    (option) => option.value === questionNoReference,
  )
  const expectedFormatMarks = selectedQuestionReference?.marks || 0
  const displayedItemMarks = isPaper1 ? 1 : expectedFormatMarks || totalSubQuestionMarks
  const constructBlueprint = !isPaper1 && questionNoReference
    ? constructBlueprintByQuestionNo[questionNoReference]
    : null

  const temaList = Array.from(
    new Set(standards.map((s) => s.theme_name as string))
  )

  const bidangList = Array.from(
    new Map(
      standards
        .filter((s) => s.theme_name === selectedTema)
        .map((s) => [
          s.bidang_code,
          { code: s.bidang_code as string, name: s.bidang_name as string },
        ])
    ).values()
  )

  const skList = Array.from(
    new Map(
      standards
        .filter((s) => s.bidang_code === selectedBidangCode)
        .map((s) => [
          s.standard_kandungan_code,
          { code: s.standard_kandungan_code as string, name: s.standard_kandungan_name as string },
        ])
    ).values()
  )

  const spList = standards.filter(
    (s) => s.standard_kandungan_code === selectedSKCode
  )

  const selectedBidangObj = bidangList.find((b) => b.code === selectedBidangCode) || null
  const selectedSKObj = skList.find((s) => s.code === selectedSKCode) || null
  const selectedSPObj = spList.find((s) => s.standard_pembelajaran_code === selectedSPCode) || null

  const constructGroupList = Array.from(
    new Set(constructs.map((c) => c.construct_group as string))
  ).sort(sortConstructGroups)

  const constructCodeList = constructs.filter(
    (c) => c.construct_group === mainConstruct
  )

  function getConstructCodesForGroup(group: string) {
    return constructs.filter((c) => c.construct_group === group)
  }

  function handleOptionChange(index: number, value: string) {
    setOptions((prev) =>
      prev.map((opt, i) => (i === index ? { ...opt, text: value } : opt)),
    )
  }

  function addSubQuestion() {
    const nextLabel = String.fromCharCode(97 + subQuestions.length)
    setSubQuestions((prev) => [
      ...prev,
      createBlankSubQuestion({
        label: nextLabel,
        mainConstruct: mainConstruct || "",
        constructCode: constructCode || "",
        difficultyLevel,
      }),
    ])
  }

  function handleSectionChange(nextSection: SectionType) {
    setSection(nextSection)
    const firstOption = nextSection ? questionReferenceOptionsBySection[nextSection][0] : null
    const nextMarks = firstOption?.marks || 1
    setQuestionNoReference(firstOption?.value || "")

    setMarks(nextMarks)
  }

  function handleQuestionReferenceChange(nextReference: string) {
    setQuestionNoReference(nextReference)
    const option = questionReferenceOptions.find((item) => item.value === nextReference)
    if (!option) return

    setMarks(option.marks)
  }

  function updateSubQuestion(id: string, patch: Partial<SubQuestion>) {
    setSubQuestions((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    )
  }

  function removeSubQuestion(id: string) {
    setSubQuestions((prev) =>
      prev.length <= 1 ? prev : prev.filter((item) => item.id !== id),
    )
  }

  function formatSubQuestionLabel(item: Pick<SubQuestion, "label" | "subLabel">) {
    return `(${item.label})${item.subLabel ? `(${item.subLabel})` : ""}`
  }

  function isInstructionSubQuestion(item: Pick<SubQuestion, "responseType">) {
    return item.responseType === "instruction"
  }

  function getPrimarySubQuestionMetadata() {
    return (
      subQuestions.find(
        (item) =>
          !isInstructionSubQuestion(item) &&
          item.mainConstruct &&
          item.constructCode &&
          item.difficultyLevel,
      ) || null
    )
  }

  function optionTextToHtml(label: McqOption["label"]) {
    return `<p>${label}</p>`
  }

  function isLabelOnlyOption(label: McqOption["label"], html: string) {
    const plainText = html
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim()

    return plainText === label
  }

  function htmlToText(html: string) {
    return html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim()
  }

  function escapeHtml(text: string) {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;")
  }

  function textToTableCellHtml(text: string) {
    return escapeHtml(text.trim()).replace(/\n/g, "<br />")
  }

  function generateMarkingSchemeHtml() {
    const rows = markedSubQuestions
      .map(
        (item) => `
          <tr>
            <td>${escapeHtml(formatSubQuestionLabel(item))}</td>
            <td>${textToTableCellHtml(item.answerSchemeText || "")}</td>
            <td>${Number(item.marks) || 0}</td>
          </tr>`,
      )
      .join("")

    return `
      <table>
        <thead>
          <tr>
            <th>Nombor Soalan</th>
            <th>Cadangan Jawapan</th>
            <th>Markah</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
          <tr>
            <th>Jumlah</th>
            <td></td>
            <th>${totalSubQuestionMarks}</th>
          </tr>
        </tbody>
      </table>
    `
  }

  function tokenize(text: string) {
    const stopwords = new Set([
      "yang",
      "dan",
      "atau",
      "dalam",
      "dengan",
      "bagi",
      "pada",
      "untuk",
      "berikut",
      "manakah",
      "apakah",
      "antara",
      "rajah",
      "jadual",
      "soalan",
      "pilih",
      "jawapan",
      "betul",
      "menunjukkan",
      "suatu",
      "satu",
      "the",
      "and",
      "which",
      "following",
      "correct",
    ])

    return text
      .toLowerCase()
      .replace(/[^a-z0-9\u00c0-\u024f]+/gi, " ")
      .split(/\s+/)
      .filter((word) => word.length > 3 && !stopwords.has(word))
  }

  function inferConstructGroup(text: string) {
    const lower = text.toLowerCase()

    const hasExperimentContext =
      paper === "paper_2" &&
      section === "A" &&
      /(eksperimen|experiment|rajah|diagram|pemerhatian|observation|inferens|inference|hipotesis|hypothesis|pemboleh ubah|faktor ditetapkan|faktor diubah|faktor bergerak balas|dimalarkan|dimanipulasikan|responding variable|manipulated variable|constant variable|fixed|changed|ditetapkan|diubah|mentafsir data|tafsir data)/.test(
        lower,
      )

    if (hasExperimentContext) {
      return "Kemahiran Proses Sains"
    }

    if (/(wajarkan|justifikasi|nilai|bandingkan|terbaik|sesuai|kesimpulan)/.test(lower)) {
      return "Menilai"
    }
    if (/(ramalkan|analisis|hubungan|pola|trend|inferens|sebab|mengapa|bezakan)/.test(lower)) {
      return "Analisis (Menganalisis)"
    }
    if (/(hitung|kira|calculate|gunakan formula|tentukan nilai|aplikasi)/.test(lower)) {
      return "Aplikasi (Mengaplikasi)"
    }
    if (/(terangkan|jelaskan|apakah yang dimaksudkan|maksud|fungsi|nyatakan sebab)/.test(lower)) {
      return "Kefahaman (Memahami)"
    }
    if (/(namakan|nyatakan|labelkan|pilih|apakah|manakah|kenal pasti)/.test(lower)) {
      return "Pengetahuan (Mengingat)"
    }

    return isPaper1 ? "Pengetahuan (Mengingat)" : "Kefahaman (Memahami)"
  }

  function inferConstructCode(text: string, constructGroup: string) {
    const lower = text.toLowerCase()

    if (constructGroup !== "Kemahiran Proses Sains") return ""

    const kpsRules = [
      {
        code: "SS0110",
        pattern:
          /(pemboleh ubah|faktor ditetapkan|faktor diubah|faktor bergerak balas|dimalarkan|dimanipulasikan|bergerak balas|manipulated variable|responding variable|constant variable|fixed factor|changed factor|fixed variable)/,
      },
      { code: "SS0111", pattern: /(hipotesis|hypothesis)/ },
      { code: "SS0104", pattern: /(inferens|inference|membuat inferens)/ },
      { code: "SS0101", pattern: /(pemerhatian|observation|perhatikan|observe|nyatakan satu pemerhatian)/ },
      { code: "SS0108", pattern: /(tafsir data|mentafsir data|graf|graph|jadual|pola|trend|hubungan antara)/ },
      { code: "SS0109", pattern: /(definisi secara operasi|operational definition|didefinisikan secara operasi)/ },
      { code: "SS0112", pattern: /(menjalankan eksperimen|mengeksperimen|prosedur|procedure|kaedah eksperimen|radas)/ },
      { code: "SS0105", pattern: /(ramal|meramal|predict|prediction)/ },
      { code: "SS0102", pattern: /(mengelas|kelaskan|classify|classification)/ },
      { code: "SS0103", pattern: /(mengukur|ukur|nombor|unit|measurement|measure)/ },
      { code: "SS0106", pattern: /(berkomunikasi|komunikasi|communicate|lukis graf|plot)/ },
      { code: "SS0107", pattern: /(ruang dan masa|space and time|perhubungan ruang)/ },
    ]

    return kpsRules.find((rule) => rule.pattern.test(lower))?.code || "SS0112"
  }

  function findBlueprintConstruct(text: string, blueprint: ConstructBlueprint | null) {
    if (!blueprint) return null

    const lower = text.toLowerCase()
    const candidates = constructs.filter((construct) =>
      blueprint.codePrefixes.some((prefix) => (construct.construct_code || "").startsWith(prefix)),
    )

    if (candidates.length === 0) return null

    const scored = candidates
      .map((construct) => {
        const prefixIndex = blueprint.codePrefixes.findIndex((prefix) =>
          (construct.construct_code || "").startsWith(prefix),
        )
        const aspectText = `${construct.aspect_name || ""} ${construct.description || ""}`.toLowerCase()
        const aspectTokens = tokenize(aspectText)
        const textScore = aspectTokens.reduce(
          (total, token) => total + (lower.includes(token) ? 3 : 0),
          0,
        )
        const inferredGroup = inferConstructGroup(text)
        const groupScore = construct.construct_group === inferredGroup ? 8 : 0
        const inferredCode = inferConstructCode(text, construct.construct_group)
        const codeScore = inferredCode && construct.construct_code === inferredCode ? 10 : 0

        return {
          construct,
          score: textScore + groupScore + codeScore + Math.max(0, 6 - prefixIndex),
        }
      })
      .sort((a, b) => b.score - a.score)

    return scored[0]?.construct || null
  }

  function inferDifficulty(text: string): DifficultyType {
    const lower = text.toLowerCase()
    if (
      paper === "paper_2" &&
      section === "A" &&
      /(pemerhatian|observation|inferens|inference|hipotesis|hypothesis|pemboleh ubah|faktor ditetapkan|faktor diubah|faktor bergerak balas|mentafsir data|tafsir data|eksperimen)/.test(
        lower,
      )
    ) {
      if (/(rancang|reka bentuk|design|prosedur lengkap|kesimpulan|justify|wajarkan)/.test(lower)) {
        return "tinggi"
      }
      if (/(hipotesis|inferens|pemboleh ubah|faktor ditetapkan|faktor diubah|faktor bergerak balas|mentafsir data|tafsir data)/.test(lower)) {
        return "sederhana"
      }
      return "rendah"
    }

    if (/(wajarkan|justifikasi|cadangkan|rekabentuk|analisis|ramalkan|evaluate|justify)/.test(lower)) {
      return "tinggi"
    }
    if (/(hitung|kira|terangkan|jelaskan|bandingkan|inferens|mengapa|calculate)/.test(lower)) {
      return "sederhana"
    }
    return isPaper1 ? "rendah" : "sederhana"
  }

  function inferSubQuestionMetadata(text: string) {
    const suggestedGroup = inferConstructGroup(text)
    const suggestedCode = inferConstructCode(text, suggestedGroup)
    const blueprintConstruct = findBlueprintConstruct(text, constructBlueprint)
    const matchedConstruct =
      blueprintConstruct ||
      constructs.find((c) => c.construct_code === suggestedCode) ||
      constructs.find((c) => c.construct_group === suggestedGroup)

    return {
      mainConstruct: matchedConstruct?.construct_group || suggestedGroup,
      constructCode: matchedConstruct?.construct_code || "",
      difficultyLevel: inferDifficulty(text),
    }
  }

  function suggestSubQuestionMetadata(id: string) {
    setSubQuestions((prev) =>
      prev.map((subQuestion) => {
        if (subQuestion.id !== id || isInstructionSubQuestion(subQuestion)) return subQuestion

        const text = [
          htmlToText(stemText),
          htmlToText(subQuestion.questionText),
          subQuestion.answerSchemeText,
        ].join(" ")

        return {
          ...subQuestion,
          ...inferSubQuestionMetadata(text),
        }
      }),
    )
  }

  async function generateAnswerSchemeForSubQuestion(item: SubQuestion) {
    if (isInstructionSubQuestion(item)) return

    setMessage("")
    setGeneratingSchemeId(item.id)

    try {
      const { data, error } = await supabase.functions.invoke("generate-marking-scheme", {
        body: {
          mode: "single",
          subject: "Sains KSSM SPM 1511",
          tingkatan,
          paper,
          section,
          stemText: htmlToText(stemText),
          dskp: {
            theme_name: selectedTema,
            bidang_code: selectedBidangObj?.code || selectedBidangCode,
            bidang_name: selectedBidangObj?.name || "",
            standard_kandungan: selectedSKObj
              ? `${selectedSKObj.code} - ${selectedSKObj.name}`
              : selectedSKCode,
            standard_pembelajaran: selectedSPObj
              ? `${selectedSPObj.standard_pembelajaran_code} - ${selectedSPObj.standard_pembelajaran_name}`
              : selectedSPCode,
          },
          subQuestion: {
            label: formatSubQuestionLabel(item),
            questionText: htmlToText(item.questionText),
            marks: Number(item.marks) || 1,
            responseType: item.responseType,
            mainConstruct: item.mainConstruct,
            constructCode: item.constructCode,
            difficultyLevel: item.difficultyLevel,
          },
        },
      })

      if (error) throw error
      if (!data?.answer) throw new Error("AI tidak memulangkan cadangan jawapan.")

      updateSubQuestion(item.id, { answerSchemeText: data.answer })
      setMessage(data.quota?.remainingText || "Cadangan jawapan AI diisi. Sila semak sebelum simpan.")
    } catch (error: any) {
      console.error("Generate marking scheme error", error)
      setMessage(error.message || "Gagal jana cadangan jawapan AI.")
    } finally {
      setGeneratingSchemeId(null)
    }
  }

  async function generateAllAnswerSchemes() {
    for (const item of markedSubQuestions) {
      if (!item.answerSchemeText.trim()) {
        await generateAnswerSchemeForSubQuestion(item)
      }
    }
  }

  async function suggestMetadata() {
    setMetadataSuggestion("")

    const optionText = options.map((opt) => htmlToText(opt.text)).join(" ")
    const questionText = [
      questionInstruction,
      htmlToText(stemText),
      isStemOptionMode ? "" : optionText,
      subQuestions.map((sq) => htmlToText(sq.questionText)).join(" "),
      subQuestions.map((sq) => sq.answerSchemeText).join(" "),
      explanationText,
    ].join(" ")

    if (!questionText.trim()) {
      setMetadataSuggestion("Masukkan stem soalan dahulu sebelum guna cadangan metadata.")
      return
    }

    if (standards.length === 0 || constructs.length === 0) {
      setMetadataSuggestion("Data standard akademik atau konstruk belum dimuatkan.")
      return
    }

    setSuggestingMetadata(true)

    try {
      const words = tokenize(questionText)
      const wordSet = new Set(words)

      const scoredStandards = standards
        .map((standard) => {
          const haystack = [
            standard.theme_name,
            standard.bidang_code,
            standard.bidang_name,
            standard.standard_kandungan_code,
            standard.standard_kandungan_name,
            standard.standard_pembelajaran_code,
            standard.standard_pembelajaran_name,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()

          const score = Array.from(wordSet).reduce((total, word) => {
            if (!haystack.includes(word)) return total
            if ((standard.standard_pembelajaran_name || "").toLowerCase().includes(word)) return total + 5
            if ((standard.standard_kandungan_name || "").toLowerCase().includes(word)) return total + 4
            if ((standard.bidang_name || "").toLowerCase().includes(word)) return total + 3
            return total + 1
          }, 0)

          return { standard, score }
        })
        .sort((a, b) => b.score - a.score)

      const bestStandard = scoredStandards[0]?.standard

      if (bestStandard && scoredStandards[0].score > 0) {
        setSelectedTema(bestStandard.theme_name || "")
        setSelectedBidangCode(bestStandard.bidang_code || "")
        setSelectedSKCode(bestStandard.standard_kandungan_code || "")
        setSelectedSPCode(bestStandard.standard_pembelajaran_code || "")
      }

      const suggestedConstruct = inferConstructGroup(questionText)
      const blueprintConstruct = findBlueprintConstruct(questionText, constructBlueprint)
      const availableConstructGroup =
        blueprintConstruct?.construct_group ||
        constructs.find((c) => c.construct_group === suggestedConstruct)?.construct_group ||
        constructs.find((c) =>
          (c.construct_group || "").toLowerCase().includes(
            suggestedConstruct.replace(/^.*\((.*)\).*$/, "$1").toLowerCase(),
          ),
        )?.construct_group ||
        constructGroupList[0] ||
        ""
      const availableConstruct = constructs.find((c) => c.construct_group === availableConstructGroup)

      if (availableConstructGroup) {
        setMainConstruct(availableConstructGroup)
        const suggestedConstructCode = inferConstructCode(questionText, availableConstructGroup)
        const matchedConstruct =
          blueprintConstruct ||
          constructs.find((c) => c.construct_code === suggestedConstructCode) ||
          availableConstruct

        setConstructCode(matchedConstruct?.construct_code || "")
      }

      const suggestedDifficulty = inferDifficulty(questionText)
      setDifficultyLevel(suggestedDifficulty)

      if (!isPaper1) {
        setSubQuestions((prev) =>
          prev.map((subQuestion) => {
            if (isInstructionSubQuestion(subQuestion)) return subQuestion

            const subQuestionText = [
              htmlToText(stemText),
              htmlToText(subQuestion.questionText),
              subQuestion.answerSchemeText,
            ].join(" ")

            return {
              ...subQuestion,
              ...inferSubQuestionMetadata(subQuestionText),
            }
          }),
        )
      }

      const result = {
        standard:
          bestStandard && scoredStandards[0].score > 0
            ? {
                theme_name: bestStandard.theme_name,
                bidang_code: bestStandard.bidang_code,
                standard_kandungan_code: bestStandard.standard_kandungan_code,
                standard_pembelajaran_code: bestStandard.standard_pembelajaran_code,
                score: scoredStandards[0].score,
              }
            : null,
        construct_group: availableConstructGroup || null,
        construct_code:
          constructs.find((c) => c.construct_code === inferConstructCode(questionText, availableConstructGroup))
            ?.construct_code ||
          availableConstruct?.construct_code ||
          null,
        difficulty_level: suggestedDifficulty,
        construct_blueprint: constructBlueprint?.label || null,
      }

      if (profile?.id) {
        await supabase.from("ai_usage_logs").insert({
          profile_id: profile.id,
          usage_type: "suggest_metadata_rule_based",
          input_snapshot: {
            tingkatan,
            paper,
            section,
            questionNoReference,
            construct_blueprint: constructBlueprint?.label || null,
            text: questionText.slice(0, 2500),
          },
          output_snapshot: result,
        })
      }

      setMetadataSuggestion(
        bestStandard && scoredStandards[0].score > 0
          ? constructBlueprint
            ? "Cadangan metadata diisi berpandukan taburan format SPM. Sila semak sebelum simpan."
            : "Cadangan metadata diisi. Sila semak sebelum simpan."
          : constructBlueprint
            ? "Cadangan konstruk/aras diisi berpandukan taburan format SPM, tetapi standard akademik kurang yakin. Sila pilih Tema/Bidang/SK/SP secara manual."
            : "Cadangan konstruk dan aras diisi, tetapi standard akademik kurang yakin. Sila pilih Tema/Bidang/SK/SP secara manual.",
      )
    } catch (error: any) {
      console.error(error)
      setMetadataSuggestion(error.message || "Gagal menjana cadangan metadata.")
    } finally {
      setSuggestingMetadata(false)
    }
  }

  function generateItemCode() {
    const paperCode = paper === "paper_1" ? "K1" : `K2${section || ""}`
    const formCode = `T${tingkatan}`
    const randomCode = Math.random().toString(36).substring(2, 8).toUpperCase()

    return ["SCI", paperCode, formCode, randomCode].filter(Boolean).join("-")
  }

  useEffect(() => {
    async function fetchConstructs() {
      const { data, error } = await supabase
        .from("constructs")
        .select("*")
        .order("construct_code", { ascending: true })

      if (!error && data) {
        setConstructs(data)
      }
    }

    void fetchConstructs()
  }, [])

  useEffect(() => {
    async function fetchProfileSchool() {
      if (!profile?.school_id) {
        setProfileSchoolName("")
        return
      }

      const { data, error } = await supabase
        .from("schools")
        .select("school_name")
        .eq("id", profile.school_id)
        .maybeSingle()

      if (!error && data?.school_name) {
        setProfileSchoolName(data.school_name)
      }
    }

    void fetchProfileSchool()
  }, [profile?.school_id])

  useEffect(() => {
    async function fetchStandards() {
      const { data, error } = await supabase
        .from("academic_standards")
        .select("*")
        .eq("tingkatan", tingkatan)
        .order("bidang_code", { ascending: true })
        .order("standard_kandungan_code", { ascending: true })
        .order("standard_pembelajaran_code", { ascending: true })

      if (!error && data) {
        setStandards(data)
      }
    }

    void fetchStandards()
  }, [tingkatan])

  useEffect(() => {
    if (editId) {
      void loadItemForEdit(editId)
    } else {
      resetForm()
    }
  }, [editId])

  async function loadItemForEdit(itemId: string) {
    setLoadingItem(true)
    setMessage("")

    try {
      const { data: item, error: itemError } = await supabase
        .from("items")
        .select("*")
        .eq("id", itemId)
        .single()

      if (itemError) throw itemError

      const loadedTingkatan = (item.tingkatan || 4) as 4 | 5
      const loadedPaper: PaperType = item.paper === "paper_2" ? "paper_2" : "paper_1"

      setItemCode(item.item_code || "")
      setTingkatan(loadedTingkatan)
      setPaper(loadedPaper)
      setSection((item.section || "") as SectionType)
      setQuestionNoReference(item.question_no_reference ? String(item.question_no_reference) : "")
      setSelectedTema(item.theme_name || "")
      setSelectedBidangCode(item.bidang_learning_code || "")
      setSelectedSKCode(item.standard_kandungan || "")
      setSelectedSPCode(item.standard_pembelajaran || "")
      setMainConstruct(item.main_construct || "")
      setConstructCode(item.construct_code || "")
      setDifficultyLevel((item.difficulty_level || "sederhana") as DifficultyType)
      setMarks(item.marks || 1)
      setStimulusType(item.stimulus_type || "text")
      setQuestionInstruction(item.question_instruction || "")
      setStemText(item.stem_text || "")
      setAnswerSchemeText(item.answer_scheme_text || "")
      setAnswerFinal(item.answer_final || "")
      setExplanationText(item.explanation_text || "")
      setSourceType(item.source_type || "")
      setSourceReference(item.source_reference || "")
      setSourceYear(item.source_year ? String(item.source_year) : "")
      setSourceSchool(item.source_school || "")
      setStatus(item.status || "draft")

      if (loadedPaper === "paper_1") {
        const { data: optionData, error: optionError } = await supabase
          .from("item_options")
          .select("*")
          .eq("item_id", itemId)
          .order("display_order", { ascending: true })

        if (optionError) throw optionError

        if (optionData && optionData.length > 0) {
          const preparedOptions: McqOption[] = ["A", "B", "C", "D"].map((label) => {
            const found = optionData.find((o) => o.option_label === label)
            return {
              label: label as "A" | "B" | "C" | "D",
              text: found?.option_text || "",
            }
          })
          setOptions(preparedOptions)
          setMcqOptionMode(
            preparedOptions.every((opt) => isLabelOnlyOption(opt.label, opt.text))
              ? "in_stem"
              : "separate",
          )
        } else {
          setOptions(createInitialOptions())
          setMcqOptionMode("separate")
        }
      } else {
        setOptions(createInitialOptions())
        setMcqOptionMode("separate")

        const { data: subQuestionData, error: subQuestionError } = await supabase
          .from("item_subquestions")
          .select("*")
          .eq("item_id", itemId)
          .order("display_order", { ascending: true })

        if (subQuestionError) {
          console.warn("Subquestion fetch skipped", subQuestionError)
          setSubQuestions(createInitialSubQuestions())
        } else if (subQuestionData && subQuestionData.length > 0) {
          setSubQuestions(
            subQuestionData.map((row: any) => ({
              id: row.id || crypto.randomUUID(),
              label: row.label || "a",
              subLabel: row.sub_label || "",
              questionText: row.question_text || "",
              answerSchemeText:
                row.answer_scheme_text && row.answer_scheme_text !== "-" ? row.answer_scheme_text : "",
              marks: row.marks ?? 1,
              responseType: row.response_type || "short_text",
              mainConstruct: row.main_construct || item.main_construct || "",
              constructCode: row.construct_code || item.construct_code || "",
              difficultyLevel: (row.difficulty_level || item.difficulty_level || "sederhana") as DifficultyType,
            })),
          )
        } else {
          setSubQuestions(createInitialSubQuestions())
        }
      }
    } catch (error: any) {
      console.error(error)
      setMessage(error.message || "Gagal memuatkan item untuk edit.")
    } finally {
      setLoadingItem(false)
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setMessage("")

    if (!profile?.id) {
      setMessage("Profil pengguna tidak dijumpai.")
      return
    }

    if (isRichContentEmpty(stemText)) {
      setMessage("Stem soalan wajib diisi.")
      return
    }

    if (isPaper1) {
      const finalOptions = isStemOptionMode
        ? options.map((opt) => ({ ...opt, text: optionTextToHtml(opt.label) }))
        : options
      const hasEmptyOption = finalOptions.some((opt) => isRichContentEmpty(opt.text))

      if (hasEmptyOption) {
        setMessage("Semua pilihan jawapan A, B, C dan D wajib diisi.")
        return
      }

      if (!answerFinal) {
        setMessage("Sila pilih jawapan betul untuk Kertas 1.")
        return
      }

      if (isStemOptionMode && isRichContentEmpty(stemText)) {
        setMessage("Masukkan jadual pilihan A-D dalam stem soalan.")
        return
      }
    }

    if (!isPaper1) {
      if (!section) {
        setMessage("Bahagian wajib dipilih untuk Kertas 2.")
        return
      }

      if (!selectedQuestionReference) {
        setMessage("Sila pilih No. Rujukan Soalan yang sah untuk bahagian ini.")
        return
      }

      if (subQuestions.length === 0) {
        setMessage("Tambah sekurang-kurangnya satu sub-soalan untuk Kertas 2.")
        return
      }

      const incompleteSubQuestion = subQuestions.find(
        (item) =>
          !item.label.trim() ||
          isRichContentEmpty(item.questionText) ||
          (!isInstructionSubQuestion(item) && (!item.mainConstruct || !item.constructCode || !item.difficultyLevel)) ||
          (!isInstructionSubQuestion(item) && Number(item.marks) < 1),
      )

      if (incompleteSubQuestion) {
        setMessage("Setiap sub-soalan bermarkah perlu label, teks soalan, konstruk, kod konstruk, aras dan markah sekurang-kurangnya 1.")
        return
      }

      const incompleteMarkingScheme = markedSubQuestions.find(
        (item) => !item.answerSchemeText.trim(),
      )

      if (incompleteMarkingScheme) {
        setMessage("Cadangan jawapan wajib diisi untuk setiap sub-soalan bermarkah.")
        return
      }

      if (expectedFormatMarks && totalSubQuestionMarks !== expectedFormatMarks) {
        setMessage(
          `Jumlah markah sub-soalan mesti ${expectedFormatMarks} markah untuk Soalan ${questionNoReference}.`,
        )
        return
      }
    }

    if (!selectedTema || !selectedBidangCode || !selectedSKCode || !selectedSPCode) {
      setMessage("Metadata akademik DSKP wajib dilengkapkan.")
      return
    }

    const primarySubQuestionMetadata = getPrimarySubQuestionMetadata()

    if (isPaper1 && (!mainConstruct || !constructCode)) {
      setMessage("Konstruk dan kod konstruk wajib dipilih.")
      return
    }

    if (!isPaper1 && !primarySubQuestionMetadata) {
      setMessage("Sekurang-kurangnya satu sub-soalan bermarkah perlu ada konstruk, kod konstruk dan aras.")
      return
    }

    setSaving(true)

    try {
      const finalItemCode = itemCode.trim() || generateItemCode()

      const finalAnswerSchemeText = isPaper1
        ? `Jawapan: ${answerFinal}`
        : generateMarkingSchemeHtml()

      const payload = {
        item_code: finalItemCode,
        updated_by: profile.id,

        tingkatan,
        paper: isPaper1 ? "paper_1" : "paper_2",
        section: isPaper1 ? null : section || null,
        question_no_reference:
          !isPaper1 && questionNoReference.trim() ? questionNoReference.trim() : null,

        item_type: isPaper1 ? "mcq" : itemType,
        marks: isPaper1 ? 1 : expectedFormatMarks || totalSubQuestionMarks,

        theme_name: selectedTema || null,
        bidang_learning_code: selectedBidangObj?.code || null,
        bidang_learning_name: selectedBidangObj?.name || null,
        standard_kandungan: selectedSKObj?.code || null,
        standard_pembelajaran: selectedSPObj?.standard_pembelajaran_code || null,

        main_construct: isPaper1
          ? mainConstruct || null
          : primarySubQuestionMetadata?.mainConstruct || null,
        construct_code: isPaper1
          ? constructCode || null
          : primarySubQuestionMetadata?.constructCode || null,
        difficulty_level: isPaper1
          ? difficultyLevel
          : primarySubQuestionMetadata?.difficultyLevel || "sederhana",

        stimulus_type: stimulusType || null,
        question_instruction: questionInstruction || null,
        stem_text: stemText,
        answer_scheme_text: finalAnswerSchemeText,
        answer_final: isPaper1 ? answerFinal : answerFinal || null,
        explanation_text: explanationText || null,

        source_type: sourceType || null,
        source_reference: sourceReference || null,
        source_year: sourceYear ? Number(sourceYear) : null,
        source_school: sourceSchool || profileSchoolName || null,

        status,
      }

      let savedItemId = editId || ""

      if (editId) {
        const { error: updateError } = await supabase
          .from("items")
          .update(payload)
          .eq("id", editId)

        if (updateError) {
          console.error("Item update error", { error: updateError, payload })
          throw new Error(`Gagal simpan item: ${updateError.message}`)
        }
      } else {
        const { data: insertedItem, error: itemError } = await supabase
          .from("items")
          .insert({
            ...payload,
            created_by: profile.id,
          })
          .select("id")
          .single()

        if (itemError) {
          console.error("Item insert error", { error: itemError, payload })
          throw new Error(`Gagal simpan item: ${itemError.message}`)
        }
        savedItemId = insertedItem.id
      }

      if (isPaper1 && savedItemId) {
        const finalOptions = isStemOptionMode
          ? options.map((opt) => ({ ...opt, text: optionTextToHtml(opt.label) }))
          : options

        if (editId) {
          const { error: deleteOldOptionsError } = await supabase
            .from("item_options")
            .delete()
            .eq("item_id", savedItemId)

          if (deleteOldOptionsError) {
            console.error("Item option cleanup error", deleteOldOptionsError)
            throw new Error(`Gagal kemas pilihan lama: ${deleteOldOptionsError.message}`)
          }
        }

        const optionRows = finalOptions.map((opt, index) => ({
          item_id: savedItemId,
          option_label: opt.label,
          option_text: opt.text,
          is_correct: opt.label === answerFinal,
          display_order: index + 1,
        }))

        const { error: optionError } = await supabase
          .from("item_options")
          .insert(optionRows)

        if (optionError) {
          console.error("Item options insert error", { error: optionError, optionRows })
          throw new Error(`Gagal simpan pilihan jawapan: ${optionError.message}`)
        }
      }

      if (!isPaper1 && savedItemId) {
        if (editId) {
          const { error: deleteOldSubQuestionsError } = await supabase
            .from("item_subquestions")
            .delete()
            .eq("item_id", savedItemId)

          if (deleteOldSubQuestionsError) {
            console.error("Subquestion cleanup error", deleteOldSubQuestionsError)
            throw new Error(`Gagal kemas sub-soalan lama: ${deleteOldSubQuestionsError.message}`)
          }
        }

        const rows = subQuestions.map((item, index) => ({
          item_id: savedItemId,
          label: item.label.trim(),
          sub_label: item.subLabel.trim() || null,
          question_text: item.questionText,
          answer_scheme_text: isInstructionSubQuestion(item)
            ? "-"
            : item.answerSchemeText.trim(),
          marks: isInstructionSubQuestion(item) ? 0 : Number(item.marks) || 1,
          response_type: item.responseType,
          main_construct: isInstructionSubQuestion(item) ? null : item.mainConstruct || null,
          construct_code: isInstructionSubQuestion(item) ? null : item.constructCode || null,
          difficulty_level: isInstructionSubQuestion(item) ? null : item.difficultyLevel || null,
          display_order: index + 1,
        }))

        const { error: subQuestionError } = await supabase
          .from("item_subquestions")
          .insert(rows)

        if (subQuestionError) {
          console.error("Subquestion insert error", { error: subQuestionError, rows })
          throw new Error(`Gagal simpan sub-soalan: ${subQuestionError.message}`)
        }
      }

      if (!editId) {
        prepareNextQuestionForm()
        setMessage("Soalan berjaya disimpan. Borang baharu disediakan untuk soalan seterusnya.")
      } else {
        setMessage("Soalan berjaya dikemaskini.")
      }
    } catch (error: any) {
      console.error(error)
      setMessage(error.message || "Gagal simpan soalan.")
    } finally {
      setSaving(false)
    }
  }

  function clearQuestionContent() {
    setItemCode("")
    setQuestionNoReference("")
    setMarks(1)
    setQuestionInstruction("")
    setStemText("")
    setAnswerSchemeText("")
    setAnswerFinal("")
    setExplanationText("")
    setStatus("draft")
    setOptions(createInitialOptions())
    setMcqOptionMode("separate")
    setSubQuestions(createInitialSubQuestions())
  }

  function prepareNextQuestionForm() {
    clearQuestionContent()
    setMetadataSuggestion("")
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  function resetForm() {
    clearQuestionContent()
    setSelectedTema("")
    setSelectedBidangCode("")
    setSelectedSKCode("")
    setSelectedSPCode("")
    setMainConstruct("")
    setConstructCode("")
    setDifficultyLevel("sederhana")
    setStimulusType("text")
    setSourceType("")
    setSourceReference("")
    setSourceYear("")
    setSourceSchool("")
    setPaper("paper_1")
    setSection("")
    setTingkatan(4)
    setMetadataSuggestion("")
    setMessage("")
  }

  if (loadingItem) {
    return (
      <div className="page-shell">
        <div className="card-block">
          <div className="empty-state">Memuatkan item untuk edit...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            {editId ? "Edit Soalan" : "Masukkan Soalan"}
          </h1>
          <p className="page-subtitle">
            {editId
              ? "Kemaskini item sedia ada dalam bank soalan Sains KSSM Tingkatan 4 dan 5."
              : "Bina item baharu untuk bank soalan Sains KSSM Tingkatan 4 dan 5."}
          </p>
        </div>

        <div className="header-badges">
          <Badge tone="blue">{selectedPaperLabel}</Badge>
          <Badge tone="purple">Tingkatan {tingkatan}</Badge>
          {section && <Badge tone="orange">Bahagian {section}</Badge>}
          <Badge tone="gray">{status}</Badge>
        </div>
      </div>

      <div className="paper-tabs">
        <button
          type="button"
          className={`paper-tab ${paper === "paper_1" ? "active" : ""}`}
          onClick={() => {
            setPaper("paper_1")
            setSection("")
            setQuestionNoReference("")
            setAnswerFinal("")
            setMarks(1)
          }}
        >
          Kertas 1 Objektif
        </button>

        <button
          type="button"
          className={`paper-tab ${paper === "paper_2" ? "active" : ""}`}
          onClick={() => {
            setPaper("paper_2")
            if (!section) {
              handleSectionChange("A")
              return
            }

            setMarks(expectedFormatMarks || 5)
          }}
        >
          Kertas 2 Subjektif
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="builder-layout">
          <div className="builder-main">
            <Card
              title="Tetapan Item"
              subtitle="Maklumat asas bagi soalan ini."
            >
              <div className="form-grid form-grid-4">
                <Field label="Kod Item (auto jika kosong)">
                  <input
                    value={itemCode}
                    onChange={(e) => setItemCode(e.target.value)}
                    className="input"
                    placeholder="Auto dijana oleh sistem"
                  />
                </Field>

                <Field label="Tingkatan">
                  <select
                    value={tingkatan}
                    onChange={(e) => setTingkatan(Number(e.target.value) as 4 | 5)}
                    className="input"
                  >
                    <option value={4}>Tingkatan 4</option>
                    <option value={5}>Tingkatan 5</option>
                  </select>
                </Field>

                {!isPaper1 && (
                  <Field label="Bahagian">
                    <select
                      value={section}
                      onChange={(e) => handleSectionChange(e.target.value as SectionType)}
                      className="input"
                    >
                      <option value="">Pilih bahagian</option>
                      <option value="A">Bahagian A</option>
                      <option value="B">Bahagian B</option>
                      <option value="C">Bahagian C</option>
                    </select>
                  </Field>
                )}

                <Field label="Markah">
                  <input
                    type="number"
                    value={displayedItemMarks}
                    onChange={(e) => setMarks(Number(e.target.value))}
                    className="input"
                    min={1}
                    readOnly={!isPaper1}
                  />
                </Field>

                {!isPaper1 && (
                  <Field label="No. Rujukan Soalan">
                    <select
                      value={questionNoReference}
                      onChange={(e) => handleQuestionReferenceChange(e.target.value)}
                      className="input"
                      disabled={!section}
                    >
                      <option value="">Pilih no. soalan</option>
                      {questionReferenceOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}

              </div>
            </Card>

            <Card
              title="Kandungan Soalan"
              subtitle="Isi stem, stimulus, rajah, jadual dan konteks utama item."
            >
              <div className="space-y-4">
                <Field label="Stem Soalan">
                  <Suspense fallback={<div className="input">Memuat editor...</div>}>
                    <RichEditor
                      value={stemText}
                      onChange={setStemText}
                      placeholder="Taip stem soalan, masukkan rajah, jadual atau stimulus di sini..."
                      showAnswerTemplate={isPaper1}
                    />
                  </Suspense>
                </Field>

                {isPaper1 && (
                  <div className="options-block">
                    <div className="section-mini-header">
                      <h3>Pilihan Jawapan</h3>
                      <p>Pilih cara pilihan jawapan dimasukkan untuk item objektif.</p>
                    </div>

                    <div className="option-mode-switch" role="group" aria-label="Mode pilihan jawapan">
                      <button
                        type="button"
                        className={mcqOptionMode === "separate" ? "active" : ""}
                        onClick={() => setMcqOptionMode("separate")}
                      >
                        Pilihan Biasa
                      </button>
                      <button
                        type="button"
                        className={mcqOptionMode === "in_stem" ? "active" : ""}
                        onClick={() => {
                          setMcqOptionMode("in_stem")
                          setOptions((prev) =>
                            prev.map((opt) => ({ ...opt, text: optionTextToHtml(opt.label) })),
                          )
                        }}
                      >
                        Pilihan Dalam Stem / Jadual
                      </button>
                    </div>

                    <Field label="Jawapan Betul">
                      <select
                        value={answerFinal}
                        onChange={(e) => setAnswerFinal(e.target.value)}
                        className="input"
                      >
                        <option value="">Pilih jawapan betul</option>
                        <option value="A">A</option>
                        <option value="B">B</option>
                        <option value="C">C</option>
                        <option value="D">D</option>
                      </select>
                    </Field>

                    {isStemOptionMode ? (
                      <div className="option-mode-note">
                        Masukkan jadual A-D terus dalam Stem Soalan. Sistem akan simpan pilihan ringkas A, B, C dan D untuk rujukan jawapan.
                      </div>
                    ) : (
                      <div className="options-grid options-grid-full">
                        {options.map((option, index) => (
                          <div
                            key={option.label}
                            className={`option-card option-card-rich ${
                              answerFinal === option.label ? "selected" : ""
                            }`}
                          >
                            <div className="option-top">
                              <div className="option-left">
                                <span className="option-label">{option.label}</span>
                                <span className="option-title">Pilihan {option.label}</span>
                              </div>

                              <label className="option-correct">
                                <input
                                  type="radio"
                                  name="correctOption"
                                  checked={answerFinal === option.label}
                                  onChange={() => setAnswerFinal(option.label)}
                                />
                                <span>Jawapan betul</span>
                              </label>
                            </div>

                            <Suspense fallback={<div className="input">Memuat editor...</div>}>
                              <RichEditor
                                value={option.text}
                                onChange={(value) => handleOptionChange(index, value)}
                                placeholder={`Isi kandungan pilihan ${option.label} di sini...`}
                              />
                            </Suspense>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {!isPaper1 && (
                  <div className="subquestion-block">
                    <div className="section-mini-header subquestion-head">
                      <div>
                        <h3>Sub-soalan Kertas 2</h3>
                        <p>Isi pecahan seperti (a), (b), (a)(i), markah dan skema jawapan.</p>
                      </div>
                      <div className="subquestion-total">
                        Jumlah: <strong>{totalSubQuestionMarks}</strong> markah
                      </div>
                    </div>

                    {expectedFormatMarks > 0 && totalSubQuestionMarks !== expectedFormatMarks && (
                      <div className="metadata-ai-message">
                        Soalan {questionNoReference || "ini"} perlu tepat {expectedFormatMarks} markah.
                        Jumlah semasa: {totalSubQuestionMarks} markah.
                      </div>
                    )}

                    <div className="subquestion-list">
                      {subQuestions.map((item, index) => (
                        <div key={item.id} className="subquestion-card">
                          <div className="subquestion-card-head">
                            <strong>Sub-soalan {formatSubQuestionLabel(item)}</strong>
                            <div className="subquestion-actions">
                              {!isInstructionSubQuestion(item) && (
                                <button
                                  type="button"
                                  className="icon-action-btn icon-action-ai"
                                  onClick={() => suggestSubQuestionMetadata(item.id)}
                                  title="Cadang metadata AI"
                                  aria-label={`Cadang metadata AI untuk sub-soalan ${formatSubQuestionLabel(item)}`}
                                >
                                  <SparklesIcon />
                                </button>
                              )}
                              <button
                                type="button"
                                className="icon-action-btn icon-action-danger"
                                onClick={() => removeSubQuestion(item.id)}
                                disabled={subQuestions.length <= 1}
                                title="Buang sub-soalan"
                                aria-label={`Buang sub-soalan ${formatSubQuestionLabel(item)}`}
                              >
                                <TrashIcon />
                              </button>
                            </div>
                          </div>

                          <div className="form-grid subquestion-settings-grid">
                            <Field label="Label">
                              <select
                                value={item.label}
                                onChange={(e) => updateSubQuestion(item.id, { label: e.target.value })}
                                className="input"
                              >
                                {["a", "b", "c", "d", "e"].map((label) => (
                                  <option key={label} value={label}>
                                    {label}
                                  </option>
                                ))}
                              </select>
                            </Field>

                            <Field label="Sub-label">
                              <select
                                value={item.subLabel}
                                onChange={(e) => updateSubQuestion(item.id, { subLabel: e.target.value })}
                                className="input"
                              >
                                <option value="">-</option>
                                <option value="i">i</option>
                                <option value="ii">ii</option>
                                <option value="iii">iii</option>
                                <option value="iv">iv</option>
                              </select>
                            </Field>

                            <Field label="Markah">
                              <input
                                type="number"
                                min={isInstructionSubQuestion(item) ? 0 : 1}
                                value={isInstructionSubQuestion(item) ? 0 : item.marks}
                                onChange={(e) =>
                                  updateSubQuestion(item.id, { marks: Number(e.target.value) })
                                }
                                className="input"
                                disabled={isInstructionSubQuestion(item)}
                              />
                            </Field>

                            <Field label="Jenis Respons">
                              <select
                                value={item.responseType}
                                onChange={(e) =>
                                  updateSubQuestion(item.id, {
                                    responseType: e.target.value as SubQuestionResponseType,
                                    marks: e.target.value === "instruction" ? 0 : Math.max(Number(item.marks) || 1, 1),
                                  })
                                }
                                className="input"
                              >
                                <option value="instruction">Arahan induk / tanpa markah</option>
                                <option value="short_text">Jawapan ringkas</option>
                                <option value="structured_text">Berstruktur</option>
                                <option value="table">Jadual</option>
                                <option value="drawing">Lakaran</option>
                                <option value="design">Rekacipta</option>
                                <option value="calculation">Pengiraan</option>
                              </select>
                            </Field>

                            {!isInstructionSubQuestion(item) && (
                              <>
                                <Field label="Konstruk">
                                  <select
                                    value={item.mainConstruct}
                                    onChange={(e) => {
                                      const nextGroup = e.target.value
                                      const firstCode =
                                        getConstructCodesForGroup(nextGroup)[0]?.construct_code || ""
                                      updateSubQuestion(item.id, {
                                        mainConstruct: nextGroup,
                                        constructCode: firstCode,
                                      })
                                    }}
                                    className="input"
                                  >
                                    <option value="">Pilih konstruk</option>
                                    {constructGroupList.map((group) => (
                                      <option key={group} value={group}>
                                        {group}
                                      </option>
                                    ))}
                                  </select>
                                </Field>

                                <Field label="Kod Konstruk">
                                  <select
                                    value={item.constructCode}
                                    onChange={(e) =>
                                      updateSubQuestion(item.id, { constructCode: e.target.value })
                                    }
                                    className="input"
                                    disabled={!item.mainConstruct}
                                  >
                                    <option value="">Pilih kod konstruk</option>
                                    {getConstructCodesForGroup(item.mainConstruct).map((c) => (
                                      <option key={c.construct_code} value={c.construct_code}>
                                        {c.construct_code} : {c.aspect_name}
                                      </option>
                                    ))}
                                  </select>
                                </Field>

                                <Field label="Aras">
                                  <select
                                    value={item.difficultyLevel}
                                    onChange={(e) =>
                                      updateSubQuestion(item.id, {
                                        difficultyLevel: e.target.value as DifficultyType,
                                      })
                                    }
                                    className="input"
                                  >
                                    <option value="rendah">rendah</option>
                                    <option value="sederhana">sederhana</option>
                                    <option value="tinggi">tinggi</option>
                                  </select>
                                </Field>
                              </>
                            )}
                          </div>

                          <Field label={`Teks Soalan ${formatSubQuestionLabel(item)}`}>
                            <Suspense fallback={<div className="input">Memuat editor...</div>}>
                              <RichEditor
                                value={item.questionText}
                                onChange={(value) => updateSubQuestion(item.id, { questionText: value })}
                                placeholder={`Masukkan sub-soalan ${formatSubQuestionLabel(item)}...`}
                              />
                            </Suspense>
                          </Field>

                        </div>
                      ))}
                    </div>

                    <button type="button" className="btn btn-light" onClick={addSubQuestion}>
                      + Tambah Sub-soalan
                    </button>

                    <div className="marking-scheme-block">
                      <div className="section-mini-header">
                        <div>
                          <h3>Panduan Pemarkahan / Skema Jawapan</h3>
                          <p>Jadual dijana daripada sub-soalan bermarkah sahaja.</p>
                        </div>
                        <div className="marking-header-actions">
                          <button
                            type="button"
                            className="btn btn-light btn-sm"
                            onClick={() => void generateAllAnswerSchemes()}
                            disabled={Boolean(generatingSchemeId) || markedSubQuestions.length === 0}
                          >
                            Jana Semua Skema
                          </button>
                          <div className="subquestion-total">
                            Jumlah: <strong>{totalSubQuestionMarks}</strong> markah
                          </div>
                        </div>
                      </div>

                      <div className="marking-table-wrap">
                        <table className="marking-table">
                          <thead>
                            <tr>
                              <th>Nombor Soalan</th>
                              <th>Cadangan Jawapan</th>
                              <th>Markah</th>
                            </tr>
                          </thead>
                          <tbody>
                            {markedSubQuestions.length === 0 ? (
                              <tr>
                                <td colSpan={3}>Tiada sub-soalan bermarkah.</td>
                              </tr>
                            ) : (
                              markedSubQuestions.map((item) => (
                                <tr key={item.id}>
                                  <td>{formatSubQuestionLabel(item)}</td>
                                  <td>
                                    <div className="marking-answer-cell">
                                      <textarea
                                        value={item.answerSchemeText}
                                        onChange={(e) =>
                                          updateSubQuestion(item.id, {
                                            answerSchemeText: e.target.value,
                                          })
                                        }
                                        className="input marking-answer-input"
                                        placeholder={`Cadangan jawapan ${formatSubQuestionLabel(item)}`}
                                      />
                                      <button
                                        type="button"
                                        className="icon-action-btn icon-action-ai marking-ai-btn"
                                        onClick={() => void generateAnswerSchemeForSubQuestion(item)}
                                        disabled={generatingSchemeId === item.id}
                                        title="Jana cadangan jawapan AI"
                                        aria-label={`Jana cadangan jawapan AI untuk ${formatSubQuestionLabel(item)}`}
                                      >
                                        {generatingSchemeId === item.id ? "..." : <SparklesIcon />}
                                      </button>
                                    </div>
                                  </td>
                                  <td>{item.marks}</td>
                                </tr>
                              ))
                            )}
                            <tr className="marking-total-row">
                              <th>Jumlah</th>
                              <td></td>
                              <th>{totalSubQuestionMarks}</th>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                <Field label="Penerangan / Rasional">
                  <textarea
                    value={explanationText}
                    onChange={(e) => setExplanationText(e.target.value)}
                    className="input textarea-md"
                    placeholder="Optional"
                  />
                </Field>
              </div>
            </Card>

            <Card
              title="Metadata Akademik"
              subtitle="Pilih standard DSKP. Maklumat kod akan diisi secara automatik."
            >
              <div className="metadata-ai-bar">
                <div>
                  <strong>Cadangan metadata</strong>
                  <span>
                    {isPaper1
                      ? "Pra-isi Tema, Bidang, SK, SP, konstruk dan aras berdasarkan kandungan soalan."
                      : "Pra-isi Tema, Bidang, SK, SP serta cadangan konstruk/aras pada sub-soalan."}
                  </span>
                </div>
                <button
                  type="button"
                  className="btn btn-light"
                  onClick={() => void suggestMetadata()}
                  disabled={suggestingMetadata}
                >
                  {suggestingMetadata ? "Menganalisis..." : "Cadang Metadata"}
                </button>
              </div>

              {constructBlueprint && (
                <div className="metadata-ai-message">
                  Rujukan format SPM untuk Soalan {questionNoReference}: {constructBlueprint.label}. Cadangan masih boleh diubah oleh penggubal.
                </div>
              )}

              {metadataSuggestion && (
                <div className="metadata-ai-message">{metadataSuggestion}</div>
              )}

              <div className="metadata-clean-grid">
                <Field label="Tema">
                  <select
                    value={selectedTema}
                    onChange={(e) => {
                      setSelectedTema(e.target.value)
                      setSelectedBidangCode("")
                      setSelectedSKCode("")
                      setSelectedSPCode("")
                    }}
                    className="input"
                  >
                    <option value="">Pilih tema</option>
                    {temaList.map((tema) => (
                      <option key={tema} value={tema}>
                        {tema}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Bidang Pembelajaran">
                  <select
                    value={selectedBidangCode}
                    onChange={(e) => {
                      setSelectedBidangCode(e.target.value)
                      setSelectedSKCode("")
                      setSelectedSPCode("")
                    }}
                    className="input"
                    disabled={!selectedTema}
                  >
                    <option value="">Pilih bidang pembelajaran</option>
                    {bidangList.map((b) => (
                      <option key={b.code} value={b.code}>
                        {b.code} - {b.name}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Standard Kandungan">
                  <select
                    value={selectedSKCode}
                    onChange={(e) => {
                      setSelectedSKCode(e.target.value)
                      setSelectedSPCode("")
                    }}
                    className="input"
                    disabled={!selectedBidangCode}
                  >
                    <option value="">Pilih standard kandungan</option>
                    {skList.map((sk) => (
                      <option key={sk.code} value={sk.code}>
                        {sk.code} - {sk.name}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Standard Pembelajaran">
                  <select
                    value={selectedSPCode}
                    onChange={(e) => setSelectedSPCode(e.target.value)}
                    className="input"
                    disabled={!selectedSKCode}
                  >
                    <option value="">Pilih standard pembelajaran</option>
                    {spList.map((sp) => (
                      <option
                        key={sp.standard_pembelajaran_code}
                        value={sp.standard_pembelajaran_code}
                      >
                        {sp.standard_pembelajaran_code} - {sp.standard_pembelajaran_name}
                      </option>
                    ))}
                  </select>
                </Field>

                {isPaper1 && (
                  <>
                    <Field label="Konstruk Utama">
                      <select
                        value={mainConstruct}
                        onChange={(e) => {
                          setMainConstruct(e.target.value)
                          setConstructCode("")
                        }}
                        className="input"
                      >
                        <option value="">Pilih konstruk</option>
                        {constructGroupList.map((group) => (
                          <option key={group} value={group}>
                            {group}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <Field label="Kod Konstruk">
                      <select
                        value={constructCode}
                        onChange={(e) => setConstructCode(e.target.value)}
                        className="input"
                        disabled={!mainConstruct}
                      >
                        <option value="">Pilih kod konstruk</option>
                        {constructCodeList.map((c) => (
                          <option key={c.construct_code} value={c.construct_code}>
                            {c.construct_code} : {c.aspect_name}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <Field label="Aras Kesukaran">
                      <select
                        value={difficultyLevel}
                        onChange={(e) => setDifficultyLevel(e.target.value as DifficultyType)}
                        className="input"
                      >
                        <option value="rendah">rendah</option>
                        <option value="sederhana">sederhana</option>
                        <option value="tinggi">tinggi</option>
                      </select>
                    </Field>
                  </>
                )}
              </div>
            </Card>

            <Card
              title="Sumber Item"
              subtitle="Sumber dan tahun rujukan. Penggubal direkod automatik melalui akaun login."
            >
              <div className="form-grid source-item-grid">
                <Field label="Sumber">
                  <input
                    value={sourceType}
                    onChange={(e) => setSourceType(e.target.value)}
                    className="input"
                    placeholder="Contoh: Trial / Original / Buku teks"
                  />
                </Field>

                <Field label="Tahun">
                  <input
                    value={sourceYear}
                    onChange={(e) => setSourceYear(e.target.value)}
                    className="input"
                    placeholder="2026"
                  />
                </Field>

                <Field label="Penggubal Item">
                  <div className="source-author-card">
                    <span>Penggubal:</span>
                    <strong>{authorAuditText}</strong>
                  </div>
                </Field>
              </div>
            </Card>
          </div>

          <aside className="builder-sidebar">
            <Card title="Preview Ringkas" subtitle="Ringkasan item semasa.">
              <div className="preview-stack">
                <PreviewRow label="Kod Item" value={itemCode || "-"} />
                <PreviewRow label="Kertas" value={selectedPaperLabel} />
                <PreviewRow label="Tingkatan" value={`Tingkatan ${tingkatan}`} />
                <PreviewRow label="Bahagian" value={section || "-"} />
                <PreviewRow label="Jenis Item" value={itemType} />
                <PreviewRow label="Markah" value={String(displayedItemMarks)} />
                <PreviewRow
                  label="Bidang"
                  value={
                    selectedBidangObj
                      ? `${selectedBidangObj.code} - ${selectedBidangObj.name}`
                      : "-"
                  }
                />
                <PreviewRow
                  label="Std. Kandungan"
                  value={selectedSKObj ? `${selectedSKObj.code} - ${selectedSKObj.name}` : "-"}
                />
                <PreviewRow
                  label="Std. Pembelajaran"
                  value={selectedSPCode || "-"}
                />
                {isPaper1 ? (
                  <>
                    <PreviewRow label="Konstruk" value={mainConstruct || "-"} />
                    <PreviewRow label="Kod Konstruk" value={constructCode || "-"} />
                    <PreviewRow label="Aras" value={difficultyLevel} />
                  </>
                ) : (
                  <PreviewRow
                    label="Konstruk"
                    value="Ikut sub-soalan"
                  />
                )}
                <PreviewRow label="Status" value={status} />
              </div>
            </Card>

            <Card title="Pratonton Kandungan" subtitle="Semakan cepat sebelum simpan.">
              <div className="mini-preview">
                <div className="mini-preview-stem">
                  {!isRichContentEmpty(stemText) ? (
                    <div dangerouslySetInnerHTML={{ __html: stemText }} />
                  ) : (
                    "Stem soalan akan dipaparkan di sini."
                  )}
                </div>

                {isPaper1 && !isStemOptionMode && (
                  <div className="mini-options">
                    {options.map((opt) => (
                      <div key={opt.label} className="mini-option rich-preview-option">
                        <div className="mini-option-head">
                          <strong>{opt.label}.</strong>
                          {answerFinal === opt.label && (
                            <span className="mini-correct">Betul</span>
                          )}
                        </div>

                        <div
                          className="mini-option-body"
                          dangerouslySetInnerHTML={{
                            __html: opt.text || "<p>...</p>",
                          }}
                        />
                      </div>
                    ))}
                  </div>
                )}

                {isPaper1 && isStemOptionMode && answerFinal && (
                  <div className="preview-answer-box">
                    Jawapan betul: <strong>{answerFinal}</strong>
                  </div>
                )}

                {!isPaper1 && (
                  <div className="mini-subquestions">
                    {subQuestions.map((item) => (
                      <div key={item.id} className="preview-subquestion">
                        <div className="mini-option-head">
                          <strong>{formatSubQuestionLabel(item)}</strong>
                          <span>
                            {isInstructionSubQuestion(item) ? "Arahan" : `${item.marks} markah`}
                          </span>
                        </div>
                        {!isInstructionSubQuestion(item) && (
                          <div className="bank-item-construct">
                            {item.constructCode || "-"} · {item.difficultyLevel || "-"}
                          </div>
                        )}
                        <div
                          dangerouslySetInnerHTML={{
                            __html: item.questionText || "<p>Sub-soalan akan dipaparkan di sini.</p>",
                          }}
                        />
                        <AnswerSpace
                          responseType={item.responseType}
                          marks={item.marks}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>

            <Card title="Panduan Cepat" subtitle="Rujukan ringkas semasa masukkan item.">
              <ul className="tips-list">
                <li>Untuk Kertas 2, masukkan skema pada setiap sub-soalan.</li>
                <li>Kertas 1 perlu 4 pilihan jawapan dan satu jawapan betul.</li>
                <li>Untuk soalan objektif berjadual, letak jadual A-D dalam stem dan guna mode pilihan dalam stem.</li>
                <li>Bahagian A Kertas 2 perlu jumlah 5 markah.</li>
                <li>Guna konstruk dan aras yang konsisten untuk memudahkan carian.</li>
              </ul>
            </Card>
          </aside>
        </div>

        <div className="sticky-actions">
          <div className="sticky-left">
            {message && <span className="save-message">{message}</span>}
          </div>

          <div className="sticky-right">
            <button
              type="button"
              className="btn btn-light"
              onClick={resetForm}
              disabled={saving}
            >
              Reset
            </button>

            <button
              type="submit"
              disabled={saving}
              className="btn btn-primary"
            >
              {saving ? "Menyimpan..." : "Simpan Soalan"}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

function Card({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <section className="card-block">
      <div className="card-head">
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <div>{children}</div>
    </section>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="field-wrap">
      <label className="field-label">{label}</label>
      {children}
    </div>
  )
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="preview-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function Badge({
  children,
  tone,
}: {
  children: React.ReactNode
  tone: "blue" | "purple" | "orange" | "gray"
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}

