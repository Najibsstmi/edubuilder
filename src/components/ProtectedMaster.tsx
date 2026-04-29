import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function ProtectedMaster({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();

  if (!profile) return null;

  if (profile.role !== 'master_admin' || profile.status !== 'active') {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
