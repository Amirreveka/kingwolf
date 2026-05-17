import { useState, useEffect } from 'react';
import { Phone, Video, PhoneIncoming, PhoneOutgoing, PhoneMissed, PhoneCall, Search, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { Avatar } from '../components/Avatar';
import { Conversation } from '../types';

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

interface CallsPageProps {
  onCall?: (userId: string, type: 'voice' | 'video') => void;
  contacts?: Conversation[];
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

export function CallsPage({ onCall, contacts = [] }: CallsPageProps) {
  const { user } = useAuth();
  const { t, language } = useTheme();
  const fa = language === 'fa';
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');

  useEffect(() => { loadCalls(); }, []);

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
      return { name: call.receiver_name || call.receiver_username, avatar: call.receiver_avatar, username: call.receiver_username, userId: call.receiver_id };
    }
    return { name: call.caller_name || call.caller_username, avatar: call.caller_avatar, username: call.caller_username, userId: call.caller_id };
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

  const filteredContacts = contacts.filter(c => {
    if (!pickerSearch.trim()) return true;
    const name = c.other_user?.display_name || c.other_user?.username || '';
    return name.toLowerCase().includes(pickerSearch.toLowerCase());
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
            onClick={() => setShowPicker(true)}
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
                  <Avatar src={other.avatar} name={other.name} size={44} />
                  <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center border-2" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--bg-secondary)' }}>
                    {call.type === 'video' ? <Video size={10} style={{ color: 'var(--accent)' }} /> : <Phone size={10} style={{ color: 'var(--accent)' }} />}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{other.name || other.username}</p>
                  <div className="flex items-center gap-1 mt-0.5">
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
                  {onCall && (
                    <button
                      className="w-7 h-7 rounded-full flex items-center justify-center transition-colors"
                      style={{ background: 'rgba(37,99,235,0.1)', color: 'var(--accent)' }}
                      onClick={(e) => { e.stopPropagation(); onCall(other.userId, call.type); }}
                    >
                      {call.type === 'video' ? <Video size={13} /> : <Phone size={13} />}
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Contact Picker Modal */}
      {showPicker && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-sm rounded-t-3xl sm:rounded-3xl overflow-hidden animate-slideUp" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            {/* Modal header */}
            <div className="flex items-center justify-between px-4 py-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--border-color)' }}>
              <button onClick={() => setShowPicker(false)} style={{ color: 'var(--text-secondary)' }}>
                <X size={20} />
              </button>
              <h3 className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>{t('تماس جدید', 'New Call')}</h3>
              <div className="w-6" />
            </div>
            {/* Search */}
            <div className="px-3 pt-3 flex-shrink-0">
              <div className="relative">
                <Search size={14} className={`absolute ${fa ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2`} style={{ color: 'var(--text-muted)' }} />
                <input
                  value={pickerSearch}
                  onChange={(e) => setPickerSearch(e.target.value)}
                  placeholder={t('جستجوی مخاطب...', 'Search contacts...')}
                  className={`w-full ${fa ? 'pr-8 pl-3' : 'pl-8 pr-3'} py-2 rounded-xl text-sm outline-none`}
                  style={{ background: 'var(--bg-input)', color: 'var(--text-primary)' }}
                  autoFocus
                />
              </div>
            </div>
            {/* Contacts list */}
            <div className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
              {filteredContacts.length === 0 ? (
                <p className="text-center text-sm py-8" style={{ color: 'var(--text-muted)' }}>{t('مخاطبی یافت نشد', 'No contacts found')}</p>
              ) : (
                filteredContacts.map((c) => {
                  const other = c.other_user!;
                  return (
                    <div key={c.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ background: 'transparent' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <Avatar src={other.avatar_url} name={other.display_name} username={other.username} size={42} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{other.display_name || other.username}</p>
                        <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>@{other.username}</p>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        {onCall && (
                          <>
                            <button
                              className="w-9 h-9 rounded-full flex items-center justify-center transition-colors"
                              style={{ background: 'rgba(37,99,235,0.12)', color: 'var(--accent)' }}
                              onClick={() => { setShowPicker(false); onCall(other.id, 'voice'); }}
                              title={t('تماس صوتی', 'Voice Call')}
                            >
                              <Phone size={16} />
                            </button>
                            <button
                              className="w-9 h-9 rounded-full flex items-center justify-center transition-colors"
                              style={{ background: 'rgba(139,92,246,0.12)', color: '#8b5cf6' }}
                              onClick={() => { setShowPicker(false); onCall(other.id, 'video'); }}
                              title={t('تماس تصویری', 'Video Call')}
                            >
                              <Video size={16} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
