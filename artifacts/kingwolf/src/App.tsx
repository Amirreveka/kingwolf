import { useState, useEffect } from 'react';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AppSettingsProvider } from './contexts/AppSettingsContext';
import { AuthPage } from './pages/AuthPage';
import { MessengerLayout } from './pages/MessengerLayout';
import { PendingApprovalPage } from './pages/PendingApprovalPage';
import { AdminPanel } from './pages/AdminPanel';
import { PermissionGate, needsPermissionGate } from './components/PermissionGate';

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
  const isAdmin = window.location.pathname === '/admin' || window.location.hash === '#/admin';

  return (
    <ThemeProvider>
      <AppSettingsProvider>
        <LocalModeBanner />
        {isAdmin ? (
          <AdminPanel />
        ) : (
          <AuthProvider>
            <AppRouter />
          </AuthProvider>
        )}
      </AppSettingsProvider>
    </ThemeProvider>
  );
}
