import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth as useUser } from '../contexts/AuthContext';
import type { Profile } from '../types';

export default function MasterAdminDashboard() {
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const { profile } = useUser();

  useEffect(() => {
    void fetchUsers();
  }, []);

  async function fetchUsers() {
    setLoading(true);

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error(error);
    } else {
      setUsers((data as Profile[]) || []);
    }

    setLoading(false);
  }

  async function approveUser(userId: string, masterId: string) {
    const { error } = await supabase
      .from('profiles')
      .update({
        status: 'active',
        approved_by: masterId,
        approved_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (error) {
      console.error(error);
      return;
    }

    void fetchUsers();
  }

  async function suspendUser(userId: string, masterId: string) {
    const { error } = await supabase
      .from('profiles')
      .update({
        status: 'suspended',
        approved_by: masterId,
        approved_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (error) {
      console.error(error);
      return;
    }

    void fetchUsers();
  }

  async function makeAdmin(userId: string) {
    const { error } = await supabase.from('profiles').update({ role: 'admin' }).eq('id', userId);

    if (error) {
      console.error(error);
      return;
    }

    void fetchUsers();
  }

  async function setFull(userId: string) {
    const { error } = await supabase.from('profiles').update({ account_type: 'full' }).eq('id', userId);

    if (error) {
      console.error(error);
      return;
    }

    void fetchUsers();
  }

  async function updateNotes(userId: string, notes: string) {
    const { error } = await supabase.from('profiles').update({ notes }).eq('id', userId);

    if (error) {
      console.error(error);
    }
  }

  if (loading) return <div className="p-6">Loading...</div>;
  if (!profile) return <div className="p-6">Loading...</div>;

  return (
    <div className="p-6">
      <h1 className="mb-6 text-2xl font-bold">Master Admin Dashboard</h1>

      <div className="overflow-x-auto">
        <table className="w-full border">
          <thead className="bg-gray-100">
            <tr>
              <th className="border p-2">Nama</th>
              <th className="border p-2">Email</th>
              <th className="border p-2">Role</th>
              <th className="border p-2">Status</th>
              <th className="border p-2">Account</th>
              <th className="border p-2">Tindakan</th>
            </tr>
          </thead>

          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td className="border p-2">{user.full_name}</td>
                <td className="border p-2">{user.email}</td>
                <td className="border p-2">{user.role}</td>
                <td className="border p-2">{user.status}</td>
                <td className="border p-2">{user.account_type}</td>

                <td className="p-2 border space-x-2">
                  {user.role !== "master_admin" && (
                    <>
                      <button
                        onClick={() => approveUser(user.id, profile.id)}
                        className="bg-green-600 text-white px-2 py-1 rounded"
                      >
                        Aktifkan
                      </button>

                      <button
                        onClick={() => suspendUser(user.id, profile.id)}
                        className="bg-red-600 text-white px-2 py-1 rounded"
                      >
                        Suspend
                      </button>

                      <button
                        onClick={() => makeAdmin(user.id)}
                        className="bg-blue-600 text-white px-2 py-1 rounded"
                      >
                        Jadi Admin
                      </button>

                      <button
                        onClick={() => setFull(user.id)}
                        className="bg-purple-600 text-white px-2 py-1 rounded"
                      >
                        Full
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
