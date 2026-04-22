import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Profile } from '../types';
import { useAuth } from '../contexts/AuthContext';

export function MasterAdminUsersPage() {
  const { profile: currentProfile } = useAuth();
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadUsers = async () => {
    setLoading(true);
    const { data, error: loadError } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    setLoading(false);

    if (loadError) {
      setError(loadError.message);
      return;
    }

    setUsers((data || []) as Profile[]);
  };

  useEffect(() => {
    void loadUsers();
  }, []);

  const upgradeUser = async (id: string) => {
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ account_type: 'full', status: 'active' })
      .eq('id', id);

    if (updateError) {
      alert(updateError.message);
      return;
    }

    await loadUsers();
  };

  if (currentProfile?.role !== 'master_admin') {
    return <div className="card">Akses hanya untuk master admin.</div>;
  }

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <h1>Pengurusan pengguna</h1>
          <p className="muted">Master admin boleh lihat semua pengguna dan upgrade akaun selepas pembayaran.</p>
        </div>
      </div>

      <div className="card">
        {loading ? <p>Loading...</p> : null}
        {error ? <p className="error-text">{error}</p> : null}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nama</th>
                <th>Email</th>
                <th>Role</th>
                <th>Akaun</th>
                <th>Status</th>
                <th>Tindakan</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>{user.full_name || '-'}</td>
                  <td>{user.email || '-'}</td>
                  <td>{user.role}</td>
                  <td>{user.account_type}</td>
                  <td>{user.status}</td>
                  <td>
                    {user.account_type === 'free' ? (
                      <button className="small-btn" onClick={() => void upgradeUser(user.id)}>Upgrade ke full</button>
                    ) : (
                      <span className="muted">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
