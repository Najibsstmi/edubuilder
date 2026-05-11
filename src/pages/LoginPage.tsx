import { FormEvent, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { BrandLogo } from '../components/BrandLogo';
import { useAuth } from '../contexts/AuthContext';
import { PremiumContactCard } from '../components/PremiumContactCard';

function getLoginErrorMessage(message = '') {
  const normalized = message.toLowerCase();

  if (normalized.includes('email not confirmed') || normalized.includes('not confirmed')) {
    return 'Email belum disahkan di Supabase Auth. Semak inbox/spam untuk pautan pengesahan atau hubungi master admin.';
  }

  if (
    normalized.includes('invalid login') ||
    normalized.includes('invalid email') ||
    normalized.includes('invalid credentials')
  ) {
    return 'Email atau kata laluan tidak tepat. Jika akaun baru didaftarkan, pastikan email sudah disahkan dahulu.';
  }

  return message || 'Login gagal. Sila cuba semula.';
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signInAsGuest } = useAuth();
  const from = (location.state as { from?: { pathname?: string } })?.from?.pathname || '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (signInError) {
      setError(getLoginErrorMessage(signInError.message));
      return;
    }

    navigate(from, { replace: true });
  };

  const enterAsGuest = async () => {
    setLoading(true);
    setError('');
    await signInAsGuest();
    setLoading(false);
    navigate('/', { replace: true });
  };

  return (
    <div className="auth-page">
      <form className="card auth-card" onSubmit={onSubmit}>
        <BrandLogo centered to="/login" />
        <h1>Log masuk EduBuilder</h1>
        <label>
          Email
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
        </label>
        <label>
          Kata laluan
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
        </label>
        <p className="auth-helper">
          <Link to="/forgot-password">Lupa kata laluan?</Link>
        </p>
        {error && <p className="error-text">{error}</p>}
        <div className="auth-actions">
          <button className="primary-btn" disabled={loading}>{loading ? 'Sedang login...' : 'Login'}</button>
          <button type="button" className="ghost-btn" onClick={enterAsGuest}>
            Masuk sebagai tetamu
          </button>
        </div>
        <p className="muted signup-cta-text">
          Belum ada akaun? <Link to="/signup">Daftar di sini</Link>
        </p>
        <PremiumContactCard compact />
      </form>
    </div>
  );
}
