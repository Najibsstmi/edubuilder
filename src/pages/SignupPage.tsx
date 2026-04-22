import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { School } from '../types';

async function applyPostSignupLogic(userId: string, schoolId: string, school: School) {
  const { count, error: countError } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('school_id', schoolId)
    .eq('role', 'admin')
    .eq('status', 'active');

  if (countError) throw countError;

  const firstAdminForSchool = !count || count === 0;
  const payload = firstAdminForSchool
    ? { school_id: schoolId, role: 'admin', status: 'active', account_type: 'full', state_name: school.state_name, ppd_name: school.ppd_name, school_type: school.school_type }
    : { school_id: schoolId, role: 'user', status: 'pending', account_type: 'free', state_name: school.state_name, ppd_name: school.ppd_name, school_type: school.school_type };

  const { error: updateError } = await supabase.from('profiles').update(payload).eq('id', userId);
  if (updateError) throw updateError;
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

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
      },
    });

    if (signUpError || !data.user) {
      setLoading(false);
      setError(signUpError?.message || 'Signup gagal.');
      return;
    }

    try {
      await applyPostSignupLogic(data.user.id, selectedSchool.id, selectedSchool);
      navigate('/login');
    } catch (signupLogicError) {
      console.error(signupLogicError);
      setError('Akaun berjaya dicipta tetapi gagal lengkapkan profil. Semak RLS atau profile table.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="card auth-card wide" onSubmit={onSubmit}>
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
      </form>
    </div>
  );
}
