import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { supabase } from "../lib/supabase"
import { useAuth } from "../contexts/AuthContext"

type ItemRow = {
  id: string
  item_code: string
  tingkatan: 4 | 5
  paper: "paper_1" | "paper_2"
  section: "A" | "B" | "C" | null
  question_no_reference: string | null
  item_type: "mcq" | "structured" | "limited_response" | "open_response"
  theme_name: string | null
  bidang_learning_code: string | null
  bidang_learning_name: string | null
  standard_kandungan: string | null
  standard_pembelajaran: string | null
  main_construct: string | null
  construct_code: string | null
  difficulty_level: "rendah" | "sederhana" | "tinggi" | null
  marks: number
  stimulus_type: string | null
  stem_text: string | null
  answer_scheme_text: string
  answer_final: string | null
  status: "draft" | "pending_review" | "approved" | "rejected" | "published" | "archived"
  created_at: string
}

type FilterState = {
  search: string
  tingkatan: string
  paper: string
  section: string
  construct: string
  difficulty: string
  status: string
}

const defaultFilters: FilterState = {
  search: "",
  tingkatan: "",
  paper: "",
  section: "",
  construct: "",
  difficulty: "",
  status: "",
}

export default function BankSoalanAdmin() {
  const { user } = useAuth()
  const [items, setItems] = useState<ItemRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<FilterState>(defaultFilters)
  const [previewItem, setPreviewItem] = useState<ItemRow | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [archivingId, setArchivingId] = useState<string | null>(null)
  const [publishingId, setPublishingId] = useState<string | null>(null)
  const [message, setMessage] = useState("")

  useEffect(() => {
    fetchItems()
  }, [])

  async function fetchItems() {
    setLoading(true)
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
        theme_name,
        bidang_learning_code,
        bidang_learning_name,
        standard_kandungan,
        standard_pembelajaran,
        main_construct,
        construct_code,
        difficulty_level,
        marks,
        stimulus_type,
        stem_text,
        answer_scheme_text,
        answer_final,
        status,
        created_at
      `)
      .order("created_at", { ascending: false })

    if (error) {
      console.error(error)
      setMessage("Gagal memuatkan bank soalan.")
    } else {
      setItems((data || []) as ItemRow[])
    }

    setLoading(false)
  }

  async function archiveItem(id: string) {
    setArchivingId(id)
    setMessage("")

    const { error } = await supabase
      .from("items")
      .update({ status: "archived" })
      .eq("id", id)

    if (error) {
      console.error(error)
      setMessage("Gagal mengarkibkan item.")
    } else {
      setItems((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, status: "archived" } : item,
        ),
      )
      if (previewItem?.id === id) {
        setPreviewItem({ ...previewItem, status: "archived" })
      }
      setMessage("Item berjaya diarkibkan.")
    }

    setArchivingId(null)
  }

  async function publishItem(id: string) {
    setPublishingId(id)
    setMessage("")

    const now = new Date().toISOString()
    const { error } = await supabase
      .from("items")
      .update({
        status: "published",
        approved_by: user?.id || null,
        approved_at: now,
        published_by: user?.id || null,
        published_at: now,
        updated_by: user?.id || null,
        updated_at: now,
      })
      .eq("id", id)

    if (error) {
      console.error(error)
      setMessage("Gagal publish item.")
    } else {
      setItems((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, status: "published" } : item,
        ),
      )
      if (previewItem?.id === id) {
        setPreviewItem({ ...previewItem, status: "published" })
      }
      setMessage("Item berjaya dipublish. Item ini kini boleh digunakan dalam Bina Set Soalan.")
    }

    setPublishingId(null)
  }

  async function deleteItem(id: string) {
    const confirmed = window.confirm("Padam item ini? Tindakan ini tidak boleh dibatalkan.")
    if (!confirmed) return

    setDeletingId(id)
    setMessage("")

    const { error } = await supabase
      .from("items")
      .delete()
      .eq("id", id)

    if (error) {
      console.error(error)
      setMessage("Gagal memadam item.")
    } else {
      setItems((prev) => prev.filter((item) => item.id !== id))
      if (previewItem?.id === id) setPreviewItem(null)
      setMessage("Item berjaya dipadam.")
    }

    setDeletingId(null)
  }

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const haystack = [
        item.item_code,
        item.theme_name || "",
        item.bidang_learning_name || "",
        item.bidang_learning_code || "",
        item.standard_kandungan || "",
        item.standard_pembelajaran || "",
        item.main_construct || "",
        item.construct_code || "",
        stripHtml(item.stem_text || ""),
      ]
        .join(" ")
        .toLowerCase()

      const q = filters.search.trim().toLowerCase()
      if (q && !haystack.includes(q)) return false

      if (filters.tingkatan && String(item.tingkatan) !== filters.tingkatan) return false
      if (filters.paper && String(item.paper) !== filters.paper) return false
      if (filters.section && (item.section || "") !== filters.section) return false
      if (filters.construct && (item.main_construct || "") !== filters.construct) return false
      if (filters.difficulty && (item.difficulty_level || "") !== filters.difficulty) return false
      if (filters.status && item.status !== filters.status) return false

      return true
    })
  }, [items, filters])

  const stats = useMemo(() => {
    const total = items.length
    const paper1 = items.filter((i) => i.paper === "paper_1").length
    const paper2 = items.filter((i) => i.paper === "paper_2").length
    const published = items.filter((i) => i.status === "published").length
    return { total, paper1, paper2, published }
  }, [items])

  const constructOptions = useMemo(() => {
    return Array.from(
      new Set(items.map((i) => i.main_construct).filter(Boolean) as string[]),
    ).sort((a, b) => a.localeCompare(b))
  }, [items])

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <h1 className="page-title">Bank Soalan Admin</h1>
          <p className="page-subtitle">
            Urus item Sains KSSM Tingkatan 4 dan 5 untuk Kertas 1 dan Kertas 2.
          </p>
        </div>

        <div className="header-actions">
          <Link to="/masukkan-soalan" className="btn btn-primary">
            + Tambah Soalan
          </Link>
        </div>
      </div>

      <div className="stats-grid">
        <StatCard title="Jumlah Item" value={stats.total} />
        <StatCard title="Kertas 1" value={stats.paper1} />
        <StatCard title="Kertas 2" value={stats.paper2} />
        <StatCard title="Published" value={stats.published} />
      </div>

      <section className="card-block">
        <div className="card-head">
          <h2>Penapis & Carian</h2>
          <p>Tapis item dengan lebih cepat mengikut struktur sebenar sistem.</p>
        </div>

        <div className="form-grid form-grid-4">
          <Field label="Carian">
            <input
              className="input"
              placeholder="Kod item / stem / bidang / konstruk"
              value={filters.search}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, search: e.target.value }))
              }
            />
          </Field>

          <Field label="Tingkatan">
            <select
              className="input"
              value={filters.tingkatan}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, tingkatan: e.target.value }))
              }
            >
              <option value="">Semua</option>
              <option value="4">Tingkatan 4</option>
              <option value="5">Tingkatan 5</option>
            </select>
          </Field>

          <Field label="Kertas">
            <select
              className="input"
              value={filters.paper}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, paper: e.target.value }))
              }
            >
              <option value="">Semua</option>
              <option value="paper_1">Kertas 1</option>
              <option value="paper_2">Kertas 2</option>
            </select>
          </Field>

          <Field label="Bahagian">
            <select
              className="input"
              value={filters.section}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, section: e.target.value }))
              }
            >
              <option value="">Semua</option>
              <option value="A">Bahagian A</option>
              <option value="B">Bahagian B</option>
              <option value="C">Bahagian C</option>
            </select>
          </Field>

          <Field label="Konstruk">
            <select
              className="input"
              value={filters.construct}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, construct: e.target.value }))
              }
            >
              <option value="">Semua</option>
              {constructOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Aras Kesukaran">
            <select
              className="input"
              value={filters.difficulty}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, difficulty: e.target.value }))
              }
            >
              <option value="">Semua</option>
              <option value="rendah">rendah</option>
              <option value="sederhana">sederhana</option>
              <option value="tinggi">tinggi</option>
            </select>
          </Field>

          <Field label="Status">
            <select
              className="input"
              value={filters.status}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, status: e.target.value }))
              }
            >
              <option value="">Semua</option>
              <option value="draft">draft</option>
              <option value="pending_review">pending_review</option>
              <option value="approved">approved</option>
              <option value="rejected">rejected</option>
              <option value="published">published</option>
              <option value="archived">archived</option>
            </select>
          </Field>

          <div className="field-wrap">
            <label className="field-label">&nbsp;</label>
            <button
              type="button"
              className="btn btn-light"
              onClick={() => setFilters(defaultFilters)}
            >
              Reset Penapis
            </button>
          </div>
        </div>
      </section>

      {message && <div className="admin-alert">{message}</div>}

      <div className="bank-layout">
        <section className="bank-list-panel">
          {loading ? (
            <section className="card-block">
              <div className="empty-state">Memuatkan bank soalan...</div>
            </section>
          ) : filteredItems.length === 0 ? (
            <section className="card-block">
              <div className="empty-state">
                Tiada item dijumpai. Cuba ubah penapis atau tambah item baharu.
              </div>
            </section>
          ) : (
            <div className="bank-card-list">
              {filteredItems.map((item) => (
                <article
                  key={item.id}
                  className={`bank-item-card ${
                    previewItem?.id === item.id ? "active" : ""
                  }`}
                >
                  <div className="bank-item-top">
                    <div>
                      <div className="bank-item-code">{item.item_code}</div>
                      <div className="bank-item-meta">
                        <Badge tone="blue">
                          {item.paper === "paper_1" ? "Kertas 1" : "Kertas 2"}
                        </Badge>

                        <Badge tone="purple">Tingkatan {item.tingkatan}</Badge>

                        {item.section && (
                          <Badge tone="orange">Bahagian {item.section}</Badge>
                        )}

                        {item.question_no_reference && (
                          <Badge tone="gray">No. {item.question_no_reference}</Badge>
                        )}

                        <Badge tone={difficultyTone(item.difficulty_level)}>
                          {item.difficulty_level || "-"}
                        </Badge>

                        <Badge tone={statusTone(item.status)}>{item.status}</Badge>
                      </div>
                    </div>

                    <div className="bank-item-mark">{item.marks} markah</div>
                  </div>

                  <div className="bank-item-body">
                    <div className="bank-item-topic">
                      {item.bidang_learning_code || "-"}{" "}
                      {item.bidang_learning_name || ""}
                    </div>

                    <div className="bank-item-construct">
                      Konstruk: {item.main_construct || "-"}{" "}
                      {item.construct_code ? `(${item.construct_code})` : ""}
                    </div>

                    <div className="bank-item-snippet">
                      {truncate(stripHtml(item.stem_text || ""), 180)}
                    </div>
                  </div>

                  <div className="bank-item-actions">
                    <button
                      type="button"
                      className="btn btn-light btn-sm"
                      onClick={() => setPreviewItem(item)}
                    >
                      Preview
                    </button>

                    <Link
                      to={`/masukkan-soalan?id=${item.id}`}
                      className="btn btn-light btn-sm"
                    >
                      Edit
                    </Link>

                    {item.status !== "published" && item.status !== "archived" && (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => publishItem(item.id)}
                        disabled={publishingId === item.id}
                      >
                        {publishingId === item.id ? "Publishing..." : "Publish"}
                      </button>
                    )}

                    <button
                      type="button"
                      className="btn btn-light btn-sm"
                      onClick={() => archiveItem(item.id)}
                      disabled={archivingId === item.id}
                    >
                      {archivingId === item.id ? "Processing..." : "Arkib"}
                    </button>

                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => deleteItem(item.id)}
                      disabled={deletingId === item.id}
                    >
                      {deletingId === item.id ? "Deleting..." : "Padam"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <aside className="bank-preview-panel">
          <section className="card-block sticky-preview">
            <div className="card-head">
              <h2>Preview Item</h2>
              <p>Semak ringkasan item sebelum edit atau jana set.</p>
            </div>

            {!previewItem ? (
              <div className="empty-state">
                Pilih mana-mana item di sebelah kiri untuk lihat preview.
              </div>
            ) : (
              <div className="preview-detail">
                <div className="preview-detail-head">
                  <div className="bank-item-code">{previewItem.item_code}</div>
                  <div className="bank-item-meta">
                    <Badge tone="blue">
                      {previewItem.paper === "paper_1" ? "Kertas 1" : "Kertas 2"}
                    </Badge>
                    <Badge tone="purple">Tingkatan {previewItem.tingkatan}</Badge>
                    {previewItem.section && (
                      <Badge tone="orange">Bahagian {previewItem.section}</Badge>
                    )}
                    {previewItem.question_no_reference && (
                      <Badge tone="gray">No. {previewItem.question_no_reference}</Badge>
                    )}
                  </div>
                </div>

                <div className="preview-stack">
                  <PreviewRow
                    label="Tema"
                    value={previewItem.theme_name || "-"}
                  />
                  <PreviewRow
                    label="Bidang"
                    value={
                      previewItem.bidang_learning_code || previewItem.bidang_learning_name
                        ? `${previewItem.bidang_learning_code || ""} ${previewItem.bidang_learning_name || ""}`.trim()
                        : "-"
                    }
                  />
                  <PreviewRow
                    label="Standard Kandungan"
                    value={previewItem.standard_kandungan || "-"}
                  />
                  <PreviewRow
                    label="Standard Pembelajaran"
                    value={previewItem.standard_pembelajaran || "-"}
                  />
                  <PreviewRow
                    label="Konstruk"
                    value={
                      previewItem.main_construct
                        ? `${previewItem.main_construct}${previewItem.construct_code ? ` (${previewItem.construct_code})` : ""}`
                        : "-"
                    }
                  />
                  <PreviewRow
                    label="Aras"
                    value={previewItem.difficulty_level || "-"}
                  />
                  <PreviewRow
                    label="Markah"
                    value={String(previewItem.marks)}
                  />
                  <PreviewRow
                    label="Jenis Item"
                    value={previewItem.item_type}
                  />
                  <PreviewRow
                    label="Stimulus"
                    value={previewItem.stimulus_type || "-"}
                  />
                  <PreviewRow
                    label="Status"
                    value={previewItem.status}
                  />
                </div>

                <div className="preview-section-block">
                  <h3>Stem Soalan</h3>
                  <div
                    className="preview-html"
                    dangerouslySetInnerHTML={{
                      __html: previewItem.stem_text || "<p>-</p>",
                    }}
                  />
                </div>

                <div className="preview-section-block">
                  <h3>Panduan Pemarkahan</h3>
                  <div
                    className="preview-html"
                    dangerouslySetInnerHTML={{
                      __html: previewItem.answer_scheme_text || "<p>-</p>",
                    }}
                  />
                </div>

                {previewItem.paper === "paper_1" && previewItem.answer_final && (
                  <div className="preview-answer-box">
                    Jawapan akhir: <strong>{previewItem.answer_final}</strong>
                  </div>
                )}
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  )
}

function StatCard({ title, value }: { title: string; value: number }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{title}</div>
      <div className="stat-value">{value}</div>
    </div>
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
  tone: "blue" | "purple" | "orange" | "gray" | "green" | "red" | "yellow"
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}

function truncate(text: string, max = 180) {
  if (!text) return ""
  if (text.length <= max) return text
  return `${text.slice(0, max).trim()}...`
}

function stripHtml(html: string) {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function difficultyTone(value: ItemRow["difficulty_level"]): "green" | "yellow" | "red" | "gray" {
  if (value === "rendah") return "green"
  if (value === "sederhana") return "yellow"
  if (value === "tinggi") return "red"
  return "gray"
}

function statusTone(value: ItemRow["status"]): "green" | "yellow" | "purple" | "gray" | "red" {
  if (value === "published") return "green"
  if (value === "approved") return "purple"
  if (value === "pending_review") return "yellow"
  if (value === "archived" || value === "rejected") return "red"
  return "gray"
}
