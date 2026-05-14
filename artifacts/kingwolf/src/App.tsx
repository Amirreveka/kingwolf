import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AppSettingsProvider } from './contexts/AppSettingsContext';
import { AuthPage } from './pages/AuthPage';
import { MessengerLayout } from './pages/MessengerLayout';
import { PendingApprovalPage } from './pages/PendingApprovalPage';
import { AdminPanel } from './pages/AdminPanel';

function AppRouter() {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p style={{ color: 'var(--text-muted)' }} className="text-sm">در حال بارگذاری...</p>
        </div>
      </div>
    );
  }

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

  return <MessengerLayout />;
}

export default function App() {
  const isAdmin = window.location.pathname === '/admin' || window.location.hash === '#/admin';

  return (
    <ThemeProvider>
      <AppSettingsProvider>
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
