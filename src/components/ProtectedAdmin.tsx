import { Navigate } from 'react-router-dom';
import { useUser } from '../context/UserContext';

export default function ProtectedAdmin({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useUser();

  if (loading) return null;

  if (!profile) return <Navigate to="/login" />;

  if (profile.role !== 'admin' && profile.role !== 'master_admin') {
    return <Navigate to="/" />;
  }

  return <>{children}</>;
}
