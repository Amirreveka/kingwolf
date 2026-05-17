import { useState, useRef, useEffect } from 'react';
import { Eye, EyeOff, User, Lock, UserPlus, LogIn, Shield, Phone, Mail } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { WolfLogo } from '../components/ui/WolfLogo';
import { useAppSettings } from '../contexts/AppSettingsContext';

function loadGoogleScript() {
  if (typeof window === 'undefined') return;
  if (document.getElementById('google-gsi')) return;
  const script = document.createElement('script');
  script.id = 'google-gsi';
  script.src = 'https://accounts.google.com/gsi/client';
  script.async = true;
  script.defer = true;
  document.head.appendChild(script);
}

export function AuthPage() {
  const { signIn } = useAuth();
  const { settings } = useAppSettings();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
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

  useEffect(() => { loadGoogleScript(); }, []);

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

  async function handleGoogleSignIn() {
    const clientId = (window as any).__GOOGLE_CLIENT_ID__ || import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
    if (!clientId) {
      setError('برای فعال‌سازی ورود با گوگل، Client ID را در تنظیمات سرور وارد کنید');
      return;
    }

    (window as any).google?.accounts.id.initialize({
      client_id: clientId,
      callback: async (response: any) => {
        if (!response.credential) return;
        setLoading(true);
        try {
          const res = await fetch('/api/auth/google', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ credential: response.credential }),
          });
          const data = await res.json();
          if (data.token) {
            localStorage.setItem('kingwolf_token', data.token);
          } else {
            setError(data.error || 'ورود با گوگل ناموفق بود');
          }
        } catch {
          setError('ورود با گوگل ناموفق بود');
        }
        setLoading(false);
      },
      auto_select: false,
    });
    (window as any).google?.accounts.id.prompt();
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
    if (!email || !phone) { setError('ایمیل و شماره تلفن الزامی است'); return; }
    if (username.trim().length < 3) { setError('نام کاربری باید حداقل ۳ کاراکتر باشد'); return; }
    if (password.length < 6) { setError('رمز عبور باید حداقل ۶ کاراکتر باشد'); return; }
    setError(''); setLoading(true);

    const { data, error: signUpErr } = await supabase.auth.signUp({ email, password });
    if (signUpErr) {
      if (signUpErr.message.includes('already registered')) setError('این ایمیل قبلاً ثبت شده است');
      else setError(signUpErr.message);
      setLoading(false); return;
    }
    if (data.user) {
      await supabase.from('profiles').upsert({
        id: data.user.id,
        username: username.toLowerCase().trim(),
        display_name: displayName.trim(),
        email,
        phone,
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
                  placeholder="نام کاربری، ایمیل یا تلفن"
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

              {/* Divider */}
              <div className="flex items-center gap-3 my-2">
                <div className="flex-1 h-px" style={{ background: 'var(--border-color)' }} />
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>یا</span>
                <div className="flex-1 h-px" style={{ background: 'var(--border-color)' }} />
              </div>

              {/* Google Sign-in Button */}
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-xl border border-[var(--border-color)] bg-white hover:bg-gray-50 text-gray-800 font-medium text-sm transition-all duration-200 active:scale-95"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z"/>
                  <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 0 1-7.18-2.54H1.83v2.07A8 8 0 0 0 8.98 17z"/>
                  <path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 0 1 0-3.04V5.41H1.83a8 8 0 0 0 0 7.18l2.67-2.07z"/>
                  <path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 0 0 1.83 5.4L4.5 7.49a4.77 4.77 0 0 1 4.48-3.3z"/>
                </svg>
                ورود با گوگل
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
                <Mail size={15} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                <input
                  type="email"
                  value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="ایمیل"
                  required
                  className="w-full pr-9 pl-4 py-3 rounded-xl text-sm outline-none"
                  style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-input)' }}
                  autoComplete="email"
                />
              </div>
              <div className="relative">
                <Phone size={15} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                <input
                  type="tel"
                  value={phone} onChange={(e) => setPhone(e.target.value)}
                  placeholder="شماره تلفن (مثلاً ۰۹۱۲۳۴۵۶۷۸۹)"
                  required
                  className="w-full pr-9 pl-4 py-3 rounded-xl text-sm outline-none"
                  style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-input)' }}
                  autoComplete="tel"
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
