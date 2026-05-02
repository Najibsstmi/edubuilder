import { FormEvent, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { supabase } from "../lib/supabase"

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setMessage("")
    setError("")

    if (password.length < 6) {
      setError("Kata laluan perlu sekurang-kurangnya 6 aksara.")
      return
    }

    if (password !== confirmPassword) {
      setError("Sahkan kata laluan tidak sama.")
      return
    }

    setLoading(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (updateError) {
      setError(updateError.message)
      return
    }

    setMessage("Kata laluan berjaya dikemaskini. Anda boleh log masuk semula.")
    setTimeout(() => navigate("/login", { replace: true }), 1400)
  }

  return (
    <div className="auth-page">
      <form className="card auth-card" onSubmit={handleSubmit}>
        <h1>Reset kata laluan</h1>
        <p className="muted">Masukkan kata laluan baharu untuk akaun EduBuilder.</p>

        <label>
          Kata laluan baharu
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            minLength={6}
            required
          />
        </label>

        <label>
          Sahkan kata laluan
          <input
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            type="password"
            minLength={6}
            required
          />
        </label>

        {error && <p className="error-text">{error}</p>}
        {message && <p className="save-message">{message}</p>}

        <button className="primary-btn" disabled={loading}>
          {loading ? "Menyimpan..." : "Simpan kata laluan baharu"}
        </button>

        <p className="muted">
          Kembali ke <Link to="/login">log masuk</Link>
        </p>
      </form>
    </div>
  )
}
