import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { AppLayout } from './components/AppLayout';
import { RequireAuth } from './components/RequireAuth';
import ProtectedMaster from './components/ProtectedMaster';
import ProtectedAdmin from './components/ProtectedAdmin';
import { LoginPage } from './pages/LoginPage';
import { SignupPage } from './pages/SignupPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { DashboardPage } from './pages/DashboardPage';
import { MasterAdminUsersPage } from './pages/MasterAdminUsersPage';
import MasterAdminDashboard from './pages/MasterAdminDashboard';
import ItemFormPage from './pages/ItemFormPage';
import BankSoalanAdmin from './pages/BankSoalanAdmin';
import BuilderSetSoalan from './pages/BuilderSetSoalan';
import MyProfilePage from './pages/MyProfilePage';
import SavedSetsPage from './pages/SavedSetsPage';
import BulkImportPage from './pages/BulkImportPage';

export default function App() {
  const { loading } = useAuth();

  if (loading) {
    return <div className="center-screen">Loading EduBuilder...</div>;
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="profil-saya" element={<MyProfilePage />} />
        <Route
          path="master-admin"
          element={
            <ProtectedMaster>
              <MasterAdminDashboard />
            </ProtectedMaster>
          }
        />
        <Route path="master/users" element={<MasterAdminUsersPage />} />
        <Route path="admin/items/new" element={<Navigate to="/masukkan-soalan" replace />} />
        <Route
          path="masukkan-soalan"
          element={
            <ProtectedAdmin>
              <ItemFormPage />
            </ProtectedAdmin>
          }
        />
        <Route
          path="import-pukal"
          element={
            <ProtectedAdmin>
              <BulkImportPage />
            </ProtectedAdmin>
          }
        />
        <Route path="build" element={<Navigate to="/builder-set" replace />} />
        <Route path="set-saya" element={<SavedSetsPage />} />
        <Route
          path="bank-soalan-admin"
          element={
            <ProtectedAdmin>
              <BankSoalanAdmin />
            </ProtectedAdmin>
          }
        />
        <Route path="builder-set" element={<BuilderSetSoalan />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
