import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { BrandLogo } from "../components/BrandLogo"
import { PremiumContactCard } from "../components/PremiumContactCard"
import { useAuth } from "../contexts/AuthContext"
import { supabase } from "../lib/supabase"

type DashboardStats = {
  ownItems: number
  pendingReview: number
  published: number
  rejected: number
  paper1: number
  paper2: number
  aiUsed: number
}

type RecentItem = {
  id: string
  item_code: string
  paper: "paper_1" | "paper_2"
  status: string
  stem_text: string | null
  created_at: string
}

const ADMIN_AI_LIMIT = 30

export function DashboardPage() {
  const { profile } = useAuth()
  const [stats, setStats] = useState<DashboardStats>({
    ownItems: 0,
    pendingReview: 0,
    published: 0,
    rejected: 0,
    paper1: 0,
    paper2: 0,
    aiUsed: 0,
  })
  const [recentItems, setRecentItems] = useState<RecentItem[]>([])

  const isMaster = profile?.role === "master_admin"
  const isAdmin = profile?.role === "admin"
  const isPremiumUser = profile?.role === "user" && profile?.account_type === "full"
  const isFreeUser = profile?.role === "user" && profile?.account_type === "free"
  const setLimit = useMemo(() => {
    if (!profile) return 1
    if (profile.role === "master_admin") return "Tiada had"
    if (profile.role === "admin") return "20 set"
    if (profile.account_type === "full") return "15 set"
    return "1 set"
  }, [profile])

  useEffect(() => {
    async function loadDashboard() {
      if (!profile?.id) return

      const [ownItems, pendingReview, published, rejected, paper1, paper2, aiUsed, recent] =
        await Promise.all([
          countOwnItems(profile.id, {}),
          countOwnItems(profile.id, { status: "pending_review" }),
          countOwnItems(profile.id, { status: "published" }),
          countOwnItems(profile.id, { status: "rejected" }),
          countOwnItems(profile.id, { paper: "paper_1" }),
          countOwnItems(profile.id, { paper: "paper_2" }),
          countMonthlyAi(profile.id),
          supabase
            .from("items")
            .select("id, item_code, paper, status, stem_text, created_at")
            .eq("created_by", profile.id)
            .order("created_at", { ascending: false })
            .limit(5),
        ])

      setStats({ ownItems, pendingReview, published, rejected, paper1, paper2, aiUsed })
      setRecentItems(((recent.data || []) as RecentItem[]) || [])
    }

    void loadDashboard()
  }, [profile?.id])

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <h1>Dashboard EduBuilder</h1>
          <p className="muted">
            {isAdmin
              ? "Ringkasan kerja penggubalan item dan kuota AI anda."
              : isMaster
                ? "Pusat kawalan master admin untuk semakan sistem."
                : "Bina dan urus set soalan daripada bank soalan yang telah dipublish."}
          </p>
        </div>
        <div className="dashboard-brand-card">
          <BrandLogo compact />
        </div>
      </div>

      {isFreeUser && <PremiumContactCard />}

      <div className="stats-grid stats-grid-compact">
        <DashboardStat title="Peranan" value={profile?.role || "-"} />
        <DashboardStat title="Akaun" value={profile?.account_type || "-"} />
        <DashboardStat title="Status" value={profile?.status || "-"} />
        <DashboardStat title="Had Set" value={setLimit} />
        {(isAdmin || isMaster) && (
          <DashboardStat
            title="Baki AI"
            value={isMaster ? "Tiada had" : `${Math.max(ADMIN_AI_LIMIT - stats.aiUsed, 0)} / ${ADMIN_AI_LIMIT}`}
          />
        )}
      </div>

      {isAdmin && (
        <>
          <div className="stats-grid stats-grid-compact">
            <DashboardStat title="Item Saya" value={stats.ownItems} />
            <DashboardStat title="Kertas 1" value={stats.paper1} />
            <DashboardStat title="Kertas 2" value={stats.paper2} />
            <DashboardStat title="Menunggu Semakan" value={stats.pendingReview} />
            <DashboardStat title="Published" value={stats.published} />
            <DashboardStat title="Rejected" value={stats.rejected} />
          </div>

          <section className="card-block">
            <div className="card-head">
              <h2>Soalan Saya</h2>
              <p>Item terkini yang anda hasilkan. Item baharu dihantar untuk semakan admin lain.</p>
            </div>
            {recentItems.length === 0 ? (
              <div className="empty-state">Belum ada item dibina.</div>
            ) : (
              <div className="admin-mini-list">
                {recentItems.map((item) => (
                  <Link key={item.id} to={`/masukkan-soalan?id=${item.id}`} className="admin-mini-row">
                    <strong>{item.item_code}</strong>
                    <span>{item.paper === "paper_1" ? "Kertas 1" : "Kertas 2"}</span>
                    <span>{item.status}</span>
                    <span>{stripHtml(item.stem_text || "").slice(0, 90) || "-"}</span>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      <section className="card-block">
        <div className="card-head">
          <h2>Akses Pantas</h2>
          <p>{isPremiumUser ? "Akses premium untuk bina dan simpan lebih banyak set." : "Pilih tindakan utama anda."}</p>
        </div>
        <div className="action-row">
          <Link className="btn btn-primary" to="/builder-set">Bina Set Soalan</Link>
          <Link className="btn btn-light" to="/set-saya">Set Saya</Link>
          {(isAdmin || isMaster) && <Link className="btn btn-light" to="/masukkan-soalan">Masukkan Soalan</Link>}
          {isMaster && <Link className="btn btn-light" to="/import-pukal">Import Pukal</Link>}
          {isMaster && <Link className="btn btn-light" to="/master/users">Pengurusan User</Link>}
        </div>
      </section>
    </div>
  )
}

function DashboardStat({ title, value }: { title: string; value: string | number }) {
  return (
    <div className="card stat-card stat-card-center">
      <h3>{title}</h3>
      <strong>{value}</strong>
    </div>
  )
}

async function countOwnItems(profileId: string, filters: { paper?: string; status?: string }) {
  let query = supabase.from("items").select("id", { count: "exact", head: true }).eq("created_by", profileId)
  if (filters.paper) query = query.eq("paper", filters.paper)
  if (filters.status) query = query.eq("status", filters.status)
  const { count, error } = await query
  if (error) {
    console.warn("Dashboard item count skipped", error)
    return 0
  }
  return count || 0
}

async function countMonthlyAi(profileId: string) {
  const start = new Date()
  start.setDate(1)
  start.setHours(0, 0, 0, 0)
  const { count, error } = await supabase
    .from("ai_usage_logs")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profileId)
    .eq("usage_type", "generate_marking_scheme")
    .gte("created_at", start.toISOString())

  if (error) {
    console.warn("Dashboard AI quota count skipped", error)
    return 0
  }
  return count || 0
}

function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}
