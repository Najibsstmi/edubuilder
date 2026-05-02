import { FormEvent, useEffect, useMemo, useState } from "react"
import { supabase } from "../lib/supabase"
import { useAuth } from "../contexts/AuthContext"
import type { School } from "../types"

export default function MyProfilePage() {
  const { profile, refreshProfile } = useAuth()
  const [schools, setSchools] = useState<School[]>([])
  const [fullName, setFullName] = useState(profile?.full_name || "")
  const [selectedState, setSelectedState] = useState("")
  const [selectedPpd, setSelectedPpd] = useState("")
  const [selectedSchoolId, setSelectedSchoolId] = useState(profile?.school_id || "")
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function loadSchools() {
      const { data, error: loadError } = await supabase
        .from("schools")
        .select("*")
        .eq("is_active", true)
        .eq("is_secondary", true)
        .order("state_name", { ascending: true })
        .order("ppd_name", { ascending: true })
        .order("school_name", { ascending: true })

      if (loadError) {
        setError(loadError.message)
        return
      }

      setSchools((data || []) as School[])
    }

    void loadSchools()
  }, [])

  useEffect(() => {
    setFullName(profile?.full_name || "")
    setSelectedSchoolId(profile?.school_id || "")
  }, [profile?.full_name, profile?.school_id])

  useEffect(() => {
    const school = schools.find((item) => item.id === selectedSchoolId)
    if (!school) return

    setSelectedState(school.state_name || "")
    setSelectedPpd(school.ppd_name || "")
  }, [schools, selectedSchoolId])

  const stateOptions = useMemo(
    () => Array.from(new Set(schools.map((school) => school.state_name).filter(Boolean))) as string[],
    [schools],
  )

  const ppdOptions = useMemo(
    () =>
      Array.from(
        new Set(
          schools
            .filter((school) => school.state_name === selectedState)
            .map((school) => school.ppd_name)
            .filter(Boolean),
        ),
      ) as string[],
    [schools, selectedState],
  )

  const schoolOptions = useMemo(
    () => schools.filter((school) => school.state_name === selectedState && school.ppd_name === selectedPpd),
    [schools, selectedState, selectedPpd],
  )

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setMessage("")
    setError("")

    if (!profile?.id) {
      setError("Profil pengguna tidak dijumpai.")
      return
    }

    const trimmedName = fullName.trim()
    if (!trimmedName) {
      setError("Nama penuh wajib diisi.")
      return
    }

    const selectedSchool = schools.find((school) => school.id === selectedSchoolId) || null
    if ((selectedState || selectedPpd) && !selectedSchool) {
      setError("Sila pilih sekolah yang sah.")
      return
    }

    setSaving(true)

    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        full_name: trimmedName,
        school_id: selectedSchool?.id || null,
        state_name: selectedSchool?.state_name || null,
        ppd_name: selectedSchool?.ppd_name || null,
        school_type: selectedSchool?.school_type || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", profile.id)

    setSaving(false)

    if (updateError) {
      setError(updateError.message)
      return
    }

    await refreshProfile()
    setMessage("Profil berjaya dikemaskini.")
  }

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <h1>Profil Saya</h1>
          <p className="muted">
            Kemas kini nama dan sekolah supaya rekod penggubal item dipaparkan dengan betul.
          </p>
        </div>
      </div>

      <form className="card page-form" onSubmit={handleSubmit}>
        <div className="grid-2">
          <label>
            Nama penuh
            <input
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Contoh: Mohd Najib bin Jaafar"
              required
            />
          </label>

          <label>
            Email
            <input value={profile?.email || ""} readOnly />
          </label>
        </div>

        <div className="grid-3">
          <label>
            Negeri
            <select
              value={selectedState}
              onChange={(event) => {
                setSelectedState(event.target.value)
                setSelectedPpd("")
                setSelectedSchoolId("")
              }}
            >
              <option value="">Pilih negeri</option>
              {stateOptions.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </select>
          </label>

          <label>
            PPD
            <select
              value={selectedPpd}
              onChange={(event) => {
                setSelectedPpd(event.target.value)
                setSelectedSchoolId("")
              }}
              disabled={!selectedState}
            >
              <option value="">Pilih PPD</option>
              {ppdOptions.map((ppd) => (
                <option key={ppd} value={ppd}>
                  {ppd}
                </option>
              ))}
            </select>
          </label>

          <label>
            Sekolah
            <select
              value={selectedSchoolId}
              onChange={(event) => setSelectedSchoolId(event.target.value)}
              disabled={!selectedPpd}
            >
              <option value="">Pilih sekolah</option>
              {schoolOptions.map((school) => (
                <option key={school.id} value={school.id}>
                  {school.school_name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <p className="muted small">
          Nama penuh akan digunakan sebagai nama penggubal. Sekolah akan dipaparkan bersama nama jika dipilih.
        </p>

        {error && <p className="error-text">{error}</p>}
        {message && <p className="save-message">{message}</p>}

        <div className="action-row">
          <button className="primary-btn" disabled={saving}>
            {saving ? "Menyimpan..." : "Simpan Profil"}
          </button>
        </div>
      </form>
    </div>
  )
}
