import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase, subscribePush } from '../lib/supabase';
import { Profile } from '../types';

interface User { id: string; email?: string; [key: string]: any; }
interface Session { user: User; [key: string]: any; }

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (username: string, password: string) => Promise<{ error: string | null; retryAfter?: number }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadProfile(userId: string) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (data) setProfile(data as Profile);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) loadProfile(session.user.id).finally(() => setLoading(false));
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        (async () => {
          await loadProfile(session.user.id);
          subscribePush().catch(() => {});
        })();
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function signIn(username: string, password: string): Promise<{ error: string | null; retryAfter?: number }> {
    try {
      const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api';
      const res = await fetch(`${API_BASE}/auth/signin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.toLowerCase().trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = data.error || '';
        if (res.status === 429) return { error: `تلاش بیش از حد — ${data.retryAfter || 30} ثانیه دیگر امتحان کنید`, retryAfter: data.retryAfter || 30 };
        if (msg === 'pending_approval') return { error: 'حساب شما در انتظار تأیید مدیر است' };
        if (msg === 'banned') return { error: 'حساب شما توسط مدیر مسدود شده' };
        return { error: 'نام کاربری یا رمز عبور اشتباه است' };
      }
      localStorage.setItem('kingwolf_token', data.access_token);
      if (data.user) {
        setUser(data.user);
        setSession({ user: data.user });
        await loadProfile(data.user.id);
        subscribePush().catch(() => {});
      }
      return { error: null };
    } catch {
      return { error: 'خطا در اتصال به سرور' };
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    setProfile(null);
  }

  async function refreshProfile() {
    if (user) await loadProfile(user.id);
  }

  return (
    <AuthContext.Provider value={{ user, session, profile, loading, signIn, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
