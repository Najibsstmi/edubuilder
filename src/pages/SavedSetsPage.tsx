import { useEffect, useMemo, useState } from "react"
import { useAuth } from "../contexts/AuthContext"
import { supabase } from "../lib/supabase"
import { Document, Packer, Paragraph, TextRun, Table, TableCell, TableRow, ImageRun, AlignmentType, HeadingLevel, WidthType, VerticalAlign } from "docx"
// @ts-ignore
import { saveAs } from "file-saver"

type PaperType = "paper_1" | "paper_2"

type SavedSet = {
  id: string
  title: string
  build_mode: string
  tingkatan: number | null
  paper: PaperType | null
  section: string | null
  status: string
  created_at: string
  build_set_items: SavedSetItemRow[]
}

type SavedSetItemRow = {
  id: string
  section: "A" | "B" | "C" | null
  display_order: number
  custom_question_no: string | null
  marks: number
  items: SavedItem | SavedItem[] | null
}

type SavedItem = {
  id: string
  item_code: string
  stem_text: string | null
  answer_scheme_text: string | null
  paper: PaperType
  section: "A" | "B" | "C" | null
  tingkatan: number
  marks: number
  question_no_reference: string | null
  item_options?: ItemOption[]
  item_subquestions?: ItemSubQuestion[]
}

type ItemOption = {
  option_label: string
  option_text: string | null
  option_image_url: string | null
  display_order: number
}

type ItemSubQuestion = {
  id: string
  label: string
  sub_label: string | null
  question_text: string
  answer_scheme_text: string
  marks: number
  response_type: string
  display_order: number
}

type NormalizedSetItem = {
  id: string
  display_order: number
  custom_question_no: string
  marks: number
  item: SavedItem | null
}

const GUEST_SET_KEY = "edubuilder_guest_sets"

export default function SavedSetsPage() {
  const { profile } = useAuth()
  const [sets, setSets] = useState<SavedSet[]>([])
  const [selectedSetId, setSelectedSetId] = useState("")
  const [loading, setLoading] = useState(true)
  const [deletingSetId, setDeletingSetId] = useState("")
  const [message, setMessage] = useState("")
  const [printMode, setPrintMode] = useState<"question" | "scheme">("question")

  useEffect(() => {
    void fetchSets()
  }, [profile?.id])

  const selectedSet = useMemo(
    () => sets.find((set) => set.id === selectedSetId) || sets[0] || null,
    [selectedSetId, sets],
  )

  const selectedItems = useMemo(() => normalizeItems(selectedSet), [selectedSet])
  const setLimit = getSavedSetLimit(profile)

  async function fetchSets() {
    if (!profile?.id) return

    setLoading(true)
    setMessage("")

    if (profile.id === "guest-local") {
      const nextSets = getGuestSavedSets()
      setSets(nextSets)
      setSelectedSetId((current) => {
        if (current && nextSets.some((set) => set.id === current)) return current
        return nextSets[0]?.id || ""
      })
      setLoading(false)
      return
    }

    const { data, error } = await supabase
      .from("build_sets")
      .select(`
        id,
        title,
        build_mode,
        tingkatan,
        paper,
        section,
        status,
        created_at,
        build_set_items (
          id,
          section,
          display_order,
          custom_question_no,
          marks,
          items (
            id,
            item_code,
            stem_text,
            answer_scheme_text,
            paper,
            tingkatan,
            marks,
            question_no_reference,
            section,
            item_options (
              option_label,
              option_text,
              option_image_url,
              display_order
            ),
            item_subquestions (
              id,
              label,
              sub_label,
              question_text,
              answer_scheme_text,
              marks,
              response_type,
              display_order
            )
          )
        )
      `)
      .eq("owner_profile_id", profile.id)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Saved sets fetch error", error)
      setMessage(error.message)
    } else {
      const nextSets = (data || []) as SavedSet[]
      setSets(nextSets)
      setSelectedSetId((current) => {
        if (current && nextSets.some((set) => set.id === current)) return current
        return nextSets[0]?.id || ""
      })
    }

    setLoading(false)
  }

  async function deleteSet(set: SavedSet) {
    const confirmed = window.confirm(`Padam set "${set.title}"? Set ini akan dibuang daripada Set Saya.`)
    if (!confirmed) return

    setDeletingSetId(set.id)
    setMessage("")

    try {
      if (profile?.id === "guest-local") {
        const nextSets = getGuestSavedSets().filter((row) => row.id !== set.id)
        localStorage.setItem(GUEST_SET_KEY, JSON.stringify(nextSets))
        setSets(nextSets)
        setSelectedSetId((current) => {
          if (current !== set.id) return current
          return nextSets[0]?.id || ""
        })
        setMessage("Set berjaya dipadam.")
        return
      }

      const { error: itemError } = await supabase
        .from("build_set_items")
        .delete()
        .eq("build_set_id", set.id)

      if (itemError) throw itemError

      const { error: setError } = await supabase
        .from("build_sets")
        .delete()
        .eq("id", set.id)

      if (setError) throw setError

      setSets((prev) => {
        const next = prev.filter((row) => row.id !== set.id)
        setSelectedSetId((current) => {
          if (current !== set.id) return current
          return next[0]?.id || ""
        })
        return next
      })
      setMessage("Set berjaya dipadam.")
    } catch (error: any) {
      console.error("Delete saved set error", error)
      setMessage(error.message || "Gagal memadam set.")
    } finally {
      setDeletingSetId("")
    }
  }

  async function downloadWord() {
    if (!selectedSet) return

    try {
      setMessage("Menjana fail Word...")

      const doc = await buildWordDocx(selectedSet, selectedItems)

      const blob = await Packer.toBlob(doc)

      saveAs(
        blob,
        `${slugify(selectedSet.title)}.docx`
      )

      setMessage("Word berjaya dijana.")
    } catch (error: any) {
      console.error(error)
      setMessage("Gagal jana Word.")
    }
  }

  async function downloadSchemeWord() {
    if (!selectedSet) return

    try {
      setMessage("Menjana fail Word skema...")

      const doc = await buildSchemeWordDocx(selectedSet, selectedItems)

      const blob = await Packer.toBlob(doc)

      saveAs(
        blob,
        `${slugify(selectedSet.title)}-skema.docx`
      )

      setMessage("Word skema berjaya dijana.")
    } catch (error: any) {
      console.error(error)
      setMessage("Gagal jana Word skema.")
    }
  }

  function printPdf() {
    setPrintMode("question")
    setTimeout(() => window.print(), 100)
  }

  function printScheme() {
    setPrintMode("scheme")
    setTimeout(() => window.print(), 100)
  }

  return (
    <div className="page-shell saved-sets-page">
      <div className="page-header saved-sets-header">
        <div>
          <h1 className="page-title">Set Saya</h1>
          <p className="page-subtitle">
            Buka semula set yang telah disimpan, kemudian cetak PDF atau muat turun Word.
          </p>
        </div>
        <button type="button" className="btn btn-light" onClick={() => void fetchSets()}>
          Refresh
        </button>
      </div>

      {message && <div className="admin-alert">{message}</div>}

      <div className="saved-sets-layout">
        <aside className="card-block saved-sets-list">
          <div className="card-head">
            <h2>Senarai Set</h2>
            <p>
              {loading
                ? "Memuat set..."
                : `${sets.length}${setLimit === Infinity ? "" : `/${setLimit}`} set disimpan`}
            </p>
          </div>

          {sets.length === 0 && !loading ? (
            <div className="empty-state">Belum ada set disimpan.</div>
          ) : (
            <div className="saved-set-buttons">
              {sets.map((set) => (
                <button
                  key={set.id}
                  type="button"
                  className={`saved-set-button ${selectedSet?.id === set.id ? "active" : ""}`}
                  onClick={() => setSelectedSetId(set.id)}
                >
                  <strong>{set.title}</strong>
                  <span>
                    {set.paper === "paper_1" ? "Kertas 1" : "Kertas 2"} ·{" "}
                    {set.build_set_items?.length || 0} item
                  </span>
                  <small>{formatDate(set.created_at)}</small>
                </button>
              ))}
            </div>
          )}
        </aside>

        <main className="saved-set-preview-wrap">
          <section className="card-block saved-set-toolbar">
            <div>
              <h2>{selectedSet?.title || "Pilih set"}</h2>
              <p>
                {selectedSet
                  ? `${selectedItems.length} item dalam set ini.`
                  : "Pilih satu set untuk pratonton."}
              </p>
            </div>
            <div className="action-row">
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => selectedSet && void deleteSet(selectedSet)}
                disabled={!selectedSet || deletingSetId === selectedSet.id}
              >
                {deletingSetId === selectedSet?.id ? "Memadam..." : "Padam Set"}
              </button>
              <button
                type="button"
                className="btn btn-question"
                onClick={printPdf}
                disabled={!selectedSet}
              >
                🖨️ Cetak Soalan
              </button>
              <button
                type="button"
                className="btn btn-question"
                onClick={() => void downloadWord()}
                disabled={!selectedSet}
              >
                📄 Word Soalan
              </button>
              <button
                type="button"
                className="btn btn-scheme"
                onClick={printScheme}
                disabled={!selectedSet}
              >
                🖨️ Cetak Skema
              </button>
              <button
                type="button"
                className="btn btn-scheme"
                onClick={() => void downloadSchemeWord()}
                disabled={!selectedSet}
              >
                ✅ Word Skema
              </button>
            </div>
          </section>

          {selectedSet ? (
            printMode === "scheme" ? (
              <SchemePreview set={selectedSet} items={selectedItems} />
            ) : (
              <SetPaperPreview set={selectedSet} items={selectedItems} />
            )
          ) : (
            <section className="card-block">
              <div className="empty-state">Tiada set dipilih.</div>
            </section>
          )}
        </main>
      </div>
    </div>
  )
}

function generatePaperInstruction(set: SavedSet, items: NormalizedSetItem[]) {
  const sections = Array.from(
    new Set(items.map((i) => i.item?.section).filter(Boolean)),
  )

  const hasA = sections.includes("A")
  const hasB = sections.includes("B")
  const hasC = sections.includes("C")

  if (set.paper === "paper_1") {
    return "Jawab semua soalan dalam kertas ini."
  }

  // Kertas 2
  if (hasA && !hasB && !hasC) {
    return "Jawab semua soalan dalam bahagian ini."
  }

  if (hasA && hasB && !hasC) {
    return "Jawab semua soalan dalam Bahagian A dan Bahagian B."
  }

  if (hasA && hasB && hasC) {
    // ambil nombor sebenar Bahagian C
    const cItems = items.filter((i) => i.item?.section === "C")

    const nums = cItems.map((i) => Number(i.custom_question_no)).sort((a, b) => a - b)

    if (nums.length >= 3) {
      return `Jawab semua soalan dalam Bahagian A dan Bahagian B. Jawab Soalan ${nums[0]} dan mana-mana satu soalan daripada Soalan ${nums[1]} atau ${nums[2]}.`
    }

    return "Jawab semua soalan dalam Bahagian A dan Bahagian B serta soalan dalam Bahagian C."
  }

  return "Jawab semua soalan."
}

function generateSectionCInstruction(items: NormalizedSetItem[]) {
  const cItems = items.filter((i) => i.item?.section === "C")

  const nums = cItems.map((i) => Number(i.custom_question_no)).sort((a, b) => a - b)

  if (nums.length >= 3) {
    return `Jawab Soalan ${nums[0]} dan mana-mana satu soalan daripada Soalan ${nums[1]} atau ${nums[2]}.`
  }

  return "Jawab soalan dalam bahagian ini."
}

function getSectionTotalMarks(items: NormalizedSetItem[], section: string) {
  return items
    .filter((row) => row.item?.section === section)
    .reduce((total, row) => total + (row.marks || 0), 0)
}

function SetPaperPreview({ set, items }: { set: SavedSet; items: NormalizedSetItem[] }) {
  return (
    <section className="card-block set-print-area">
      <div className="question-paper-preview">
        <div className="question-paper-head">
          <strong>{set.title || "Latihan Sains"}</strong>
          <span>Sains KSSM</span>
          <span>{set.tingkatan ? `Tingkatan ${set.tingkatan}` : "Tingkatan 4 dan 5"}</span>
        </div>

        <div className="paper-instruction">
          {generatePaperInstruction(set, items)}
        </div>

        <ol className="question-paper-list">
          {items.map((row, index) => {
            const currentSection = row.item?.section
            const prevSection = index > 0 ? items[index - 1].item?.section : null
            const isNewSection = currentSection !== prevSection

            return (
              <>
                {isNewSection && currentSection && (
                  <div className="section-block">
                    <div className="section-title">Bahagian {currentSection}</div>
                    <div className="section-marks">
                      [{getSectionTotalMarks(items, currentSection)} markah]
                    </div>
                    <div className="section-instruction">
                      {currentSection === "C"
                        ? generateSectionCInstruction(items)
                        : "Jawab semua soalan dalam bahagian ini."}
                    </div>
                  </div>
                )}

                <li key={row.id} className="question-paper-item">
                  <div
                    className="question-paper-stem"
                    dangerouslySetInnerHTML={{ __html: row.item?.stem_text || "" }}
                  />

              {set.paper === "paper_1" && (
                <div className="question-paper-options">
                  {sortOptions(row.item?.item_options).map((option) => (
                    <div
                      key={`${row.id}-${option.option_label}`}
                      className="question-paper-option"
                    >
                      <strong>{option.option_label}.</strong>
                      <div>
                        {option.option_text && (
                          <div
                            className="question-paper-option-text"
                            dangerouslySetInnerHTML={{ __html: option.option_text }}
                          />
                        )}
                        {option.option_image_url && (
                          <img src={option.option_image_url} alt={`Pilihan ${option.option_label}`} />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {set.paper === "paper_2" && (
                <div className="question-paper-subquestions">
                  {sortSubQuestions(row.item?.item_subquestions).map((sub) => (
                    <div key={sub.id} className="question-paper-subquestion">
                      <div className="question-paper-subquestion-label">
                        ({sub.label}){sub.sub_label ? `(${sub.sub_label})` : ""}
                      </div>

                      <div className="question-paper-subquestion-content">
                        <div dangerouslySetInnerHTML={{ __html: sub.question_text || "" }} />

                        {shouldShowAnswerSpace(row.item, sub) && (
                          <AnswerSpace responseType={sub.response_type} marks={sub.marks} />
                        )}

                        {!isInstructionSubQuestionPreview(sub) && (
                          <div className="question-paper-subquestion-marks">
                            [{sub.marks} markah]
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {set.paper === "paper_2" && (
                <div className="question-total-marks">
                  [Jumlah: {row.item?.item_subquestions?.reduce((sum, s) => sum + (s.marks || 0), 0) || row.marks} markah]
                </div>
              )}
            </li>
              </>
            )
          })}
        </ol>

        {items.length === 0 && <div className="empty-state">Set ini belum ada item.</div>}
      </div>
    </section>
  )
}

function SchemePreview({ set, items }: { set: SavedSet; items: NormalizedSetItem[] }) {
  return (
    <section className="card-block set-print-area">
      <div className="question-paper-preview">
        <div className="question-paper-head">
          <strong>Panduan Pemarkahan</strong>
          <span>{set.title || "Set Soalan"}</span>
          <span>Sains KSSM</span>
        </div>

        <div className="scheme-list">
          {items.map((row) => (
            <div key={row.id} className="scheme-item">
              <h3>Soalan {row.custom_question_no}</h3>

              {set.paper === "paper_2" ? (
                <table className="scheme-table">
                  <thead>
                    <tr>
                      <th>Sub-soalan</th>
                      <th>Cadangan Jawapan</th>
                      <th>Markah</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortSubQuestions(row.item?.item_subquestions).map((sub) => (
                      <tr key={sub.id}>
                        <td>
                          ({sub.label}){sub.sub_label ? `(${sub.sub_label})` : ""}
                        </td>
                        <td>{sub.answer_scheme_text || "-"}</td>
                        <td>{sub.marks}</td>
                      </tr>
                    ))}
                    <tr>
                      <th>Jumlah</th>
                      <td></td>
                      <th>
                        {sortSubQuestions(row.item?.item_subquestions).reduce(
                          (sum, sub) => sum + (sub.marks || 0),
                          0,
                        ) || row.marks}
                      </th>
                    </tr>
                  </tbody>
                </table>
              ) : (
                <div className="scheme-answer">
                  {row.item?.answer_scheme_text || "-"}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function normalizeItems(set: SavedSet | null): NormalizedSetItem[] {
  if (!set?.build_set_items) return []

  const sectionOrder: Record<string, number> = {
    A: 1,
    B: 2,
    C: 3,
  }

  function getQuestionNo(row: SavedSetItemRow) {
    const item = Array.isArray(row.items) ? row.items[0] || null : row.items

    // Untuk Kertas 2, nombor rasmi perlu ikut question_no_reference
    const fromItemRef = Number((item as any)?.question_no_reference)
    if (Number.isFinite(fromItemRef) && fromItemRef > 0) return fromItemRef

    // Custom number hanya fallback
    const fromCustom = Number(row.custom_question_no)
    if (Number.isFinite(fromCustom) && fromCustom > 0) return fromCustom

    return row.display_order || 999
  }

  return [...set.build_set_items]
    .sort((a, b) => {
      const aSection = a.section || ""
      const bSection = b.section || ""

      const aSectionOrder = sectionOrder[aSection] || 99
      const bSectionOrder = sectionOrder[bSection] || 99

      if (aSectionOrder !== bSectionOrder) {
        return aSectionOrder - bSectionOrder
      }

      const aQuestionNo = getQuestionNo(a)
      const bQuestionNo = getQuestionNo(b)

      if (aQuestionNo !== bQuestionNo) {
        return aQuestionNo - bQuestionNo
      }

      return a.display_order - b.display_order
    })
    .map((row, index) => {
      const item = Array.isArray(row.items) ? row.items[0] || null : row.items
      const questionNo = getQuestionNo(row)

      return {
        id: row.id,
        display_order: row.display_order,
        custom_question_no: String(index + 1),
        marks: row.marks,
        item,
      }
    })
}

function sortOptions(options: ItemOption[] = []) {
  return [...options].sort((a, b) => {
    if (a.display_order !== b.display_order) return a.display_order - b.display_order
    return a.option_label.localeCompare(b.option_label)
  })
}

function sortSubQuestions(subquestions: ItemSubQuestion[] = []) {
  return [...subquestions].sort((a, b) => {
    if (a.display_order !== b.display_order) return a.display_order - b.display_order
    return a.label.localeCompare(b.label)
  })
}

function isInstructionSubQuestionPreview(sub: ItemSubQuestion) {
  return sub.response_type === "instruction" || sub.marks === 0
}

function shouldShowAnswerSpace(item: SavedItem | null, sub: ItemSubQuestion) {
  if (!item) return false
  if (isInstructionSubQuestionPreview(sub)) return false
  if (sub.response_type === "provided_space") return false
  if (item.section === "C") return false
  return item.section === "A" || item.section === "B"
}

function AnswerSpace({
  responseType,
  marks = 1,
}: {
  responseType: string
  marks?: number
}) {
  const lineCount = Math.max(1, marks || 1)

  if (responseType === "instruction") return null

  if (responseType === "provided_space") return null

  if (responseType === "structured_text") {
    return <AnswerLines count={Math.max(2, lineCount)} />
  }

  if (responseType === "calculation") {
    return <AnswerLines count={Math.max(5, lineCount)} />
  }

  if (responseType === "drawing") {
    return <div className="answer-drawing-large" />
  }

  if (responseType === "design") {
    return (
      <div className="answer-design-space">
        <div className="answer-drawing-large" />
        <AnswerLines count={Math.max(3, Math.min(lineCount, 5))} />
      </div>
    )
  }

  if (responseType === "table") {
    return <div className="answer-table-box" />
  }

  return <AnswerLines count={1} />
}

function AnswerLines({ count }: { count: number }) {
  return (
    <div className="answer-space">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="answer-line" />
      ))}
    </div>
  )
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onloadend = () => {
      resolve(reader.result as string)
    }

    reader.onerror = reject

    reader.readAsDataURL(blob)
  })
}

async function fetchImageAsBase64(url: string): Promise<string | null> {
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    const blob = await response.blob()
    return await blobToBase64(blob)
  } catch (error) {
    console.warn("Failed to fetch image:", url, error)
    return null
  }
}

async function processTextWithImages(text: string): Promise<(TextRun | ImageRun)[]> {
  if (!text) return [new TextRun(text)]

  // Simple regex to find image URLs in text (assuming they're in <img> tags or direct URLs)
  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/g
  const parts: (TextRun | ImageRun)[] = []
  let lastIndex = 0
  let match

  while ((match = imgRegex.exec(text)) !== null) {
    // Add text before image
    if (match.index > lastIndex) {
      parts.push(new TextRun(text.slice(lastIndex, match.index)))
    }

    // Add image
    const imageUrl = match[1]
    const base64 = await fetchImageAsBase64(imageUrl)
    if (base64) {
      // Extract base64 data
      const base64Data = base64.split(',')[1]
      const imageBuffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0))

      parts.push(
        new ImageRun({
          data: imageBuffer,
          transformation: {
            width: 400,
            height: 300,
          },
          type: "png",
        })
      )
    } else {
      parts.push(new TextRun("[Gambar tidak dapat dimuat turun]"))
    }

    lastIndex = match.index + match[0].length
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(new TextRun(text.slice(lastIndex)))
  }

  return parts
}

async function buildWordDocx(set: SavedSet, items: NormalizedSetItem[]): Promise<Document> {
  const children: (Paragraph | Table)[] = []

  // Header
  children.push(
    new Paragraph({
      text: set.title || "Latihan Sains",
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({
      text: "Sains KSSM",
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({
      text: set.tingkatan ? `Tingkatan ${set.tingkatan}` : "Tingkatan 4 dan 5",
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({
      text: "",
    }) // Empty line
  )

  // Questions
  for (let i = 0; i < items.length; i++) {
    const row = items[i]
    const questionNumber = `${i + 1}.`

    if (row.item) {
      // Question stem
      const stemParts = await processTextWithImages(row.item.stem_text || "")
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: questionNumber,
              bold: true,
            }),
            ...stemParts,
          ],
        })
      )

      if (set.paper === "paper_1" && row.item.item_options) {
        // Options table
        const sortedOptions = sortOptions(row.item.item_options)
        const tableRows: TableRow[] = []

        for (const option of sortedOptions) {
          const optionParts = await processTextWithImages(option.option_text || "")

          // Add image if exists
          if (option.option_image_url) {
            const base64 = await fetchImageAsBase64(option.option_image_url)
            if (base64) {
              const base64Data = base64.split(',')[1]
              const imageBuffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0))

              optionParts.push(
                new ImageRun({
                  data: imageBuffer,
                  transformation: {
                    width: 300,
                    height: 200,
                  },
                  type: "png",
                })
              )
            } else {
              optionParts.push(new TextRun("[Gambar tidak dapat dimuat turun]"))
            }
          }

          tableRows.push(
            new TableRow({
              children: [
                new TableCell({
                  children: [
                    new Paragraph({
                      children: [new TextRun({ text: `${option.option_label}.`, bold: true })],
                    }),
                  ],
                  width: {
                    size: 10,
                    type: WidthType.PERCENTAGE,
                  },
                }),
                new TableCell({
                  children: [
                    new Paragraph({
                      children: optionParts,
                    }),
                  ],
                  width: {
                    size: 90,
                    type: WidthType.PERCENTAGE,
                  },
                }),
              ],
            })
          )
        }

        children.push(
          new Table({
            rows: tableRows,
            width: {
              size: 100,
              type: WidthType.PERCENTAGE,
            },
          })
        )
      } else {
        // Paper 2 - marks
        children.push(
          new Paragraph({
            text: `[${row.marks} markah]`,
            alignment: AlignmentType.RIGHT,
          })
        )
      }

      // Add spacing between questions
      children.push(new Paragraph({ text: "" }))
    }
  }

  return new Document({
    sections: [
      {
        properties: {},
        children: children,
      },
    ],
  })
}

async function buildSchemeWordDocx(set: SavedSet, items: NormalizedSetItem[]): Promise<Document> {
  const children: (Paragraph | Table)[] = []

  // Header
  children.push(
    new Paragraph({
      text: "Panduan Pemarkahan",
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({
      text: set.title || "Set Soalan",
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({
      text: "Sains KSSM",
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({
      text: set.tingkatan ? `Tingkatan ${set.tingkatan}` : "Tingkatan 4 dan 5",
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({
      text: "",
    }) // Empty line
  )

  // Questions
  for (const row of items) {
    if (!row.item) continue

    const subs = sortSubQuestions(row.item.item_subquestions)
    const total = subs.reduce((sum, sub) => sum + (sub.marks || 0), 0) || row.marks

    // Question header
    children.push(
      new Paragraph({
        text: `Soalan ${row.custom_question_no}`,
        heading: HeadingLevel.HEADING_2,
      })
    )

    if (set.paper === "paper_2") {
      // Table for paper 2 with subquestions
      const tableRows: TableRow[] = []

      // Header row
      tableRows.push(
        new TableRow({
          children: [
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: "Sub-soalan", bold: true })] })],
              width: { size: 20, type: WidthType.PERCENTAGE },
            }),
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: "Cadangan Jawapan", bold: true })] })],
              width: { size: 65, type: WidthType.PERCENTAGE },
            }),
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: "Markah", bold: true })] })],
              width: { size: 15, type: WidthType.PERCENTAGE },
            }),
          ],
        })
      )

      // Subquestion rows
      for (const sub of subs) {
        const subLabel = `(${sub.label})${sub.sub_label ? `(${sub.sub_label})` : ""}`

        tableRows.push(
          new TableRow({
            children: [
              new TableCell({
                children: [new Paragraph({ text: subLabel })],
              }),
              new TableCell({
                children: [
                  new Paragraph({
                    text: sub.answer_scheme_text || "-",
                  }),
                ],
              }),
              new TableCell({
                children: [
                  new Paragraph({
                    text: sub.marks.toString(),
                    alignment: AlignmentType.CENTER,
                  }),
                ],
              }),
            ],
          })
        )
      }

      // Total row
      tableRows.push(
        new TableRow({
          children: [
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: "Jumlah", bold: true })] })],
            }),
            new TableCell({
              children: [new Paragraph({ text: "" })],
            }),
            new TableCell({
              children: [
                new Paragraph({
                  children: [new TextRun({ text: total.toString(), bold: true })],
                  alignment: AlignmentType.CENTER,
                }),
              ],
            }),
          ],
        })
      )

      children.push(
        new Table({
          rows: tableRows,
          width: {
            size: 100,
            type: WidthType.PERCENTAGE,
          },
        })
      )
    } else {
      // Simple table for paper 1
      children.push(
        new Table({
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  children: [new Paragraph({ children: [new TextRun({ text: "Jawapan", bold: true })] })],
                  width: { size: 30, type: WidthType.PERCENTAGE },
                }),
                new TableCell({
                  children: [
                    new Paragraph({
                      text: row.item.answer_scheme_text || "-",
                    }),
                  ],
                  width: { size: 70, type: WidthType.PERCENTAGE },
                }),
              ],
            }),
          ],
          width: {
            size: 100,
            type: WidthType.PERCENTAGE,
          },
        })
      )
    }

    // Add spacing between questions
    children.push(new Paragraph({ text: "" }))
  }

  return new Document({
    sections: [
      {
        properties: {},
        children: children,
      },
    ],
  })
}

function slugify(text: string) {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "set-soalan"
  )
}

function getSavedSetLimit(profile: { role?: string; account_type?: string } | null) {
  if (!profile) return 1
  if (profile.role === "master_admin") return Infinity
  if (profile.role === "admin") return 20
  if (profile.account_type === "full") return 15
  return 1
}

function getGuestSavedSets() {
  try {
    return JSON.parse(localStorage.getItem(GUEST_SET_KEY) || "[]") as SavedSet[]
  } catch {
    return []
  }
}

function normalizeWordOptionHtml(html: string) {
  return html
    .replace(/<p[^>]*>/gi, "")
    .replace(/<\/p>/gi, "<br />")
    .replace(/(<br\s*\/?>\s*)+$/gi, "")
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ms-MY", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value))
}
