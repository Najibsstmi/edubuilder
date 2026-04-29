import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export function AppLayout() {
  const { profile, signOut } = useAuth();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link to="/" className="brand">
          EduBuilder
        </Link>
        <div className="profile-box">
          <div className="profile-name">{profile?.full_name || 'Pengguna'}</div>
          <div className="profile-meta">
            {profile?.role} / {profile?.account_type}
          </div>
          <div className="profile-meta">Status: {profile?.status}</div>
        </div>
        <nav className="nav-list">
          <NavLink to="/">Dashboard</NavLink>
          <NavLink to="/builder-set">Bina Set Soalan</NavLink>
          {(profile?.role === 'admin' || profile?.role === 'master_admin') && (
            <NavLink to="/masukkan-soalan">Masukkan Soalan</NavLink>
          )}
          {(profile?.role === 'admin' || profile?.role === 'master_admin') && (
            <NavLink to="/bank-soalan-admin">Bank Soalan</NavLink>
          )}
          {profile?.role === 'master_admin' && (
            <NavLink to="/master/users">Pengurusan User</NavLink>
          )}
        </nav>
        <button className="ghost-btn" onClick={() => void signOut()}>
          Log keluar
        </button>
      </aside>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
