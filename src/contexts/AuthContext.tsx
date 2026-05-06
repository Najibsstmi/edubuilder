import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Profile } from '../types';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signInAsGuest: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const GUEST_SESSION_KEY = 'edubuilder_guest_session';

function createGuestProfile(): Profile {
  return {
    id: 'guest-local',
    full_name: 'Tetamu EduBuilder',
    email: null,
    role: 'user',
    account_type: 'free',
    status: 'active',
    school_id: null,
    state_name: null,
    ppd_name: null,
    school_type: null,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = async () => {
    const { data } = await supabase.auth.getUser();
    const currentUser = data.user;
    setUser(currentUser ?? null);

    if (localStorage.getItem(GUEST_SESSION_KEY) === 'true') {
      setProfile(createGuestProfile());
      return;
    }

    if (!currentUser) {
      setProfile(null);
      return;
    }

    const { data: profileData, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', currentUser.id)
      .single();

    if (error) {
      console.error('Profile fetch error', error);
      setProfile(null);
      return;
    }

    setProfile(profileData as Profile);
  };

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(data.session ?? null);
      setUser(data.session?.user ?? null);
      if (!data.session && localStorage.getItem(GUEST_SESSION_KEY) === 'true') {
        setProfile(createGuestProfile());
      } else {
        await refreshProfile();
      }
      if (mounted) setLoading(false);
    };

    void init();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      void refreshProfile();
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    localStorage.removeItem(GUEST_SESSION_KEY);
    await supabase.auth.signOut();
    setProfile(null);
  };

  const signInAsGuest = async () => {
    localStorage.setItem(GUEST_SESSION_KEY, 'true');

    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) {
      console.warn('Anonymous guest sign-in failed, falling back to local guest session', error);
      setSession(null);
      setUser(null);
    } else {
      setSession(data.session ?? null);
      setUser(data.user ?? null);
    }

    setProfile(createGuestProfile());
  };

  const value = useMemo(
    () => ({ user, session, profile, loading, signInAsGuest, refreshProfile, signOut }),
    [user, session, profile, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
}
