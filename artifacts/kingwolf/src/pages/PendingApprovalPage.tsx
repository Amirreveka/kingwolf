import { Clock, LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { WolfLogo } from '../components/ui/WolfLogo';

export function PendingApprovalPage() {
  const { signOut, profile } = useAuth();

  return (
    <div className="min-h-screen flex items-center justify-center p-4" dir="rtl" style={{ background: 'var(--bg-primary)' }}>
      <div className="max-w-sm w-full text-center animate-fadeIn">
        <div className="flex justify-center mb-6">
          <WolfLogo size={64} />
        </div>
        <div className="w-16 h-16 bg-yellow-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Clock size={32} className="text-yellow-400" />
        </div>
        <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>در انتظار تأیید</h2>
        <p className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
          سلام <span className="font-bold text-blue-400">{profile?.display_name || profile?.username}</span>!
        </p>
        <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
          حساب شما ثبت شده است و در انتظار تأیید مدیر می‌باشد. پس از تأیید می‌توانید وارد شوید.
        </p>
        <button
          onClick={signOut}
          className="flex items-center gap-2 mx-auto px-4 py-2 rounded-xl text-sm transition-colors"
          style={{ background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}
        >
          <LogOut size={16} />
          <span>خروج</span>
        </button>
      </div>
    </div>
  );
}
