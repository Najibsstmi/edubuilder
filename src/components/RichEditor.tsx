import { useEffect, useMemo, useRef, useState } from "react"
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

type Props = {
  value: string
  onChange: (val: string) => void
  placeholder?: string
  label?: string
}

export default function RichEditor({
  value,
  onChange,
  placeholder = "Tulis kandungan di sini...",
  label,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [uploading, setUploading] = useState(false)
  const [showTablePrompt, setShowTablePrompt] = useState(false)
  const [rowCount, setRowCount] = useState(3)
  const [colCount, setColCount] = useState(3)

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Placeholder.configure({
        placeholder,
      }),
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      Image.configure({
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

  async function handleImageUpload(file: File) {
    if (!editor) return
    setUploading(true)

    try {
      const ext = file.name.split(".").pop() || "png"
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

      editor.chain().focus().setImage({ src: imageUrl, alt: file.name }).run()
    } catch (error) {
      console.error(error)
      window.alert("Gagal upload gambar.")
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
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

  if (!editor) return null

  return (
    <div className="re2-wrap">
      {label && <div className="re2-label">{label}</div>}

      <div className="re2-toolbar">
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

        <ToolbarDivider />

        <ToolbarButton onClick={openImagePicker} disabled={uploading}>
          {uploading ? "Uploading..." : "Image"}
        </ToolbarButton>

        <ToolbarButton onClick={() => setShowTablePrompt((v) => !v)}>
          Table
        </ToolbarButton>

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
