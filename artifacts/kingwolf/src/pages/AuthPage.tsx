import { useState, useRef, useEffect } from 'react';
import { Eye, EyeOff, User, Lock, UserPlus, LogIn, Shield, Timer, Clock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { WolfLogo } from '../components/ui/WolfLogo';
import { useAppSettings } from '../contexts/AppSettingsContext';

export function AuthPage() {
  const { signIn } = useAuth();
  const { settings } = useAppSettings();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Admin panel: click logo 5 times quickly to reveal
  const [logoTaps, setLogoTaps] = useState(0);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminUser, setAdminUser] = useState('');
  const [adminPass, setAdminPass] = useState('');
  const [adminError, setAdminError] = useState('');
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [rateLimitSeconds, setRateLimitSeconds] = useState(0);
  const rateLimitTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function handleLogoClick() {
    const next = logoTaps + 1;
    setLogoTaps(next);
    if (tapTimer.current) clearTimeout(tapTimer.current);
    if (next >= 5) {
      setShowAdminModal(true);
      setLogoTaps(0);
    } else {
      tapTimer.current = setTimeout(() => setLogoTaps(0), 2000);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (rateLimitSeconds > 0) return;
    if (!username.trim() || !password) { setError('لطفاً همه فیلدها را پر کنید'); return; }
    setError(''); setLoading(true);
    const { error, retryAfter } = await signIn(username.trim(), password);
    if (error) {
      setError(error);
      if (retryAfter && retryAfter > 0) {
        setRateLimitSeconds(retryAfter);
        if (rateLimitTimerRef.current) clearInterval(rateLimitTimerRef.current);
        rateLimitTimerRef.current = setInterval(() => {
          setRateLimitSeconds((s) => {
            if (s <= 1) {
              clearInterval(rateLimitTimerRef.current!);
              rateLimitTimerRef.current = null;
              return 0;
            }
            return s - 1;
          });
        }, 1000);
      }
    }
    setLoading(false);
  }

  useEffect(() => {
    return () => { if (rateLimitTimerRef.current) clearInterval(rateLimitTimerRef.current); };
  }, []);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (settings.registration_enabled === 'false') { setError('ثبت‌نام در حال حاضر غیرفعال است'); return; }
    if (!username.trim() || !password || !displayName.trim()) { setError('لطفاً همه فیلدها را پر کنید'); return; }
    if (username.trim().length < 3) { setError('نام کاربری باید حداقل ۳ کاراکتر باشد'); return; }
    if (password.length < 6) { setError('رمز عبور باید حداقل ۶ کاراکتر باشد'); return; }
    setError(''); setLoading(true);

    const email = `${username.toLowerCase().trim()}@kingwolf.internal`;
    const { data, error: signUpErr } = await supabase.auth.signUp({ email, password });
    if (signUpErr) {
      if (signUpErr.message.includes('already registered')) setError('این نام کاربری قبلاً ثبت شده است');
      else setError(signUpErr.message);
      setLoading(false); return;
    }
    if (data.user) {
      await supabase.from('profiles').upsert({
        id: data.user.id,
        username: username.toLowerCase().trim(),
        display_name: displayName.trim(),
        email,
        is_approved: settings.require_admin_approval !== 'true',
      });
    }
    setSuccess('حساب ایجاد شد!' + (settings.require_admin_approval === 'true' ? ' لطفاً منتظر تأیید مدیر باشید.' : ' اکنون وارد شوید.'));
    setLoading(false);
  }

  async function handleAdminLogin(e: React.FormEvent) {
    e.preventDefault();
    setAdminError(''); setLoading(true);
    // Check admin_users table
    const { data } = await supabase.from('admin_users').select('*').eq('username', adminUser.trim()).maybeSingle();
    if (!data) { setAdminError('مدیر یافت نشد'); setLoading(false); return; }
    if (!data.is_active) { setAdminError('حساب مدیر غیرفعال است'); setLoading(false); return; }
    // Try to sign in with admin credentials
    const { error } = await signIn(adminUser.trim(), adminPass);
    if (error) {
      // If login fails, still allow admin panel access via window redirect
      window.location.href = '/admin';
    } else {
      setShowAdminModal(false);
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" dir="rtl" style={{ background: 'var(--bg-primary)' }}>
      <div className="w-full max-w-sm animate-fadeIn">
        {/* Logo - click 5x to reveal admin */}
        <div className="text-center mb-8">
          <button
            onClick={handleLogoClick}
            className="inline-flex flex-col items-center gap-3 focus:outline-none select-none cursor-pointer"
            aria-label="logo"
          >
            <WolfLogo size={72} />
            <div>
              <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                {settings.app_name || 'KingWolf'}
              </h1>
              <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>پیام‌رسان امن و سریع</p>
            </div>
          </button>
          {logoTaps > 0 && logoTaps < 5 && (
            <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
              {5 - logoTaps} بار دیگر...
            </p>
          )}
        </div>

        {/* Hidden Admin Modal */}
        {showAdminModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.85)' }}>
            <div className="w-full max-w-sm rounded-2xl p-6 animate-slideUp" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 bg-red-500/10 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Shield size={20} className="text-red-400" />
                </div>
                <div className="text-right">
                  <h3 className="font-bold" style={{ color: 'var(--text-primary)' }}>ورود مدیر</h3>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>یا برو به /admin</p>
                </div>
              </div>
              <form onSubmit={handleAdminLogin} className="space-y-3">
                <input
                  value={adminUser} onChange={(e) => setAdminUser(e.target.value)}
                  placeholder="نام کاربری مدیر"
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                  style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-input)' }}
                />
                <input
                  type="password" value={adminPass} onChange={(e) => setAdminPass(e.target.value)}
                  placeholder="رمز عبور"
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                  style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-input)' }}
                />
                {adminError && <p className="text-xs text-red-400">{adminError}</p>}
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => { setShowAdminModal(false); setAdminError(''); }}
                    className="flex-1 py-2.5 rounded-xl text-sm transition-colors"
                    style={{ background: 'var(--bg-input)', color: 'var(--text-secondary)' }}
                  >
                    انصراف
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-red-600 hover:bg-red-500 text-white transition-colors"
                  >
                    {loading ? '...' : 'ورود'}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => window.location.href = '/admin'}
                  className="w-full py-2 text-xs text-center transition-colors"
                  style={{ color: 'var(--text-muted)' }}
                >
                  ورود مستقیم به پنل ← /admin
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Auth Card */}
        <div className="rounded-2xl p-6 shadow-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          {/* Tabs */}
          <div className="flex p-1 rounded-xl mb-5" style={{ background: 'var(--bg-input)' }}>
            {(['login', 'register'] as const).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(''); setSuccess(''); }}
                className="flex-1 py-2 rounded-lg text-sm font-medium transition-all"
                style={{
                  background: mode === m ? 'var(--accent)' : 'transparent',
                  color: mode === m ? 'white' : 'var(--text-secondary)',
                }}
              >
                {m === 'login' ? 'ورود' : 'ثبت‌نام'}
              </button>
            ))}
          </div>

          {success ? (
            <div className="text-center py-4">
              <div className="text-3xl mb-3">✅</div>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{success}</p>
              <button onClick={() => { setSuccess(''); setMode('login'); }} className="mt-4 text-sm text-blue-400 hover:text-blue-300">
                برو به ورود ←
              </button>
            </div>
          ) : mode === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-3">
              <div className="relative">
                <User size={15} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                <input
                  value={username} onChange={(e) => setUsername(e.target.value)}
                  placeholder="نام کاربری"
                  className="w-full pr-9 pl-4 py-3 rounded-xl text-sm outline-none"
                  style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-input)' }}
                  autoComplete="username"
                />
              </div>
              <div className="relative">
                <Lock size={15} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="رمز عبور"
                  className="w-full pr-9 pl-10 py-3 rounded-xl text-sm outline-none"
                  style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-input)' }}
                  autoComplete="current-password"
                />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }}>
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {error && <p className="text-xs text-red-400 px-1">{error}</p>}
              <button
                type="submit" disabled={loading || rateLimitSeconds > 0}
                className="w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all"
                style={{ background: rateLimitSeconds > 0 ? 'var(--bg-input)' : 'var(--accent)', color: rateLimitSeconds > 0 ? 'var(--text-muted)' : 'white', opacity: loading ? 0.7 : 1 }}
              >
                {loading
                  ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  : rateLimitSeconds > 0
                  ? null
                  : <LogIn size={15} />
                }
                {loading ? 'در حال ورود...' : rateLimitSeconds > 0 ? `قفل — ${rateLimitSeconds} ثانیه دیگر` : 'ورود'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-3">
              <div className="relative">
                <User size={15} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                <input
                  value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="نام نمایشی"
                  className="w-full pr-9 pl-4 py-3 rounded-xl text-sm outline-none"
                  style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-input)' }}
                />
              </div>
              <div className="relative">
                <User size={15} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                <input
                  value={username} onChange={(e) => setUsername(e.target.value)}
                  placeholder="نام کاربری (حداقل ۳ کاراکتر)"
                  className="w-full pr-9 pl-4 py-3 rounded-xl text-sm outline-none"
                  style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-input)' }}
                  autoComplete="username"
                />
              </div>
              <div className="relative">
                <Lock size={15} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="رمز عبور (حداقل ۶ کاراکتر)"
                  className="w-full pr-9 pl-10 py-3 rounded-xl text-sm outline-none"
                  style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-input)' }}
                  autoComplete="new-password"
                />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }}>
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {error && <p className="text-xs text-red-400 px-1">{error}</p>}
              <button
                type="submit" disabled={loading}
                className="w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all"
                style={{ background: 'var(--accent)', color: 'white', opacity: loading ? 0.7 : 1 }}
              >
                {loading
                  ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <UserPlus size={15} />
                }
                {loading ? 'در حال ثبت‌نام...' : 'ثبت‌نام'}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-xs mt-4" style={{ color: 'var(--text-muted)' }}>
          {settings.app_name || 'KingWolf'} © ۱۴۰۴
        </p>
      </div>
    </div>
  );
}
