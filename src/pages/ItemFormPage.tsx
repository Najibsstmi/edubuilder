import { FormEvent, Suspense, lazy, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { supabase } from "../lib/supabase"
import { useUser } from "../context/UserContext"

const RichEditor = lazy(() => import("../components/RichEditor"))

type PaperType = "paper_1" | "paper_2"
type SectionType = "A" | "B" | "C" | ""
type ItemType = "mcq" | "structured" | "limited_response" | "open_response"
type DifficultyType = "rendah" | "sederhana" | "tinggi"
type McqOptionMode = "separate" | "in_stem"
type SubQuestionResponseType =
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
  marks: number
  responseType: SubQuestionResponseType
}

const initialOptions: McqOption[] = [
  { label: "A", text: "" },
  { label: "B", text: "" },
  { label: "C", text: "" },
  { label: "D", text: "" },
]

const initialSubQuestions: SubQuestion[] = [
  {
    id: crypto.randomUUID(),
    label: "a",
    subLabel: "",
    questionText: "",
    marks: 1,
    responseType: "short_text",
  },
]

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
  const [options, setOptions] = useState<McqOption[]>(initialOptions)
  const [mcqOptionMode, setMcqOptionMode] = useState<McqOptionMode>("separate")
  const [metadataSuggestion, setMetadataSuggestion] = useState("")
  const [suggestingMetadata, setSuggestingMetadata] = useState(false)
  const [subQuestions, setSubQuestions] = useState<SubQuestion[]>(initialSubQuestions)

  const isPaper1 = paper === "paper_1"
  const isStemOptionMode = isPaper1 && mcqOptionMode === "in_stem"
  const totalSubQuestionMarks = useMemo(
    () => subQuestions.reduce((total, item) => total + (Number(item.marks) || 0), 0),
    [subQuestions],
  )

  const itemType = useMemo<ItemType>(() => {
    if (paper === "paper_1") return "mcq"
    if (section === "A") return "structured"
    if (section === "B") return "limited_response"
    return "open_response"
  }, [paper, section])

  const selectedPaperLabel = paper === "paper_1" ? "Kertas 1" : "Kertas 2"

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

  const selectedConstructObj = constructs.find(
    (c) => c.construct_code === constructCode
  ) || null

  function handleOptionChange(index: number, value: string) {
    setOptions((prev) =>
      prev.map((opt, i) => (i === index ? { ...opt, text: value } : opt)),
    )
  }

  function addSubQuestion() {
    const nextLabel = String.fromCharCode(97 + subQuestions.length)
    setSubQuestions((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        label: nextLabel,
        subLabel: "",
        questionText: "",
        marks: 1,
        responseType: "short_text",
      },
    ])
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

  function inferDifficulty(text: string): DifficultyType {
    const lower = text.toLowerCase()
    if (/(wajarkan|justifikasi|cadangkan|rekabentuk|analisis|ramalkan|evaluate|justify)/.test(lower)) {
      return "tinggi"
    }
    if (/(hitung|kira|terangkan|jelaskan|bandingkan|inferens|mengapa|calculate)/.test(lower)) {
      return "sederhana"
    }
    return isPaper1 ? "rendah" : "sederhana"
  }

  async function suggestMetadata() {
    setMetadataSuggestion("")

    const optionText = options.map((opt) => htmlToText(opt.text)).join(" ")
    const questionText = [
      questionInstruction,
      htmlToText(stemText),
      isStemOptionMode ? "" : optionText,
      subQuestions.map((sq) => htmlToText(sq.questionText)).join(" "),
      htmlToText(answerSchemeText),
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
      const availableConstructGroup =
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
        setConstructCode(availableConstruct?.construct_code || "")
      }

      const suggestedDifficulty = inferDifficulty(questionText)
      setDifficultyLevel(suggestedDifficulty)

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
        construct_code: availableConstruct?.construct_code || null,
        difficulty_level: suggestedDifficulty,
      }

      if (profile?.id) {
        await supabase.from("ai_usage_logs").insert({
          profile_id: profile.id,
          usage_type: "suggest_metadata_rule_based",
          input_snapshot: {
            tingkatan,
            paper,
            section,
            text: questionText.slice(0, 2500),
          },
          output_snapshot: result,
        })
      }

      setMetadataSuggestion(
        bestStandard && scoredStandards[0].score > 0
          ? `Cadangan metadata diisi. Padanan standard skor ${scoredStandards[0].score}; sila semak sebelum simpan.`
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
          setOptions(initialOptions)
          setMcqOptionMode("separate")
        }
      } else {
        setOptions(initialOptions)
        setMcqOptionMode("separate")

        const { data: subQuestionData, error: subQuestionError } = await supabase
          .from("item_subquestions")
          .select("*")
          .eq("item_id", itemId)
          .order("display_order", { ascending: true })

        if (subQuestionError) {
          console.warn("Subquestion fetch skipped", subQuestionError)
          setSubQuestions(initialSubQuestions)
        } else if (subQuestionData && subQuestionData.length > 0) {
          setSubQuestions(
            subQuestionData.map((row: any) => ({
              id: row.id || crypto.randomUUID(),
              label: row.label || "a",
              subLabel: row.sub_label || "",
              questionText: row.question_text || "",
              marks: row.marks || 1,
              responseType: row.response_type || "short_text",
            })),
          )
        } else {
          setSubQuestions(initialSubQuestions)
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

      if (subQuestions.length === 0) {
        setMessage("Tambah sekurang-kurangnya satu sub-soalan untuk Kertas 2.")
        return
      }

      const incompleteSubQuestion = subQuestions.find(
        (item) =>
          !item.label.trim() ||
          isRichContentEmpty(item.questionText) ||
          Number(item.marks) < 1,
      )

      if (incompleteSubQuestion) {
        setMessage("Setiap sub-soalan perlu label, teks soalan dan markah.")
        return
      }

      if (isRichContentEmpty(answerSchemeText)) {
        setMessage("Panduan pemarkahan / skema jawapan wajib diisi untuk Kertas 2.")
        return
      }

      if (section === "A" && totalSubQuestionMarks !== 5) {
        setMessage("Bahagian A mesti berjumlah 5 markah.")
        return
      }
    }

    if (!selectedTema || !selectedBidangCode || !selectedSKCode || !selectedSPCode) {
      setMessage("Metadata akademik DSKP wajib dilengkapkan.")
      return
    }

    if (!mainConstruct || !constructCode) {
      setMessage("Konstruk dan kod konstruk wajib dipilih.")
      return
    }

    if (profile?.role !== "master_admin") {
      if (status === "approved" || status === "published" || status === "archived") {
        setMessage("Hanya master admin boleh approve, publish atau archive item.")
        return
      }
    }

    setSaving(true)

    try {
      const statusAuditFields =
        profile?.role === "master_admin"
          ? {
              approved_by: status === "approved" ? profile.id : null,
              approved_at: status === "approved" ? new Date().toISOString() : null,
              published_by: status === "published" ? profile.id : null,
              published_at: status === "published" ? new Date().toISOString() : null,
            }
          : {}

      const finalItemCode = itemCode.trim() || generateItemCode()

      const finalAnswerSchemeText = isPaper1
        ? `Jawapan: ${answerFinal}`
        : answerSchemeText

      const payload = {
        item_code: finalItemCode,
        updated_by: profile.id,

        tingkatan,
        paper: isPaper1 ? "paper_1" : "paper_2",
        section: isPaper1 ? null : section || null,
        question_no_reference:
          !isPaper1 && questionNoReference.trim() ? questionNoReference.trim() : null,

        item_type: isPaper1 ? "mcq" : itemType,
        marks: isPaper1 ? 1 : totalSubQuestionMarks,

        theme_name: selectedTema || null,
        bidang_learning_code: selectedBidangObj?.code || null,
        bidang_learning_name: selectedBidangObj?.name || null,
        standard_kandungan: selectedSKObj?.code || null,
        standard_pembelajaran: selectedSPObj?.standard_pembelajaran_code || null,

        main_construct: mainConstruct || null,
        construct_code: constructCode || null,
        difficulty_level: difficultyLevel,

        stimulus_type: stimulusType || null,
        question_instruction: questionInstruction || null,
        stem_text: stemText,
        answer_scheme_text: finalAnswerSchemeText,
        answer_final: isPaper1 ? answerFinal : answerFinal || null,
        explanation_text: explanationText || null,

        source_type: sourceType || null,
        source_reference: sourceReference || null,
        source_year: sourceYear ? Number(sourceYear) : null,
        source_school: sourceSchool || null,

        status,
        ...statusAuditFields,
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
          answer_scheme_text: "-",
          marks: Number(item.marks) || 1,
          response_type: item.responseType,
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

      setMessage(editId ? "Soalan berjaya dikemaskini." : "Soalan berjaya disimpan.")
      if (!editId) {
        resetForm()
      }
    } catch (error: any) {
      console.error(error)
      setMessage(error.message || "Gagal simpan soalan.")
    } finally {
      setSaving(false)
    }
  }

  function resetForm() {
    setItemCode("")
    setQuestionNoReference("")
    setSelectedTema("")
    setSelectedBidangCode("")
    setSelectedSKCode("")
    setSelectedSPCode("")
    setMainConstruct("")
    setConstructCode("")
    setDifficultyLevel("sederhana")
    setMarks(1)
    setStimulusType("text")
    setQuestionInstruction("")
    setStemText("")
    setAnswerSchemeText("")
    setAnswerFinal("")
    setExplanationText("")
    setSourceType("")
    setSourceReference("")
    setSourceYear("")
    setSourceSchool("")
    setStatus("draft")
    setOptions(initialOptions)
    setMcqOptionMode("separate")
    setSubQuestions(initialSubQuestions)
    setPaper("paper_1")
    setSection("")
    setTingkatan(4)
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
            setMarks(totalSubQuestionMarks || 5)
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
                      onChange={(e) => setSection(e.target.value as SectionType)}
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
                    value={isPaper1 ? 1 : totalSubQuestionMarks}
                    onChange={(e) => setMarks(Number(e.target.value))}
                    className="input"
                    min={1}
                    readOnly={!isPaper1}
                  />
                </Field>

                {!isPaper1 && (
                  <Field label="No. Rujukan Soalan">
                    <input
                      value={questionNoReference}
                      onChange={(e) => setQuestionNoReference(e.target.value)}
                      className="input"
                      placeholder="Contoh: 5 / 6 / 11 / 12"
                    />
                  </Field>
                )}

                <Field label="Status">
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="input"
                  >
                    <option value="draft">draft</option>
                    <option value="pending_review">pending_review</option>

                    {profile?.role === "master_admin" && (
                      <>
                        <option value="approved">approved</option>
                        <option value="published">published</option>
                        <option value="archived">archived</option>
                      </>
                    )}
                  </select>
                </Field>

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

                    {section === "A" && totalSubQuestionMarks !== 5 && (
                      <div className="metadata-ai-message">
                        Bahagian A perlu tepat 5 markah. Jumlah semasa: {totalSubQuestionMarks} markah.
                      </div>
                    )}

                    <div className="subquestion-list">
                      {subQuestions.map((item, index) => (
                        <div key={item.id} className="subquestion-card">
                          <div className="subquestion-card-head">
                            <strong>Sub-soalan {formatSubQuestionLabel(item)}</strong>
                            <button
                              type="button"
                              className="btn btn-light btn-sm"
                              onClick={() => removeSubQuestion(item.id)}
                              disabled={subQuestions.length <= 1}
                            >
                              Buang
                            </button>
                          </div>

                          <div className="form-grid form-grid-4">
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
                                min={1}
                                value={item.marks}
                                onChange={(e) =>
                                  updateSubQuestion(item.id, { marks: Number(e.target.value) })
                                }
                                className="input"
                              />
                            </Field>

                            <Field label="Jenis Respons">
                              <select
                                value={item.responseType}
                                onChange={(e) =>
                                  updateSubQuestion(item.id, {
                                    responseType: e.target.value as SubQuestionResponseType,
                                  })
                                }
                                className="input"
                              >
                                <option value="short_text">Jawapan ringkas</option>
                                <option value="structured_text">Berstruktur</option>
                                <option value="table">Jadual</option>
                                <option value="drawing">Lakaran</option>
                                <option value="design">Rekacipta</option>
                                <option value="calculation">Pengiraan</option>
                              </select>
                            </Field>
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

                    <Field label="Panduan Pemarkahan / Skema Jawapan">
                      <Suspense fallback={<div className="input">Memuat editor...</div>}>
                        <RichEditor
                          value={answerSchemeText}
                          onChange={setAnswerSchemeText}
                          placeholder="Masukkan skema keseluruhan item, contoh: (a) ... [1 markah], (b) ... [1 markah]"
                        />
                      </Suspense>
                    </Field>
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
                  <span>Pra-isi Tema, Bidang, SK, SP, konstruk dan aras berdasarkan kandungan soalan.</span>
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
              </div>

              <div className="metadata-summary">
                <div>
                  <span>Tema</span>
                  <strong>{selectedTema || "-"}</strong>
                </div>
                <div>
                  <span>Bidang</span>
                  <strong>
                    {selectedBidangObj
                      ? `${selectedBidangObj.code} - ${selectedBidangObj.name}`
                      : "-"}
                  </strong>
                </div>
                <div>
                  <span>SK</span>
                  <strong>
                    {selectedSKObj
                      ? `${selectedSKObj.code} - ${selectedSKObj.name}`
                      : "-"}
                  </strong>
                </div>
                <div>
                  <span>SP</span>
                  <strong>
                    {selectedSPObj
                      ? `${selectedSPObj.standard_pembelajaran_code} - ${selectedSPObj.standard_pembelajaran_name}`
                      : "-"}
                  </strong>
                </div>
                <div>
                  <span>Konstruk</span>
                  <strong>
                    {selectedConstructObj
                      ? `${selectedConstructObj.construct_code} : ${selectedConstructObj.aspect_name}`
                      : "-"}
                  </strong>
                </div>
              </div>
            </Card>

            <Card
              title="Sumber Item"
              subtitle="Maklumat asal item untuk rujukan dan audit."
            >
              <div className="form-grid form-grid-4">
                <Field label="Sumber">
                  <input
                    value={sourceType}
                    onChange={(e) => setSourceType(e.target.value)}
                    className="input"
                    placeholder="trial_exam / teacher_original"
                  />
                </Field>

                <Field label="Rujukan Sumber">
                  <input
                    value={sourceReference}
                    onChange={(e) => setSourceReference(e.target.value)}
                    className="input"
                    placeholder="Contoh: Percubaan Johor"
                  />
                </Field>

                <Field label="Tahun">
                  <input
                    value={sourceYear}
                    onChange={(e) => setSourceYear(e.target.value)}
                    className="input"
                    placeholder="2025"
                  />
                </Field>

                <Field label="Sekolah / Penerbit">
                  <input
                    value={sourceSchool}
                    onChange={(e) => setSourceSchool(e.target.value)}
                    className="input"
                    placeholder="Nama sekolah"
                  />
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
                <PreviewRow label="Markah" value={String(isPaper1 ? 1 : totalSubQuestionMarks)} />
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
                <PreviewRow label="Konstruk" value={mainConstruct || "-"} />
                <PreviewRow label="Kod Konstruk" value={constructCode || "-"} />
                <PreviewRow label="Aras" value={difficultyLevel} />
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
                      <div key={item.id} className="mini-subquestion">
                        <div className="mini-option-head">
                          <strong>{formatSubQuestionLabel(item)}</strong>
                          <span>{item.marks} markah</span>
                        </div>
                        <div
                          className="mini-option-body"
                          dangerouslySetInnerHTML={{
                            __html: item.questionText || "<p>Sub-soalan akan dipaparkan di sini.</p>",
                          }}
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

