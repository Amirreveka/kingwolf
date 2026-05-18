import { useState, useEffect } from 'react';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AppSettingsProvider } from './contexts/AppSettingsContext';
import { AppConfigProvider } from './contexts/AppConfigContext';
import { AuthPage } from './pages/AuthPage';
import { MessengerLayout } from './pages/MessengerLayout';
import { PendingApprovalPage } from './pages/PendingApprovalPage';
import { AdminPanel } from './pages/AdminPanel';
import { PermissionGate, needsPermissionGate } from './components/PermissionGate';
import { PinLock } from './components/PinLock';

function LocalModeBanner() {
  const [offline, setOffline] = useState(!navigator.onLine);
  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  if (!offline) return null;
  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] flex items-center justify-center gap-2 py-1.5 text-xs font-medium"
      style={{ background: 'linear-gradient(90deg, #78350f, #92400e)', color: '#fde68a', boxShadow: '0 2px 12px rgba(0,0,0,0.4)' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fbbf24', display: 'inline-block' }} />
      حالت محلی — اینترنت در دسترس نیست. تمام قابلیت‌ها روی شبکه داخلی فعال است.
    </div>
  );
}

function AppRouter() {
  const { user, profile, loading } = useAuth();
  const [permDone, setPermDone] = useState(() => !needsPermissionGate());

  if (loading) return null;

  if (!user) return <AuthPage />;

  if (profile && !profile.is_approved) return <PendingApprovalPage />;

  if (profile && profile.is_banned) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" dir="rtl" style={{ background: 'var(--bg-primary)' }}>
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">🚫</span>
          </div>
          <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>حساب مسدود شد</h2>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{profile.ban_reason || 'حساب شما توسط مدیر مسدود شده است.'}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <MessengerLayout />
      {!permDone && <PermissionGate onDone={() => setPermDone(true)} />}
    </>
  );
}

export default function App() {
  const isAdmin = window.location.pathname === '/panel' || window.location.hash === '#/panel';
  const [maintenance, setMaintenance] = useState(false);

  useEffect(() => {
    fetch('/api/admin/maintenance')
      .then(r => r.json())
      .then(d => {
        if (d.maintenance) {
          // Check if current user has a valid token (founder bypass done server-side)
          const token = localStorage.getItem('kingwolf_token');
          if (!token) { setMaintenance(true); return; }
          try {
            JSON.parse(atob(token.split('.')[1]));
            // Token exists and is decodable — allow through
            setMaintenance(false);
          } catch { setMaintenance(true); }
        }
      })
      .catch(() => {}); // Ignore errors — don't block app if API unreachable
  }, []);

  if (maintenance) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#030712] z-[9999]"
           style={{
             backgroundImage: 'linear-gradient(rgba(168,85,247,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(168,85,247,.04) 1px,transparent 1px)',
             backgroundSize: '32px 32px',
           }}>
        <div className="text-center p-12 rounded-3xl max-w-sm mx-4"
             style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(168,85,247,.2)', backdropFilter: 'blur(20px)' }}>
          <div className="text-6xl mb-6 kw-float">🐺</div>
          <div className="w-12 h-12 mx-auto mb-6 rounded-full border-2 border-purple-500/20 border-t-purple-500 animate-spin" />
          <h1 className="text-xl font-bold text-purple-400 mb-3">در حال بروزرسانی</h1>
          <p className="text-[var(--text-secondary)] text-sm">KingWolf در حال ارتقاء است.<br/>به زودی برمی‌گردیم!</p>
        </div>
      </div>
    );
  }

  return (
    <AppConfigProvider>
    <ThemeProvider>
      <AppSettingsProvider>
        <LocalModeBanner />
        {isAdmin ? (
          <AdminPanel />
        ) : (
          <AuthProvider>
            <PinLock>
              <AppRouter />
            </PinLock>
          </AuthProvider>
        )}
      </AppSettingsProvider>
    </ThemeProvider>
    </AppConfigProvider>
  );
}
