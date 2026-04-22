import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export function DashboardPage() {
  const { profile } = useAuth();

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <h1>Dashboard EduBuilder</h1>
          <p className="muted">Semua data sistem perlu difilter ikut school_id pengguna.</p>
        </div>
      </div>

      <div className="grid-3">
        <div className="card stat-card">
          <h3>Peranan</h3>
          <strong>{profile?.role}</strong>
        </div>
        <div className="card stat-card">
          <h3>Akaun</h3>
          <strong>{profile?.account_type}</strong>
        </div>
        <div className="card stat-card">
          <h3>Status</h3>
          <strong>{profile?.status}</strong>
        </div>
      </div>

      <div className="card">
        <h2>Akses pantas</h2>
        <div className="action-row">
          <Link className="primary-btn inline-btn" to="/build">Bina set soalan</Link>
          {(profile?.role === 'admin' || profile?.role === 'master_admin') && (
            <Link className="primary-btn inline-btn" to="/admin/items/new">Masukkan soalan</Link>
          )}
          {profile?.role === 'master_admin' && (
            <Link className="primary-btn inline-btn" to="/master/users">Urus pengguna</Link>
          )}
        </div>
      </div>

      <div className="card">
        <h2>Nota implementasi</h2>
        <ul className="simple-list">
          <li>Free guest flow belum dibuat di UI ini. Itu patut dibuat pada landing page berasingan dengan backend guest session.</li>
          <li>Untuk sistem sebenar, data dashboard perlu disambung dengan query ikut school_id.</li>
          <li>Untuk page build, logic limit free/full perlu dirujuk pada guest_usage atau profiles.account_type.</li>
        </ul>
      </div>
    </div>
  );
}
