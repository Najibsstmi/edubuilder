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
  tingkatan: number
  marks: number
  item_options?: ItemOption[]
}

type ItemOption = {
  option_label: string
  option_text: string | null
  option_image_url: string | null
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
  const [message, setMessage] = useState("")

  useEffect(() => {
    void fetchSets()
  }, [profile?.id])

  const selectedSet = useMemo(
    () => sets.find((set) => set.id === selectedSetId) || sets[0] || null,
    [selectedSetId, sets],
  )

  const selectedItems = useMemo(() => normalizeItems(selectedSet), [selectedSet])

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
            item_options (
              option_label,
              option_text,
              option_image_url,
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
      setSelectedSetId((current) => current || nextSets[0]?.id || "")
    }

    setLoading(false)
  }

  function printPdf() {
    window.print()
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
            <p>{loading ? "Memuat set..." : `${sets.length} set disimpan`}</p>
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
                className="btn btn-light"
                onClick={printPdf}
                disabled={!selectedSet}
              >
                Cetak / Simpan PDF
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void downloadWord()}
                disabled={!selectedSet}
              >
                Muat Turun Word
              </button>
            </div>
          </section>

          {selectedSet ? (
            <SetPaperPreview set={selectedSet} items={selectedItems} />
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

function SetPaperPreview({ set, items }: { set: SavedSet; items: NormalizedSetItem[] }) {
  return (
    <section className="card-block set-print-area">
      <div className="question-paper-preview">
        <div className="question-paper-head">
          <strong>{set.title || "Latihan Sains"}</strong>
          <span>Sains KSSM</span>
          <span>{set.tingkatan ? `Tingkatan ${set.tingkatan}` : "Tingkatan 4 dan 5"}</span>
        </div>

        <ol className="question-paper-list">
          {items.map((row, index) => (
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
                <div className="question-paper-marks">[{row.marks} markah]</div>
              )}
            </li>
          ))}
        </ol>

        {items.length === 0 && <div className="empty-state">Set ini belum ada item.</div>}
      </div>
    </section>
  )
}

function normalizeItems(set: SavedSet | null): NormalizedSetItem[] {
  if (!set?.build_set_items) return []

  return [...set.build_set_items]
    .sort((a, b) => a.display_order - b.display_order)
    .map((row, index) => ({
      id: row.id,
      display_order: row.display_order,
      custom_question_no: row.custom_question_no || String(index + 1),
      marks: row.marks,
      item: Array.isArray(row.items) ? row.items[0] || null : row.items,
    }))
}

function sortOptions(options: ItemOption[] = []) {
  return [...options].sort((a, b) => {
    if (a.display_order !== b.display_order) return a.display_order - b.display_order
    return a.option_label.localeCompare(b.option_label)
  })
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
