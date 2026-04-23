import { FormEvent, Suspense, lazy, useMemo, useState } from "react"
import { supabase } from "../lib/supabase"
import { useUser } from "../context/UserContext"

const RichEditor = lazy(() => import("../components/RichEditor"))

type PaperType = "paper_1" | "paper_2"
type SectionType = "A" | "B" | "C" | ""
type ItemType = "mcq" | "structured" | "limited_response" | "open_response"
type DifficultyType = "rendah" | "sederhana" | "tinggi"

type McqOption = {
  label: "A" | "B" | "C" | "D"
  text: string
}

const initialOptions: McqOption[] = [
  { label: "A", text: "" },
  { label: "B", text: "" },
  { label: "C", text: "" },
  { label: "D", text: "" },
]

const temaOptions = {
  4: [
    {
      tema: "Penyenggaraan dan Kesinambungan Hidup",
      bidang: [
        {
          code: "1.0",
          name: "Langkah Keselamatan dalam Makmal",
          standardKandungan: [
            {
              code: "1.1",
              name: "Peralatan perlindungan diri",
              standardPembelajaran: [
                {
                  code: "1.1.1",
                  name: "Menyatakan jenis dan fungsi PPE",
                },
              ],
            },
          ],
        },
      ],
    },
    {
      tema: "Penerokaan Unsur dalam Alam",
      bidang: [
        {
          code: "8.0",
          name: "Unsur dan Bahan",
          standardKandungan: [
            {
              code: "8.1",
              name: "Asas Jirim",
              standardPembelajaran: [
                {
                  code: "8.1.1",
                  name: "Menyatakan maksud atom dan molekul",
                },
                {
                  code: "8.1.2",
                  name: "Membandingkan unsur dan sebatian",
                },
              ],
            },
          ],
        },
      ],
    },
  ],

  5: [
    {
      tema: "Penyenggaraan dan Kesinambungan Hidup",
      bidang: [
        {
          code: "1.0",
          name: "Mikroorganisma",
          standardKandungan: [
            {
              code: "1.1",
              name: "Dunia Mikroorganisma",
              standardPembelajaran: [
                {
                  code: "1.1.1",
                  name: "Mengelaskan mikroorganisma",
                },
                {
                  code: "1.1.2",
                  name: "Menerangkan faktor pertumbuhan mikroorganisma",
                },
              ],
            },
          ],
        },
      ],
    },
  ],
} as const

const constructCodeMap: Record<string, string[]> = {
  mengingat: ["PS0101", "PS0102", "PS0103"],
  memahami: ["KS0101", "KS0102", "KS0103", "KS0104"],
  mengaplikasi: ["KS0201", "KS0202"],
  menganalisis: ["KS0301", "KS0302"],
  menilai: ["KS0401"],
  mencipta: ["KS0501", "KS0502"],
  kemahiran_proses_sains: [
    "SS0101",
    "SS0102",
    "SS0103",
    "SS0104",
    "SS0105",
    "SS0106",
    "SS0107",
    "SS0108",
    "SS0109",
    "SS0110",
    "SS0111",
    "SS0112",
  ],
}

const constructOptions = [
  "mengingat",
  "memahami",
  "mengaplikasi",
  "menganalisis",
  "menilai",
  "mencipta",
  "kemahiran_proses_sains",
]

export default function ItemFormPage() {
  const { profile } = useUser()

  function hasRichTextContent(html: string) {
    const text = html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").trim()
    return text.length > 0
  }

  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")

  const [itemCode, setItemCode] = useState("")
  const [tingkatan, setTingkatan] = useState<4 | 5>(4)
  const [paper, setPaper] = useState<PaperType>("paper_1")
  const [section, setSection] = useState<SectionType>("")
  const [questionNoReference, setQuestionNoReference] = useState("")
  const [selectedTema, setSelectedTema] = useState("")
  const [selectedBidang, setSelectedBidang] = useState("")
  const [standardKandungan, setStandardKandungan] = useState("")
  const [standardPembelajaran, setStandardPembelajaran] = useState("")
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

  const isPaper1 = paper === "paper_1"

  const itemType = useMemo<ItemType>(() => {
    if (paper === "paper_1") return "mcq"
    if (section === "A") return "structured"
    if (section === "B") return "limited_response"
    return "open_response"
  }, [paper, section])

  const selectedPaperLabel = paper === "paper_1" ? "Kertas 1" : "Kertas 2"

  const temaList = temaOptions[tingkatan]

  const selectedTemaObj =
    temaList.find((t) => t.tema === selectedTema) || null

  const bidangList = selectedTemaObj?.bidang || []

  const selectedBidangObj =
    bidangList.find(
      (b) => `${b.code} - ${b.name}` === selectedBidang,
    ) || null

  const standardKandunganList = selectedBidangObj?.standardKandungan || []

  const selectedStandardKandunganObj =
    standardKandunganList.find(
      (s) => `${s.code} - ${s.name}` === standardKandungan,
    ) || null

  const standardPembelajaranList =
    selectedStandardKandunganObj?.standardPembelajaran || []

  const constructCodeOptions = mainConstruct ? constructCodeMap[mainConstruct] || [] : []

  function handleOptionChange(index: number, value: string) {
    setOptions((prev) =>
      prev.map((opt, i) => (i === index ? { ...opt, text: value } : opt)),
    )
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setMessage("")

    if (!profile?.id) {
      setMessage("Profil pengguna tidak dijumpai.")
      return
    }

    if (!itemCode.trim()) {
      setMessage("Kod item wajib diisi.")
      return
    }

    if (!hasRichTextContent(stemText)) {
      setMessage("Stem soalan wajib diisi.")
      return
    }

    if (!hasRichTextContent(answerSchemeText)) {
      setMessage("Panduan pemarkahan wajib diisi.")
      return
    }

    if (isPaper1) {
      const hasEmptyOption = options.some((opt) => !opt.text.trim())
      if (hasEmptyOption) {
        setMessage("Semua pilihan jawapan A hingga D mesti diisi.")
        return
      }
      if (!answerFinal.trim()) {
        setMessage("Sila tandakan jawapan betul untuk Kertas 1.")
        return
      }
    }

    if (!isPaper1 && !section) {
      setMessage("Sila pilih bahagian untuk Kertas 2.")
      return
    }

    setSaving(true)

    try {
      const { data: insertedItem, error: itemError } = await supabase
        .from("items")
        .insert({
          item_code: itemCode.trim(),
          created_by: profile.id,
          updated_by: profile.id,
          tingkatan,
          paper,
          section: paper === "paper_2" ? section || null : null,
          question_no_reference: questionNoReference || null,
          item_type: itemType,
          theme_name: selectedTema || null,
          bidang_learning_code: selectedBidangObj?.code || null,
          bidang_learning_name: selectedBidangObj?.name || null,
          standard_kandungan: selectedStandardKandunganObj?.code || null,
          standard_pembelajaran: standardPembelajaran || null,
          main_construct: mainConstruct || null,
          construct_code: constructCode || null,
          difficulty_level: difficultyLevel,
          marks,
          stimulus_type: stimulusType || null,
          stem_text: stemText,
          stem_html: stemText,
          question_instruction: questionInstruction || null,
          answer_scheme_text: answerSchemeText,
          marking_scheme_html: answerSchemeText,
          answer_final: answerFinal || null,
          explanation_text: explanationText || null,
          source_type: sourceType || null,
          source_reference: sourceReference || null,
          source_year: sourceYear ? Number(sourceYear) : null,
          source_school: sourceSchool || null,
          status,
        })
        .select("id")
        .single()

      if (itemError) throw itemError

      if (isPaper1 && insertedItem?.id) {
        const optionRows = options.map((opt, index) => ({
          item_id: insertedItem.id,
          option_label: opt.label,
          option_text: opt.text,
          is_correct: opt.label === answerFinal.trim().toUpperCase(),
          display_order: index + 1,
        }))

        const { error: optionError } = await supabase
          .from("item_options")
          .insert(optionRows)

        if (optionError) throw optionError
      }

      setMessage("Soalan berjaya disimpan.")
      resetForm()
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
    setSelectedBidang("")
    setStandardKandungan("")
    setStandardPembelajaran("")
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
    setPaper("paper_1")
    setSection("")
    setTingkatan(4)
  }

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <h1 className="page-title">Masukkan Soalan</h1>
          <p className="page-subtitle">
            Bina item baharu untuk bank soalan Sains KSSM Tingkatan 4 dan 5.
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
            setMarks(1)
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
                <Field label="Kod Item">
                  <input
                    value={itemCode}
                    onChange={(e) => setItemCode(e.target.value)}
                    className="input"
                    placeholder="Contoh: K1-T4-0001"
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
                    value={marks}
                    onChange={(e) => setMarks(Number(e.target.value))}
                    className="input"
                    min={1}
                  />
                </Field>

                {!isPaper1 && (
                  <Field label="No. Rujukan Soalan">
                    <input
                      value={questionNoReference}
                      onChange={(e) => setQuestionNoReference(e.target.value)}
                      className="input"
                      placeholder="Contoh: 11 / 12 / 13"
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
                    <option value="approved">approved</option>
                    <option value="published">published</option>
                  </select>
                </Field>

                <Field label="Jenis Stimulus">
                  <select
                    value={stimulusType}
                    onChange={(e) => setStimulusType(e.target.value)}
                    className="input"
                  >
                    <option value="text">text</option>
                    <option value="image">image</option>
                    <option value="table">table</option>
                    <option value="graph">graph</option>
                    <option value="diagram">diagram</option>
                    <option value="mixed">mixed</option>
                  </select>
                </Field>
              </div>
            </Card>

            <Card
              title="Kandungan Soalan"
              subtitle="Isi stem, arahan dan kandungan utama item."
            >
              <div className="space-y-4">
                <Field label="Arahan Soalan">
                  <input
                    value={questionInstruction}
                    onChange={(e) => setQuestionInstruction(e.target.value)}
                    className="input"
                    placeholder="Contoh: Jawab semua soalan"
                  />
                </Field>

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
                      <p>Pilih satu jawapan betul bagi item objektif.</p>
                    </div>

                    <div className="options-grid">
                      {options.map((option, index) => (
                        <div
                          key={option.label}
                          className={`option-card ${
                            answerFinal === option.label ? "selected" : ""
                          }`}
                        >
                          <div className="option-top">
                            <span className="option-label">{option.label}</span>
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

                          <textarea
                            value={option.text}
                            onChange={(e) =>
                              handleOptionChange(index, e.target.value)
                            }
                            className="input option-textarea"
                            placeholder={`Isi pilihan ${option.label}`}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <Field label="Panduan Pemarkahan">
                  <Suspense fallback={<div className="input">Memuat editor...</div>}>
                    <RichEditor
                      value={answerSchemeText}
                      onChange={setAnswerSchemeText}
                      placeholder="Masukkan panduan pemarkahan di sini..."
                    />
                  </Suspense>
                </Field>

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
              subtitle="Tagging akademik untuk carian dan pembinaan set."
            >
              <div className="form-grid form-grid-2">
                <Field label="Tema">
                  <select
                    value={selectedTema}
                    onChange={(e) => {
                      setSelectedTema(e.target.value)
                      setSelectedBidang("")
                      setStandardKandungan("")
                      setStandardPembelajaran("")
                    }}
                    className="input"
                  >
                    <option value="">Pilih tema</option>
                    {temaList.map((t) => (
                      <option key={t.tema} value={t.tema}>
                        {t.tema}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Bidang Pembelajaran">
                  <select
                    value={selectedBidang}
                    onChange={(e) => {
                      setSelectedBidang(e.target.value)
                      setStandardKandungan("")
                      setStandardPembelajaran("")
                    }}
                    className="input"
                    disabled={!selectedTema}
                  >
                    <option value="">Pilih bidang</option>
                    {bidangList.map((b) => {
                      const value = `${b.code} - ${b.name}`
                      return (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      )
                    })}
                  </select>
                </Field>

                <Field label="Standard Kandungan">
                  <select
                    value={standardKandungan}
                    onChange={(e) => {
                      setStandardKandungan(e.target.value)
                      setStandardPembelajaran("")
                    }}
                    className="input"
                    disabled={!selectedBidang}
                  >
                    <option value="">Pilih standard kandungan</option>
                    {standardKandunganList.map((s) => {
                      const value = `${s.code} - ${s.name}`
                      return (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      )
                    })}
                  </select>
                </Field>

                <Field label="Standard Pembelajaran">
                  <select
                    value={standardPembelajaran}
                    onChange={(e) => setStandardPembelajaran(e.target.value)}
                    className="input"
                    disabled={!standardKandungan}
                  >
                    <option value="">Pilih standard pembelajaran</option>
                    {standardPembelajaranList.map((sp) => (
                      <option key={sp.code} value={sp.code}>
                        {sp.code} - {sp.name}
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
                    {constructOptions.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
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
                    {constructCodeOptions.map((code) => (
                      <option key={code} value={code}>
                        {code}
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
                <PreviewRow label="Markah" value={String(marks)} />
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
                  value={selectedStandardKandunganObj?.code || "-"}
                />
                <PreviewRow
                  label="Std. Pembelajaran"
                  value={standardPembelajaran || "-"}
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
                  {hasRichTextContent(stemText) ? (
                    <div dangerouslySetInnerHTML={{ __html: stemText }} />
                  ) : (
                    "Stem soalan akan dipaparkan di sini."
                  )}
                </div>

                {isPaper1 && (
                  <div className="mini-options">
                    {options.map((opt) => (
                      <div key={opt.label} className="mini-option">
                        <strong>{opt.label}.</strong> {opt.text || "..."}
                        {answerFinal === opt.label && (
                          <span className="mini-correct">✓ Betul</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>

            <Card title="Panduan Cepat" subtitle="Rujukan ringkas semasa masukkan item.">
              <ul className="tips-list">
                <li>Panduan pemarkahan wajib diisi bagi semua item.</li>
                <li>Kertas 1 perlu 4 pilihan jawapan dan satu jawapan betul.</li>
                <li>Kertas 2 perlu pilih Bahagian A, B atau C.</li>
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
