import { useEffect, useMemo, useState } from "react"
import { useUser } from "../context/UserContext"
import { supabase } from "../lib/supabase"

type PaperType = "paper_1" | "paper_2"
type SectionType = "A" | "B" | "C" | ""
type BuilderMode = "custom" | "spm"
type DifficultyType = "rendah" | "sederhana" | "tinggi"
type DifficultyMode = "random" | DifficultyType | "distribution"
type TingkatanFilter = "4" | "5" | "both"
type TopicSelectionMode = "quick" | "manual"
type BuildMode =
  | "full_exam"
  | "topical_practice"
  | "section_practice"
  | "construct_practice"
  | "difficulty_practice"

type Item = {
  id: string
  item_code: string
  tingkatan: 4 | 5
  paper: PaperType
  section: "A" | "B" | "C" | null
  question_no_reference: string | null
  item_type: "mcq" | "structured" | "limited_response" | "open_response"
  theme_name: string | null
  bidang_learning_code: string | null
  bidang_learning_name: string | null
  main_construct: string | null
  construct_code: string | null
  difficulty_level: DifficultyType | null
  marks: number
  stem_text: string | null
  question_instruction: string | null
  answer_scheme_text: string | null
  answer_final: string | null
  status: string
  created_at: string
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
  main_construct: string | null
  construct_code: string | null
  difficulty_level: DifficultyType | null
}

type Distribution = Record<DifficultyType, number>

const defaultDistribution: Distribution = {
  rendah: 0,
  sederhana: 0,
  tinggi: 0,
}

export default function BuilderSetSoalan() {
  const { profile } = useUser()
  const [items, setItems] = useState<Item[]>([])
  const [mode, setMode] = useState<BuilderMode>("custom")
  const [tingkatan, setTingkatan] = useState<TingkatanFilter>("4")
  const [paper, setPaper] = useState<PaperType>("paper_1")
  const [section, setSection] = useState<SectionType>("")
  const [setTitle, setSetTitle] = useState("")
  const [savingSet, setSavingSet] = useState(false)
  const [loadingItems, setLoadingItems] = useState(true)

  const [totalSoalan, setTotalSoalan] = useState(20)
  const [difficultyMode, setDifficultyMode] = useState<DifficultyMode>("random")
  const [distribution, setDistribution] = useState<Distribution>({
    rendah: 8,
    sederhana: 8,
    tinggi: 4,
  })
  const [topicSelectionMode, setTopicSelectionMode] = useState<TopicSelectionMode>("quick")
  const [topicTargets, setTopicTargets] = useState<Record<string, number>>({})
  const [selectedBidangCodes, setSelectedBidangCodes] = useState<string[]>([])
  const [generatedSet, setGeneratedSet] = useState<Item[]>([])
  const [message, setMessage] = useState("")

  useEffect(() => {
    void fetchItems()
  }, [])

  const tingkatanValues = useMemo(() => {
    if (tingkatan === "both") return [4, 5]
    return [Number(tingkatan) as 4 | 5]
  }, [tingkatan])

  const baseAvailableItems = useMemo(() => {
    return items.filter((item) => tingkatanValues.includes(item.tingkatan) && item.paper === paper)
  }, [items, paper, tingkatanValues])

  const selectedTopicKeys = useMemo(() => {
    if (topicSelectionMode === "manual") {
      return Object.entries(topicTargets)
        .filter(([, value]) => value > 0)
        .map(([key]) => key)
    }

    return selectedBidangCodes
  }, [selectedBidangCodes, topicSelectionMode, topicTargets])

  const bidangOptions = useMemo(() => {
    const source = items.filter(
      (item) => tingkatanValues.includes(item.tingkatan) && item.paper === paper,
    )
    const map = new Map<string, { key: string; tingkatan: 4 | 5; code: string; name: string; count: number }>()

    source.forEach((item) => {
      const key = getBidangKey(item)
      const code = item.bidang_learning_code || "unknown"
      const name = item.bidang_learning_name || "Tanpa bidang"
      const current = map.get(key)
      map.set(key, {
        key,
        tingkatan: item.tingkatan,
        code,
        name,
        count: (current?.count || 0) + 1,
      })
    })

    return Array.from(map.values()).sort((a, b) => {
      if (a.tingkatan !== b.tingkatan) return a.tingkatan - b.tingkatan
      return naturalCodeSort(a.code, b.code)
    })
  }, [items, paper, tingkatanValues])

  const customPool = useMemo(() => {
    let pool = baseAvailableItems

    if (mode === "custom") {
      if (paper === "paper_1") {
        pool = pool.filter((item) => item.item_type === "mcq")
      }

      if (selectedTopicKeys.length > 0) {
        pool = pool.filter((item) =>
          selectedTopicKeys.includes(getBidangKey(item)),
        )
      }
    }

    if (paper === "paper_2" && section) {
      pool = pool.filter((item) => item.section === section)
    }

    if (difficultyMode !== "random" && difficultyMode !== "distribution") {
      pool = pool.filter((item) => item.difficulty_level === difficultyMode)
    }

    return pool
  }, [baseAvailableItems, difficultyMode, mode, paper, section, selectedTopicKeys])

  const customStats = useMemo(() => {
    return {
      total: customPool.length,
      rendah: customPool.filter((item) => item.difficulty_level === "rendah").length,
      sederhana: customPool.filter((item) => item.difficulty_level === "sederhana").length,
      tinggi: customPool.filter((item) => item.difficulty_level === "tinggi").length,
      bidang: selectedTopicKeys.length || bidangOptions.length,
    }
  }, [bidangOptions.length, customPool, selectedTopicKeys.length])

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
        theme_name,
        bidang_learning_code,
        bidang_learning_name,
        main_construct,
        construct_code,
        difficulty_level,
        marks,
        stem_text,
        question_instruction,
        answer_scheme_text,
        answer_final,
        status,
        created_at,
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
          display_order,
          main_construct,
          construct_code,
          difficulty_level
        )
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

  function setDistributionValue(key: DifficultyType, value: number) {
    setDistribution((prev) => ({
      ...prev,
      [key]: Math.max(0, value),
    }))
  }

  function toggleBidang(code: string) {
    setSelectedBidangCodes((prev) =>
      prev.includes(code) ? prev.filter((item) => item !== code) : [...prev, code],
    )
    setGeneratedSet([])
  }

  function setTopicTarget(key: string, value: number) {
    setTopicTargets((prev) => ({
      ...prev,
      [key]: Math.max(0, value),
    }))
    setGeneratedSet([])
  }

  function toggleTopicTarget(key: string) {
    setTopicTargets((prev) => ({
      ...prev,
      [key]: prev[key] > 0 ? 0 : 1,
    }))
    setGeneratedSet([])
  }

  function selectAllTopicTargets() {
    const next: Record<string, number> = {}
    bidangOptions.forEach((option) => {
      next[option.key] = Math.min(option.count, 1)
    })
    setTopicTargets(next)
    setGeneratedSet([])
  }

  function clearTopicTargets() {
    setTopicTargets({})
    setGeneratedSet([])
  }

  function selectAllBidang() {
    setSelectedBidangCodes(bidangOptions.map((option) => option.key))
    setGeneratedSet([])
  }

  function clearBidangSelection() {
    setSelectedBidangCodes([])
    setGeneratedSet([])
  }

  function distributeRandom(pool: Item[], total: number) {
    const selected: Item[] = []
    const groupedByBidang = new Map<string, Item[]>()

    pool.forEach((item) => {
      const key = getBidangKey(item)
      groupedByBidang.set(key, [...(groupedByBidang.get(key) || []), item])
    })

    const shuffledGroups = shuffle(Array.from(groupedByBidang.values()).map((group) => shuffle(group)))
    let cursor = 0

    while (selected.length < total && shuffledGroups.some((group) => group.length > 0)) {
      const group = shuffledGroups[cursor % shuffledGroups.length]
      const item = group.shift()
      if (item && !selected.some((existing) => existing.id === item.id)) {
        selected.push(item)
      }
      cursor += 1
    }

    return selected
  }

  function buildWithDistribution(pool: Item[]) {
    const totalDistribution = distribution.rendah + distribution.sederhana + distribution.tinggi
    if (totalDistribution !== totalSoalan) {
      setMessage(`Jumlah taburan aras mesti sama dengan jumlah soalan (${totalSoalan}).`)
      return null
    }

    const result = (Object.keys(distribution) as DifficultyType[]).flatMap((level) => {
      const needed = distribution[level]
      const levelPool = pool.filter((item) => item.difficulty_level === level)
      return distributeRandom(levelPool, needed)
    })

    if (result.length < totalSoalan) {
      setMessage("Item tidak mencukupi untuk taburan aras yang dipilih.")
      return null
    }

    return shuffle(result)
  }

  function buildWithTopicTargets(pool: Item[]) {
    const entries = Object.entries(topicTargets).filter(([, target]) => target > 0)
    const requestedTotal = entries.reduce((sum, [, target]) => sum + target, 0)

    if (entries.length === 0) {
      setMessage("Sila tetapkan bilangan soalan untuk sekurang-kurangnya satu bab.")
      return null
    }

    if (requestedTotal !== totalSoalan) {
      setMessage(`Jumlah taburan bab mesti sama dengan jumlah soalan (${totalSoalan}). Sekarang: ${requestedTotal}.`)
      return null
    }

    const result: Item[] = []

    for (const [key, target] of entries) {
      const topicPool = pool.filter((item) => getBidangKey(item) === key)
      if (topicPool.length < target) {
        const option = bidangOptions.find((row) => row.key === key)
        setMessage(`${option?.code || "Bab"} hanya ada ${topicPool.length} item sesuai, tetapi diminta ${target}.`)
        return null
      }

      result.push(...shuffle(topicPool).slice(0, target))
    }

    return shuffle(result)
  }

  function buildCustom() {
    if (totalSoalan < 1) {
      setMessage("Bilangan soalan mesti sekurang-kurangnya 1.")
      return
    }

    if (topicSelectionMode === "manual" && difficultyMode === "distribution") {
      setMessage("Taburan Bab belum boleh digabungkan dengan Tetapkan taburan aras. Pilih Bebas/random atau aras tertentu dahulu.")
      return
    }

    if (customPool.length < totalSoalan) {
      setMessage("Item published tidak mencukupi untuk tetapan ini.")
      return
    }

    const result =
      topicSelectionMode === "manual"
        ? buildWithTopicTargets(customPool)
        : difficultyMode === "distribution"
        ? buildWithDistribution(customPool)
        : distributeRandom(customPool, totalSoalan)

    if (!result) return

    setGeneratedSet(result.slice(0, totalSoalan))
    setMessage(`Set latihan Kertas 1 dijana: ${Math.min(result.length, totalSoalan)} soalan.`)
  }

  function buildSPM() {
    if (paper === "paper_1") {
      const pool = baseAvailableItems.filter((item) => item.item_type === "mcq")
      const rendah = shuffle(pool.filter((item) => item.difficulty_level === "rendah")).slice(0, 20)
      const sederhana = shuffle(pool.filter((item) => item.difficulty_level === "sederhana")).slice(0, 12)
      const tinggi = shuffle(pool.filter((item) => item.difficulty_level === "tinggi")).slice(0, 8)
      const result = [...rendah, ...sederhana, ...tinggi]

      if (result.length < 40) {
        setMessage("Item published tidak cukup untuk format SPM Kertas 1.")
        return
      }

      setGeneratedSet(result.slice(0, 40))
      setMessage("Set format SPM Kertas 1 dijana.")
      return
    }

    const pool = baseAvailableItems

    const partA = shuffle(pool.filter((item) => item.section === "A")).slice(0, 4)
    const partB = shuffle(pool.filter((item) => item.section === "B")).slice(0, 6)

    const q11Pool = pool.filter((item) => item.question_no_reference === "11")
    const q12Pool = pool.filter((item) => item.question_no_reference === "12")
    const q13Pool = pool.filter((item) => item.question_no_reference === "13")

    const question11 = shuffle(q11Pool)[0]
    const question12 = shuffle(q12Pool)[0]
    const question13 = shuffle(q13Pool)[0]

    if (partA.length < 4 || partB.length < 6 || !question11 || !question12 || !question13) {
      setMessage("Item published tidak cukup untuk format SPM Kertas 2.")
      return
    }

    // Papar semua 3 (biar murid pilih dalam kertas)
    setGeneratedSet([
      ...partA,
      ...partB,
      question11,
      question12,
      question13,
    ])

    setMessage("Set format SPM Kertas 2 dijana.")
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

  function replaceGeneratedItem(index: number) {
    const current = generatedSet[index]
    if (!current) return

    const usedIds = new Set(generatedSet.map((item) => item.id))
    const replacementPool = customPool.filter((item) => {
      if (usedIds.has(item.id)) return false
      if (item.difficulty_level !== current.difficulty_level) return false
      if (getBidangKey(item) !== getBidangKey(current)) return false
      return true
    })

    const fallbackPool = customPool.filter((item) => !usedIds.has(item.id))
    const replacement = shuffle(replacementPool)[0] || shuffle(fallbackPool)[0]

    if (!replacement) {
      setMessage("Tiada item gantian yang sesuai.")
      return
    }

    setGeneratedSet((prev) => prev.map((item, itemIndex) => (itemIndex === index ? replacement : item)))
    setMessage("Item telah diganti.")
  }

  function removeGeneratedItem(index: number) {
    setGeneratedSet((prev) => prev.filter((_, itemIndex) => itemIndex !== index))
  }

  function resolveBuildMode(): BuildMode {
    if (mode === "spm") return "full_exam"
    if (paper === "paper_2" && section) return "section_practice"
    if (difficultyMode !== "random") return "difficulty_practice"
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

    const setLimit = getSavedSetLimit(profile)
    if (setLimit !== Infinity) {
      const { count, error: countError } = await supabase
        .from("build_sets")
        .select("id", { count: "exact", head: true })
        .eq("owner_profile_id", profile.id)

      if (countError) {
        console.error("Build set count error", countError)
        setMessage("Gagal semak had simpan set.")
        return
      }

      if ((count || 0) >= setLimit) {
        setMessage(`Had simpan set telah penuh (${setLimit} set). Padam set lama di Set Saya sebelum simpan set baharu.`)
        return
      }
    }

    setSavingSet(true)

    try {
      const { data: savedSet, error: setError } = await supabase
        .from("build_sets")
        .insert({
          owner_profile_id: profile.id,
          title: setTitle.trim(),
          build_mode: resolveBuildMode(),
          tingkatan: tingkatan === "both" ? null : Number(tingkatan),
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
        custom_question_no: String(index + 1),
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
      <div className="page-header">
        <div>
          <h1 className="page-title">Bina Set Soalan</h1>
          <p className="page-subtitle">
            Jana latihan atau set peperiksaan Sains KSSM berdasarkan tingkatan, kertas, bahagian dan aras kesukaran.
          </p>
        </div>
      </div>

      <div className="paper-tabs">
        <button
          type="button"
          onClick={() => {
            setMode("custom")
            setGeneratedSet([])
          }}
          className={`paper-tab ${mode === "custom" ? "active" : ""}`}
        >
          Latihan / Custom
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("spm")
            setGeneratedSet([])
          }}
          className={`paper-tab ${mode === "spm" ? "active" : ""}`}
        >
          Format SPM
        </button>
      </div>

      <div className="builder-layout">
        <div className="builder-main">
          <section className="card-block">
            <div className="card-head">
              <h2>Tetapan Set</h2>
              <p>
                Pilih tetapan set latihan atau format peperiksaan sebelum menjana soalan.
              </p>
            </div>

            <div className="form-grid form-grid-4">
              <Field label="Tingkatan">
                <select
                  className="input"
                  value={tingkatan}
                  onChange={(event) => {
                    setTingkatan(event.target.value as TingkatanFilter)
                    setSelectedBidangCodes([])
                    setTopicTargets({})
                    setGeneratedSet([])
                  }}
                >
                  <option value="4">Tingkatan 4</option>
                  <option value="5">Tingkatan 5</option>
                  <option value="both">Tingkatan 4 + 5</option>
                </select>
              </Field>

              <Field label="Kertas">
                <select
                  className="input"
                  value={paper}
                  onChange={(event) => {
                    setPaper(event.target.value as PaperType)
                    setSection("")
                    setSelectedBidangCodes([])
                    setTopicTargets({})
                    setGeneratedSet([])
                  }}
                >
                  <option value="paper_1">Kertas 1</option>
                  <option value="paper_2">Kertas 2</option>
                </select>
              </Field>

              {mode === "custom" && (
                <>
                  <Field label="Jumlah Soalan">
                    <input
                      className="input"
                      type="number"
                      min={1}
                      value={totalSoalan}
                      onChange={(event) => setTotalSoalan(Number(event.target.value))}
                    />
                  </Field>

                  <Field label="Aras Kesukaran">
                    <select
                      className="input"
                      value={difficultyMode}
                      onChange={(event) => {
                        setDifficultyMode(event.target.value as DifficultyMode)
                        setGeneratedSet([])
                      }}
                    >
                      <option value="random">Bebas / random</option>
                      <option value="rendah">Rendah sahaja</option>
                      <option value="sederhana">Sederhana sahaja</option>
                      <option value="tinggi">Tinggi sahaja</option>
                      <option value="distribution">Tetapkan taburan</option>
                    </select>
                  </Field>
                </>
              )}

              {mode === "custom" && paper === "paper_2" && (
                <Field label="Bahagian">
                  <select
                    className="input"
                    value={section}
                    onChange={(event) => setSection(event.target.value as SectionType)}
                  >
                    <option value="">Semua bahagian</option>
                    <option value="A">Bahagian A</option>
                    <option value="B">Bahagian B</option>
                    <option value="C">Bahagian C</option>
                  </select>
                </Field>
              )}

              <Field label="Tajuk Set">
                <input
                  className="input"
                  value={setTitle}
                  onChange={(event) => setSetTitle(event.target.value)}
                  placeholder="Contoh: Latihan Bab 2"
                />
              </Field>
            </div>

            {mode === "custom" && difficultyMode === "distribution" && (
              <div className="builder-distribution">
                <Field label="Rendah">
                  <input
                    className="input"
                    type="number"
                    min={0}
                    value={distribution.rendah}
                    onChange={(event) => setDistributionValue("rendah", Number(event.target.value))}
                  />
                </Field>
                <Field label="Sederhana">
                  <input
                    className="input"
                    type="number"
                    min={0}
                    value={distribution.sederhana}
                    onChange={(event) => setDistributionValue("sederhana", Number(event.target.value))}
                  />
                </Field>
                <Field label="Tinggi">
                  <input
                    className="input"
                    type="number"
                    min={0}
                    value={distribution.tinggi}
                    onChange={(event) => setDistributionValue("tinggi", Number(event.target.value))}
                  />
                </Field>
                <div className="builder-distribution-total">
                  Jumlah taburan:{" "}
                  <strong>{distribution.rendah + distribution.sederhana + distribution.tinggi}</strong>
                  {" / "}
                  {totalSoalan}
                </div>
              </div>
            )}
          </section>

          {mode === "custom" && (
            <section className="card-block">
              <div className="card-head builder-card-head-row">
                <div>
                  <h2>Bab / Bidang Pembelajaran</h2>
                  <p>Pilih secara cepat atau tetapkan bilangan item untuk setiap bab.</p>
                </div>
                <div className="action-row">
                  <button
                    type="button"
                    className={`btn btn-sm ${topicSelectionMode === "quick" ? "btn-primary" : "btn-light"}`}
                    onClick={() => {
                      setTopicSelectionMode("quick")
                      setGeneratedSet([])
                    }}
                  >
                    Mod Cepat
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${topicSelectionMode === "manual" ? "btn-primary" : "btn-light"}`}
                    onClick={() => {
                      setTopicSelectionMode("manual")
                      setGeneratedSet([])
                    }}
                  >
                    Taburan Bab
                  </button>
                </div>
              </div>

              <div className="builder-topic-toolbar">
                <div className="builder-topic-summary">
                  {topicSelectionMode === "manual" ? (
                    <>
                      Jumlah taburan bab: <strong>{getTopicTargetTotal(topicTargets)}</strong> / {totalSoalan}
                    </>
                  ) : (
                    <>
                      Bidang dipilih: <strong>{selectedBidangCodes.length || bidangOptions.length}</strong>
                    </>
                  )}
                </div>
                <div className="action-row">
                  {topicSelectionMode === "manual" ? (
                    <>
                      <button type="button" className="btn btn-light btn-sm" onClick={selectAllTopicTargets}>
                        Isi 1 Setiap Bab
                      </button>
                      <button type="button" className="btn btn-light btn-sm" onClick={clearTopicTargets}>
                        Kosongkan
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="btn btn-light btn-sm" onClick={selectAllBidang}>
                        Pilih Semua
                      </button>
                      <button type="button" className="btn btn-light btn-sm" onClick={clearBidangSelection}>
                        Bebas Semua
                      </button>
                    </>
                  )}
                </div>
              </div>

              {bidangOptions.length === 0 ? (
                <div className="empty-state">Tiada item published untuk tetapan kertas dan tingkatan ini.</div>
              ) : (
                <div className="builder-topic-grid">
                  {bidangOptions.map((option) => (
                    <div
                      key={option.key}
                      className={`builder-topic-option ${
                        topicSelectionMode === "manual" && (topicTargets[option.key] || 0) > 0 ? "active" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={
                          topicSelectionMode === "manual"
                            ? (topicTargets[option.key] || 0) > 0
                            : selectedBidangCodes.includes(option.key)
                        }
                        onChange={() =>
                          topicSelectionMode === "manual"
                            ? toggleTopicTarget(option.key)
                            : toggleBidang(option.key)
                        }
                      />
                      <div className="builder-topic-content">
                        <strong>
                          T{option.tingkatan} · {option.code === "unknown" ? "Tanpa kod" : option.code} - {option.name}
                        </strong>
                        <small>{option.count} item published</small>
                      </div>
                      {topicSelectionMode === "manual" && (
                        <div className="builder-topic-quota">
                          <span>Bil.</span>
                          <input
                            className="input"
                            type="number"
                            min={0}
                            max={option.count}
                            value={topicTargets[option.key] || 0}
                            onChange={(event) => setTopicTarget(option.key, Number(event.target.value))}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          <section className="card-block">
            <div className="card-head builder-card-head-row">
              <div>
                <h2>Preview Set</h2>
                <p>Guru boleh buang atau tukar item sebelum simpan set.</p>
              </div>
              <div className="action-row">
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
            </div>

            {generatedSet.length === 0 ? (
              <div className="empty-state">Tiada set dijana.</div>
            ) : (
              <div className="builder-preview-list">
                {generatedSet.map((item, index) => (
                  <article key={`${item.id}-${index}`} className="builder-preview-item">
                    <div className="builder-preview-no">{index + 1}</div>
                    <div className="builder-preview-body">
                      <div className="builder-preview-top">
                        <strong>{item.item_code}</strong>
                        <div className="builder-preview-tags">
                          <span>{item.bidang_learning_code || "-"}</span>
                          <span>{item.difficulty_level || "-"}</span>
                          <span>T{item.tingkatan}</span>
                        </div>
                      </div>
                      <div className="builder-preview-stem">
                        {truncate(stripHtml(item.stem_text || ""), 220)}
                      </div>
                    </div>
                    <div className="builder-preview-actions">
                      <button
                        type="button"
                        className="btn btn-light btn-sm"
                        onClick={() => replaceGeneratedItem(index)}
                      >
                        Tukar
                      </button>
                      <button
                        type="button"
                        className="btn btn-light btn-sm"
                        onClick={() => removeGeneratedItem(index)}
                      >
                        Buang
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          {generatedSet.length > 0 && (
            <section className="card-block">
              <div className="card-head builder-card-head-row">
                <div>
                  <h2>Pratonton Kertas Latihan</h2>
                  <p>Rupa kertas soalan sebenar yang akan digunakan oleh guru atau murid.</p>
                </div>
                <div className="builder-paper-meta">
                  <span>{paper === "paper_1" ? "Kertas 1" : "Kertas 2"}</span>
                  <span>{generatedSet.length} soalan</span>
                </div>
              </div>

              <div className="question-paper-preview">
                <div className="question-paper-head">
                  <strong>{setTitle.trim() || "Latihan Sains"}</strong>
                  <span>Sains KSSM</span>
                  <span>
                    {tingkatan === "both" ? "Tingkatan 4 dan 5" : `Tingkatan ${tingkatan}`}
                  </span>
                </div>

                {paper === "paper_2" ? (
                  <div className="question-paper-sections">
                    {Object.entries(groupBySection(generatedSet)).map(([section, items]) => {
                      if (items.length === 0) return null

                      return (
                        <div key={section} className="question-paper-section">
                          <div className="section-header">
                            <strong>Bahagian {section}</strong>

                            <div className="section-instruction">
                              {section === "C"
                                ? "Jawab Soalan 11 dan sama ada Soalan 12 atau Soalan 13."
                                : "Jawab semua soalan."}
                            </div>
                          </div>

                          <ol className="question-paper-list">
                            {items.map((item, index) => {
                              const questionNo =
                                item.question_no_reference || `${index + 1}`

                              return (
                                <li key={`${item.id}-${index}`} className="question-paper-item">
                                  <div className="question-number">
                                    {questionNo}.
                                  </div>

                                  <div
                                    className="question-paper-stem"
                                    dangerouslySetInnerHTML={{ __html: item.stem_text || "" }}
                                  />

                                  {/* subquestions kekal sini */}
                                  <div className="question-paper-sub-wrapper">
                                    <div className="question-paper-subquestions">
                                      {sortSubQuestions(item.item_subquestions).map((sub) => (
                                        <div key={sub.id} className="question-paper-subquestion">
                                          <div className="question-paper-subquestion-label">
                                            ({sub.label}){sub.sub_label ? `(${sub.sub_label})` : ""}
                                          </div>

                                          <div className="question-paper-subquestion-content">
                                            <div
                                              dangerouslySetInnerHTML={{ __html: sub.question_text || "" }}
                                            />

                                            {shouldShowAnswerSpace(item, sub) && (
                                              <AnswerSpace responseType={sub.response_type} />
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
                                  </div>
                                </li>
                              )
                            })}
                          </ol>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <ol className="question-paper-list">
                    {generatedSet.map((item, index) => (
                      <li key={`paper-${item.id}-${index}`} className="question-paper-item">
                        <div
                          className="question-paper-stem"
                          dangerouslySetInnerHTML={{ __html: item.stem_text || "" }}
                        />

                        {paper === "paper_1" && (
                          <div className="question-paper-options">
                            {sortOptions(item.item_options).map((option) => (
                              <div
                                key={`${item.id}-${option.option_label}`}
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
                                    <img
                                      src={option.option_image_url}
                                      alt={`Pilihan ${option.option_label}`}
                                    />
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </section>
          )}
        </div>

        <aside className="builder-sidebar">
          <section className="card-block">
            <div className="card-head">
              <h2>Ringkasan Pool</h2>
              <p>Item published yang sepadan dengan tetapan semasa.</p>
            </div>
            <div className="preview-stack">
              <PreviewRow label="Item tersedia" value={loadingItems ? "Memuat..." : String(customStats.total)} />
              <PreviewRow label="Bidang dipilih" value={String(customStats.bidang)} />
              <PreviewRow label="Rendah" value={String(customStats.rendah)} />
              <PreviewRow label="Sederhana" value={String(customStats.sederhana)} />
              <PreviewRow label="Tinggi" value={String(customStats.tinggi)} />
              <PreviewRow label="Set dijana" value={String(generatedSet.length)} />
            </div>
          </section>

          <section className="card-block">
            <div className="card-head">
              <h2>Panduan</h2>
              <p>Logik jana latihan custom.</p>
            </div>
            <ul className="tips-list">
              <li>`Bebas / random` akan cuba seimbangkan pilihan ikut bidang.</li>
              <li>`Tetapkan taburan` sesuai jika guru mahu kawal aras rendah/sederhana/tinggi.</li>
              <li>Gunakan `Tukar` untuk ganti satu item tanpa jana semula semua soalan.</li>
              <li>Hanya item `published` digunakan dalam builder.</li>
            </ul>
          </section>
        </aside>
      </div>

      {message && <div className="admin-alert builder-floating-message">{message}</div>}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
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

function shouldShowAnswerSpace(item: Item, sub: ItemSubQuestion) {
  if (isInstructionSubQuestionPreview(sub)) return false
  return item.section === "A" || item.section === "B"
}

function AnswerSpace({ responseType }: { responseType: string }) {
  if (responseType === "structured_text") {
    return (
      <div className="answer-space">
        <div className="answer-line" />
        <div className="answer-line" />
      </div>
    )
  }

  if (responseType === "table") {
    return (
      <div className="answer-space answer-box">
        <div className="answer-line" />
        <div className="answer-line" />
        <div className="answer-line" />
      </div>
    )
  }

  if (responseType === "drawing" || responseType === "design") {
    return <div className="answer-drawing-box" />
  }

  if (responseType === "calculation") {
    return (
      <div className="answer-space">
        <div className="answer-line" />
        <div className="answer-line" />
        <div className="answer-line" />
      </div>
    )
  }

  return (
    <div className="answer-space">
      <div className="answer-line" />
    </div>
  )
}

function groupBySection(items: Item[]) {
  return {
    A: items.filter(i => i.section === "A"),
    B: items.filter(i => i.section === "B"),
    C: items.filter(i => i.section === "C"),
  }
}

function getBidangKey(item: Pick<Item, "tingkatan" | "bidang_learning_code">) {
  return `T${item.tingkatan}:${item.bidang_learning_code || "unknown"}`
}

function getTopicTargetTotal(topicTargets: Record<string, number>) {
  return Object.values(topicTargets).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0)
}

function getSavedSetLimit(profile: { role?: string; account_type?: string } | null) {
  if (!profile) return 1
  if (profile.role === "master_admin") return Infinity
  if (profile.role === "admin") return 20
  if (profile.account_type === "full") return 15
  return 1
}

function naturalCodeSort(a: string, b: string) {
  const aNumber = Number.parseFloat(a)
  const bNumber = Number.parseFloat(b)

  if (Number.isFinite(aNumber) && Number.isFinite(bNumber) && aNumber !== bNumber) {
    return aNumber - bNumber
  }

  return a.localeCompare(b)
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
