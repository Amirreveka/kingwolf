import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AppSettingsProvider } from './contexts/AppSettingsContext';
import { AuthPage } from './pages/AuthPage';
import { MessengerLayout } from './pages/MessengerLayout';
import { PendingApprovalPage } from './pages/PendingApprovalPage';
import { AdminPanel } from './pages/AdminPanel';
import { WolfLogo } from './components/ui/WolfLogo';

function SplashScreen() {
  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center gap-5"
      style={{ background: '#0d1117', zIndex: 9999 }}
    >
      <div style={{ animation: 'wolfPulse 1.6s ease-in-out infinite' }}>
        <WolfLogo size={88} />
      </div>
      <p className="text-sm font-medium" style={{ color: '#4B72D8', letterSpacing: '0.08em' }}>
        KingWolf
      </p>
      <style>{`
        @keyframes wolfPulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.07); opacity: 0.85; }
        }
      `}</style>
    </div>
  );
}

function AppRouter() {
  const { user, profile, loading } = useAuth();

  if (loading) return <SplashScreen />;

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
