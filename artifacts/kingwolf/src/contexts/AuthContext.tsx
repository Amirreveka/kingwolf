import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
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
        (async () => { await loadProfile(session.user.id); })();
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function signIn(username: string, password: string): Promise<{ error: string | null; retryAfter?: number }> {
    const email = `${username.toLowerCase()}@kingwolf.internal`;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      const msg = (error as any).message || '';
      const code = (error as any).code || '';
      const status = (error as any).status || 0;
      if (status === 429 || code === 'rate_limited' || msg.includes('rate_limited') || msg.includes('بیش از حد')) {
        const retryAfter = (error as any).retryAfter || 30;
        return { error: `تلاش بیش از حد — ${retryAfter} ثانیه دیگر امتحان کنید`, retryAfter };
      }
      if (msg.includes('pending_approval') || code === 'pending_approval') return { error: 'حساب شما در انتظار تأیید مدیر است' };
      if (msg.includes('banned') || code === 'banned') return { error: 'حساب شما توسط مدیر مسدود شده' };
      return { error: 'نام کاربری یا رمز عبور اشتباه است' };
    }
    return { error: null };
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
