import { useState, useEffect } from 'react';
import { Phone, Video, PhoneIncoming, PhoneOutgoing, PhoneMissed, PhoneCall, Search, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';

interface CallRecord {
  id: string;
  caller_id: string;
  receiver_id: string;
  type: 'voice' | 'video';
  status: 'missed' | 'incoming' | 'outgoing' | 'declined';
  duration: number;
  created_at: string;
  caller_name: string;
  caller_username: string;
  caller_avatar: string;
  receiver_name: string;
  receiver_username: string;
  receiver_avatar: string;
}

const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api';

function formatDuration(seconds: number, fa: boolean): string {
  if (seconds === 0) return '';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return fa ? `${s} ثانیه` : `${s}s`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatCallTime(iso: string, fa: boolean): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const locale = fa ? 'fa-IR' : 'en-GB';
  if (diff < 86400000) return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  if (diff < 604800000) return d.toLocaleDateString(locale, { weekday: 'short' });
  return d.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}

export function CallsPage() {
  const { user } = useAuth();
  const { t, language } = useTheme();
  const fa = language === 'fa';
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeCallUser, setActiveCallUser] = useState<{ name: string; avatar: string; type: 'voice' | 'video' } | null>(null);

  useEffect(() => {
    loadCalls();
  }, []);

  async function loadCalls() {
    setLoading(true);
    try {
      const token = localStorage.getItem('kingwolf_token');
      const res = await fetch(`${API_BASE}/calls`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setCalls(data.data || []);
    } catch {
      setCalls([]);
    }
    setLoading(false);
  }

  function getOtherPerson(call: CallRecord) {
    if (call.caller_id === user?.id) {
      return { name: call.receiver_name || call.receiver_username, avatar: call.receiver_avatar, username: call.receiver_username };
    }
    return { name: call.caller_name || call.caller_username, avatar: call.caller_avatar, username: call.caller_username };
  }

  function getCallDirection(call: CallRecord): 'outgoing' | 'incoming' | 'missed' {
    if (call.status === 'missed' && call.receiver_id === user?.id) return 'missed';
    if (call.caller_id === user?.id) return 'outgoing';
    return 'incoming';
  }

  const filtered = calls.filter((c) => {
    if (!search.trim()) return true;
    const other = getOtherPerson(c);
    return other.name.toLowerCase().includes(search.toLowerCase()) || other.username.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-secondary)' }}>
      {/* Header */}
      <div className="flex-shrink-0 p-3 pb-2" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))', background: 'var(--bg-secondary)' }}>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="font-bold text-base flex-1" style={{ color: 'var(--text-primary)' }}>{t('تماس‌ها', 'Calls')}</h2>
          <button
            className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: 'var(--bg-input)', color: 'var(--accent)' }}
            onClick={() => setActiveCallUser({ name: t('تماس جدید', 'New Call'), avatar: '', type: 'voice' })}
            title={t('تماس جدید', 'New Call')}
          >
            <PhoneCall size={16} />
          </button>
        </div>
        <div className="relative">
          <Search size={14} className={`absolute ${fa ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2`} style={{ color: 'var(--text-muted)' }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('جستجو در تماس‌ها...', 'Search calls...')}
            className={`w-full ${fa ? 'pr-8 pl-3' : 'pl-8 pr-3'} py-2 rounded-xl text-sm outline-none`}
            style={{ background: 'var(--bg-input)', color: 'var(--text-primary)' }}
          />
        </div>
      </div>

      {/* Calls List */}
      <div className="flex-1 overflow-y-auto px-2 space-y-0.5">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ background: 'var(--bg-card)' }}>
              <Phone size={28} style={{ color: 'var(--text-muted)' }} />
            </div>
            <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
              {search ? t('نتیجه‌ای یافت نشد', 'No results found') : t('هنوز تماسی ندارید', 'No calls yet')}
            </p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {search ? t('عبارت دیگری جستجو کنید', 'Try a different search') : t('از دکمه تماس در چت استفاده کنید', 'Use the call button in a chat')}
            </p>
          </div>
        ) : (
          filtered.map((call) => {
            const other = getOtherPerson(call);
            const direction = getCallDirection(call);
            const isMissed = direction === 'missed';
            const isOutgoing = direction === 'outgoing';
            return (
              <div
                key={call.id}
                className="flex items-center gap-3 px-3 py-3 rounded-xl transition-all cursor-pointer"
                style={{ background: 'transparent' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <div className="relative flex-shrink-0">
                  {other.avatar ? (
                    <img src={other.avatar} className="w-11 h-11 rounded-full object-cover" alt="" />
                  ) : (
                    <div className="w-11 h-11 rounded-full bg-blue-600 flex items-center justify-center">
                      <span className="text-white text-sm font-bold">{(other.name || '?').charAt(0).toUpperCase()}</span>
                    </div>
                  )}
                  <div className="absolute -bottom-0.5 -left-0.5 w-5 h-5 rounded-full flex items-center justify-center border-2" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--bg-secondary)' }}>
                    {call.type === 'video' ? <Video size={10} style={{ color: 'var(--accent)' }} /> : <Phone size={10} style={{ color: 'var(--accent)' }} />}
                  </div>
                </div>
                <div className="flex-1 min-w-0 text-right">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{other.name || other.username}</p>
                  <div className="flex items-center gap-1 justify-end mt-0.5">
                    {isMissed ? <PhoneMissed size={12} className="text-red-400 flex-shrink-0" />
                      : isOutgoing ? <PhoneOutgoing size={12} className="text-blue-400 flex-shrink-0" />
                      : <PhoneIncoming size={12} className="text-green-400 flex-shrink-0" />}
                    <span className="text-xs" style={{ color: isMissed ? '#f87171' : 'var(--text-muted)' }}>
                      {isMissed ? t('از دست رفته', 'Missed') : isOutgoing ? t('برقرار شد', 'Outgoing') : t('دریافتی', 'Incoming')}
                    </span>
                    {call.duration > 0 && (
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>· {formatDuration(call.duration, fa)}</span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{formatCallTime(call.created_at, fa)}</span>
                  <button
                    className="w-7 h-7 rounded-full flex items-center justify-center transition-colors"
                    style={{ background: 'rgba(37,99,235,0.1)', color: 'var(--accent)' }}
                    onClick={(e) => { e.stopPropagation(); setActiveCallUser({ name: other.name, avatar: other.avatar, type: call.type }); }}
                  >
                    {call.type === 'video' ? <Video size={13} /> : <Phone size={13} />}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Simulated Call Overlay */}
      {activeCallUser && (
        <div className="fixed inset-0 z-[60] flex flex-col items-center justify-between py-16"
          style={{ background: activeCallUser.type === 'video' ? '#0a0a0a' : 'linear-gradient(135deg,#1e3a5f,#0f1b2d)' }}>
          <div className="text-center">
            <p className="text-white/60 text-sm mb-1">{activeCallUser.type === 'voice' ? `🎙️ ${t('تماس صوتی','Voice call')}` : `📹 ${t('تماس تصویری','Video call')}`}</p>
            <h2 className="text-white text-2xl font-bold">{activeCallUser.name}</h2>
            <p className="text-white/60 text-sm mt-1">{t('در حال برقراری ارتباط...', 'Connecting...')}</p>
          </div>
          <div className="flex flex-col items-center">
            {activeCallUser.avatar ? (
              <img src={activeCallUser.avatar} className="w-32 h-32 rounded-full object-cover border-4 border-white/20" alt="" />
            ) : (
              <div className="w-32 h-32 rounded-full bg-blue-700 flex items-center justify-center border-4 border-white/20">
                <span className="text-white text-5xl font-bold">{activeCallUser.name.charAt(0)}</span>
              </div>
            )}
            <div className="mt-4 flex gap-1">
              {[0, 1, 2].map(i => (
                <div key={i} className="w-2 h-2 rounded-full bg-white/40 animate-pulse" style={{ animationDelay: `${i * 0.3}s` }} />
              ))}
            </div>
          </div>
          <div className="flex items-center gap-6">
            <button onClick={() => setActiveCallUser(null)} className="w-16 h-16 rounded-full flex items-center justify-center bg-red-600 hover:bg-red-500 transition-colors">
              <X size={26} className="text-white" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
