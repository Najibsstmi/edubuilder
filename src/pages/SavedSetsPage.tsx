import { useEffect, useMemo, useState } from "react"
import { useAuth } from "../contexts/AuthContext"
import { supabase } from "../lib/supabase"

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

  function printPdf() {
    window.print()
  }

  async function deleteSet(set: SavedSet) {
    const confirmed = window.confirm(`Padam set "${set.title}"? Set ini akan dibuang daripada Set Saya.`)
    if (!confirmed) return

    setDeletingSetId(set.id)
    setMessage("")

    try {
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

    const html = await embedImagesForWord(buildWordHtml(selectedSet, selectedItems))
    const blob = new Blob([html], { type: "application/msword;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `${slugify(selectedSet.title)}.doc`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  async function downloadSchemeWord() {
    if (!selectedSet) return

    const html = buildSchemeWordHtml(selectedSet, selectedItems)
    const blob = new Blob([html], { type: "application/msword;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")

    link.href = url
    link.download = `${slugify(selectedSet.title)}-skema.doc`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
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

function buildWordHtml(set: SavedSet, items: NormalizedSetItem[]) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(set.title)}</title>
  <style>
    @page Section1 {
      size: 21cm 29.7cm;
      margin: 2cm 2cm 2cm 2cm;
      mso-paper-source: 0;
    }
    div.Section1 { page: Section1; }
    body {
      color: #000000;
      font-family: "Times New Roman", Times, serif;
      font-size: 12pt;
      line-height: 1.15;
      margin: 0;
      text-align: justify;
    }
    .head {
      border-bottom: 1px solid #bfbfbf;
      margin-bottom: 16pt;
      padding-bottom: 10pt;
      text-align: center;
    }
    .head h1 {
      font-size: 12pt;
      font-weight: bold;
      margin: 0 0 4pt;
      text-transform: uppercase;
    }
    .head div {
      font-size: 12pt;
      margin: 0;
    }
    table.question-list {
      border-collapse: collapse;
      margin: 0;
      mso-table-lspace: 0pt;
      mso-table-rspace: 0pt;
      width: 100%;
    }
    table.question-list td {
      border: 0;
      padding: 0;
      vertical-align: top;
    }
    tr.question-row td {
      padding-bottom: 36pt;
    }
    td.question-no {
      padding-right: 3pt;
      width: 12pt;
    }
    td.question-content {
      width: auto;
    }
    p {
      margin: 0 0 4pt;
      text-align: justify;
    }
    .stem {
      text-align: justify;
    }
    .stem img,
    .option-body img {
      display: block;
      height: auto;
      margin: 6pt auto;
      max-width: 13cm;
    }
    table {
      border-collapse: collapse;
      margin: 8pt 0;
      width: 100%;
    }
    td, th {
      border: 1px solid #000000;
      padding: 4pt 6pt;
      vertical-align: top;
    }
    th {
      background: #e5e7eb;
      font-weight: bold;
      text-align: center;
    }
    table.option-table {
      border-collapse: collapse;
      border-spacing: 0;
      font-family: "Times New Roman", Times, serif;
      font-size: 12pt;
      line-height: 1.15;
      margin: 4pt 0 0;
      mso-line-height-rule: exactly;
      mso-table-lspace: 0pt;
      mso-table-rspace: 0pt;
      width: 100%;
    }
    table.option-table td {
      border: 0;
      font-family: "Times New Roman", Times, serif;
      font-size: 12pt;
      line-height: 1.05;
      mso-line-height-rule: exactly;
      mso-padding-alt: 0pt 0pt 0pt 0pt;
      padding: 0.5pt 0 0.5pt 0;
      vertical-align: top;
    }
    table.option-table td.option-label {
      font-weight: bold;
      padding-right: 8pt;
      text-align: left;
      width: 20pt;
    }
    table.option-table td.option-body {
      text-align: justify;
    }
    .option-body p {
      margin: 0;
      padding: 0;
      line-height: 1.05;
      mso-line-height-rule: exactly;
    }
    .marks {
      font-weight: bold;
      margin-top: 6pt;
      text-align: right;
    }
  </style>
</head>
<body>
<div class="Section1">
  <div class="head">
    <h1>${escapeHtml(set.title || "Latihan Sains")}</h1>
    <div>Sains KSSM</div>
    <div>${set.tingkatan ? `Tingkatan ${set.tingkatan}` : "Tingkatan 4 dan 5"}</div>
  </div>
  <table class="question-list">
    ${items
      .map(
        (row, index) => `
      <tr class="question-row">
        <td class="question-no">${index + 1}.</td>
        <td class="question-content">
        <div class="stem">${row.item?.stem_text || ""}</div>
        ${
          set.paper === "paper_1"
            ? `<table class="option-table">${sortOptions(row.item?.item_options)
                .map(
                  (option) => `
              <tr>
                <td class="option-label" valign="top">${escapeHtml(option.option_label)}.</td>
                <td class="option-body" valign="top">${normalizeWordOptionHtml(option.option_text || "")}${
                    option.option_image_url
                      ? `<br /><img src="${escapeHtml(option.option_image_url)}" />`
                      : ""
                  }</td>
              </tr>`,
                )
                .join("")}</table>`
            : `<div class="marks">[${row.marks} markah]</div>`
        }
        </td>
      </tr>`,
      )
      .join("")}
  </table>
</div>
</body>
</html>`
}

function buildSchemeWordHtml(set: SavedSet, items: NormalizedSetItem[]) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Panduan Pemarkahan - ${escapeHtml(set.title)}</title>
  <style>
    @page Section1 {
      size: 21cm 29.7cm;
      margin: 2cm 2cm 2cm 2cm;
      mso-paper-source: 0;
    }

    div.Section1 { page: Section1; }

    body {
      color: #000000;
      font-family: "Times New Roman", Times, serif;
      font-size: 12pt;
      line-height: 1.15;
      margin: 0;
    }

    .head {
      border-bottom: 1px solid #bfbfbf;
      margin-bottom: 16pt;
      padding-bottom: 10pt;
      text-align: center;
    }

    .head h1 {
      font-size: 12pt;
      font-weight: bold;
      margin: 0 0 4pt;
      text-transform: uppercase;
    }

    .head div {
      font-size: 12pt;
      margin: 0;
    }

    h2 {
      font-size: 12pt;
      margin: 14pt 0 6pt;
    }

    table {
      border-collapse: collapse;
      margin-bottom: 14pt;
      width: 100%;
    }

    th,
    td {
      border: 1px solid #000000;
      padding: 5pt 6pt;
      vertical-align: top;
    }

    th {
      font-weight: bold;
      text-align: left;
    }

    .sub-col {
      width: 70pt;
    }

    .mark-col {
      text-align: center;
      width: 55pt;
    }

    .total-row th {
      font-weight: bold;
    }
  </style>
</head>
<body>
<div class="Section1">
  <div class="head">
    <h1>Panduan Pemarkahan</h1>
    <div>${escapeHtml(set.title || "Set Soalan")}</div>
    <div>Sains KSSM</div>
    <div>${set.tingkatan ? `Tingkatan ${set.tingkatan}` : "Tingkatan 4 dan 5"}</div>
  </div>

  ${items
    .map((row) => {
      const subs = sortSubQuestions(row.item?.item_subquestions)
      const total =
        subs.reduce((sum, sub) => sum + (sub.marks || 0), 0) || row.marks

      if (set.paper === "paper_2") {
        return `
          <h2>Soalan ${escapeHtml(row.custom_question_no)}</h2>
          <table>
            <thead>
              <tr>
                <th class="sub-col">Sub-soalan</th>
                <th>Cadangan Jawapan</th>
                <th class="mark-col">Markah</th>
              </tr>
            </thead>
            <tbody>
              ${subs
                .map(
                  (sub) => `
                    <tr>
                      <td>(${escapeHtml(sub.label)})${
                        sub.sub_label ? `(${escapeHtml(sub.sub_label)})` : ""
                      }</td>
                      <td>${escapeHtml(sub.answer_scheme_text || "-").replace(/\n/g, "<br />")}</td>
                      <td class="mark-col">${sub.marks}</td>
                    </tr>
                  `,
                )
                .join("")}
              <tr class="total-row">
                <th>Jumlah</th>
                <td></td>
                <th class="mark-col">${total}</th>
              </tr>
            </tbody>
          </table>
        `
      }

      return `
        <h2>Soalan ${escapeHtml(row.custom_question_no)}</h2>
        <table>
          <tbody>
            <tr>
              <th>Jawapan</th>
              <td>${escapeHtml(row.item?.answer_scheme_text || "-").replace(/\n/g, "<br />")}</td>
            </tr>
          </tbody>
        </table>
      `
    })
    .join("")}
</div>
</body>
</html>`
}

async function embedImagesForWord(html: string) {
  if (!html.includes("<img")) return html

  const parser = new DOMParser()
  const doc = parser.parseFromString(html, "text/html")
  const images = Array.from(doc.querySelectorAll("img"))

  await Promise.all(
    images.map(async (img) => {
      const src = img.getAttribute("src")
      if (!src || src.startsWith("data:")) return

      try {
        const response = await fetch(src)
        if (!response.ok) return
        const blob = await response.blob()
        const dataUrl = await blobToDataUrl(blob)
        img.setAttribute("src", dataUrl)
      } catch (error) {
        console.warn("Unable to embed image for Word export", error)
      }
    }),
  )

  return `<!doctype html>\n${doc.documentElement.outerHTML}`
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = reject
    reader.readAsDataURL(blob)
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
