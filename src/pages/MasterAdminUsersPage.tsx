import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Profile } from '../types';
import { useAuth as useUser } from '../contexts/AuthContext';

export function MasterAdminUsersPage() {
  const { profile } = useUser();
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

  async function updateUser(id: string, updates: Record<string, any>) {
    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', id);

    if (error) {
      console.error(error);
      alert('Gagal kemas kini pengguna');
      return;
    }

    await loadUsers();
  }

  async function activateUser(userId: string, masterId: string) {
    await updateUser(userId, {
      status: 'active',
      approved_by: masterId,
      approved_at: new Date().toISOString(),
    });
  }

  async function suspendUser(userId: string, masterId: string) {
    await updateUser(userId, {
      status: 'suspended',
      approved_by: masterId,
      approved_at: new Date().toISOString(),
    });
  }

  async function makeAdmin(userId: string) {
    await updateUser(userId, {
      role: 'admin',
    });
  }

  async function makeUser(userId: string) {
    await updateUser(userId, {
      role: 'user',
    });
  }

  async function makeFull(userId: string) {
    await updateUser(userId, {
      account_type: 'full',
    });
  }

  async function makeFree(userId: string) {
    await updateUser(userId, {
      account_type: 'free',
    });
  }

  function statusBadge(status: string) {
    const styles: Record<string, string> = {
      active: 'bg-green-100 text-green-700',
      pending: 'bg-yellow-100 text-yellow-700',
      suspended: 'bg-red-100 text-red-700',
    };

    return (
      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${styles[status] || 'bg-gray-100 text-gray-700'}`}>
        {status}
      </span>
    );
  }

  function roleBadge(role: string) {
    const styles: Record<string, string> = {
      master_admin: 'bg-purple-100 text-purple-700',
      admin: 'bg-blue-100 text-blue-700',
      user: 'bg-gray-100 text-gray-700',
    };

    return (
      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${styles[role] || 'bg-gray-100 text-gray-700'}`}>
        {role}
      </span>
    );
  }

  function accountBadge(type: string) {
    const styles: Record<string, string> = {
      full: 'bg-emerald-100 text-emerald-700',
      free: 'bg-orange-100 text-orange-700',
    };

    return (
      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${styles[type] || 'bg-gray-100 text-gray-700'}`}>
        {type}
      </span>
    );
  }

  if (profile?.role !== 'master_admin') {
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
                  <td className="p-3 border">{roleBadge(user.role)}</td>
                  <td className="p-3 border">{accountBadge(user.account_type)}</td>
                  <td className="p-3 border">{statusBadge(user.status)}</td>
                  <td className="p-3 border">
                    {user.role !== "master_admin" ? (
                      <div className="flex flex-wrap gap-2">
                        {user.status !== "active" ? (
                          <button
                            onClick={() => activateUser(user.id, profile.id)}
                            className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm"
                          >
                            Aktifkan
                          </button>
                        ) : (
                          <button
                            onClick={() => suspendUser(user.id, profile.id)}
                            className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm"
                          >
                            Suspend
                          </button>
                        )}

                        {user.role !== "admin" ? (
                          <button
                            onClick={() => makeAdmin(user.id)}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm"
                          >
                            Jadi Admin
                          </button>
                        ) : (
                          <button
                            onClick={() => makeUser(user.id)}
                            className="bg-slate-600 hover:bg-slate-700 text-white px-3 py-1 rounded text-sm"
                          >
                            Jadi User
                          </button>
                        )}

                        {user.account_type !== "full" ? (
                          <button
                            onClick={() => makeFull(user.id)}
                            className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 rounded text-sm"
                          >
                            Full
                          </button>
                        ) : (
                          <button
                            onClick={() => makeFree(user.id)}
                            className="bg-amber-500 hover:bg-amber-600 text-black px-3 py-1 rounded text-sm"
                          >
                            Free
                          </button>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-400">-</span>
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
