import { useState, useEffect, useCallback } from 'react';
import { Users, UserPlus, Phone, RefreshCw, Search, Copy, Share2, X, Check } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';

function getToken() { try { return localStorage.getItem('kingwolf_token'); } catch { return null; } }
async function apiPost(path: string, body?: any) {
  const token = getToken();
  const res = await fetch(`/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  try { return await res.json(); } catch { return {}; }
}
async function apiGet(path: string) {
  const token = getToken();
  const res = await fetch(`/api${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  try { return await res.json(); } catch { return {}; }
}

interface Contact {
  phone: string;
  name: string;
  matched_user_id: string | null;
  username?: string;
  display_name?: string;
  avatar_url?: string;
  online_status?: string;
  bio?: string;
}

export function ContactsPage({ onOpenChat }: { onOpenChat?: (userId: string) => void }) {
  const { profile } = useAuth();
  const { t, language } = useTheme();
  const [tab, setTab] = useState<'on' | 'invite'>('on');
  const [contacts, setContacts] = useState<{ onKingWolf: Contact[]; notOnKingWolf: Contact[] }>({ onKingWolf: [], notOnKingWolf: [] });
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [inviteLink, setInviteLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [contactsSupported] = useState(() => 'contacts' in navigator && 'ContactsManager' in window);

  const loadContacts = useCallback(async () => {
    setLoading(true);
    const data = await apiGet('/contacts');
    setContacts(data);
    setLoading(false);
  }, []);

  useEffect(() => { loadContacts(); }, [loadContacts]);

  async function syncContacts() {
    setSyncing(true);
    try {
      if (contactsSupported) {
        // Use Contact Picker API
        const props = ['name', 'tel'];
        const opts = { multiple: true };
        // @ts-ignore
        const selected = await navigator.contacts.select(props, opts);
        const mapped = selected.flatMap((c: any) =>
          (c.tel || []).map((phone: string) => ({ phone, name: (c.name || [])[0] || '' }))
        );
        await apiPost('/contacts/sync', { contacts: mapped });
        await loadContacts();
      } else {
        // Fallback: show manual entry UI
        // For now just reload
        await loadContacts();
      }
    } catch (e) {
      console.error('Contact sync error', e);
    }
    setSyncing(false);
  }

  async function generateInvite() {
    const data = await apiPost('/invite/generate');
    if (data.link) {
      const fullLink = window.location.origin + data.link;
      setInviteLink(fullLink);
    }
  }

  function copyInvite() {
    navigator.clipboard.writeText(inviteLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const onFiltered = contacts.onKingWolf.filter(c =>
    !searchQuery || (c.display_name || c.name || '').toLowerCase().includes(searchQuery.toLowerCase())
  );
  const offFiltered = contacts.notOnKingWolf.filter(c =>
    !searchQuery || (c.name || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full bg-[var(--bg-primary)] text-[var(--text-primary)]">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)] sticky top-0 bg-[var(--bg-primary)] z-10">
        <div className="w-8 h-8 rounded-full flex items-center justify-center"
             style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)', boxShadow: '0 0 16px #a855f780' }}>
          <Users size={16} className="text-white" />
        </div>
        <h1 className="font-bold text-lg flex-1">{t('مخاطبین', 'Contacts')}</h1>
        <button
          onClick={syncContacts}
          disabled={syncing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all"
          style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)', color: 'white' }}
        >
          <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} />
          {syncing ? t('همگام‌سازی...', 'Syncing...') : t('همگام‌سازی', 'Sync')}
        </button>
      </div>

      {/* Search */}
      <div className="px-4 py-2">
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)]">
          <Search size={14} className="text-[var(--text-secondary)]" />
          <input
            className="flex-1 bg-transparent text-sm outline-none"
            placeholder={t('جستجو...', 'Search...')}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex mx-4 mb-2 rounded-xl overflow-hidden border border-[var(--border)] bg-[var(--bg-secondary)]">
        {(['on', 'invite'] as const).map(tabId => (
          <button
            key={tabId}
            onClick={() => setTab(tabId)}
            className={`flex-1 py-2 text-sm font-medium transition-all ${tab === tabId ? 'text-white' : 'text-[var(--text-secondary)]'}`}
            style={tab === tabId ? { background: 'linear-gradient(135deg, #7c3aed, #a855f7)' } : {}}
          >
            {tabId === 'on'
              ? `${t('در KingWolf', 'On KingWolf')} (${contacts.onKingWolf.length})`
              : `${t('دعوت کن', 'Invite')} (${contacts.notOnKingWolf.length})`
            }
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 rounded-full border-2 border-purple-500 border-t-transparent animate-spin" />
          </div>
        ) : tab === 'on' ? (
          onFiltered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-4 text-center">
              <div className="text-5xl">🐺</div>
              <p className="text-[var(--text-secondary)] text-sm">
                {t('هنوز مخاطبی در KingWolf ندارید', "None of your contacts are on KingWolf yet")}
              </p>
              {!contactsSupported && (
                <p className="text-xs text-yellow-400">
                  {t('مرورگر شما از Contact API پشتیبانی نمی‌کند', 'Your browser does not support Contact Picker API')}
                </p>
              )}
              <button
                onClick={syncContacts}
                className="px-4 py-2 rounded-xl text-sm font-medium text-white"
                style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)' }}
              >
                {t('همگام‌سازی مخاطبین', 'Sync Contacts')}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {onFiltered.map(contact => (
                <div
                  key={contact.phone}
                  className="flex items-center gap-3 p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] hover:border-purple-500/40 transition-all cursor-pointer"
                  onClick={() => onOpenChat && contact.matched_user_id && onOpenChat(contact.matched_user_id)}
                >
                  <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0"
                       style={{ boxShadow: '0 0 12px #a855f740' }}>
                    {contact.avatar_url ? (
                      <img src={contact.avatar_url} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white font-bold text-sm"
                           style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)' }}>
                        {(contact.display_name || contact.name || '?').charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{contact.display_name || contact.name}</div>
                    <div className="text-xs text-[var(--text-secondary)] truncate">@{contact.username}</div>
                  </div>
                  <div className={`w-2 h-2 rounded-full ${contact.online_status === 'online' ? 'bg-green-400' : 'bg-gray-500'}`} />
                </div>
              ))}
            </div>
          )
        ) : (
          <div className="space-y-3">
            {/* Invite Link Generator */}
            <div className="p-4 rounded-xl border border-purple-500/30 bg-purple-500/5">
              <p className="text-sm font-medium mb-3">{t('لینک دعوت‌نامه', 'Your Invite Link')}</p>
              {inviteLink ? (
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={inviteLink}
                    className="flex-1 bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs outline-none"
                  />
                  <button onClick={copyInvite} className="p-1.5 rounded-lg bg-purple-500/20 text-purple-400">
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
              ) : (
                <button
                  onClick={generateInvite}
                  className="w-full py-2 rounded-xl text-sm font-medium text-white"
                  style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)' }}
                >
                  {t('ساخت لینک دعوت', 'Generate Invite Link')}
                </button>
              )}
            </div>

            {offFiltered.length === 0 ? (
              <div className="flex flex-col items-center py-8 gap-2 text-center">
                <div className="text-4xl">📱</div>
                <p className="text-[var(--text-secondary)] text-sm">
                  {t('مخاطبینی برای دعوت ندارید', 'No contacts to invite')}
                </p>
              </div>
            ) : (
              offFiltered.map(contact => (
                <div key={contact.phone} className="flex items-center gap-3 p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)]">
                  <div className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center"
                       style={{ background: 'linear-gradient(135deg, #374151, #4b5563)' }}>
                    <Phone size={16} className="text-gray-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{contact.name || contact.phone}</div>
                    <div className="text-xs text-[var(--text-secondary)]">{contact.phone}</div>
                  </div>
                  <button
                    onClick={async () => {
                      if (!inviteLink) await generateInvite();
                      const msg = `${t('به KingWolf بپیوند', 'Join me on KingWolf')}: ${inviteLink || window.location.origin}`;
                      if (navigator.share) {
                        navigator.share({ title: 'KingWolf', text: msg });
                      } else {
                        navigator.clipboard.writeText(msg);
                      }
                    }}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-purple-400 border border-purple-500/30 hover:bg-purple-500/10 transition-all"
                  >
                    <Share2 size={12} />
                    {t('دعوت', 'Invite')}
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
