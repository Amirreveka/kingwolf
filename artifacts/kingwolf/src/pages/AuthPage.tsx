import { useState, useRef, useEffect } from 'react';
import { Eye, EyeOff, User, Lock, UserPlus, LogIn, Shield, Phone, Mail, Sparkles } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { WolfLogo } from '../components/ui/WolfLogo';
import { useAppSettings } from '../contexts/AppSettingsContext';

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

  // Tap logo 5x to reveal admin modal
  const [logoTaps, setLogoTaps] = useState(0);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminUser, setAdminUser] = useState('');
  const [adminPass, setAdminPass] = useState('');
  const [adminError, setAdminError] = useState('');
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [rateLimitSeconds, setRateLimitSeconds] = useState(0);
  const rateLimitTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (rateLimitTimerRef.current) clearInterval(rateLimitTimerRef.current);
  }, []);

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
          setRateLimitSeconds(s => {
            if (s <= 1) { clearInterval(rateLimitTimerRef.current!); rateLimitTimerRef.current = null; return 0; }
            return s - 1;
          });
        }, 1000);
      }
    }
    setLoading(false);
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (settings.registration_enabled === 'false') { setError('ثبت‌نام در حال حاضر غیرفعال است'); return; }
    if (!username.trim() || !password || !displayName.trim()) { setError('لطفاً همه فیلدها را پر کنید'); return; }
    if (username.trim().length < 3) { setError('نام کاربری باید حداقل ۳ کاراکتر باشد'); return; }
    if (password.length < 6) { setError('رمز عبور باید حداقل ۶ کاراکتر باشد'); return; }
    setError(''); setLoading(true);
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.toLowerCase().trim(),
          password,
          display_name: displayName.trim(),
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'خطا در ثبت‌نام');
      } else if (data.token) {
        localStorage.setItem('kingwolf_token', data.token);
        window.location.reload();
      } else {
        setSuccess(
          settings.require_admin_approval === 'true'
            ? 'حساب ایجاد شد! لطفاً منتظر تأیید مدیر باشید.'
            : 'حساب ایجاد شد! اکنون وارد شوید.'
        );
      }
    } catch {
      setError('خطا در اتصال به سرور');
    }
    setLoading(false);
  }

  async function handleAdminLogin(e: React.FormEvent) {
    e.preventDefault();
    setAdminError(''); setLoading(true);
    const { error } = await signIn(adminUser.trim(), adminPass);
    if (error) {
      setAdminError(error);
    } else {
      setShowAdminModal(false);
      window.location.href = '/admin';
    }
    setLoading(false);
  }

  const appName = settings.app_name || 'KingWolf';

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden"
      dir="rtl"
      style={{ background: 'linear-gradient(145deg, #020817 0%, #0d0d2b 40%, #1a0038 70%, #0a0518 100%)' }}
    >
      {/* Ambient glows */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div style={{ position: 'absolute', top: '-15%', left: '50%', transform: 'translateX(-50%)', width: 700, height: 400, background: 'radial-gradient(ellipse, rgba(124,58,237,0.18) 0%, transparent 65%)', borderRadius: '50%' }} />
        <div style={{ position: 'absolute', bottom: '-10%', left: '10%', width: 500, height: 300, background: 'radial-gradient(ellipse, rgba(37,99,235,0.12) 0%, transparent 70%)', borderRadius: '50%' }} />
        <div style={{ position: 'absolute', top: '25%', right: '5%', width: 350, height: 350, background: 'radial-gradient(ellipse, rgba(168,85,247,0.1) 0%, transparent 70%)', borderRadius: '50%' }} />
        <div style={{ position: 'absolute', top: '60%', left: '5%', width: 280, height: 280, background: 'radial-gradient(ellipse, rgba(79,70,229,0.08) 0%, transparent 70%)', borderRadius: '50%' }} />
        <div style={{ position: 'absolute', top: '5%', right: '15%', width: 200, height: 200, background: 'radial-gradient(ellipse, rgba(196,181,253,0.06) 0%, transparent 70%)', borderRadius: '50%' }} />
        {/* Fine grid overlay */}
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(139,92,246,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(139,92,246,0.03) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <button
            onClick={handleLogoClick}
            className="inline-flex flex-col items-center gap-4 focus:outline-none select-none cursor-pointer"
            aria-label="logo"
          >
            <div className="relative">
              <div style={{ position: 'absolute', inset: -8, borderRadius: '50%', background: 'radial-gradient(circle, rgba(168,85,247,0.25) 0%, transparent 70%)', filter: 'blur(8px)' }} />
              <WolfLogo size={80} glow animated />
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tight" style={{ background: 'linear-gradient(135deg, #c084fc, #818cf8, #60a5fa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                {appName}
              </h1>
              <p className="text-sm mt-1.5 flex items-center justify-center gap-1.5" style={{ color: 'rgba(167,139,250,0.7)' }}>
                <Sparkles size={12} />
                پیام‌رسان امن و سریع
              </p>
            </div>
          </button>
          {logoTaps > 0 && logoTaps < 5 && (
            <p className="text-xs mt-3" style={{ color: 'rgba(107,114,128,0.7)' }}>
              {5 - logoTaps} بار دیگر...
            </p>
          )}
        </div>

        {/* Card */}
        <div
          className="rounded-3xl p-6 shadow-2xl"
          style={{
            background: 'rgba(15,10,30,0.75)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            border: '1px solid rgba(139,92,246,0.2)',
            boxShadow: '0 25px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)',
          }}
        >
          {/* Tab switcher */}
          <div
            className="flex p-1 rounded-2xl mb-6"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            {(['login', 'register'] as const).map(m => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(''); setSuccess(''); }}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200"
                style={{
                  background: mode === m ? 'linear-gradient(135deg, #7c3aed, #4f46e5)' : 'transparent',
                  color: mode === m ? '#fff' : 'rgba(156,163,175,0.8)',
                  boxShadow: mode === m ? '0 4px 16px rgba(124,58,237,0.35)' : 'none',
                }}
              >
                {m === 'login' ? 'ورود' : 'ثبت‌نام'}
              </button>
            ))}
          </div>

          {success ? (
            <div className="text-center py-6">
              <div className="text-5xl mb-4">✅</div>
              <p className="text-sm leading-relaxed" style={{ color: 'rgba(209,213,219,0.9)' }}>{success}</p>
              <button
                onClick={() => { setSuccess(''); setMode('login'); }}
                className="mt-5 text-sm font-medium transition-colors"
                style={{ color: '#a78bfa' }}
              >
                برو به ورود ←
              </button>
            </div>
          ) : mode === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-3">
              <InputField icon={<User size={15} />} placeholder="نام کاربری، ایمیل یا تلفن" value={username} onChange={setUsername} autoComplete="username" />
              <PasswordField placeholder="رمز عبور" value={password} onChange={setPassword} showPw={showPw} setShowPw={setShowPw} autoComplete="current-password" />
              {error && <ErrorMsg>{error}</ErrorMsg>}
              <SubmitBtn loading={loading} disabled={rateLimitSeconds > 0}>
                {loading ? 'در حال ورود...' : rateLimitSeconds > 0 ? `قفل — ${rateLimitSeconds} ثانیه دیگر` : (
                  <span className="flex items-center gap-2"><LogIn size={15} />ورود</span>
                )}
              </SubmitBtn>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-3">
              <InputField icon={<User size={15} />} placeholder="نام نمایشی" value={displayName} onChange={setDisplayName} />
              <InputField icon={<User size={15} />} placeholder="نام کاربری (حداقل ۳ کاراکتر)" value={username} onChange={setUsername} autoComplete="username" />
              <InputField icon={<Mail size={15} />} placeholder="ایمیل" value={email} onChange={setEmail} type="email" autoComplete="email" label="ایمیل (اختیاری)" />
              <InputField icon={<Phone size={15} />} placeholder="شماره تلفن" value={phone} onChange={setPhone} type="tel" autoComplete="tel" label="شماره تلفن (اختیاری)" />
              <PasswordField placeholder="رمز عبور (حداقل ۶ کاراکتر)" value={password} onChange={setPassword} showPw={showPw} setShowPw={setShowPw} autoComplete="new-password" />
              {error && <ErrorMsg>{error}</ErrorMsg>}
              <SubmitBtn loading={loading}>
                {loading ? 'در حال ثبت‌نام...' : (
                  <span className="flex items-center gap-2"><UserPlus size={15} />ثبت‌نام</span>
                )}
              </SubmitBtn>
            </form>
          )}
        </div>

        <p className="text-center text-xs mt-5" style={{ color: 'rgba(75,85,99,0.8)' }}>
          {appName} © 2026
        </p>
      </div>

      {/* Admin Modal */}
      {showAdminModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)' }}>
          <div
            className="w-full max-w-xs rounded-3xl p-6"
            style={{
              background: 'rgba(15,5,30,0.95)',
              border: '1px solid rgba(239,68,68,0.25)',
              boxShadow: '0 25px 60px rgba(0,0,0,0.7)',
            }}
          >
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.2)' }}>
                <Shield size={18} className="text-red-400" />
              </div>
              <div>
                <h3 className="font-bold text-white text-sm">ورود مدیر</h3>
                <p className="text-xs mt-0.5" style={{ color: 'rgba(107,114,128,0.8)' }}>دسترسی مخفی</p>
              </div>
            </div>
            <form onSubmit={handleAdminLogin} className="space-y-3">
              <input
                value={adminUser} onChange={e => setAdminUser(e.target.value)}
                placeholder="نام کاربری"
                className="w-full px-4 py-3 rounded-xl text-sm outline-none text-white"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
              />
              <input
                type="password" value={adminPass} onChange={e => setAdminPass(e.target.value)}
                placeholder="رمز عبور"
                className="w-full px-4 py-3 rounded-xl text-sm outline-none text-white"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
              />
              {adminError && <ErrorMsg>{adminError}</ErrorMsg>}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => { setShowAdminModal(false); setAdminError(''); }}
                  className="flex-1 py-2.5 rounded-xl text-sm transition-colors"
                  style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(156,163,175,0.8)' }}
                >
                  انصراف
                </button>
                <button
                  type="submit" disabled={loading}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors"
                  style={{ background: 'linear-gradient(135deg, #dc2626, #b91c1c)', color: '#fff' }}
                >
                  {loading ? '...' : 'ورود'}
                </button>
              </div>
              <button
                type="button"
                onClick={() => window.location.href = '/admin'}
                className="w-full py-2 text-xs text-center"
                style={{ color: 'rgba(107,114,128,0.6)' }}
              >
                ← ورود مستقیم به /admin
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── helpers ── */

function InputField({ icon, placeholder, value, onChange, type = 'text', autoComplete, label }: {
  icon: React.ReactNode; placeholder: string; value: string;
  onChange: (v: string) => void; type?: string; autoComplete?: string; label?: string;
}) {
  return (
    <div>
      {label && (
        <p className="text-xs mb-1 pr-1" style={{ color: 'rgba(139,92,246,0.7)' }}>{label}</p>
      )}
      <div className="relative">
        <span className="absolute right-3.5 top-1/2 -translate-y-1/2" style={{ color: 'rgba(107,114,128,0.7)' }}>{icon}</span>
        <input
          type={type} value={value} onChange={e => onChange(e.target.value)}
          placeholder={placeholder} autoComplete={autoComplete}
          className="w-full pr-10 pl-4 py-3 rounded-xl text-sm outline-none transition-colors"
          style={{
            background: 'rgba(255,255,255,0.05)',
            color: '#f9fafb',
            border: '1px solid rgba(255,255,255,0.08)',
            caretColor: '#a78bfa',
          }}
          onFocus={e => { e.currentTarget.style.borderColor = 'rgba(139,92,246,0.5)'; e.currentTarget.style.background = 'rgba(139,92,246,0.06)'; }}
          onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
        />
      </div>
    </div>
  );
}

function PasswordField({ placeholder, value, onChange, showPw, setShowPw, autoComplete }: {
  placeholder: string; value: string; onChange: (v: string) => void;
  showPw: boolean; setShowPw: (v: boolean) => void; autoComplete?: string;
}) {
  return (
    <div className="relative">
      <span className="absolute right-3.5 top-1/2 -translate-y-1/2" style={{ color: 'rgba(107,114,128,0.7)' }}><Lock size={15} /></span>
      <input
        type={showPw ? 'text' : 'password'} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} autoComplete={autoComplete}
        className="w-full pr-10 pl-11 py-3 rounded-xl text-sm outline-none transition-colors"
        style={{
          background: 'rgba(255,255,255,0.05)',
          color: '#f9fafb',
          border: '1px solid rgba(255,255,255,0.08)',
          caretColor: '#a78bfa',
        }}
        onFocus={e => { e.currentTarget.style.borderColor = 'rgba(139,92,246,0.5)'; e.currentTarget.style.background = 'rgba(139,92,246,0.06)'; }}
        onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
      />
      <button type="button" onClick={() => setShowPw(!showPw)} className="absolute left-3.5 top-1/2 -translate-y-1/2 transition-colors" style={{ color: 'rgba(107,114,128,0.7)' }}>
        {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
  );
}

function SubmitBtn({ children, loading, disabled = false }: { children: React.ReactNode; loading: boolean; disabled?: boolean }) {
  return (
    <button
      type="submit"
      disabled={loading || disabled}
      className="w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all mt-1"
      style={{
        background: disabled ? 'rgba(255,255,255,0.06)' : 'linear-gradient(135deg, #7c3aed, #4f46e5)',
        color: disabled ? 'rgba(107,114,128,0.8)' : '#fff',
        opacity: loading ? 0.75 : 1,
        boxShadow: disabled ? 'none' : '0 6px 24px rgba(124,58,237,0.4)',
      }}
    >
      {loading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : children}
    </button>
  );
}

function ErrorMsg({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl text-xs" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5' }}>
      {children}
    </div>
  );
}
