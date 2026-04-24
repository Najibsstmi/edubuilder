import { useEffect, useState } from "react"
import { useUser } from "../context/UserContext"
import { supabase } from "../lib/supabase"

type Item = {
  id: string
  item_code: string
  tingkatan: 4 | 5
  paper: 1 | 2
  section: "A" | "B" | "C" | null
  question_no_reference: number | null
  item_type: string
  main_construct: string | null
  difficulty_level: string | null
  marks: number
  stem_text: string | null
  status: string
}

export default function BuilderSetSoalan() {
  const { profile } = useUser()
  const [items, setItems] = useState<Item[]>([])
  const [mode, setMode] = useState<"custom" | "spm">("custom")
  const [tingkatan, setTingkatan] = useState<4 | 5>(4)
  const [paper, setPaper] = useState<1 | 2>(1)
  const [setTitle, setSetTitle] = useState("")
  const [savingSet, setSavingSet] = useState(false)

  // Custom settings
  const [totalSoalan, setTotalSoalan] = useState(10)
  const [difficulty, setDifficulty] = useState("")
  const [section, setSection] = useState("")

  const [generatedSet, setGeneratedSet] = useState<Item[]>([])
  const [message, setMessage] = useState("")

  useEffect(() => {
    fetchItems()
  }, [])

  async function fetchItems() {
    const { data } = await supabase.from("items").select("*")
    setItems(data || [])
  }

  function shuffle<T>(arr: T[]) {
    return [...arr].sort(() => Math.random() - 0.5)
  }

  // 🔥 CUSTOM MODE
  function buildCustom() {
    let pool = items.filter(
      (i) =>
        i.tingkatan === tingkatan &&
        i.paper === paper &&
        i.status === "published",
    )

    if (section) {
      pool = pool.filter((i) => i.section === section)
    }

    if (difficulty) {
      pool = pool.filter((i) => i.difficulty_level === difficulty)
    }

    if (pool.length < totalSoalan) {
      setMessage("Item tidak mencukupi.")
      return
    }

    const result = shuffle(pool).slice(0, totalSoalan)
    setGeneratedSet(result)
  }

  // 🔥 SPM MODE
  function buildSPM() {
    if (paper === 1) {
      const pool = items.filter(
        (i) =>
          i.paper === 1 &&
          i.tingkatan === tingkatan &&
          i.item_type === "mcq" &&
          i.status === "published",
      )

      const rendah = shuffle(pool.filter((i) => i.difficulty_level === "rendah")).slice(0, 20)
      const sederhana = shuffle(pool.filter((i) => i.difficulty_level === "sederhana")).slice(0, 12)
      const tinggi = shuffle(pool.filter((i) => i.difficulty_level === "tinggi")).slice(0, 8)

      const result = [...rendah, ...sederhana, ...tinggi]

      if (result.length < 40) {
        setMessage("Item tidak cukup untuk format SPM.")
        return
      }

      setGeneratedSet(result.slice(0, 40))
    }

    if (paper === 2) {
      const pool = items.filter(
        (i) =>
          i.paper === 2 &&
          i.tingkatan === tingkatan &&
          i.status === "published",
      )

      const A = shuffle(pool.filter((i) => i.section === "A")).slice(0, 4)
      const B = shuffle(pool.filter((i) => i.section === "B")).slice(0, 6)

      const Q11 = pool.find((i) => i.question_no_reference === 11)
      const Q12 = pool.find((i) => i.question_no_reference === 12)
      const Q13 = pool.find((i) => i.question_no_reference === 13)

      if (!Q11 || (!Q12 && !Q13)) {
        setMessage("Bahagian C tidak lengkap.")
        return
      }

      const selectedQ12OrQ13 = Q12 ?? Q13
      if (!selectedQ12OrQ13) {
        setMessage("Bahagian C tidak lengkap.")
        return
      }

      const C: Item[] = [Q11, selectedQ12OrQ13]

      setGeneratedSet([...A, ...B, ...C])
    }
  }

  function handleBuild() {
    setMessage("")
    if (mode === "custom") buildCustom()
    else buildSPM()
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
        .from("question_sets")
        .insert({
          title: setTitle.trim(),
          mode,
          tingkatan,
          paper,
          created_by: profile.id,
        })
        .select("id")
        .single()

      if (setError) throw setError

      const rows = generatedSet.map((item, index) => ({
        question_set_id: savedSet.id,
        item_id: item.id,
        item_order: index + 1,
      }))

      const { error: itemError } = await supabase
        .from("question_set_items")
        .insert(rows)

      if (itemError) throw itemError

      setMessage("Set soalan berjaya disimpan.")
    } catch (error: any) {
      console.error(error)
      setMessage(error.message || "Gagal simpan set.")
    } finally {
      setSavingSet(false)
    }
  }

  return (
    <div className="page-shell">
      <h1 className="page-title">Builder Set Soalan</h1>

      {/* MODE SWITCH */}
      <div className="mode-switch">
        <button onClick={() => setMode("custom")} className={mode === "custom" ? "active" : ""}>
          Latihan / Custom
        </button>
        <button onClick={() => setMode("spm")} className={mode === "spm" ? "active" : ""}>
          Format SPM
        </button>
      </div>

      {/* SETTINGS */}
      <div className="form-grid form-grid-4">
        <select value={tingkatan} onChange={(e) => setTingkatan(Number(e.target.value) as 4 | 5)}>
          <option value={4}>T4</option>
          <option value={5}>T5</option>
        </select>

        <select value={paper} onChange={(e) => setPaper(Number(e.target.value) as 1 | 2)}>
          <option value={1}>Kertas 1</option>
          <option value={2}>Kertas 2</option>
        </select>

        {mode === "custom" && (
          <>
            <input
              type="number"
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

            <select value={section} onChange={(e) => setSection(e.target.value)}>
              <option value="">Semua bahagian</option>
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="C">C</option>
            </select>
          </>
        )}

        <input
          className="input"
          value={setTitle}
          onChange={(e) => setSetTitle(e.target.value)}
          placeholder="Tajuk set, contoh: Latihan Bab 2"
        />

        <button className="btn btn-primary" onClick={handleBuild}>
          Jana Set
        </button>

        <button
          className="btn btn-light"
          onClick={saveSet}
          disabled={savingSet || generatedSet.length === 0}
        >
          {savingSet ? "Menyimpan..." : "Simpan Set"}
        </button>
      </div>

      {message && <div className="admin-alert">{message}</div>}

      {/* PREVIEW */}
      <div className="card-block">
        <h2>Preview</h2>

        {generatedSet.length === 0 ? (
          <p>Tiada set dijana</p>
        ) : (
          generatedSet.map((item, i) => (
            <div key={item.id} className="preview-item">
              <b>{i + 1}.</b>
              <div dangerouslySetInnerHTML={{ __html: item.stem_text || "" }} />
            </div>
          ))
        )}
      </div>
    </div>
  )
}
