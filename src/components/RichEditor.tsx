import { useEffect, useMemo, useRef, useState } from "react"
import { Mark, mergeAttributes } from "@tiptap/core"
import { EditorContent, useEditor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Underline from "@tiptap/extension-underline"
import Placeholder from "@tiptap/extension-placeholder"
import TextAlign from "@tiptap/extension-text-align"
import Image from "@tiptap/extension-image"
import { Table } from "@tiptap/extension-table"
import TableRow from "@tiptap/extension-table-row"
import TableCell from "@tiptap/extension-table-cell"
import TableHeader from "@tiptap/extension-table-header"
import { supabase } from "../lib/supabase"

const TextStyle = Mark.create({
  name: "textStyle",

  addAttributes() {
    return {
      fontSize: {
        default: null,
        parseHTML: (element) => element.style.fontSize || null,
        renderHTML: (attributes) =>
          attributes.fontSize ? { style: `font-size: ${attributes.fontSize}` } : {},
      },
      color: {
        default: null,
        parseHTML: (element) => element.style.color || null,
        renderHTML: (attributes) =>
          attributes.color ? { style: `color: ${attributes.color}` } : {},
      },
    }
  },

  parseHTML() {
    return [{ tag: "span[style]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes), 0]
  },
})

const AlignedImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      alignment: {
        default: "left",
        parseHTML: (element) => element.getAttribute("data-align") || "left",
        renderHTML: (attributes) => ({
          "data-align": attributes.alignment || "left",
        }),
      },
      width: {
        default: "auto",
        parseHTML: (element) => element.getAttribute("width") || element.style.width || "auto",
        renderHTML: (attributes) =>
          attributes.width && attributes.width !== "auto"
            ? { width: attributes.width, style: `width: ${attributes.width};` }
            : {},
      },
    }
  },
})

type Props = {
  value: string
  onChange: (val: string) => void
  placeholder?: string
  label?: string
  showAnswerTemplate?: boolean
}

export default function RichEditor({
  value,
  onChange,
  placeholder = "Tulis kandungan di sini...",
  label,
  showAnswerTemplate = false,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [uploading, setUploading] = useState(false)
  const [showTablePrompt, setShowTablePrompt] = useState(false)
  const [rowCount, setRowCount] = useState(3)
  const [colCount, setColCount] = useState(3)

  const editor = useEditor({
    extensions: [
      StarterKit,
      TextStyle,
      Underline,
      Placeholder.configure({
        placeholder,
      }),
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      AlignedImage.configure({
        inline: false,
        allowBase64: false,
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: value || "",
    onUpdate({ editor }) {
      onChange(editor.getHTML())
    },
    editorProps: {
      attributes: {
        class: "rich-editor-content prose prose-slate max-w-none focus:outline-none",
      },
      handlePaste(_view, event) {
        const clipboardItems = Array.from(event.clipboardData?.items || [])
        const imageFiles = clipboardItems
          .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
          .map((item) => item.getAsFile())
          .filter((file): file is File => Boolean(file))

        if (imageFiles.length === 0) return false

        event.preventDefault()
        void insertImagesFromClipboard(imageFiles)
        return true
      },
    },
    immediatelyRender: false,
  })

  useEffect(() => {
    if (!editor) return
    const current = editor.getHTML()
    if (value !== current) {
      editor.commands.setContent(value || "", { emitUpdate: false })
    }
  }, [value, editor])

  const isInTable = useMemo(() => {
    if (!editor) return false
    return editor.isActive("table")
  }, [editor?.state])

  function getImageExtension(file: File) {
    if (file.name.includes(".")) return file.name.split(".").pop() || "png"
    if (file.type === "image/jpeg") return "jpg"
    if (file.type === "image/webp") return "webp"
    if (file.type === "image/gif") return "gif"
    return "png"
  }

  async function handleImageUpload(file: File, altText = file.name || "pasted-image") {
    if (!editor) return
    setUploading(true)

    try {
      const ext = getImageExtension(file)
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const filePath = `editor-images/${fileName}`

      const { error: uploadError } = await supabase.storage
        .from("item-media")
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: false,
        })

      if (uploadError) throw uploadError

      const { data: publicUrlData } = supabase.storage
        .from("item-media")
        .getPublicUrl(filePath)

      const imageUrl = publicUrlData.publicUrl

      editor.chain().focus().setImage({ src: imageUrl, alt: altText }).run()
    } catch (error) {
      console.error(error)
      window.alert("Gagal upload gambar.")
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  async function insertImagesFromClipboard(files: File[]) {
    for (const file of files) {
      await handleImageUpload(file, file.name || "pasted-image")
    }
  }

  function openImagePicker() {
    fileInputRef.current?.click()
  }

  function insertCustomTable() {
    if (!editor) return
    editor
      .chain()
      .focus()
      .insertTable({
        rows: rowCount,
        cols: colCount,
        withHeaderRow: false,
      })
      .run()

    setShowTablePrompt(false)
  }

  function insertAnswerTableTemplate() {
    if (!editor) return

    const makeCell = (text: string, type = "tableCell") => ({
      type,
      content: [
        {
          type: "paragraph",
          content: text ? [{ type: "text", text }] : undefined,
        },
      ],
    })

    editor
      .chain()
      .focus()
      .insertContent({
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              makeCell("", "tableHeader"),
              makeCell("", "tableHeader"),
              makeCell("", "tableHeader"),
            ],
          },
          {
            type: "tableRow",
            content: [
              makeCell("A"),
              makeCell(""),
              makeCell(""),
            ],
          },
          {
            type: "tableRow",
            content: [
              makeCell("B"),
              makeCell(""),
              makeCell(""),
            ],
          },
          {
            type: "tableRow",
            content: [
              makeCell("C"),
              makeCell(""),
              makeCell(""),
            ],
          },
          {
            type: "tableRow",
            content: [
              makeCell("D"),
              makeCell(""),
              makeCell(""),
            ],
          },
        ],
      })
      .run()
  }

  function applyTextStyle(attrs: { fontSize?: string | null; color?: string | null }) {
    if (!editor) return

    const { state, view } = editor
    const markType = state.schema.marks.textStyle
    if (!markType) return

    const { from, to, empty } = state.selection
    const mark = markType.create(attrs)
    const tr = state.tr

    if (empty) {
      tr.setStoredMarks([mark])
    } else {
      tr.addMark(from, to, mark)
    }

    view.dispatch(tr)
    view.focus()
  }

  if (!editor) return null

  return (
    <div className="re2-wrap">
      {label && <div className="re2-label">{label}</div>}

      <div className="re2-toolbar">
        <select
          className="re2-select"
          defaultValue=""
          onChange={(e) => {
            const value = e.target.value
            if (value === "p") editor.chain().focus().setParagraph().run()
            if (value === "h2") editor.chain().focus().toggleHeading({ level: 2 }).run()
            if (value === "h3") editor.chain().focus().toggleHeading({ level: 3 }).run()
            e.target.value = ""
          }}
        >
          <option value="">Style</option>
          <option value="p">Normal</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
        </select>

        <select
          className="re2-select"
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) applyTextStyle({ fontSize: e.target.value })
            e.target.value = ""
          }}
        >
          <option value="">Size</option>
          <option value="12px">12</option>
          <option value="14px">14</option>
          <option value="16px">16</option>
          <option value="18px">18</option>
          <option value="20px">20</option>
          <option value="24px">24</option>
        </select>

        <select
          className="re2-select"
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) applyTextStyle({ color: e.target.value })
            e.target.value = ""
          }}
        >
          <option value="">Color</option>
          <option value="#0f172a">Hitam</option>
          <option value="#dc2626">Merah</option>
          <option value="#2563eb">Biru</option>
          <option value="#15803d">Hijau</option>
        </select>

        <ToolbarDivider />

        <ToolbarButton
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          B
        </ToolbarButton>

        <ToolbarButton
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          I
        </ToolbarButton>

        <ToolbarButton
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          U
        </ToolbarButton>

        <ToolbarButton
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          Bullet List
        </ToolbarButton>

        <ToolbarButton
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          1. List
        </ToolbarButton>

        <ToolbarButton
          active={editor.isActive({ textAlign: "left" })}
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
        >
          Left
        </ToolbarButton>

        <ToolbarButton
          active={editor.isActive({ textAlign: "center" })}
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
        >
          Center
        </ToolbarButton>

        <ToolbarButton
          active={editor.isActive({ textAlign: "right" })}
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
        >
          Right
        </ToolbarButton>

        <ToolbarButton
          active={editor.isActive({ textAlign: "justify" })}
          onClick={() => editor.chain().focus().setTextAlign("justify").run()}
        >
          Justify
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton onClick={openImagePicker} disabled={uploading}>
          {uploading ? "Uploading..." : "Image"}
        </ToolbarButton>

        <ToolbarButton onClick={() => setShowTablePrompt((v) => !v)}>
          Table
        </ToolbarButton>

        {showAnswerTemplate && (
          <ToolbarButton onClick={insertAnswerTableTemplate}>
            Template A-D
          </ToolbarButton>
        )}

        {isInTable && (
          <>
            <ToolbarButton onClick={() => editor.chain().focus().addRowAfter().run()}>
              + Row
            </ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().deleteRow().run()}>
              - Row
            </ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().addColumnAfter().run()}>
              + Col
            </ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().deleteColumn().run()}>
              - Col
            </ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().deleteTable().run()}>
              Delete Table
            </ToolbarButton>
          </>
        )}

        {editor.isActive("image") && (
          <>
            <ToolbarDivider />
            <ToolbarButton
              active={editor.getAttributes("image").alignment === "left"}
              onClick={() => editor.chain().focus().updateAttributes("image", { alignment: "left" }).run()}
            >
              Img Left
            </ToolbarButton>
            <ToolbarButton
              active={editor.getAttributes("image").alignment === "center"}
              onClick={() => editor.chain().focus().updateAttributes("image", { alignment: "center" }).run()}
            >
              Img Center
            </ToolbarButton>
            <ToolbarButton
              active={editor.getAttributes("image").alignment === "right"}
              onClick={() => editor.chain().focus().updateAttributes("image", { alignment: "right" }).run()}
            >
              Img Right
            </ToolbarButton>
            <ToolbarButton
              active={editor.getAttributes("image").width === "20%"}
              onClick={() => editor.chain().focus().updateAttributes("image", { width: "20%" }).run()}
            >
              Img S
            </ToolbarButton>
            <ToolbarButton
              active={editor.getAttributes("image").width === "40%"}
              onClick={() => editor.chain().focus().updateAttributes("image", { width: "40%" }).run()}
            >
              Img M
            </ToolbarButton>
            <ToolbarButton
              active={editor.getAttributes("image").width === "65%"}
              onClick={() => editor.chain().focus().updateAttributes("image", { width: "65%" }).run()}
            >
              Img L
            </ToolbarButton>
            <ToolbarButton
              active={editor.getAttributes("image").width === "100%"}
              onClick={() => editor.chain().focus().updateAttributes("image", { width: "100%" }).run()}
            >
              Img Full
            </ToolbarButton>
          </>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleImageUpload(file)
          }}
        />
      </div>

      {showTablePrompt && (
        <div className="re2-table-panel">
          <div className="re2-table-grid">
            <div className="field-wrap">
              <label className="field-label">Bilangan baris</label>
              <input
                type="number"
                min={1}
                max={20}
                value={rowCount}
                onChange={(e) => setRowCount(Number(e.target.value))}
                className="input"
              />
            </div>

            <div className="field-wrap">
              <label className="field-label">Bilangan kolum</label>
              <input
                type="number"
                min={1}
                max={10}
                value={colCount}
                onChange={(e) => setColCount(Number(e.target.value))}
                className="input"
              />
            </div>
          </div>

          <div className="re2-table-actions">
            <button
              type="button"
              className="btn btn-light"
              onClick={() => setShowTablePrompt(false)}
            >
              Batal
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={insertCustomTable}
            >
              Insert Table
            </button>
          </div>
        </div>
      )}

      <div className="re2-editor-shell">
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}

function ToolbarButton({
  children,
  onClick,
  active = false,
  disabled = false,
}: {
  children: React.ReactNode
  onClick: () => void
  active?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`re2-btn ${active ? "active" : ""}`}
    >
      {children}
    </button>
  )
}

function ToolbarDivider() {
  return <div className="re2-divider" />
}
