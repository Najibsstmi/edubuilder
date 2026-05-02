import { FormEvent, useState } from "react"
import { Link } from "react-router-dom"
import { supabase } from "../lib/supabase"

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setMessage("")
    setError("")
    setLoading(true)

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })

    setLoading(false)

    if (resetError) {
      setError(resetError.message)
      return
    }

    setMessage("Pautan reset kata laluan telah dihantar ke email jika akaun wujud.")
  }

  return (
    <div className="auth-page">
      <form className="card auth-card" onSubmit={handleSubmit}>
        <h1>Lupa kata laluan</h1>
        <p className="muted">
          Masukkan email akaun. Sistem akan hantar pautan untuk tetapkan kata laluan baharu.
        </p>

        <label>
          Email
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            required
          />
        </label>

        {error && <p className="error-text">{error}</p>}
        {message && <p className="save-message">{message}</p>}

        <button className="primary-btn" disabled={loading}>
          {loading ? "Menghantar..." : "Hantar pautan reset"}
        </button>

        <p className="muted">
          Ingat kata laluan? <Link to="/login">Log masuk</Link>
        </p>
      </form>
    </div>
  )
}
