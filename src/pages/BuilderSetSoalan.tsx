import { useEffect, useState } from "react"
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
  difficulty_level: "rendah" | "sederhana" | "tinggi" | null
  marks: number
  stem_text: string | null
  status: "draft" | "pending_review" | "approved" | "published" | "archived"
}

export default function BuilderSetSoalan() {
  const [items, setItems] = useState<Item[]>([])
  const [tingkatan, setTingkatan] = useState<4 | 5>(4)
  const [paper, setPaper] = useState<1 | 2>(1)
  const [generatedSet, setGeneratedSet] = useState<Item[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState("")

  useEffect(() => {
    void fetchItems()
  }, [])

  async function fetchItems() {
    setLoading(true)
    setMessage("")

    const { data, error } = await supabase.from("items").select("*")

    if (error) {
      setMessage("Gagal memuatkan bank item.")
      setItems([])
    } else {
      setItems((data || []) as Item[])
    }

    setLoading(false)
  }

  function shuffle<T>(arr: T[]) {
    return [...arr].sort(() => Math.random() - 0.5)
  }

  function buildPaper1() {
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
      setGeneratedSet([])
      setMessage("Item tidak mencukupi untuk Kertas 1.")
      return
    }

    setGeneratedSet(result.slice(0, 40))
  }

  function buildPaper2() {
    const pool = items.filter(
      (i) =>
        i.paper === 2 &&
        i.tingkatan === tingkatan &&
        i.status === "published",
    )

    const A = shuffle(pool.filter((i) => i.section === "A")).slice(0, 4)
    const B = shuffle(pool.filter((i) => i.section === "B")).slice(0, 6)

    const Q11 = pool.find((i) => i.section === "C" && i.question_no_reference === 11)
    const Q12 = pool.find((i) => i.section === "C" && i.question_no_reference === 12)
    const Q13 = pool.find((i) => i.section === "C" && i.question_no_reference === 13)

    if (A.length < 4 || B.length < 6 || !Q11 || (!Q12 && !Q13)) {
      setGeneratedSet([])
      setMessage("Item tidak mencukupi untuk format SPM Kertas 2 (A/B/C).")
      return
    }

    const selectedQ12OrQ13 = Q12 ?? Q13
    if (!selectedQ12OrQ13) {
      setGeneratedSet([])
      setMessage("Bahagian C tidak lengkap (Q11 dan Q12/Q13).")
      return
    }

    const C: Item[] = [Q11, selectedQ12OrQ13]
    setGeneratedSet([...A, ...B, ...C])
  }

  function handleBuild() {
    setMessage("")
    if (paper === 1) buildPaper1()
    else buildPaper2()
  }

  return (
    <div className="page-shell">
      <h1 className="page-title">Builder Set Soalan</h1>

      <div className="form-grid form-grid-3">
        <select
          className="input"
          value={tingkatan}
          onChange={(e) => setTingkatan(Number(e.target.value) as 4 | 5)}
        >
          <option value={4}>Tingkatan 4</option>
          <option value={5}>Tingkatan 5</option>
        </select>

        <select
          className="input"
          value={paper}
          onChange={(e) => setPaper(Number(e.target.value) as 1 | 2)}
        >
          <option value={1}>Kertas 1</option>
          <option value={2}>Kertas 2</option>
        </select>

        <button className="btn btn-primary" onClick={handleBuild} disabled={loading}>
          {loading ? "Memuatkan..." : "Jana Set"}
        </button>
      </div>

      {message && <div className="admin-alert">{message}</div>}

      <div className="card-block">
        <h2>Preview Set Soalan</h2>

        {generatedSet.length === 0 ? (
          <p>Tiada set dijana.</p>
        ) : (
          generatedSet.map((item, i) => (
            <div key={item.id} className="preview-item">
              <div className="preview-number">{i + 1}.</div>
              <div
                dangerouslySetInnerHTML={{
                  __html: item.stem_text || "<p>-</p>",
                }}
              />
            </div>
          ))
        )}
      </div>
    </div>
  )
}
