import { useEffect, useMemo, useState } from "react"
import { useUser } from "../context/UserContext"
import { supabase } from "../lib/supabase"

type PaperType = "paper_1" | "paper_2"
type SectionType = "A" | "B" | "C" | ""
type BuilderMode = "custom" | "spm"
type BuildMode =
  | "full_exam"
  | "topical_practice"
  | "section_practice"
  | "difficulty_practice"

type Item = {
  id: string
  item_code: string
  tingkatan: 4 | 5
  paper: PaperType
  section: "A" | "B" | "C" | null
  question_no_reference: string | null
  item_type: "mcq" | "structured" | "limited_response" | "open_response"
  main_construct: string | null
  difficulty_level: "rendah" | "sederhana" | "tinggi" | null
  marks: number
  stem_text: string | null
  status: string
  created_at: string
}

export default function BuilderSetSoalan() {
  const { profile } = useUser()
  const [items, setItems] = useState<Item[]>([])
  const [mode, setMode] = useState<BuilderMode>("custom")
  const [tingkatan, setTingkatan] = useState<4 | 5>(4)
  const [paper, setPaper] = useState<PaperType>("paper_1")
  const [section, setSection] = useState<SectionType>("")
  const [setTitle, setSetTitle] = useState("")
  const [savingSet, setSavingSet] = useState(false)
  const [loadingItems, setLoadingItems] = useState(true)

  const [totalSoalan, setTotalSoalan] = useState(10)
  const [difficulty, setDifficulty] = useState("")
  const [generatedSet, setGeneratedSet] = useState<Item[]>([])
  const [message, setMessage] = useState("")

  useEffect(() => {
    void fetchItems()
  }, [])

  const availableItems = useMemo(() => {
    return items.filter((item) => item.tingkatan === tingkatan && item.paper === paper)
  }, [items, paper, tingkatan])

  async function fetchItems() {
    setLoadingItems(true)
    setMessage("")

    const { data, error } = await supabase
      .from("items")
      .select(`
        id,
        item_code,
        tingkatan,
        paper,
        section,
        question_no_reference,
        item_type,
        main_construct,
        difficulty_level,
        marks,
        stem_text,
        status,
        created_at
      `)
      .eq("status", "published")
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Builder items fetch error", error)
      setMessage(error.message)
    } else {
      setItems((data || []) as Item[])
    }

    setLoadingItems(false)
  }

  function shuffle<T>(arr: T[]) {
    return [...arr].sort(() => Math.random() - 0.5)
  }

  function buildCustom() {
    if (totalSoalan < 1) {
      setMessage("Bilangan soalan mesti sekurang-kurangnya 1.")
      return
    }

    let pool = availableItems

    if (paper === "paper_2" && section) {
      pool = pool.filter((item) => item.section === section)
    }

    if (difficulty) {
      pool = pool.filter((item) => item.difficulty_level === difficulty)
    }

    if (pool.length < totalSoalan) {
      setMessage("Item published tidak mencukupi untuk tetapan ini.")
      return
    }

    setGeneratedSet(shuffle(pool).slice(0, totalSoalan))
  }

  function buildSPM() {
    if (paper === "paper_1") {
      const pool = availableItems.filter((item) => item.item_type === "mcq")
      const rendah = shuffle(pool.filter((item) => item.difficulty_level === "rendah")).slice(0, 20)
      const sederhana = shuffle(pool.filter((item) => item.difficulty_level === "sederhana")).slice(0, 12)
      const tinggi = shuffle(pool.filter((item) => item.difficulty_level === "tinggi")).slice(0, 8)
      const result = [...rendah, ...sederhana, ...tinggi]

      if (result.length < 40) {
        setMessage("Item published tidak cukup untuk format SPM Kertas 1.")
        return
      }

      setGeneratedSet(result.slice(0, 40))
      return
    }

    const pool = availableItems
    const partA = shuffle(pool.filter((item) => item.section === "A")).slice(0, 4)
    const partB = shuffle(pool.filter((item) => item.section === "B")).slice(0, 6)
    const question11 = pool.find((item) => item.question_no_reference === "11")
    const question12 = pool.find((item) => item.question_no_reference === "12")
    const question13 = pool.find((item) => item.question_no_reference === "13")
    const selectedChoice = question12 ?? question13

    if (partA.length < 4 || partB.length < 6 || !question11 || !selectedChoice) {
      setMessage("Item published tidak cukup untuk format SPM Kertas 2.")
      return
    }

    setGeneratedSet([...partA, ...partB, question11, selectedChoice])
  }

  function handleBuild() {
    setMessage("")
    setGeneratedSet([])

    if (mode === "custom") {
      buildCustom()
      return
    }

    buildSPM()
  }

  function resolveBuildMode(): BuildMode {
    if (mode === "spm") return "full_exam"
    if (paper === "paper_2" && section) return "section_practice"
    if (difficulty) return "difficulty_practice"
    return "topical_practice"
  }

  async function saveSet() {
    setMessage("")

    if (!profile?.id) {
      setMessage("Sila login dahulu.")
      return
    }

    if (!setTitle.trim()) {
      setMessage("Sila isi tajuk set.")
      return
    }

    if (generatedSet.length === 0) {
      setMessage("Jana set dahulu sebelum simpan.")
      return
    }

    setSavingSet(true)

    try {
      const { data: savedSet, error: setError } = await supabase
        .from("build_sets")
        .insert({
          owner_profile_id: profile.id,
          title: setTitle.trim(),
          build_mode: resolveBuildMode(),
          tingkatan,
          paper,
          section: paper === "paper_2" && section ? section : null,
          status: "draft",
          instructions_text:
            mode === "spm"
              ? "Set dijana menggunakan format SPM."
              : `Set latihan custom (${generatedSet.length} item).`,
        })
        .select("id")
        .single()

      if (setError) throw setError

      const rows = generatedSet.map((item, index) => ({
        build_set_id: savedSet.id,
        item_id: item.id,
        section: item.section,
        custom_question_no: item.question_no_reference || String(index + 1),
        marks: item.marks || 1,
        display_order: index + 1,
      }))

      const { error: itemError } = await supabase
        .from("build_set_items")
        .insert(rows)

      if (itemError) throw itemError

      setMessage("Set soalan berjaya disimpan.")
      setGeneratedSet([])
      setSetTitle("")
    } catch (error: any) {
      console.error("Builder set save error", error)
      setMessage(error.message || "Gagal simpan set.")
    } finally {
      setSavingSet(false)
    }
  }

  return (
    <div className="page-shell">
      <h1 className="page-title">Bina Set Soalan</h1>

      <div className="mode-switch">
        <button
          type="button"
          onClick={() => {
            setMode("custom")
            setGeneratedSet([])
          }}
          className={mode === "custom" ? "active" : ""}
        >
          Latihan / Custom
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("spm")
            setGeneratedSet([])
          }}
          className={mode === "spm" ? "active" : ""}
        >
          Format SPM
        </button>
      </div>

      <div className="form-grid form-grid-4">
        <select
          value={tingkatan}
          onChange={(e) => {
            setTingkatan(Number(e.target.value) as 4 | 5)
            setGeneratedSet([])
          }}
        >
          <option value={4}>T4</option>
          <option value={5}>T5</option>
        </select>

        <select
          value={paper}
          onChange={(e) => {
            setPaper(e.target.value as PaperType)
            setSection("")
            setGeneratedSet([])
          }}
        >
          <option value="paper_1">Kertas 1</option>
          <option value="paper_2">Kertas 2</option>
        </select>

        {mode === "custom" && (
          <>
            <input
              type="number"
              min={1}
              value={totalSoalan}
              onChange={(e) => setTotalSoalan(Number(e.target.value))}
              placeholder="Bilangan soalan"
            />

            <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
              <option value="">Semua aras</option>
              <option value="rendah">rendah</option>
              <option value="sederhana">sederhana</option>
              <option value="tinggi">tinggi</option>
            </select>

            {paper === "paper_2" && (
              <select value={section} onChange={(e) => setSection(e.target.value as SectionType)}>
                <option value="">Semua bahagian</option>
                <option value="A">A</option>
                <option value="B">B</option>
                <option value="C">C</option>
              </select>
            )}
          </>
        )}

        <input
          className="input"
          value={setTitle}
          onChange={(e) => setSetTitle(e.target.value)}
          placeholder="Tajuk set, contoh: Latihan Bab 2"
        />

        <button type="button" className="btn btn-primary" onClick={handleBuild}>
          Jana Set
        </button>

        <button
          type="button"
          className="btn btn-light"
          onClick={saveSet}
          disabled={savingSet || generatedSet.length === 0}
        >
          {savingSet ? "Menyimpan..." : "Simpan Set"}
        </button>
      </div>

      <div className="card-block">
        <strong>Item published tersedia:</strong> {loadingItems ? "Memuatkan..." : availableItems.length}
      </div>

      {message && <div className="admin-alert">{message}</div>}

      <div className="card-block">
        <h2>Preview</h2>

        {generatedSet.length === 0 ? (
          <p>Tiada set dijana</p>
        ) : (
          generatedSet.map((item, index) => (
            <div key={item.id} className="preview-item">
              <b>{index + 1}.</b>
              <div>
                <strong>{item.item_code}</strong>
                <div dangerouslySetInnerHTML={{ __html: item.stem_text || "" }} />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
