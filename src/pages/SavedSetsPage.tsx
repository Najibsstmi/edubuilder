import { useEffect, useMemo, useState } from "react"
import { useAuth } from "../contexts/AuthContext"
import { auditLanguageText } from "../lib/languageAudit"
import { supabase } from "../lib/supabase"
import {
  AlignmentType,
  BorderStyle,
  Document,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx"
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
  explanation_text?: string | null
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
  const [translatingSet, setTranslatingSet] = useState(false)
  const [savingSetTranslation, setSavingSetTranslation] = useState(false)
  const [translatedSetItemIds, setTranslatedSetItemIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    void fetchSets()
  }, [profile?.id])

  useEffect(() => {
    setTranslatedSetItemIds(new Set())
  }, [selectedSetId])

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
            explanation_text,
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

  async function translateSetForExport() {
    if (!selectedSet) return
    if (!canUseSetTranslation(profile)) {
      setMessage("Fungsi terjemah BI hanya untuk admin dan pengguna premium.")
      return
    }

    const rowsToTranslate = selectedItems.filter((row) => {
      if (!row.item) return false
      return itemNeedsSetTranslation(row.item)
    })

    if (rowsToTranslate.length === 0) {
      setMessage("Semua item dalam set ini sudah dikesan mempunyai Bahasa Inggeris.")
      return
    }

    setTranslatingSet(true)
    setMessage(`Menterjemah ${rowsToTranslate.length} item untuk export...`)

    try {
      const translatedByItemId = new Map<string, Partial<SavedItem>>()
      let quotaText = ""

      for (const [index, row] of rowsToTranslate.entries()) {
        const item = row.item
        if (!item) continue

        setMessage(`Menterjemah item ${index + 1}/${rowsToTranslate.length} untuk export...`)

        const { data, error } = await supabase.functions.invoke("translate-item-bilingual", {
          body: {
            subject: "Sains KSSM SPM 1511",
            paper: item.paper,
            section: item.section,
            tingkatan: item.tingkatan,
            item: {
              stemText: item.stem_text || "",
              answerSchemeText: item.answer_scheme_text || "",
              explanationText: item.explanation_text || "",
              options: sortOptions(item.item_options || []).map((option) => ({
                label: option.option_label,
                text: option.option_text || "",
              })),
              subQuestions: sortSubQuestions(item.item_subquestions || []).map((sub) => ({
                id: sub.id,
                label: sub.label,
                subLabel: sub.sub_label,
                questionText: sub.question_text || "",
                answerSchemeText: sub.answer_scheme_text || "",
              })),
            },
          },
        })

        if (error) throw error
        if (data?.error) throw new Error(data.error)

        const translated = data?.item
        if (!translated) continue

        translatedByItemId.set(item.id, applyTranslatedFields(item, translated))
        quotaText = data?.quota?.remainingText || quotaText
      }

      if (translatedByItemId.size > 0) {
        setSets((prev) =>
          prev.map((set) => {
            if (set.id !== selectedSet.id) return set

            return {
              ...set,
              build_set_items: set.build_set_items.map((row) => {
                const rowItems = Array.isArray(row.items) ? row.items : row.items ? [row.items] : []
                const nextItems = rowItems.map((item) => {
                  const translated = translatedByItemId.get(item.id)
                  return translated ? { ...item, ...translated } : item
                })

                return {
                  ...row,
                  items: Array.isArray(row.items) ? nextItems : nextItems[0] || row.items,
                }
              }),
            }
          }),
        )
        setTranslatedSetItemIds(new Set(translatedByItemId.keys()))
      }

      setMessage(quotaText || "Terjemahan BI untuk set/export telah diisi. Sila semak sebelum muat turun.")
    } catch (error: any) {
      console.error("Set translation error", error)
      setMessage(error.message || "Gagal terjemah BI untuk set.")
    } finally {
      setTranslatingSet(false)
    }
  }

  async function saveSetTranslationToBank() {
    if (!selectedSet) return
    if (!canPersistSetTranslation(profile)) {
      setMessage("Simpan terjemahan ke bank hanya untuk admin dan master admin.")
      return
    }

    const translatedItems = selectedItems
      .map((row) => row.item)
      .filter((item): item is SavedItem => Boolean(item && translatedSetItemIds.has(item.id)))

    if (translatedItems.length === 0) {
      setMessage("Tiada terjemahan baharu untuk disimpan.")
      return
    }

    const confirmed = window.confirm(
      `Simpan terjemahan BI untuk ${translatedItems.length} item ke Bank Soalan? Ini akan kekal pada item asal.`,
    )
    if (!confirmed) return

    setSavingSetTranslation(true)
    setMessage("Menyimpan terjemahan BI ke Bank Soalan...")

    try {
      for (const item of translatedItems) {
        const { error: itemError } = await supabase
          .from("items")
          .update({
            stem_text: item.stem_text,
            answer_scheme_text: item.answer_scheme_text,
            explanation_text: item.explanation_text || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", item.id)

        if (itemError) throw itemError

        for (const option of item.item_options || []) {
          const { error: optionError } = await supabase
            .from("item_options")
            .update({ option_text: option.option_text })
            .eq("item_id", item.id)
            .eq("option_label", option.option_label)

          if (optionError) throw optionError
        }

        for (const sub of item.item_subquestions || []) {
          const { error: subError } = await supabase
            .from("item_subquestions")
            .update({
              question_text: sub.question_text,
              answer_scheme_text: sub.answer_scheme_text,
            })
            .eq("id", sub.id)

          if (subError) throw subError
        }
      }

      setTranslatedSetItemIds(new Set())
      setMessage("Terjemahan BI berjaya disimpan ke Bank Soalan.")
    } catch (error: any) {
      console.error("Save set translation error", error)
      setMessage(error.message || "Gagal simpan terjemahan BI.")
    } finally {
      setSavingSetTranslation(false)
    }
  }

  async function downloadWord() {
    if (!selectedSet) return

    try {
      setMessage("Menjana fail Word...")

      const doc = await buildQuestionDocx(selectedSet, selectedItems)
      const blob = await Packer.toBlob(doc)

      saveAs(blob, `${slugify(selectedSet.title)}.docx`)

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

  async function buildQuestionDocx(set: SavedSet, items: NormalizedSetItem[]) {
    const children: any[] = [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 80, line: 276 },
        children: [
          new TextRun({
            text: (set.title || "Latihan Sains").toUpperCase(),
            bold: true,
            font: "Times New Roman",
            size: 24,
          }),
        ],
      }),
      wordParagraph("Sains KSSM", { alignment: AlignmentType.CENTER, after: 40 }),
      wordParagraph(set.tingkatan ? `Tingkatan ${set.tingkatan}` : "Tingkatan 4 dan 5", {
        alignment: AlignmentType.CENTER,
        after: 220,
      }),
      wordParagraph(generatePaperInstruction(set, items), { after: 220 }),
    ]

    for (const [index, row] of items.entries()) {
      if (!row.item) continue

      const contentChildren: any[] = [
        ...(await htmlToWordBlocks(row.item.stem_text || "")),
      ]

      if (set.paper === "paper_1" && row.item.item_options?.length) {
        contentChildren.push(...(await buildOptionBlocks(row.item.item_options)))
      }

      if (set.paper === "paper_2" && row.item.item_subquestions?.length) {
        contentChildren.push(...(await buildSubQuestionBlocks(row.item, row.item.item_subquestions)))
      }

      if (contentChildren.length === 0) contentChildren.push(wordParagraph(""))

      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: tableNoBorders(),
          rows: [
            new TableRow({
              cantSplit: true,
              children: [
                new TableCell({
                  width: { size: 520, type: WidthType.DXA },
                  borders: tableNoBorders(),
                  children: [wordParagraph(`${index + 1}.`, { after: 0 })],
                }),
                new TableCell({
                  borders: tableNoBorders(),
                  children: contentChildren,
                }),
              ],
            }),
          ],
        }),
        wordParagraph("", { after: 260 }),
      )
    }

    return new Document({
      styles: {
        default: {
          document: {
            run: {
              font: "Times New Roman",
              size: 24,
            },
            paragraph: {
              spacing: { line: 276 },
            },
          },
        },
      },
      sections: [
        {
          properties: {
            page: {
              margin: {
                top: 1134,
                right: 1134,
                bottom: 1134,
                left: 1134,
              },
            },
          },
          children,
        },
      ],
    })
  }

  async function buildOptionBlocks(options: ItemOption[]) {
    const rows: TableRow[] = []

    for (const option of sortOptions(options)) {
      const contentChildren = await htmlToWordBlocks(option.option_text || "")
      if (option.option_image_url) {
        const image = await createWordImage(option.option_image_url)
        if (image) {
          contentChildren.push(
            new Paragraph({
              spacing: { before: 40, after: 40, line: 276 },
              children: [image],
            }),
          )
        }
      }

      rows.push(
        new TableRow({
          cantSplit: true,
          children: [
            new TableCell({
              width: { size: 420, type: WidthType.DXA },
              borders: tableNoBorders(),
              children: [wordParagraph(`${option.option_label}.`, { bold: true, after: 0 })],
            }),
            new TableCell({
              borders: tableNoBorders(),
              children: contentChildren.length ? contentChildren : [wordParagraph("")],
            }),
          ],
        }),
      )
    }

    return [
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: tableNoBorders(),
        rows,
      }),
    ]
  }

  async function buildSubQuestionBlocks(item: SavedItem, subquestions: ItemSubQuestion[]) {
    const blocks: any[] = []
    let previousLabel = ""

    for (const sub of sortSubQuestions(subquestions)) {
      const mainLabel = sub.label === previousLabel ? "" : `(${sub.label})`
      const subLabel = sub.sub_label ? `(${sub.sub_label})` : ""
      previousLabel = sub.label
      const contentChildren = await htmlToWordBlocks(sub.question_text || "")

      if (shouldShowAnswerSpace(item, sub)) {
        contentChildren.push(...wordAnswerLines(sub.response_type, sub.marks))
      }

      if (!isInstructionSubQuestionPreview(sub)) {
        contentChildren.push(
          wordParagraph(`[${sub.marks} markah]`, {
            alignment: AlignmentType.RIGHT,
            bold: true,
            after: 180,
          }),
        )
      }

      blocks.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: tableNoBorders(),
          rows: [
            new TableRow({
              cantSplit: true,
              children: [
                new TableCell({
                  width: { size: 460, type: WidthType.DXA },
                  borders: tableNoBorders(),
                  children: [wordParagraph(mainLabel, { bold: true, after: 0 })],
                }),
                new TableCell({
                  width: { size: 440, type: WidthType.DXA },
                  borders: tableNoBorders(),
                  children: [wordParagraph(subLabel, { bold: true, after: 0 })],
                }),
                new TableCell({
                  borders: tableNoBorders(),
                  children: contentChildren.length ? contentChildren : [wordParagraph("")],
                }),
              ],
            }),
          ],
        }),
      )
    }

    return blocks
  }

  async function htmlToWordBlocks(html: string): Promise<any[]> {
    if (!html.trim()) return []

    const doc = new DOMParser().parseFromString(html, "text/html")
    const blocks: any[] = []

    for (const node of Array.from(doc.body.childNodes)) {
      blocks.push(...(await nodeToWordBlocks(node)))
    }

    return blocks.length ? blocks : [wordParagraph(htmlToPlainText(html))]
  }

  async function nodeToWordBlocks(node: ChildNode): Promise<any[]> {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.replace(/\s+/g, " ").trim() || ""
      return text ? [wordParagraph(text)] : []
    }

    if (!(node instanceof HTMLElement)) return []

    const tag = node.tagName.toLowerCase()

    if (!["img", "table"].includes(tag) && node.querySelector("img, table")) {
      const blocks: any[] = []
      const paragraphChildren: any[] = []

      for (const child of Array.from(node.childNodes)) {
        if (child instanceof HTMLElement && (child.matches("img, table") || child.querySelector("img, table"))) {
          if (paragraphChildren.length) {
            blocks.push(wordParagraphRuns(paragraphChildren, { alignment: getWordAlignment(node) }))
            paragraphChildren.length = 0
          }
          blocks.push(...(await nodeToWordBlocks(child)))
        } else {
          paragraphChildren.push(...(await inlineNodeToRuns(child)))
        }
      }

      if (paragraphChildren.length) {
        blocks.push(wordParagraphRuns(paragraphChildren, { alignment: getWordAlignment(node) }))
      }

      return blocks
    }

    if (tag === "br") return [wordParagraph("")]

    if (tag === "img") {
      const image = await createWordImage(node.getAttribute("src") || "")
      return image
        ? [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { before: 80, after: 80, line: 276 },
              children: [image],
            }),
          ]
        : []
    }

    if (tag === "table") {
      const table = await htmlTableToWordTable(node as HTMLTableElement)
      return table ? [table] : []
    }

    if (["p", "div", "li", "h1", "h2", "h3"].includes(tag)) {
      const blocks: any[] = []
      const paragraphChildren: any[] = []

      for (const child of Array.from(node.childNodes)) {
        if (child instanceof HTMLElement && ["img", "table", "div", "p"].includes(child.tagName.toLowerCase())) {
          if (paragraphChildren.length) {
            blocks.push(wordParagraphRuns(paragraphChildren, { alignment: getWordAlignment(node) }))
            paragraphChildren.length = 0
          }
          blocks.push(...(await nodeToWordBlocks(child)))
        } else {
          paragraphChildren.push(...(await inlineNodeToRuns(child)))
        }
      }

      if (paragraphChildren.length) {
        blocks.push(wordParagraphRuns(paragraphChildren, { alignment: getWordAlignment(node) }))
      }

      return blocks
    }

    const runs = await inlineNodeToRuns(node)
    return runs.length ? [wordParagraphRuns(runs, { alignment: getWordAlignment(node) })] : []
  }

  async function inlineNodeToRuns(node: ChildNode, inherited: Record<string, any> = {}): Promise<TextRun[]> {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.replace(/\s+/g, " ") || ""
      return text ? [new TextRun({ text, font: "Times New Roman", size: 24, ...inherited })] : []
    }

    if (!(node instanceof HTMLElement)) return []

    const tag = node.tagName.toLowerCase()
    if (tag === "img" || node.querySelector("img, table")) return []

    const next: Record<string, any> = { ...inherited }
    if (["strong", "b"].includes(tag)) next.bold = true
    if (["em", "i"].includes(tag)) next.italics = true
    if (tag === "u") next.underline = {}

    if (tag === "br") return [new TextRun({ text: "", break: 1, font: "Times New Roman", size: 24 })]

    const runs: TextRun[] = []
    for (const child of Array.from(node.childNodes)) {
      runs.push(...(await inlineNodeToRuns(child, next)))
    }
    return runs
  }

  async function htmlTableToWordTable(tableEl: HTMLTableElement) {
    const rows: TableRow[] = []

    for (const tr of Array.from(tableEl.querySelectorAll("tr"))) {
      const cells: TableCell[] = []
      for (const cell of Array.from(tr.children)) {
        const children = await htmlToWordBlocks(cell.innerHTML)
        cells.push(
          new TableCell({
            children: children.length ? children : [wordParagraph("")],
            margins: { top: 80, right: 80, bottom: 80, left: 80 },
          }),
        )
      }
      if (cells.length) rows.push(new TableRow({ cantSplit: true, children: cells }))
    }

    if (!rows.length) return null

    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
        bottom: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
        left: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
        right: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
        insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
        insideVertical: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
      },
      rows,
    })
  }

  async function createWordImage(src: string) {
    if (!src) return null

    try {
      const response = await fetch(src)
      if (!response.ok) return null

      const blob = await response.blob()
      let imageBlob = blob
      let type = getDocxImageType(blob.type, src)

      if (!type) {
        imageBlob = await convertImageBlobToPng(blob)
        type = "png"
      }

      const data = await imageBlob.arrayBuffer()
      const { width, height } = await getImageSize(blob)
      const maxWidth = 360
      const ratio = width > maxWidth ? maxWidth / width : 1

      return new ImageRun({
        type,
        data,
        transformation: {
          width: Math.round(width * ratio),
          height: Math.round(height * ratio),
        },
      })
    } catch (error) {
      console.warn("Word image skipped", error)
      return null
    }
  }

  function convertImageBlobToPng(blob: Blob): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob)
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement("canvas")
        canvas.width = img.naturalWidth || 360
        canvas.height = img.naturalHeight || 240
        const context = canvas.getContext("2d")
        if (!context) {
          URL.revokeObjectURL(url)
          reject(new Error("Canvas tidak tersedia untuk tukar imej."))
          return
        }

        context.drawImage(img, 0, 0)
        canvas.toBlob((pngBlob) => {
          URL.revokeObjectURL(url)
          if (pngBlob) resolve(pngBlob)
          else reject(new Error("Gagal tukar imej kepada PNG."))
        }, "image/png")
      }
      img.onerror = () => {
        URL.revokeObjectURL(url)
        reject(new Error("Format imej tidak boleh dibaca."))
      }
      img.src = url
    })
  }

  function getDocxImageType(mimeType: string, src: string) {
    const lower = `${mimeType} ${src}`.toLowerCase()
    if (lower.includes("png") || lower.endsWith(".png")) return "png" as const
    if (lower.includes("jpg") || lower.includes("jpeg") || lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "jpg" as const
    if (lower.includes("gif") || lower.endsWith(".gif")) return "gif" as const
    if (lower.includes("bmp") || lower.endsWith(".bmp")) return "bmp" as const
    return null
  }

  function getImageSize(blob: Blob): Promise<{ width: number; height: number }> {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(blob)
      const img = new Image()
      img.onload = () => {
        URL.revokeObjectURL(url)
        resolve({ width: img.naturalWidth || 360, height: img.naturalHeight || 240 })
      }
      img.onerror = () => {
        URL.revokeObjectURL(url)
        resolve({ width: 360, height: 240 })
      }
      img.src = url
    })
  }

  function wordAnswerLines(responseType: string, marks = 1) {
    if (responseType === "instruction" || responseType === "provided_space") return []

    const count =
      responseType === "calculation"
        ? Math.max(5, marks)
        : responseType === "structured_text"
          ? Math.max(2, marks)
          : Math.max(1, Math.min(marks, 4))

    return Array.from({ length: count }).map(
      () =>
        new Paragraph({
          border: {
            bottom: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
          },
          spacing: { before: 100, after: 80, line: 276 },
          children: [new TextRun({ text: "", font: "Times New Roman", size: 24 })],
        }),
    )
  }

  function wordParagraph(
    text: string,
    options: {
      alignment?: (typeof AlignmentType)[keyof typeof AlignmentType]
      bold?: boolean
      after?: number
    } = {},
  ) {
    return new Paragraph({
      alignment: options.alignment,
      spacing: { after: options.after ?? 80, line: 276 },
      children: [
        new TextRun({
          text,
          bold: options.bold,
          font: "Times New Roman",
          size: 24,
        }),
      ],
    })
  }

  function wordParagraphRuns(
    children: TextRun[],
    options: { alignment?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {},
  ) {
    return new Paragraph({
      alignment: options.alignment,
      spacing: { after: 80, line: 276 },
      children: children.length ? children : [new TextRun({ text: "", font: "Times New Roman", size: 24 })],
    })
  }

  function getWordAlignment(element: HTMLElement) {
    const align = element.style.textAlign || element.getAttribute("align") || ""
    if (align === "center") return AlignmentType.CENTER
    if (align === "right") return AlignmentType.RIGHT
    if (align === "justify") return AlignmentType.JUSTIFIED
    return AlignmentType.JUSTIFIED
  }

  function tableNoBorders() {
    return {
      top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    }
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
              {canUseSetTranslation(profile) && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => void translateSetForExport()}
                  disabled={!selectedSet || translatingSet}
                  title="Tambah terjemahan Bahasa Inggeris untuk set ini sahaja sebelum cetak atau muat turun."
                >
                  {translatingSet ? "Menterjemah..." : "Terjemah BI"}
                </button>
              )}
              {canPersistSetTranslation(profile) && translatedSetItemIds.size > 0 && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void saveSetTranslationToBank()}
                  disabled={!selectedSet || savingSetTranslation}
                  title="Simpan terjemahan Bahasa Inggeris ke item asal dalam Bank Soalan."
                >
                  {savingSetTranslation ? "Menyimpan..." : "Simpan BI"}
                </button>
              )}
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

function canUseSetTranslation(profile: { role?: string; account_type?: string } | null) {
  if (!profile) return false
  return profile.role === "master_admin" || profile.role === "admin" || profile.account_type === "full"
}

function canPersistSetTranslation(profile: { role?: string } | null) {
  return profile?.role === "master_admin" || profile?.role === "admin"
}

function itemNeedsSetTranslation(item: SavedItem) {
  const textParts = [
    item.stem_text || "",
    item.answer_scheme_text || "",
    item.explanation_text || "",
    ...(item.item_options || []).map((option) => option.option_text || ""),
    ...(item.item_subquestions || []).flatMap((sub) => [
      sub.question_text || "",
      sub.answer_scheme_text || "",
    ]),
  ]

  return textParts.some((text) => text.trim() && auditLanguageText(text) !== "bilingual")
}

function applyTranslatedFields(item: SavedItem, translated: any): Partial<SavedItem> {
  const optionTextByLabel = new Map<string, string>()
  for (const option of translated.options || []) {
    const label = normalizeQuestionPart(option?.label || option?.option_label || "")
    if (label) optionTextByLabel.set(label, option.text || option.option_text || "")
  }

  const translatedSubs = Array.isArray(translated.subQuestions)
    ? translated.subQuestions
    : Array.isArray(translated.sub_questions)
      ? translated.sub_questions
      : []
  const subById = new Map<string, any>()
  const subByLabel = new Map<string, any>()
  for (const sub of translatedSubs) {
    if (sub?.id) subById.set(String(sub.id), sub)
    const key = `${normalizeQuestionPart(sub?.label || "")}::${normalizeQuestionPart(sub?.subLabel || sub?.sub_label || "")}`
    if (sub?.label) subByLabel.set(key, sub)
  }

  return {
    stem_text: translated.stemText ?? item.stem_text,
    answer_scheme_text:
      typeof translated.answerSchemeText === "string"
        ? htmlToPlainText(translated.answerSchemeText)
        : item.answer_scheme_text,
    explanation_text: translated.explanationText ?? item.explanation_text,
    item_options: (item.item_options || []).map((option) => ({
      ...option,
      option_text: optionTextByLabel.get(normalizeQuestionPart(option.option_label)) ?? option.option_text,
    })),
    item_subquestions: (item.item_subquestions || []).map((sub, index) => {
      const translatedSub =
        subById.get(sub.id) ||
        subByLabel.get(`${normalizeQuestionPart(sub.label)}::${normalizeQuestionPart(sub.sub_label || "")}`) ||
        translatedSubs[index]
      if (!translatedSub) return sub

      return {
        ...sub,
        question_text:
          translatedSub.questionText ??
          translatedSub.question_text ??
          translatedSub.text ??
          sub.question_text,
        answer_scheme_text:
          (typeof translatedSub.answerSchemeText === "string"
            ? htmlToPlainText(translatedSub.answerSchemeText)
            : undefined) ??
          (typeof translatedSub.answer_scheme_text === "string"
            ? htmlToPlainText(translatedSub.answer_scheme_text)
            : undefined) ??
          (typeof translatedSub.scheme === "string" ? htmlToPlainText(translatedSub.scheme) : undefined) ??
          sub.answer_scheme_text,
      }
    }),
  }
}

function normalizeQuestionPart(value: string) {
  return String(value || "")
    .trim()
    .replace(/[()]/g, "")
    .toLowerCase()
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
