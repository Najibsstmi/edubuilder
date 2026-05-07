import { useState } from "react"
import mammoth from "mammoth"
import * as pdfjsLib from "pdfjs-dist"
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url"
import { useAuth } from "../contexts/AuthContext"
import { supabase } from "../lib/supabase"

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

type DraftItem = {
  id: string
  paper: "paper_1" | "paper_2"
  questionNo: string
  section: "" | "A" | "B" | "C"
  stem: string
  options: Record<"A" | "B" | "C" | "D", string>
  answer: "" | "A" | "B" | "C" | "D"
  marks: number
  itemType: "mcq" | "structured" | "limited_response" | "open_response"
  subQuestions: DraftSubQuestion[]
  imageRefs: string[]
  tingkatan: 4 | 5
  themeName: string
  bidangCode: string
  bidangName: string
  standardKandungan: string
  standardKandunganName: string
  standardPembelajaran: string
  standardPembelajaranName: string
  mainConstruct: string
  constructCode: string
  constructAspect: string
  difficultyLevel: "rendah" | "sederhana" | "tinggi"
  selected: boolean
}

type DraftSubQuestion = {
  id: string
  label: string
  subLabel: string
  questionText: string
  answerSchemeText: string
  marks: number
  responseType: "instruction" | "short_text" | "structured_text" | "table" | "drawing" | "design" | "calculation" | "provided_space"
  mainConstruct: string
  constructCode: string
  difficultyLevel: "rendah" | "sederhana" | "tinggi"
  imageRefs: string[]
}

type ExtractedImage = {
  ref: string
  dataUrl: string
  mimeType: string
}

const optionLabels = ["A", "B", "C", "D"] as const
const supportedImageMimeTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"]

export default function BulkImportPage() {
  const { profile } = useAuth()
  const [paperType, setPaperType] = useState<"paper_1" | "paper_2">("paper_1")
  const [languageMode, setLanguageMode] = useState<"bm_only" | "bm_bi">("bm_only")
  const [sourceType, setSourceType] = useState("Import pukal")
  const [sourceYear, setSourceYear] = useState(new Date().getFullYear())
  const [rawText, setRawText] = useState("")
  const [extractedImages, setExtractedImages] = useState<ExtractedImage[]>([])
  const [draftItems, setDraftItems] = useState<DraftItem[]>([])
  const [extractingFile, setExtractingFile] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [message, setMessage] = useState("")
  const detectedQuestionCount = countDetectedQuestions(rawText)

  const isMasterAdmin = profile?.role === "master_admin"

  if (!isMasterAdmin) {
    return (
      <div className="page-shell">
        <section className="card-block">
          <div className="card-head">
            <h2>Akses Terhad</h2>
            <p>
              Modul Import Pukal AI hanya dibuka kepada Master Admin sahaja.
            </p>
          </div>
        </section>
      </div>
    )
  }

  async function handleFileUpload(file: File | null) {
    if (!file) return

    setMessage("")
    setExtractingFile(true)

    try {
      const ext = file.name.split(".").pop()?.toLowerCase()

      if (ext === "txt") {
        setRawText(await file.text())
        setExtractedImages([])
        setMessage("Fail teks berjaya dimuatkan.")
      } else if (ext === "docx") {
        const result = await extractDocx(file)
        setRawText(result.text)
        setExtractedImages(result.images)
        setMessage(
          `DOCX berjaya diextract. ${result.images.length} gambar web dijumpai. Anggaran ${countDetectedQuestions(result.text)} soalan dikesan.${
            result.unsupportedImages.length > 0
              ? ` ${result.unsupportedImages.length} gambar format lama/EMF dilangkau kerana tidak disokong web.`
              : ""
          }`,
        )
      } else if (ext === "pdf") {
        const text = await extractPdfText(file)
        setRawText(text)
        setExtractedImages([])
        setMessage("PDF digital berjaya diextract sebagai teks. Extract gambar PDF akan dibuat pada fasa seterusnya.")
      } else {
        setMessage("Format belum disokong. Gunakan .txt, .docx atau .pdf digital.")
      }
    } catch (error: any) {
      console.error("Bulk file extraction error", error)
      setMessage(error.message || "Gagal extract fail.")
    } finally {
      setExtractingFile(false)
    }
  }

  async function parseWithAi() {
    setMessage("")

    if (rawText.trim().length < 40) {
      setMessage("Sila paste teks soalan yang lebih lengkap dahulu.")
      return
    }

    setParsing(true)

    try {
      const importText = languageMode === "bm_only" ? stripEnglishTranslationLines(rawText) : rawText
      const batches = splitQuestionBatches(importText, 3)
      const allItems: any[] = []
      const estimatedItems = countDetectedQuestions(importText)

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
        setMessage(`AI memproses batch ${batchIndex + 1}/${batches.length}... Anggaran soalan dikesan: ${estimatedItems}`)
        const { data, error } = await supabase.functions.invoke("parse-bulk-items", {
          body: {
            paperType,
            languageMode,
            rawText: batches[batchIndex],
            batchIndex,
            batchCount: batches.length,
          },
        })

        if (error) {
          console.error("Bulk parse error", error)
          setMessage(await getFunctionErrorMessage(error))
          return
        }

        if (data?.error) {
          setMessage(data.error)
          return
        }

        allItems.push(...(Array.isArray(data?.items) ? data.items : []))
      }

      setDraftItems(
        allItems.map((item: any, index: number) => ({
        id: crypto.randomUUID(),
        paper: paperType,
        questionNo: item.questionNo || String(index + 1),
        section: paperType === "paper_2" ? normalizeSection(item.section) : "",
        stem: item.stem || "",
        options: {
          A: item.options?.A || "",
          B: item.options?.B || "",
          C: item.options?.C || "",
          D: item.options?.D || "",
        },
        answer: item.answer || "",
        marks: paperType === "paper_2" ? normalizeMarks(item.marks, 5) : 1,
        itemType: paperType === "paper_2" ? "structured" : "mcq",
        subQuestions:
          paperType === "paper_2"
            ? normalizeSubQuestions(item.subQuestions, item.metadata)
            : [],
        imageRefs: Array.isArray(item.imageRefs) ? filterSupportedImageRefs(item.imageRefs, extractedImages) : [],
        ...mapMetadata(item.metadata),
        selected: true,
      })),
      )
      setMessage(`${allItems.length}/${estimatedItems || allItems.length} draft item dijana. Sila semak sebelum import.`)
    } finally {
      setParsing(false)
    }
  }

  function updateDraft(id: string, patch: Partial<DraftItem>) {
    setDraftItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  function updateOption(id: string, label: "A" | "B" | "C" | "D", value: string) {
    setDraftItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              options: {
                ...item.options,
                [label]: value,
              },
            }
          : item,
      ),
    )
  }

  function updateSubQuestion(itemId: string, subId: string, patch: Partial<DraftSubQuestion>) {
    setDraftItems((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? {
              ...item,
              subQuestions: item.subQuestions.map((sub) =>
                sub.id === subId ? { ...sub, ...patch } : sub,
              ),
            }
          : item,
      ),
    )
  }

  function removeDraft(id: string) {
    setDraftItems((prev) => prev.filter((item) => item.id !== id))
  }

  async function importSelected() {
    setMessage("")

    if (!profile?.id) {
      setMessage("Profil pengguna tidak dijumpai.")
      return
    }

    const selected = draftItems.filter((item) => item.selected)
    if (selected.length === 0) {
      setMessage("Tiada draft item dipilih.")
      return
    }

    const invalid = selected.find((item) => {
      if (!item.stem.trim()) return true
      if (item.paper === "paper_1") {
        return optionLabels.some((label) => !item.options[label].trim()) || !item.answer
      }

      const markedSubQuestions = item.subQuestions.filter((sub) => sub.responseType !== "instruction" && sub.marks > 0)
      return !item.section || markedSubQuestions.length === 0
    })
    if (invalid) {
      setMessage(
        invalid.paper === "paper_1"
          ? `Sila lengkapkan stem, pilihan A-D dan jawapan betul untuk item ${invalid.questionNo || ""}.`
          : `Sila lengkapkan bahagian dan sekurang-kurangnya satu sub-soalan bermarkah untuk item ${invalid.questionNo || ""}.`,
      )
      return
    }

    setImporting(true)

    try {
      let imported = 0
      for (const item of selected) {
        const itemCode = generateItemCode(item.tingkatan, item.paper, item.section)
        const imageUrlByRef = await uploadImagesForItem(item, itemCode, profile.id, extractedImages)
        const { data: insertedItem, error: itemError } = await supabase
          .from("items")
          .insert({
            item_code: itemCode,
            created_by: profile.id,
            updated_by: profile.id,
            tingkatan: item.tingkatan,
            paper: item.paper,
            section: item.paper === "paper_2" ? item.section || null : null,
            question_no_reference: item.questionNo || null,
            item_type: item.itemType,
            theme_name: item.themeName || null,
            bidang_learning_code: item.bidangCode || null,
            bidang_learning_name: item.bidangName || null,
            standard_kandungan: item.standardKandungan || null,
            standard_pembelajaran: item.standardPembelajaran || null,
            main_construct: getPrimaryConstruct(item),
            construct_code: getPrimaryConstructCode(item),
            difficulty_level: getPrimaryDifficulty(item),
            marks: item.paper === "paper_2" ? getTotalMarks(item) : 1,
            stimulus_type: collectImageRefs(item).length > 0 ? "image" : "text",
            stem_text: toHtmlWithImages(item.stem, imageUrlByRef),
            answer_scheme_text:
              item.paper === "paper_2"
                ? generatePaper2MarkingSchemeHtml(item)
                : `Jawapan: ${item.answer}`,
            answer_final: item.paper === "paper_1" ? item.answer : null,
            source_type: sourceType.trim() || "Import pukal",
            source_year: sourceYear || null,
            status: "draft",
          })
          .select("id")
          .single()

        if (itemError) throw itemError

        if (item.paper === "paper_1") {
          const optionRows = optionLabels.map((label, index) => ({
            item_id: insertedItem.id,
            option_label: label,
            option_text: toParagraphHtml(item.options[label]),
            is_correct: item.answer === label,
            display_order: index + 1,
          }))

          const { error: optionError } = await supabase.from("item_options").insert(optionRows)
          if (optionError) throw optionError
        }

        if (item.paper === "paper_2") {
          const subRows = item.subQuestions.map((sub, index) => {
            const isInstruction = sub.responseType === "instruction" || Number(sub.marks) <= 0
            return {
              item_id: insertedItem.id,
              label: sub.label || "a",
              sub_label: sub.subLabel || null,
              question_text: toHtmlWithImages(sub.questionText, imageUrlByRef),
              answer_scheme_text: isInstruction ? "-" : sub.answerSchemeText.trim() || "-",
              marks: isInstruction ? 0 : normalizeMarks(sub.marks, 1),
              response_type: sub.responseType,
              main_construct: isInstruction ? null : sub.mainConstruct || item.mainConstruct || null,
              construct_code: isInstruction ? null : sub.constructCode || item.constructCode || null,
              difficulty_level: isInstruction ? null : sub.difficultyLevel || item.difficultyLevel || "sederhana",
              display_order: index + 1,
            }
          })

          const { error: subError } = await supabase.from("item_subquestions").insert(subRows)
          if (subError) throw subError
        }
        imported += 1
      }

      setDraftItems((prev) => prev.filter((item) => !item.selected))
      setMessage(`${imported} item berjaya diimport sebagai draft. Semak di Bank Soalan.`)
    } catch (error: any) {
      console.error("Bulk import insert error", error)
      setMessage(error.message || "Gagal import item.")
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <h1 className="page-title">Import Pukal AI</h1>
          <p className="page-subtitle">
              Upload atau paste teks, AI pecahkan item Kertas 1 / Kertas 2 dan cadangkan metadata sebelum import sebagai draft.
          </p>
        </div>
      </div>

      {message && <div className="admin-alert">{message}</div>}

      <div className="bulk-import-layout">
        <section className="card-block">
          <div className="card-head">
            <h2>Sumber Import</h2>
            <p>Untuk fasa pertama, gunakan teks daripada PDF/Word yang disalin.</p>
          </div>

          <div className="bulk-source-row">
            <Field label="Jenis import">
              <select
                className="input"
                value={paperType}
                onChange={(event) => {
                  setPaperType(event.target.value as "paper_1" | "paper_2")
                  setDraftItems([])
                }}
              >
                <option value="paper_1">Kertas 1 Objektif</option>
                <option value="paper_2">Kertas 2 Subjektif</option>
              </select>
            </Field>
            <Field label="Sumber">
              <input className="input" value={sourceType} onChange={(event) => setSourceType(event.target.value)} />
            </Field>
            <Field label="Tahun">
              <input className="input" type="number" value={sourceYear} onChange={(event) => setSourceYear(Number(event.target.value))} />
            </Field>
            <Field label="Bahasa import">
              <select
                className="input"
                value={languageMode}
                onChange={(event) => setLanguageMode(event.target.value as "bm_only" | "bm_bi")}
              >
                <option value="bm_only">Bahasa Melayu sahaja</option>
                <option value="bm_bi">Kekalkan BM + BI</option>
              </select>
            </Field>
            <div className="bulk-import-actions">
              <button type="button" className="btn btn-primary" onClick={() => void parseWithAi()} disabled={parsing}>
                {parsing ? "AI memproses..." : "AI Pecahkan Soalan"}
              </button>
            </div>
          </div>

          <div className="bulk-file-box">
            <Field label="Upload fail digital">
              <input
                className="input"
                type="file"
                accept=".txt,.docx,.pdf"
                onChange={(event) => void handleFileUpload(event.target.files?.[0] || null)}
                disabled={extractingFile}
              />
            </Field>
            <div className="bulk-file-note">
              {extractingFile
                ? "Sedang extract fail..."
                : "DOCX boleh extract teks dan gambar embedded. PDF digital buat masa ini extract teks dahulu."}
            </div>
            {rawText.trim() && (
              <div className="bulk-detect-note">
                Anggaran soalan dikesan daripada teks: <strong>{detectedQuestionCount || "-"}</strong>
              </div>
            )}
          </div>

          {extractedImages.length > 0 && (
            <div className="bulk-image-strip">
              {extractedImages.map((image) => (
                <figure key={image.ref}>
                  <img src={image.dataUrl} alt={image.ref} />
                  <figcaption>[{image.ref}]</figcaption>
                </figure>
              ))}
            </div>
          )}

          <textarea
            className="input bulk-import-textarea"
            value={rawText}
            onChange={(event) => setRawText(event.target.value)}
            placeholder="Paste teks soalan objektif di sini. Contoh: 1. ... A. ... B. ... C. ... D. ..."
          />
        </section>

        <section className="card-block">
          <div className="card-head builder-card-head-row">
            <div>
              <h2>Draft Import</h2>
              <p>Semak kandungan item sahaja. Metadata AI akan disimpan dan disemak semasa proses pengesahan.</p>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void importSelected()}
              disabled={importing || draftItems.length === 0}
            >
              {importing ? "Mengimport..." : "Import Dipilih"}
            </button>
          </div>

          {draftItems.length === 0 ? (
            <div className="empty-state">Belum ada draft item.</div>
          ) : (
            <div className="bulk-draft-list">
              {draftItems.map((item, index) => (
                <article key={item.id} className="bulk-draft-card">
                  <div className="bulk-draft-head">
                    <label className="bulk-check">
                      <input
                        type="checkbox"
                        checked={item.selected}
                        onChange={(event) => updateDraft(item.id, { selected: event.target.checked })}
                      />
                      <strong>Item {item.questionNo || index + 1}</strong>
                    </label>
                    <button type="button" className="btn btn-light btn-sm" onClick={() => removeDraft(item.id)}>
                      Buang
                    </button>
                  </div>

                  <div className="form-grid form-grid-2">
                    <Field label="No. Rujukan">
                      <input
                        className="input"
                        value={item.questionNo}
                        onChange={(event) => updateDraft(item.id, { questionNo: event.target.value })}
                      />
                    </Field>
                    {item.paper === "paper_1" ? (
                      <Field label="Jawapan Betul">
                        <select
                          className="input"
                          value={item.answer}
                          onChange={(event) => updateDraft(item.id, { answer: event.target.value as DraftItem["answer"] })}
                        >
                          <option value="">Pilih jawapan</option>
                          {optionLabels.map((label) => (
                            <option key={label} value={label}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </Field>
                    ) : (
                      <>
                        <Field label="Bahagian">
                          <select
                            className="input"
                            value={item.section}
                            onChange={(event) => updateDraft(item.id, { section: normalizeSection(event.target.value) })}
                          >
                            <option value="">Pilih bahagian</option>
                            <option value="A">Bahagian A</option>
                            <option value="B">Bahagian B</option>
                            <option value="C">Bahagian C</option>
                          </select>
                        </Field>
                        <Field label="Jumlah Markah">
                          <input
                            className="input"
                            type="number"
                            min={1}
                            value={item.marks}
                            onChange={(event) => updateDraft(item.id, { marks: normalizeMarks(event.target.value, 5) })}
                          />
                        </Field>
                      </>
                    )}
                  </div>

                  <Field label="Stem Soalan">
                    <textarea
                      className="input textarea-md"
                      value={item.stem}
                      onChange={(event) => updateDraft(item.id, { stem: event.target.value })}
                    />
                  </Field>

                  {extractedImages.length > 0 && (
                    <Field label="Gambar dipadankan AI">
                      <input
                        className="input"
                        value={item.imageRefs.join(", ")}
                        onChange={(event) =>
                          updateDraft(item.id, {
                            imageRefs: event.target.value
                              .split(",")
                              .map((ref) => ref.trim().replace(/[\[\]]/g, ""))
                              .filter(Boolean),
                          })
                        }
                        placeholder="Contoh: IMAGE_1"
                      />
                    </Field>
                  )}

                  {item.paper === "paper_1" ? (
                    <div className="bulk-options-grid">
                      {optionLabels.map((label) => (
                        <Field key={label} label={`Pilihan ${label}`}>
                          <textarea
                            className="input"
                            value={item.options[label]}
                            onChange={(event) => updateOption(item.id, label, event.target.value)}
                          />
                        </Field>
                      ))}
                    </div>
                  ) : (
                    <div className="bulk-subquestion-list">
                      {item.subQuestions.map((sub) => (
                        <div key={sub.id} className="bulk-subquestion-card">
                          <div className="form-grid form-grid-4">
                            <Field label="Label">
                              <input
                                className="input"
                                value={sub.label}
                                onChange={(event) => updateSubQuestion(item.id, sub.id, { label: event.target.value })}
                              />
                            </Field>
                            <Field label="Sub-label">
                              <input
                                className="input"
                                value={sub.subLabel}
                                onChange={(event) => updateSubQuestion(item.id, sub.id, { subLabel: event.target.value })}
                              />
                            </Field>
                            <Field label="Markah">
                              <input
                                className="input"
                                type="number"
                                min={0}
                                value={sub.marks}
                                onChange={(event) =>
                                  updateSubQuestion(item.id, sub.id, { marks: normalizeMarks(event.target.value, 0) })
                                }
                              />
                            </Field>
                            <Field label="Jenis Respons">
                              <select
                                className="input"
                                value={sub.responseType}
                                onChange={(event) =>
                                  updateSubQuestion(item.id, sub.id, {
                                    responseType: event.target.value as DraftSubQuestion["responseType"],
                                  })
                                }
                              >
                                <option value="instruction">Arahan sahaja</option>
                                <option value="short_text">Jawapan ringkas</option>
                                <option value="structured_text">Jawapan berstruktur</option>
                                <option value="provided_space">Ruang jawapan telah disediakan</option>
                                <option value="table">Jadual</option>
                                <option value="calculation">Pengiraan</option>
                                <option value="drawing">Lukisan / rajah</option>
                                <option value="design">Reka bentuk</option>
                              </select>
                            </Field>
                          </div>

                          <Field label={`Teks sub-soalan ${formatSubLabel(sub)}`}>
                            <textarea
                              className="input textarea-md"
                              value={sub.questionText}
                              onChange={(event) =>
                                updateSubQuestion(item.id, sub.id, { questionText: event.target.value })
                              }
                            />
                          </Field>

                          {sub.responseType !== "instruction" && (
                            <Field label="Cadangan jawapan / skema">
                              <textarea
                                className="input"
                                value={sub.answerSchemeText}
                                onChange={(event) =>
                                  updateSubQuestion(item.id, sub.id, { answerSchemeText: event.target.value })
                                }
                              />
                            </Field>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="field-wrap">
      <label className="field-label">{label}</label>
      {children}
    </div>
  )
}

function generateItemCode(tingkatan: 4 | 5, paper: "paper_1" | "paper_2" = "paper_1", section: DraftItem["section"] = "") {
  const random = Math.random().toString(36).slice(2, 7).toUpperCase()
  const paperCode = paper === "paper_2" ? `K2${section || ""}` : "K1"
  return `SCI-${paperCode}-T${tingkatan}-AI${random}`
}

function countDetectedQuestions(text: string) {
  return splitQuestionBlocks(text).length
}

function splitQuestionBatches(text: string, batchSize = 3) {
  const normalized = normalizeBulkText(text)
  const blocks = splitQuestionBlocks(normalized)

  if (blocks.length < 2) return [normalized]
  const batches: string[] = []
  for (let i = 0; i < blocks.length; i += batchSize) {
    batches.push(blocks.slice(i, i + batchSize).join("\n\n"))
  }

  return batches
}

function normalizeBulkText(text: string) {
  return text
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/([^\n])(\[(?:IMAGE|Image|image)_\d+\])/g, "$1\n$2")
    .replace(/(\[(?:IMAGE|Image|image)_\d+\])([^\n])/g, "$1\n$2")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function stripEnglishTranslationLines(text: string) {
  return normalizeBulkText(text)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !isLikelyEnglishTranslationLine(line))
    .join("\n")
}

function isLikelyEnglishTranslationLine(line: string) {
  const value = line.trim()
  if (!value) return false
  if (/^\[IMAGE_\d+\]$/i.test(value)) return false
  if (/^[A-D][\).]?\s+/i.test(value)) return false

  const lower = value.toLowerCase()
  const englishStarts = /^(based on|state|name|which|what|why|how|explain|calculate|draw|predict|observe|give|mark|diagram|table|figure|a student|the diagram|the table|from the|using the|write|choose|select|identify|determine|compare|suggest)\b/
  if (englishStarts.test(lower)) return true

  const englishWords = lower.match(/\b(the|and|of|in|on|for|with|from|which|what|that|are|is|to|as|based|diagram|table|state|shows|given|following|answer|sample|water|polluted|types)\b/g) || []
  const malayWords = lower.match(/\b(yang|dan|dalam|pada|bagi|untuk|dengan|daripada|rajah|jadual|nyatakan|apakah|manakah|berdasarkan|sampel|air|jenis|pencemaran)\b/g) || []

  return englishWords.length >= 4 && englishWords.length > malayWords.length * 2
}

function splitQuestionBlocks(text: string) {
  const normalized = normalizeBulkText(text)
  const starts = findQuestionStarts(normalized)

  if (starts.length < 2) return normalized ? [normalized] : []

  return starts
    .map((start, index) => {
      const end = starts[index + 1]?.index || normalized.length
      return normalized.slice(start.index, end).trim()
    })
    .filter(Boolean)
}

function findQuestionStarts(text: string) {
  const normalized = normalizeBulkText(text)
  const candidates = Array.from(
    normalized.matchAll(/(?:^|[\n\f]|(?:\s{2,}))(\d{1,2})(?:[\).])?\s+(?=\S)/g),
  )
    .map((match) => ({
      index: getDigitIndex(match),
      questionNo: Number(match[1]),
    }))
    .filter((match) => match.questionNo >= 1 && match.questionNo <= 60)
    .sort((a, b) => a.index - b.index)

  const sequential = buildSequentialQuestionStarts(candidates)
  if (sequential.length >= 2) return sequential

  return candidates.filter((match, index, all) => {
    const end = all[index + 1]?.index || normalized.length
    const chunk = normalized.slice(match.index, end)
    return hasMcqMarkers(chunk)
  })
}

function getDigitIndex(match: RegExpMatchArray) {
  const base = match.index || 0
  const offset = match[0].search(/\d/)
  return base + Math.max(offset, 0)
}

function buildSequentialQuestionStarts(candidates: Array<{ index: number; questionNo: number }>) {
  if (candidates.length < 2) return []

  const byQuestionNo = new Map<number, Array<{ index: number; questionNo: number }>>()
  candidates.forEach((candidate) => {
    byQuestionNo.set(candidate.questionNo, [...(byQuestionNo.get(candidate.questionNo) || []), candidate])
  })

  const starts: Array<{ index: number; questionNo: number }> = []
  let previousIndex = -1

  for (let questionNo = 1; questionNo <= 60; questionNo += 1) {
    const next = (byQuestionNo.get(questionNo) || []).find((candidate) => candidate.index > previousIndex)
    if (!next) break
    starts.push(next)
    previousIndex = next.index
  }

  return starts.length >= 2 ? starts : []
}

function hasMcqMarkers(text: string) {
  return ["A", "B", "C", "D"].every((label) =>
    new RegExp(`(?:^|\\n|\\s{2,})${label}(?:[\\).]|\\s{2,})`, "i").test(text),
  )
}

function mapMetadata(metadata: any): Pick<
  DraftItem,
  | "tingkatan"
  | "themeName"
  | "bidangCode"
  | "bidangName"
  | "standardKandungan"
  | "standardKandunganName"
  | "standardPembelajaran"
  | "standardPembelajaranName"
  | "mainConstruct"
  | "constructCode"
  | "constructAspect"
  | "difficultyLevel"
> {
  return {
    tingkatan: metadata?.tingkatan === 5 ? 5 : 4,
    themeName: metadata?.theme_name || "",
    bidangCode: metadata?.bidang_learning_code || "",
    bidangName: metadata?.bidang_learning_name || "",
    standardKandungan: metadata?.standard_kandungan || "",
    standardKandunganName: metadata?.standard_kandungan_name || "",
    standardPembelajaran: metadata?.standard_pembelajaran || "",
    standardPembelajaranName: metadata?.standard_pembelajaran_name || "",
    mainConstruct: metadata?.main_construct || "Mengingat",
    constructCode: metadata?.construct_code || "",
    constructAspect: metadata?.construct_aspect || "",
    difficultyLevel: normalizeDifficulty(metadata?.difficulty_level),
  }
}

function normalizeDifficulty(value: unknown): DraftItem["difficultyLevel"] {
  return value === "rendah" || value === "tinggi" || value === "sederhana" ? value : "sederhana"
}

function normalizeSection(value: unknown): DraftItem["section"] {
  const section = String(value || "").trim().toUpperCase()
  return section === "A" || section === "B" || section === "C" ? section : ""
}

function normalizeMarks(value: unknown, fallback: number) {
  const marks = Number(value)
  if (!Number.isFinite(marks)) return fallback
  return Math.max(0, Math.round(marks))
}

function normalizeResponseType(value: unknown): DraftSubQuestion["responseType"] {
  const responseType = String(value || "").trim()
  const allowed: DraftSubQuestion["responseType"][] = [
    "instruction",
    "short_text",
    "structured_text",
    "table",
    "drawing",
    "design",
    "calculation",
    "provided_space",
  ]
  return allowed.includes(responseType as DraftSubQuestion["responseType"])
    ? (responseType as DraftSubQuestion["responseType"])
    : "short_text"
}

function normalizeSubQuestions(subQuestions: unknown, metadata: any): DraftSubQuestion[] {
  const rows = Array.isArray(subQuestions) ? subQuestions : []
  const normalized = rows
    .map((row: any, index) => {
      const responseType = normalizeResponseType(row?.responseType || row?.response_type)
      const marks = responseType === "instruction" ? 0 : normalizeMarks(row?.marks, 1)

      return {
        id: crypto.randomUUID(),
        label: String(row?.label || defaultSubQuestionLabel(index)).trim().toLowerCase(),
        subLabel: String(row?.subLabel || row?.sub_label || "").trim().toLowerCase(),
        questionText: String(row?.questionText || row?.question_text || "").trim(),
        answerSchemeText: String(row?.answerSchemeText || row?.answer_scheme_text || "").trim(),
        marks,
        responseType: marks === 0 ? "instruction" : responseType,
        mainConstruct: String(row?.mainConstruct || metadata?.main_construct || "").trim(),
        constructCode: String(row?.constructCode || metadata?.construct_code || "").trim(),
        difficultyLevel: normalizeDifficulty(row?.difficultyLevel || row?.difficulty_level || metadata?.difficulty_level),
        imageRefs: Array.isArray(row?.imageRefs)
          ? row.imageRefs.map((ref: unknown) => String(ref || "").replace(/[\[\]]/g, "").trim()).filter(Boolean)
          : [],
      }
    })
    .filter((row) => row.questionText)

  return normalized.length > 0
    ? normalized
    : [
        {
          id: crypto.randomUUID(),
          label: "a",
          subLabel: "",
          questionText: "",
          answerSchemeText: "",
          marks: 1,
          responseType: "short_text",
          mainConstruct: String(metadata?.main_construct || "").trim(),
          constructCode: String(metadata?.construct_code || "").trim(),
          difficultyLevel: normalizeDifficulty(metadata?.difficulty_level),
          imageRefs: [],
        },
      ]
}

function defaultSubQuestionLabel(index: number) {
  return String.fromCharCode("a".charCodeAt(0) + index)
}

function formatSubLabel(sub: DraftSubQuestion) {
  return `(${sub.label})${sub.subLabel ? `(${sub.subLabel})` : ""}`
}

function collectImageRefs(item: DraftItem) {
  return Array.from(
    new Set([
      ...item.imageRefs,
      ...item.subQuestions.flatMap((sub) => sub.imageRefs),
    ].map((ref) => ref.replace(/[\[\]]/g, "").trim()).filter(Boolean)),
  )
}

function getTotalMarks(item: DraftItem) {
  const subTotal = item.subQuestions.reduce(
    (sum, sub) => sum + (sub.responseType === "instruction" ? 0 : normalizeMarks(sub.marks, 0)),
    0,
  )
  return subTotal || normalizeMarks(item.marks, 5)
}

function getPrimarySubQuestion(item: DraftItem) {
  return item.subQuestions.find((sub) => sub.responseType !== "instruction" && sub.marks > 0)
}

function getPrimaryConstruct(item: DraftItem) {
  return getPrimarySubQuestion(item)?.mainConstruct || item.mainConstruct || "Mengingat"
}

function getPrimaryConstructCode(item: DraftItem) {
  return getPrimarySubQuestion(item)?.constructCode || item.constructCode || null
}

function getPrimaryDifficulty(item: DraftItem) {
  return getPrimarySubQuestion(item)?.difficultyLevel || item.difficultyLevel || "sederhana"
}

function generatePaper2MarkingSchemeHtml(item: DraftItem) {
  const rows = item.subQuestions.filter((sub) => sub.responseType !== "instruction" && sub.marks > 0)
  if (rows.length === 0) return "<p>-</p>"

  const body = rows
    .map(
      (sub) => `
        <tr>
          <td>${escapeHtml(formatSubLabel(sub))}</td>
          <td>${escapeHtml(sub.answerSchemeText || "-").replace(/\n/g, "<br />")}</td>
          <td>${normalizeMarks(sub.marks, 1)}</td>
        </tr>
      `,
    )
    .join("")

  return `
    <table>
      <thead>
        <tr><th>Nombor Soalan</th><th>Cadangan Jawapan</th><th>Markah</th></tr>
      </thead>
      <tbody>
        ${body}
        <tr><td colspan="2"><strong>Jumlah</strong></td><td><strong>${getTotalMarks(item)}</strong></td></tr>
      </tbody>
    </table>
  `
}

function cleanExtractedText(text: string) {
  return normalizeBulkText(
    text
      .replace(/\t/g, " ")
      .replace(/[ \u00a0]{2,}/g, " ")
      .replace(/\n[ \u00a0]+/g, "\n"),
  )
}

function extractDocxImportText(body: HTMLElement) {
  const lines: string[] = []
  let questionNo = 1

  body.childNodes.forEach((node) => {
    if (node instanceof HTMLOListElement) {
      questionNo = appendOrderedListText(node, lines, questionNo, 0)
      return
    }

    if (node instanceof HTMLElement) {
      const text = ownBlockText(node)
      if (text) lines.push(text)
    }
  })

  return cleanExtractedText(lines.join("\n"))
}

function appendOrderedListText(ol: HTMLOListElement, lines: string[], questionNo: number, depth: number) {
  let optionIndex = 0

  directChildren(ol, "li").forEach((li) => {
    const ownText = ownBlockText(li)
    const nestedLists = directChildren(li, "ol") as HTMLOListElement[]
    const hasNestedOptions = nestedLists.length > 0

    if (depth === 0) {
      const shouldStartQuestion = hasNestedOptions || optionIndex >= optionLabels.length || looksLikeQuestionStem(ownText)

      if (shouldStartQuestion) {
        if (ownText) lines.push(`${questionNo}. ${ownText}`)
        questionNo += 1
        optionIndex = 0
        nestedLists.forEach((nestedList) => {
          questionNo = appendOrderedListText(nestedList, lines, questionNo, depth + 1)
        })
        return
      }
    }

    const label = optionLabels[optionIndex] || "-"
    if (ownText) lines.push(`${label}. ${ownText}`)
    optionIndex += 1
    nestedLists.forEach((nestedList) => {
      questionNo = appendOrderedListText(nestedList, lines, questionNo, depth + 1)
    })
  })

  return questionNo
}

function directChildren(element: Element, tagName: string) {
  return Array.from(element.children).filter((child) => child.tagName.toLowerCase() === tagName.toLowerCase())
}

function ownBlockText(element: Element) {
  const clone = element.cloneNode(true) as HTMLElement
  clone.querySelectorAll("ol, ul").forEach((list) => list.remove())
  return cleanExtractedText(clone.textContent || "")
}

function looksLikeQuestionStem(text: string) {
  const value = text.trim()
  if (!value) return false
  const lower = value.toLowerCase()

  return (
    /[?？]$/.test(value) ||
    /^(antara|apakah|manakah|berapakah|bagaimanakah|yang manakah|rajah|jadual|maklumat|berdasarkan|seorang|huda|pilih|nyatakan|apabila)\b/i.test(
      value,
    ) ||
    lower.includes("yang manakah") ||
    lower.includes("apakah") ||
    lower.includes("rajah") && lower.includes("menunjukkan")
  )
}

async function extractDocx(file: File) {
  let imageIndex = 0
  const images: ExtractedImage[] = []
  const unsupportedImages: string[] = []
  const arrayBuffer = await file.arrayBuffer()

  const result = await mammoth.convertToHtml(
    { arrayBuffer },
    {
      convertImage: mammoth.images.imgElement(async (image) => {
        imageIndex += 1
        const mimeType = image.contentType || "image/png"
        const ref = `IMAGE_${imageIndex}`

        if (!isSupportedImageMimeType(mimeType)) {
          unsupportedImages.push(`${ref} (${mimeType})`)
          return { src: "", alt: ref }
        }

        const base64 = await image.read("base64")
        const dataUrl = `data:${mimeType};base64,${base64}`
        images.push({ ref, dataUrl, mimeType })
        return { src: dataUrl, alt: ref }
      }),
    },
  )

  const doc = new DOMParser().parseFromString(result.value, "text/html")
  doc.querySelectorAll("p, li, tr, h1, h2, h3, h4").forEach((element) => {
    element.appendChild(doc.createTextNode("\n"))
  })
  doc.querySelectorAll("img").forEach((img) => {
    const ref = img.getAttribute("alt") || `IMAGE_${images.length + 1}`
    img.replaceWith(doc.createTextNode(`\n[${ref}]\n`))
  })

  const plainText = cleanExtractedText(doc.body.innerText)
  const structuredText = extractDocxImportText(doc.body)
  const text =
    countDetectedQuestions(structuredText) > countDetectedQuestions(plainText) ? structuredText : plainText

  return {
    text,
    images,
    unsupportedImages,
  }
}

async function extractPdfText(file: File) {
  const data = new Uint8Array(await file.arrayBuffer())
  const pdf = await pdfjsLib.getDocument({ data }).promise
  const pages: string[] = []

  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
    const page = await pdf.getPage(pageNo)
    const content = await page.getTextContent()
    const text = content.items
      .map((item: any) => item.str || "")
      .join(" ")
      .replace(/\s+/g, " ")
      .trim()
    pages.push(`\n\n--- PAGE ${pageNo} ---\n${text}`)
  }

  return pages.join("\n").trim()
}

async function uploadImagesForItem(
  item: DraftItem,
  itemCode: string,
  profileId: string,
  extractedImages: ExtractedImage[],
) {
  const imageUrlByRef = new Map<string, string>()
  const refs = collectImageRefs(item)

  for (const ref of refs) {
    const image = extractedImages.find((entry) => entry.ref.toLowerCase() === ref.toLowerCase())
    if (!image) continue
    if (!isSupportedImageMimeType(image.mimeType)) continue

    const blob = dataUrlToBlob(image.dataUrl)
    const ext = mimeToExt(image.mimeType)
    const path = `bulk-import/${profileId}/${itemCode}-${ref}.${ext}`
    const { error } = await supabase.storage.from("item-media").upload(path, blob, {
      cacheControl: "3600",
      contentType: image.mimeType,
      upsert: true,
    })

    if (error) throw error

    const { data } = supabase.storage.from("item-media").getPublicUrl(path)
    imageUrlByRef.set(ref, data.publicUrl)
  }

  return imageUrlByRef
}

function filterSupportedImageRefs(refs: unknown[], extractedImages: ExtractedImage[]) {
  return refs
    .map((ref) => String(ref || "").replace(/[\[\]]/g, "").trim())
    .filter((ref) => {
      const image = extractedImages.find((entry) => entry.ref.toLowerCase() === ref.toLowerCase())
      return image ? isSupportedImageMimeType(image.mimeType) : false
    })
}

function isSupportedImageMimeType(mimeType: string) {
  return supportedImageMimeTypes.includes(mimeType.toLowerCase())
}

function toHtmlWithImages(text: string, imageUrlByRef: Map<string, string>) {
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)

  return lines
    .map((line) => {
      const imageMatch = line.match(/^\[(IMAGE_\d+)\]$/i)
      if (imageMatch) {
        const url = imageUrlByRef.get(imageMatch[1])
        return url ? `<p><img src="${escapeHtml(url)}" alt="${escapeHtml(imageMatch[1])}" /></p>` : ""
      }

      const withImages = escapeHtml(line).replace(/\[(IMAGE_\d+)\]/gi, (_match, ref) => {
        const url = imageUrlByRef.get(ref)
        return url ? `<br /><img src="${escapeHtml(url)}" alt="${escapeHtml(ref)}" /><br />` : `[${ref}]`
      })

      return `<p>${withImages}</p>`
    })
    .join("")
}

function toParagraphHtml(text: string) {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("")
}

function dataUrlToBlob(dataUrl: string) {
  const [header, base64] = dataUrl.split(",")
  const mimeType = header.match(/data:(.*?);base64/)?.[1] || "image/png"
  const bytes = atob(base64)
  const array = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i += 1) {
    array[i] = bytes.charCodeAt(i)
  }
  return new Blob([array], { type: mimeType })
}

function mimeToExt(mimeType: string) {
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg"
  if (mimeType.includes("webp")) return "webp"
  if (mimeType.includes("gif")) return "gif"
  return "png"
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

async function getFunctionErrorMessage(error: any) {
  const fallback = error?.message || "Gagal proses import AI."

  try {
    const context = error?.context
    if (!context) return fallback

    if (typeof context.json === "function") {
      const body = await context.json()
      return body?.error || body?.message || fallback
    }

    if (typeof context.text === "function") {
      const text = await context.text()
      return text || fallback
    }
  } catch (_error) {
    return fallback
  }

  return fallback
}
