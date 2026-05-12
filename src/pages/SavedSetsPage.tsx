import { useEffect, useMemo, useState } from "react"
import { useAuth } from "../contexts/AuthContext"
import { supabase } from "../lib/supabase"
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

      const html = buildWordHtml(selectedSet, selectedItems)
      const blob = new Blob([html], {
        type: "application/msword;charset=utf-8",
      })

      saveAs(blob, `${slugify(selectedSet.title)}.doc`)

      setMessage("Word berjaya dijana.")
    } catch (error: any) {
      console.error("Word export error", error)
      setMessage("Gagal jana Word.")
    }
  }

  async function downloadSchemeWord() {
    if (!selectedSet) return

    try {
      setMessage("Menjana fail Word skema...")

      const html = buildSchemeWordHtml(selectedSet, selectedItems)
      const blob = new Blob([html], {
        type: "application/msword;charset=utf-8",
      })

      saveAs(blob, `${slugify(selectedSet.title)}-skema.doc`)

      setMessage("Word skema berjaya dijana.")
    } catch (error: any) {
      console.error("Word scheme export error", error)
      setMessage("Gagal jana Word skema.")
    }
  }

  function buildWordHtml(set: SavedSet, items: NormalizedSetItem[]) {
    const questionHtml = items
      .map((row, index) => {
        if (!row.item) return ""

        const stemHtml = row.item.stem_text || ""
        let contentHtml = `<div class="question-stem">${stemHtml}</div>`

        if (set.paper === "paper_1" && row.item.item_options?.length) {
          const optionsHtml = sortOptions(row.item.item_options)
            .map((option) => {
              const contentHtml = option.option_text || ""
              const imageHtml = option.option_image_url
                ? `<img src="${escapeHtml(option.option_image_url)}" alt="Pilihan ${escapeHtml(option.option_label)}" />`
                : ""

              return `
                <div class="question-option">
                  <div class="option-label">${escapeHtml(option.option_label)}.</div>
                  <div class="option-content">${contentHtml}${imageHtml}</div>
                </div>
              `
            })
            .join("")

          contentHtml += `
            <div class="question-options">
              ${optionsHtml}
            </div>
          `
        }

        if (set.paper === "paper_2" && row.item.item_subquestions?.length) {
          const subHtml = sortSubQuestions(row.item.item_subquestions)
            .map((sub) => {
              const label = `(${escapeHtml(sub.label)})${sub.sub_label ? `(${escapeHtml(sub.sub_label)})` : ""}`
              const questionText = sub.question_text || ""
              const lineCount = Math.max(1, sub.marks || 1)
              const answerLines = Array.from({ length: lineCount }).map(() => '<div class="answer-line"></div>').join('')

              return `
                <table class="subquestion-table">
                  <tr>
                    <td class="sub-label">${label}</td>
                    <td class="sub-content">
                      <div class="sub-text">${questionText}</div>
                      <div class="answer-lines">${answerLines}</div>
                      <div class="sub-marks">[${sub.marks} markah]</div>
                    </td>
                  </tr>
                </table>
              `
            })
            .join("")

          contentHtml += subHtml
        }

        return `
          <table class="question-row-table">
            <tr>
              <td class="question-no">${index + 1}.</td>
              <td class="question-content">${contentHtml}</td>
            </tr>
          </table>
        `
      })
      .join("")

    return `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${escapeHtml(set.title || "Set Soalan")}</title>
          <style>
            body { font-family: Arial, sans-serif; color: #111; margin: 20px; }
            .document { max-width: 900px; margin: auto; }
            .doc-head { text-align: center; margin-bottom: 24px; }
            .doc-head h1 { margin: 0 0 8px; font-size: 24px; }
            .doc-head .meta { margin: 4px 0; }
            .question-row-table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 14pt;
            }
            .question-row-table td {
              border: none;
              vertical-align: top;
            }
            .question-no {
              width: 24pt;
              padding-right: 6pt;
              font-weight: normal;
            }
            .question-content {
              width: auto;
            }
            .question-stem { margin: 8px 0; }
            .question-options { margin-top: 10px; padding-left: 18px; }
            .question-option { margin-bottom: 8px; }
            .option-label { font-weight: bold; display: inline-block; width: 24px; }
            .option-content { display: inline-block; vertical-align: top; max-width: 850px; }
            .subquestion-table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 10pt;
            }
            .subquestion-table td {
              border: none;
              vertical-align: top;
            }
            .sub-label {
              width: 42pt;
              font-weight: bold;
            }
            .sub-content {
              width: auto;
            }
            .sub-text { margin: 6px 0; }
            .answer-lines {
              margin-top: 8pt;
            }
            .answer-line {
              border-bottom: 1px solid #000;
              height: 14pt;
              margin-bottom: 4pt;
            }
            .sub-marks {
              text-align: right;
              font-weight: bold;
              margin-top: 2pt;
            }
            img {
              max-width: 10.5cm !important;
              height: auto !important;
              display: block;
              margin: 6pt auto;
            }
          </style>
        </head>
        <body>
          <div class="document">
            <div class="doc-head">
              <h1>${escapeHtml(set.title || "Latihan Sains")}</h1>
              <div class="meta">Sains KSSM</div>
              <div class="meta">${set.tingkatan ? `Tingkatan ${set.tingkatan}` : "Tingkatan 4 dan 5"}</div>
            </div>
            ${questionHtml}
          </div>
        </body>
      </html>
    `
  }

  function buildSchemeWordHtml(set: SavedSet, items: NormalizedSetItem[]) {
    const schemeHtml = items
      .map((row) => {
        if (!row.item) return ""

        if (set.paper === "paper_2") {
          const rows = sortSubQuestions(row.item.item_subquestions)
            .map((sub) => `
              <tr>
                <td>${escapeHtml(`(${sub.label})${sub.sub_label ? `(${sub.sub_label})` : ""}`)}</td>
                <td>${sub.answer_scheme_text || "-"}</td>
                <td>${sub.marks}</td>
              </tr>
            `)
            .join("")

          return `
            <div class="scheme-item">
              <h2>Soalan ${escapeHtml(row.custom_question_no)}</h2>
              <table class="scheme-table">
                <thead>
                  <tr>
                    <th>Sub-soalan</th>
                    <th>Cadangan Jawapan</th>
                    <th>Markah</th>
                  </tr>
                </thead>
                <tbody>
                  ${rows}
                  <tr>
                    <td><strong>Jumlah</strong></td>
                    <td></td>
                    <td><strong>${sortSubQuestions(row.item.item_subquestions).reduce((sum, sub) => sum + (sub.marks || 0), 0) || row.marks}</strong></td>
                  </tr>
                </tbody>
              </table>
            </div>
          `
        }

        return `
          <div class="scheme-item">
            <h2>Soalan ${escapeHtml(row.custom_question_no)}</h2>
            <div class="scheme-answer">${row.item.answer_scheme_text || "-"}</div>
          </div>
        `
      })
      .join("")

    return `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${escapeHtml(set.title || "Skema")}</title>
          <style>
            body { font-family: Arial, sans-serif; color: #111; margin: 20px; }
            .document { max-width: 900px; margin: auto; }
            .doc-head { text-align: center; margin-bottom: 24px; }
            .doc-head h1 { margin: 0 0 8px; font-size: 24px; }
            .scheme-item { margin-bottom: 24px; }
            .scheme-item h2 { margin-bottom: 12px; }
            .scheme-answer { white-space: pre-wrap; margin-top: 8px; }
            .scheme-table { width: 100%; border-collapse: collapse; margin-top: 12px; }
            .scheme-table th, .scheme-table td { border: 1px solid #444; padding: 8px; vertical-align: top; }
            .scheme-table th { background: #f5f5f5; }
            img { max-width: 520px; height: auto; display: block; margin: 8px 0; }
          </style>
        </head>
        <body>
          <div class="document">
            <div class="doc-head">
              <h1>Panduan Pemarkahan</h1>
              <div class="meta">${escapeHtml(set.title || "Set Soalan")}</div>
              <div class="meta">Sains KSSM</div>
            </div>
            ${schemeHtml}
          </div>
        </body>
      </html>
    `
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

function htmlToPlainText(html: string) {
  if (!html) return ""

  const normalized = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")

  const doc = new DOMParser().parseFromString(normalized, "text/html")

  return (doc.body.textContent || "")
    .replace(/\n{3,}/g, "\n\n")
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ms-MY", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value))
}
