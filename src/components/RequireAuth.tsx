import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div className="center-screen">Checking session...</div>;
  if (!user && !profile) return <Navigate to="/login" state={{ from: location }} replace />;
  return <>{children}</>;
}
