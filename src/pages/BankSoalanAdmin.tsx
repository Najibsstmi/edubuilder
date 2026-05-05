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
  item_options?: ItemOptionRow[]
  item_subquestions?: SubQuestionRow[]
}

type ItemStatus = ItemRow["status"]

type ItemOptionRow = {
  id: string
  option_label: string
  option_text: string | null
  is_correct: boolean
  display_order: number
}

type SubQuestionRow = {
  id: string
  item_id: string
  label: string
  sub_label: string | null
  question_text: string
  answer_scheme_text: string
  marks: number
  response_type: string
  main_construct: string | null
  construct_code: string | null
  difficulty_level: string | null
  display_order: number
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
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [previewItem, setPreviewItem] = useState<ItemRow | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null)
  const [message, setMessage] = useState("")

  const PAGE_SIZE = 10
  const [page, setPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)

  useEffect(() => {
    fetchItems()
  }, [page, filters])

  useEffect(() => {
    setPage(1)
  }, [filters])

  async function fetchItems() {
    setLoading(true)
    setMessage("")

    const from = (page - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    let query = supabase
      .from("items")
      .select(
        `
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
        created_at,
        item_options (
          id,
          option_label,
          option_text,
          is_correct,
          display_order
        )
      `,
        { count: "exact" }
      )
      .order("created_at", { ascending: false })
      .range(from, to)

    // Apply filters if any
    if (filters.tingkatan) {
      query = query.eq("tingkatan", filters.tingkatan)
    }
    if (filters.paper) {
      query = query.eq("paper", filters.paper)
    }
    if (filters.section) {
      query = query.eq("section", filters.section)
    }
    if (filters.construct) {
      query = query.ilike("main_construct", `%${filters.construct}%`)
    }
    if (filters.difficulty) {
      query = query.eq("difficulty_level", filters.difficulty)
    }
    if (filters.status) {
      query = query.eq("status", filters.status)
    }
    if (filters.search) {
      query = query.or(`item_code.ilike.%${filters.search}%,stem_text.ilike.%${filters.search}%`)
    }

    const { data, error, count } = await query

    if (error) {
      console.error(error)
      setMessage("Gagal memuatkan bank soalan.")
    } else {
      const rows = (data || []) as ItemRow[]
      const paper2Ids = rows.filter((item) => item.paper === "paper_2").map((item) => item.id)

      if (paper2Ids.length > 0) {
        const { data: subQuestionData, error: subQuestionError } = await supabase
          .from("item_subquestions")
          .select("*")
          .in("item_id", paper2Ids)
          .order("display_order", { ascending: true })

        if (subQuestionError) {
          console.warn("Subquestion bank fetch skipped", subQuestionError)
          setItems(rows)
        } else {
          const grouped = new Map<string, SubQuestionRow[]>()
          ;(subQuestionData || []).forEach((row: SubQuestionRow) => {
            grouped.set(row.item_id, [...(grouped.get(row.item_id) || []), row])
          })

          setItems(
            rows.map((item) => ({
              ...item,
              item_subquestions: grouped.get(item.id) || [],
            })),
          )
        }
      } else {
        setItems(rows)
      }
      setTotalCount(count || 0)
    }

    setLoading(false)
  }

  async function updateItemStatus(item: ItemRow, nextStatus: ItemStatus) {
    const confirmMessage = getStatusConfirmMessage(nextStatus)
    if (confirmMessage && !window.confirm(confirmMessage)) return

    setUpdatingStatusId(item.id)
    setMessage("")

    const now = new Date().toISOString()
    const payload: Record<string, string | null> = {
      status: nextStatus,
      updated_by: user?.id || null,
      updated_at: now,
    }

    if (nextStatus === "approved") {
      payload.approved_by = user?.id || null
      payload.approved_at = now
      payload.rejected_by = null
      payload.rejected_at = null
      payload.rejected_reason = null
    }

    if (nextStatus === "published") {
      payload.approved_by = user?.id || null
      payload.approved_at = now
      payload.published_by = user?.id || null
      payload.published_at = now
      payload.rejected_by = null
      payload.rejected_at = null
      payload.rejected_reason = null
    }

    if (nextStatus === "rejected") {
      const reason = window.prompt("Sebab reject item ini?")?.trim()
      if (!reason) {
        setUpdatingStatusId(null)
        return
      }
      payload.rejected_by = user?.id || null
      payload.rejected_at = now
      payload.rejected_reason = reason
      payload.published_by = null
      payload.published_at = null
    }

    if (nextStatus === "archived") {
      payload.published_by = null
      payload.published_at = null
    }

    const { error } = await supabase
      .from("items")
      .update(payload)
      .eq("id", item.id)

    if (error) {
      console.error(error)
      setMessage(`Gagal tukar status item kepada ${nextStatus}.`)
    } else {
      setItems((prev) =>
        prev.map((row) =>
          row.id === item.id ? { ...row, status: nextStatus } : row,
        ),
      )
      if (previewItem?.id === item.id) {
        setPreviewItem({ ...previewItem, status: nextStatus })
      }
      setMessage(getStatusSuccessMessage(nextStatus))
    }

    setUpdatingStatusId(null)
  }

  async function deleteItem(id: string) {
    const confirmed = window.confirm("Padam item ini? Tindakan ini tidak boleh dibatalkan.")
    if (!confirmed) return

    setDeletingId(id)
    setMessage("")

    try {
      const { error } = await supabase.rpc("delete_item_cascade", {
        target_item_id: id,
      })

      if (error) {
        throw new Error(error.message)
      }

      setItems((prev) => prev.filter((item) => item.id !== id))
      if (previewItem?.id === id) setPreviewItem(null)
      setMessage("Item berjaya dipadam.")
    } catch (error: any) {
      console.error(error)
      setMessage(error.message || "Gagal memadam item.")
    }

    setDeletingId(null)
  }

  const filteredItems = useMemo(() => {
    const filtered = items.filter((item) => {
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

    return filtered.sort((a, b) => {
      const priorityDiff = getStatusPriority(a.status) - getStatusPriority(b.status)
      if (priorityDiff !== 0) return priorityDiff

      const paperDiff = getPaperPriority(a.paper, a.section) - getPaperPriority(b.paper, b.section)
      if (paperDiff !== 0) return paperDiff

      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
  }, [items, filters])

  const stats = useMemo(() => {
    const total = items.length
    const paper1 = items.filter((i) => i.paper === "paper_1").length
    const paper2 = items.filter((i) => i.paper === "paper_2").length
    const draft = items.filter((i) => i.status === "draft").length
    const review = items.filter((i) => i.status === "pending_review").length
    const published = items.filter((i) => i.status === "published").length
    return { total, paper1, paper2, draft, review, published }
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

      <div className="stats-grid stats-grid-compact">
        <StatCard title="Jumlah Item" value={stats.total} />
        <StatCard title="Kertas 1" value={stats.paper1} />
        <StatCard title="Kertas 2" value={stats.paper2} />
        <StatCard title="Draft" value={stats.draft} />
        <StatCard title="Semakan" value={stats.review} />
        <StatCard title="Published" value={stats.published} />
      </div>

      <section className="card-block filter-card">
        <div className="filter-card-head">
          <div className="card-head">
            <h2>Penapis & Carian</h2>
            <p>{filtersOpen ? "Tapis item dengan lebih cepat mengikut struktur sebenar sistem." : getFilterSummary(filters)}</p>
          </div>
          <button
            type="button"
            className="btn btn-light filter-toggle-btn"
            onClick={() => setFiltersOpen((value) => !value)}
            aria-expanded={filtersOpen}
          >
            {filtersOpen ? "Tutup Penapis" : "Buka Penapis"}
          </button>
        </div>

        {filtersOpen && <div className="form-grid form-grid-4 filter-grid">
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
        </div>}
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
            <>
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

                    {item.status === "draft" && (
                      <button
                        type="button"
                        className="btn btn-light btn-sm"
                        onClick={() => updateItemStatus(item, "pending_review")}
                        disabled={updatingStatusId === item.id}
                      >
                        Hantar Semakan
                      </button>
                    )}

                    {item.status !== "approved" && item.status !== "published" && item.status !== "archived" && (
                      <button
                        type="button"
                        className="btn btn-light btn-sm"
                        onClick={() => updateItemStatus(item, "approved")}
                        disabled={updatingStatusId === item.id}
                      >
                        Approve
                      </button>
                    )}

                    {item.status !== "published" && item.status !== "archived" && (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => updateItemStatus(item, "published")}
                        disabled={updatingStatusId === item.id}
                      >
                        Publish
                      </button>
                    )}

                    {item.status !== "rejected" && item.status !== "published" && item.status !== "archived" && (
                      <button
                        type="button"
                        className="btn btn-light btn-sm"
                        onClick={() => updateItemStatus(item, "rejected")}
                        disabled={updatingStatusId === item.id}
                      >
                        Reject
                      </button>
                    )}

                    <button
                      type="button"
                      className="btn btn-light btn-sm"
                      onClick={() => updateItemStatus(item, "archived")}
                      disabled={updatingStatusId === item.id}
                    >
                      Arkib
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

            <div className="pagination-bar">
              <button
                className="btn btn-light"
                disabled={page === 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                ← Sebelumnya
              </button>

              <span>
                Page {page} / {Math.ceil(totalCount / PAGE_SIZE) || 1}
              </span>

              <button
                className="btn btn-light"
                disabled={page >= Math.ceil(totalCount / PAGE_SIZE)}
                onClick={() => setPage((p) => p + 1)}
              >
                Seterusnya →
              </button>
            </div>
          </>
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

                {previewItem.paper === "paper_1" && (
                  <div className="preview-section-block">
                    <h3>Pilihan Jawapan</h3>
                    <div className="preview-options">
                      {getSortedOptions(previewItem).length === 0 ? (
                        <div className="empty-state">Pilihan jawapan belum dijumpai.</div>
                      ) : hasOptionsInStem(previewItem) ? (
                        <div className="option-mode-note">
                          Pilihan A-D berada dalam stem soalan/jadual di atas.
                        </div>
                      ) : (
                        getSortedOptions(previewItem).map((option) => (
                          <div
                            key={option.id}
                            className={`preview-option ${
                              option.is_correct ? "preview-option-correct" : ""
                            }`}
                          >
                            <strong>{option.option_label}.</strong>
                            <div
                              dangerouslySetInnerHTML={{
                                __html: option.option_text || "<p>-</p>",
                              }}
                            />
                            {option.is_correct && <span>Betul</span>}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {previewItem.paper === "paper_2" && (
                  <div className="preview-section-block">
                    <h3>Sub-soalan</h3>
                    {getSortedSubQuestions(previewItem).length === 0 ? (
                      <div
                        className="preview-html"
                        dangerouslySetInnerHTML={{
                          __html: previewItem.answer_scheme_text || "<p>-</p>",
                        }}
                      />
                    ) : (
                      <div className="preview-subquestions">
                        {getSortedSubQuestions(previewItem).map((subQuestion) => (
                          <div key={subQuestion.id} className="preview-subquestion">
                            <div className="preview-subquestion-head">
                              <strong>{formatSubQuestionLabel(subQuestion)}</strong>
                              <span>
                                {subQuestion.response_type === "instruction"
                                  ? "Arahan"
                                  : `${subQuestion.marks} markah`}
                              </span>
                            </div>
                            {subQuestion.response_type !== "instruction" && (
                              <div className="bank-item-construct">
                                Konstruk: {subQuestion.main_construct || "-"}{" "}
                                {subQuestion.construct_code ? `(${subQuestion.construct_code})` : ""}
                                {" · "}
                                Aras: {subQuestion.difficulty_level || "-"}
                              </div>
                            )}
                            <div
                              className="preview-html"
                              dangerouslySetInnerHTML={{
                                __html: subQuestion.question_text || "<p>-</p>",
                              }}
                            />
                            <AnswerSpace
                              responseType={subQuestion.response_type}
                              marks={subQuestion.marks}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {previewItem.paper === "paper_2" && (
                  <div className="preview-section-block">
                    <h3>Panduan Pemarkahan / Skema Jawapan</h3>
                    <div
                      className="preview-html"
                      dangerouslySetInnerHTML={{
                        __html: previewItem.answer_scheme_text || "<p>-</p>",
                      }}
                    />
                  </div>
                )}

                {previewItem.paper === "paper_1" && previewItem.answer_final && (
                  <div className="preview-answer-box">
                    Jawapan betul: <strong>{previewItem.answer_final}</strong>
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

function getSortedOptions(item: ItemRow) {
  return [...(item.item_options || [])].sort(
    (a, b) => a.display_order - b.display_order || a.option_label.localeCompare(b.option_label),
  )
}

function getSortedSubQuestions(item: ItemRow) {
  return [...(item.item_subquestions || [])].sort(
    (a, b) => a.display_order - b.display_order || a.label.localeCompare(b.label),
  )
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

function getStatusPriority(status: ItemStatus) {
  const priority: Record<ItemStatus, number> = {
    pending_review: 1,
    draft: 2,
    rejected: 3,
    approved: 4,
    published: 5,
    archived: 6,
  }

  return priority[status] || 99
}

function getPaperPriority(paper: ItemRow["paper"], section: ItemRow["section"]) {
  if (paper === "paper_1") return 1
  if (section === "A") return 2
  if (section === "B") return 3
  if (section === "C") return 4
  return 5
}

function getFilterSummary(filters: FilterState) {
  const active = [
    filters.search ? "carian aktif" : "",
    filters.tingkatan ? `T${filters.tingkatan}` : "",
    filters.paper ? (filters.paper === "paper_1" ? "Kertas 1" : "Kertas 2") : "",
    filters.section ? `Bahagian ${filters.section}` : "",
    filters.construct || "",
    filters.difficulty || "",
    filters.status || "",
  ].filter(Boolean)

  return active.length > 0 ? `Penapis aktif: ${active.join(" · ")}` : "Penapis disembunyikan untuk paparan bank soalan yang lebih luas."
}

function formatSubQuestionLabel(item: Pick<SubQuestionRow, "label" | "sub_label">) {
  return `(${item.label})${item.sub_label ? `(${item.sub_label})` : ""}`
}

function hasOptionsInStem(item: ItemRow) {
  const options = getSortedOptions(item)
  if (options.length !== 4) return false

  return options.every((option) => {
    const plainText = stripHtml(option.option_text || "")
    return plainText === option.option_label
  })
}

function getStatusConfirmMessage(status: ItemStatus) {
  if (status === "published") {
    return "Publish item ini? Item published akan boleh digunakan dalam Bina Set Soalan."
  }
  if (status === "archived") {
    return "Arkibkan item ini? Item archived tidak akan digunakan dalam builder."
  }
  return ""
}

function getStatusSuccessMessage(status: ItemStatus) {
  if (status === "pending_review") return "Item dihantar untuk semakan."
  if (status === "approved") return "Item berjaya diapprove."
  if (status === "published") {
    return "Item berjaya dipublish. Item ini kini boleh digunakan dalam Bina Set Soalan."
  }
  if (status === "rejected") return "Item berjaya direject."
  if (status === "archived") return "Item berjaya diarkibkan."
  return "Status item berjaya dikemaskini."
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
