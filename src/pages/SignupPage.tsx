import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { BrandLogo } from '../components/BrandLogo';
import { PremiumContactCard } from '../components/PremiumContactCard';
import type { School } from '../types';

function getSignupErrorMessage(message = '') {
  const normalized = message.toLowerCase();

  if (
    normalized.includes('already') ||
    normalized.includes('registered') ||
    normalized.includes('exists') ||
    normalized.includes('user already')
  ) {
    return 'Email ini sudah berdaftar. Sila log masuk atau guna Lupa kata laluan.';
  }

  if (
    normalized.includes('rate limit') ||
    normalized.includes('too many') ||
    normalized.includes('over email send') ||
    normalized.includes('email rate')
  ) {
    return 'Had pendaftaran/email Supabase sedang tinggi kerana ramai daftar serentak. Sila tunggu 2-5 minit dan cuba semula, atau hubungi master admin.';
  }

  if (normalized.includes('email not confirmed') || normalized.includes('not confirmed')) {
    return 'Email ini sudah didaftarkan tetapi belum disahkan. Sila semak inbox/spam atau hubungi master admin.';
  }

  return message || 'Signup gagal. Sila semak maklumat dan cuba semula.';
}

export function SignupPage() {
  const navigate = useNavigate();
  const [schools, setSchools] = useState<School[]>([]);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selectedState, setSelectedState] = useState('');
  const [selectedPpd, setSelectedPpd] = useState('');
  const [selectedSchoolId, setSelectedSchoolId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadSchools = async () => {
      const { data, error: loadError } = await supabase
        .from('schools')
        .select('*')
        .eq('is_active', true)
        .eq('is_secondary', true)
        .order('state_name', { ascending: true })
        .order('ppd_name', { ascending: true })
        .order('school_name', { ascending: true });

      if (loadError) {
        setError(loadError.message);
        return;
      }

      setSchools((data || []) as School[]);
    };

    void loadSchools();
  }, []);

  const stateOptions = useMemo(
    () => Array.from(new Set(schools.map((s) => s.state_name).filter(Boolean))) as string[],
    [schools],
  );

  const ppdOptions = useMemo(
    () => Array.from(new Set(schools.filter((s) => s.state_name === selectedState).map((s) => s.ppd_name).filter(Boolean))) as string[],
    [schools, selectedState],
  );

  const schoolOptions = useMemo(
    () => schools.filter((s) => s.state_name === selectedState && s.ppd_name === selectedPpd),
    [schools, selectedState, selectedPpd],
  );

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const selectedSchool = schools.find((s) => s.id === selectedSchoolId);
    if (!selectedSchool) {
      setLoading(false);
      setError('Sila pilih sekolah.');
      return;
    }

    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/login`,
        data: {
          full_name: fullName.trim(),
          school_id: selectedSchool.id,
          state_name: selectedSchool.state_name,
          ppd_name: selectedSchool.ppd_name,
          school_type: selectedSchool.school_type,
        },
      },
    });

    setLoading(false);

    if (signUpError) {
      console.error(signUpError);
      setError(getSignupErrorMessage(signUpError.message));
      return;
    }

    navigate('/login');
  };

  return (
    <div className="auth-page">
      <form className="card auth-card wide" onSubmit={onSubmit}>
        <BrandLogo centered to="/signup" />
        <h1>Daftar EduBuilder</h1>
        <label>
          Nama penuh
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        </label>
        <label>
          Email
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
        </label>
        <label>
          Kata laluan
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" minLength={6} required />
        </label>
        <div className="grid-3">
          <label>
            Negeri
            <select value={selectedState} onChange={(e) => { setSelectedState(e.target.value); setSelectedPpd(''); setSelectedSchoolId(''); }} required>
              <option value="">Pilih negeri</option>
              {stateOptions.map((state) => <option key={state} value={state}>{state}</option>)}
            </select>
          </label>
          <label>
            PPD
            <select value={selectedPpd} onChange={(e) => { setSelectedPpd(e.target.value); setSelectedSchoolId(''); }} required disabled={!selectedState}>
              <option value="">Pilih PPD</option>
              {ppdOptions.map((ppd) => <option key={ppd} value={ppd}>{ppd}</option>)}
            </select>
          </label>
          <label>
            Sekolah
            <select value={selectedSchoolId} onChange={(e) => setSelectedSchoolId(e.target.value)} required disabled={!selectedPpd}>
              <option value="">Pilih sekolah</option>
              {schoolOptions.map((school) => <option key={school.id} value={school.id}>{school.school_name}</option>)}
            </select>
          </label>
        </div>
        <p className="muted small">User pertama bagi sesebuah sekolah akan diaktifkan sebagai admin sekolah secara automatik. User seterusnya akan jadi pending dahulu.</p>
        {error && <p className="error-text">{error}</p>}
        <button className="primary-btn" disabled={loading}>{loading ? 'Sedang daftar...' : 'Daftar Akaun'}</button>
        <p className="muted">Dah ada akaun? <Link to="/login">Login</Link></p>
        <PremiumContactCard compact />
      </form>
    </div>
  );
}
