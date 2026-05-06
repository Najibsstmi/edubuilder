import { useEffect, useMemo, useState } from "react"
import { supabase } from "../lib/supabase"
import type { Profile } from "../types"
import { useAuth } from "../contexts/AuthContext"

type UserMetrics = {
  total: number
  paper1: number
  paper2: number
  pending: number
  published: number
  aiUsed: number
}

const ADMIN_AI_LIMIT = 30

export function MasterAdminUsersPage() {
  const { profile } = useAuth()
  const [users, setUsers] = useState<Profile[]>([])
  const [metrics, setMetrics] = useState<Record<string, UserMetrics>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const summary = useMemo(() => {
    const admins = users.filter((user) => user.role === "admin").length
    const premium = users.filter((user) => user.role === "user" && user.account_type === "full").length
    const free = users.filter((user) => user.role === "user" && user.account_type === "free").length
    const pending = users.filter((user) => user.status === "pending").length
    return { admins, premium, free, pending }
  }, [users])

  useEffect(() => {
    void loadUsers()
  }, [])

  async function loadUsers() {
    setLoading(true)
    setError("")

    const { data, error: loadError } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false })

    if (loadError) {
      setError(loadError.message)
      setLoading(false)
      return
    }

    const nextUsers = (data || []) as Profile[]
    setUsers(nextUsers)
    setMetrics(await loadUserMetrics(nextUsers))
    setLoading(false)
  }

  async function updateUser(id: string, updates: Record<string, any>) {
    const { error: updateError } = await supabase.from("profiles").update(updates).eq("id", id)

    if (updateError) {
      console.error(updateError)
      alert("Gagal kemas kini pengguna")
      return
    }

    await loadUsers()
  }

  if (profile?.role !== "master_admin") {
    return <div className="card">Akses hanya untuk master admin.</div>
  }

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <h1 className="page-title">Pengurusan pengguna</h1>
          <p className="page-subtitle">
            Master admin boleh aktifkan akaun, tetapkan role, upgrade premium, dan semak output penggubal.
          </p>
        </div>
        <button type="button" className="btn btn-light" onClick={() => void loadUsers()}>
          Refresh
        </button>
      </div>

      <div className="stats-grid stats-grid-compact">
        <UserStat title="Admin/Penggubal" value={summary.admins} />
        <UserStat title="Premium User" value={summary.premium} />
        <UserStat title="Free User" value={summary.free} />
        <UserStat title="Pending" value={summary.pending} />
      </div>

      <section className="card-block">
        {loading && <p>Loading...</p>}
        {error && <p className="error-text">{error}</p>}

        <div className="table-wrap">
          <table className="admin-user-table">
            <thead>
              <tr>
                <th>Pengguna</th>
                <th>Role / Akaun</th>
                <th>Status</th>
                <th>Output Item</th>
                <th>Kuota AI</th>
                <th>Tindakan</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const userMetrics = metrics[user.id] || emptyUserMetrics()
                const aiRemaining =
                  user.role === "master_admin" ? "Tiada had" : Math.max(ADMIN_AI_LIMIT - userMetrics.aiUsed, 0)

                return (
                  <tr key={user.id}>
                    <td>
                      <div className="user-cell">
                        <strong>{user.full_name || "-"}</strong>
                        <span>{user.email || "-"}</span>
                      </div>
                    </td>
                    <td>
                      <div className="badge-stack">
                        <Badge tone={user.role === "master_admin" ? "purple" : user.role === "admin" ? "blue" : "gray"}>
                          {roleLabel(user.role)}
                        </Badge>
                        <Badge tone={user.account_type === "full" ? "green" : "orange"}>
                          {accountLabel(user)}
                        </Badge>
                      </div>
                    </td>
                    <td>
                      <Badge tone={user.status === "active" ? "green" : user.status === "pending" ? "orange" : "red"}>
                        {user.status}
                      </Badge>
                    </td>
                    <td>
                      <div className="metric-mini">
                        <span>Total: <strong>{userMetrics.total}</strong></span>
                        <span>K1: <strong>{userMetrics.paper1}</strong></span>
                        <span>K2: <strong>{userMetrics.paper2}</strong></span>
                        <span>Semakan: <strong>{userMetrics.pending}</strong></span>
                        <span>Published: <strong>{userMetrics.published}</strong></span>
                      </div>
                    </td>
                    <td>
                      <div className="quota-pill">
                        {user.role === "master_admin" ? (
                          <strong>{aiRemaining}</strong>
                        ) : (
                          <>
                            <strong>{aiRemaining}</strong>
                            <span>/ {ADMIN_AI_LIMIT} baki</span>
                          </>
                        )}
                      </div>
                    </td>
                    <td>
                      {user.role === "master_admin" ? (
                        <span className="muted">-</span>
                      ) : (
                        <div className="user-action-grid">
                          {user.status !== "active" ? (
                            <button
                              type="button"
                              className="btn btn-success btn-sm"
                              onClick={() =>
                                updateUser(user.id, {
                                  status: "active",
                                  approved_by: profile.id,
                                  approved_at: new Date().toISOString(),
                                })
                              }
                            >
                              Aktifkan
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-danger btn-sm"
                              onClick={() =>
                                updateUser(user.id, {
                                  status: "suspended",
                                  approved_by: profile.id,
                                  approved_at: new Date().toISOString(),
                                })
                              }
                            >
                              Suspend
                            </button>
                          )}

                          <button
                            type="button"
                            className="btn btn-light btn-sm"
                            onClick={() =>
                              updateUser(
                                user.id,
                                user.role === "admin"
                                  ? { role: "user", account_type: "free" }
                                  : { role: "admin", account_type: "full", status: "active" },
                              )
                            }
                          >
                            {user.role === "admin" ? "Jadi User" : "Jadi Admin"}
                          </button>

                          {user.role === "user" && (
                            <button
                              type="button"
                              className="btn btn-light btn-sm"
                              onClick={() =>
                                updateUser(user.id, {
                                  account_type: user.account_type === "full" ? "free" : "full",
                                })
                              }
                            >
                              {user.account_type === "full" ? "Set Free" : "Set Premium"}
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function UserStat({ title, value }: { title: string; value: number }) {
  return (
    <div className="card stat-card stat-card-center">
      <h3>{title}</h3>
      <strong>{value}</strong>
    </div>
  )
}

function Badge({ tone, children }: { tone: string; children: React.ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}

function roleLabel(role: Profile["role"]) {
  if (role === "master_admin") return "Master Admin"
  if (role === "admin") return "Admin/Penggubal"
  return "User"
}

function accountLabel(user: Profile) {
  if (user.role === "admin") return "full access"
  if (user.account_type === "full") return "premium/full"
  return "free"
}

function emptyUserMetrics(): UserMetrics {
  return { total: 0, paper1: 0, paper2: 0, pending: 0, published: 0, aiUsed: 0 }
}

async function loadUserMetrics(users: Profile[]) {
  const output: Record<string, UserMetrics> = {}
  const start = new Date()
  start.setDate(1)
  start.setHours(0, 0, 0, 0)

  await Promise.all(
    users.map(async (user) => {
      const [total, paper1, paper2, pending, published, aiUsed] = await Promise.all([
        countByUser(user.id, {}),
        countByUser(user.id, { paper: "paper_1" }),
        countByUser(user.id, { paper: "paper_2" }),
        countByUser(user.id, { status: "pending_review" }),
        countByUser(user.id, { status: "published" }),
        countMonthlyAiByUser(user.id, start.toISOString()),
      ])

      output[user.id] = { total, paper1, paper2, pending, published, aiUsed }
    }),
  )

  return output
}

async function countByUser(profileId: string, filters: { paper?: string; status?: string }) {
  let query = supabase.from("items").select("id", { count: "exact", head: true }).eq("created_by", profileId)
  if (filters.paper) query = query.eq("paper", filters.paper)
  if (filters.status) query = query.eq("status", filters.status)
  const { count, error } = await query
  if (error) {
    console.warn("User item count skipped", error)
    return 0
  }
  return count || 0
}

async function countMonthlyAiByUser(profileId: string, startIso: string) {
  const { count, error } = await supabase
    .from("ai_usage_logs")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profileId)
    .eq("usage_type", "generate_marking_scheme")
    .gte("created_at", startIso)

  if (error) {
    console.warn("User AI count skipped", error)
    return 0
  }
  return count || 0
}
