import { FormEvent, Suspense, lazy, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
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

  const isPaper1 = paper === "paper_1"

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
  )

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
      const loadedPaper: PaperType =
        item.paper === 2 || item.paper === "paper_2" ? "paper_2" : "paper_1"

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
        } else {
          setOptions(initialOptions)
        }
      } else {
        setOptions(initialOptions)
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
      const hasEmptyOption = options.some((opt) => isRichContentEmpty(opt.text))

      if (hasEmptyOption) {
        setMessage("Semua pilihan jawapan A, B, C dan D wajib diisi.")
        return
      }

      if (!answerFinal) {
        setMessage("Sila pilih jawapan betul untuk Kertas 1.")
        return
      }
    }

    if (!isPaper1) {
      if (!section) {
        setMessage("Bahagian wajib dipilih untuk Kertas 2.")
        return
      }

      if (isRichContentEmpty(answerSchemeText)) {
        setMessage("Panduan pemarkahan wajib diisi untuk Kertas 2.")
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
        paper: isPaper1 ? 1 : 2,
        section: isPaper1 ? null : section || null,
        question_no_reference:
          !isPaper1 && questionNoReference ? Number(questionNoReference) : null,

        item_type: isPaper1 ? "mcq" : itemType,
        marks: isPaper1 ? 1 : marks,

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

        if (updateError) throw updateError
      } else {
        const { data: insertedItem, error: itemError } = await supabase
          .from("items")
          .insert({
            ...payload,
            created_by: profile.id,
          })
          .select("id")
          .single()

        if (itemError) throw itemError
        savedItemId = insertedItem.id
      }

      if (isPaper1 && savedItemId) {
        if (editId) {
          const { error: deleteOldOptionsError } = await supabase
            .from("item_options")
            .delete()
            .eq("item_id", savedItemId)

          if (deleteOldOptionsError) throw deleteOldOptionsError
        }

        const optionRows = options.map((opt, index) => ({
          item_id: savedItemId,
          option_label: opt.label,
          option_text: opt.text,
          is_correct: opt.label === answerFinal,
          display_order: index + 1,
        }))

        const { error: optionError } = await supabase
          .from("item_options")
          .insert(optionRows)

        if (optionError) throw optionError
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

                    {profile?.role === "master_admin" && (
                      <>
                        <option value="approved">approved</option>
                        <option value="published">published</option>
                        <option value="archived">archived</option>
                      </>
                    )}
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
                      <p>Pilih satu jawapan betul bagi item objektif. Setiap pilihan boleh mengandungi teks, gambar atau jadual.</p>
                    </div>

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
              subtitle="Pilih standard DSKP. Maklumat kod akan diisi secara automatik."
            >
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

                {isPaper1 && (
                  <div className="mini-options">
                    {options.map((opt) => (
                      <div key={opt.label} className="mini-option rich-preview-option">
                        <div className="mini-option-head">
                          <strong>{opt.label}.</strong>
                          {answerFinal === opt.label && (
                            <span className="mini-correct">✓ Betul</span>
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

