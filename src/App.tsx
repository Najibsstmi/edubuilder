import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { AppLayout } from './components/AppLayout';
import { RequireAuth } from './components/RequireAuth';
import ProtectedMaster from './components/ProtectedMaster';
import ProtectedAdmin from './components/ProtectedAdmin';
import { LoginPage } from './pages/LoginPage';
import { SignupPage } from './pages/SignupPage';
import { DashboardPage } from './pages/DashboardPage';
import { MasterAdminUsersPage } from './pages/MasterAdminUsersPage';
import MasterAdminDashboard from './pages/MasterAdminDashboard';
import { AdminItemCreatePage } from './pages/AdminItemCreatePage';
import ItemFormPage from './pages/ItemFormPage';
import { BuildPaperPage } from './pages/BuildPaperPage';

export default function App() {
  const { loading } = useAuth();

  if (loading) {
    return <div className="center-screen">Loading EduBuilder...</div>;
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route
          path="master-admin"
          element={
            <ProtectedMaster>
              <MasterAdminDashboard />
            </ProtectedMaster>
          }
        />
        <Route path="master/users" element={<MasterAdminUsersPage />} />
        <Route path="admin/items/new" element={<AdminItemCreatePage />} />
        <Route
          path="masukkan-soalan"
          element={
            <ProtectedAdmin>
              <ItemFormPage />
            </ProtectedAdmin>
          }
        />
        <Route path="build" element={<BuildPaperPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
