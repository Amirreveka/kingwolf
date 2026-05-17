import React, { useState, useRef, useEffect, useCallback, memo, useMemo } from 'react';
import { Search, Plus, MessageSquare, Users, Radio, Bookmark, X, Check, Hash, UserPlus, BadgeCheck, Camera, CheckCheck, BellOff, Bell, Pin, PinOff, Trash2, AlertTriangle } from 'lucide-react';
import { Conversation, Profile } from '../../types';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { WolfLogo } from '../ui/WolfLogo';

interface ChatListProps {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreateGroup: (name: string, desc: string, members: string[]) => Promise<void>;
  onCreateChannel: (name: string, desc: string) => Promise<void>;
  onSavedMessages: () => void;
  onOpenStories: () => void;
}

// ─── Telegram-style Stories Bar ───────────────────────────────────────────────
interface StoryGroup {
  author_id: string; username: string; display_name: string; avatar_url: string;
  stories: Array<{ id: string; viewed: boolean }>;
}

function TelegramStoriesBar({ onOpen }: { onOpen: () => void }) {
  const { user, profile } = useAuth();
  const { language } = useTheme();
  const fa = language === 'fa';
  const [groups, setGroups] = useState<StoryGroup[]>([]);
  const [pressed, setPressed] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const token = localStorage.getItem('kingwolf_token');
      const res = await fetch('/api/stories', { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const { data } = await res.json();
      setGroups((data as StoryGroup[]) || []);
    } catch {}
  }, []);

  useEffect(() => { load(); }, [load]);

  if (groups.length === 0 && !user) return null;

  const myGroup = user ? groups.find(g => g.author_id === user.id) : null;
  const others = groups.filter(g => g.author_id !== user?.id);

  const myInit = (profile?.display_name || profile?.username || '?').charAt(0).toUpperCase();
  const myColor = `hsl(${(myInit.charCodeAt(0) * 17 + 100) % 360},55%,48%)`;

  function StoryAvatar({ src, name, size }: { src?: string; name: string; size: number }) {
    const init = (name || '?').charAt(0).toUpperCase();
    const color = `hsl(${(init.charCodeAt(0) * 17 + 100) % 360},55%,48%)`;
    return src
      ? <img src={src} style={{ width: size, height: size, objectFit: 'cover' }} alt="" />
      : <div style={{ width: size, height: size, background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: size * 0.38 }}>{init}</div>;
  }

  function StoryCircle({ group, id }: { group: StoryGroup; id: string }) {
    const allViewed = group.stories.every(s => s.viewed);
    const isPressed = pressed === id;
    const gradId = `tg-grad-${id.replace(/[^a-z0-9]/gi, '')}`;
    return (
      <button
        onPointerDown={() => setPressed(id)}
        onPointerUp={() => { setPressed(null); setTimeout(onOpen, 80); }}
        onPointerLeave={() => setPressed(null)}
        className="flex flex-col items-center gap-1 flex-shrink-0"
        style={{
          touchAction: 'manipulation',
          transform: isPressed ? 'scale(0.88)' : 'scale(1)',
          transition: 'transform 0.15s cubic-bezier(0.34,1.56,0.64,1)',
          outline: 'none',
          background: 'transparent',
          border: 'none',
          padding: '4px 2px',
          cursor: 'pointer',
          minWidth: 52,
        }}>
        <div style={{ position: 'relative', width: 50, height: 50 }}>
          {/* Gradient ring SVG */}
          <svg width={50} height={50} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            {!allViewed && (
              <defs>
                <linearGradient id={gradId} x1="0%" y1="100%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#f09433" />
                  <stop offset="33%" stopColor="#dc2743" />
                  <stop offset="66%" stopColor="#cc2366" />
                  <stop offset="100%" stopColor="#bc1888" />
                </linearGradient>
              </defs>
            )}
            <circle cx="25" cy="25" r="23"
              fill="none"
              stroke={allViewed ? 'rgba(128,128,128,0.35)' : `url(#${gradId})`}
              strokeWidth={allViewed ? '1.5' : '2'}
              strokeLinecap="round"
              transform="rotate(-90 25 25)"
            />
          </svg>
          {/* Avatar inside ring */}
          <div style={{
            position: 'absolute', inset: 3,
            borderRadius: '50%', overflow: 'hidden',
            border: '2px solid var(--bg-secondary)',
          }}>
            <StoryAvatar src={group.avatar_url} name={group.display_name || group.username} size={40} />
          </div>
          {/* Blue dot for unseen */}
          {!allViewed && (
            <div style={{
              position: 'absolute', bottom: 0, right: 0,
              width: 12, height: 12, borderRadius: '50%',
              background: '#1d9bf0',
              border: '2px solid var(--bg-secondary)',
              animation: 'tg-dot-pulse 2s infinite',
            }} />
          )}
        </div>
        <span style={{
          fontSize: 10,
          maxWidth: 50, overflow: 'hidden', textOverflow: 'ellipsis',
          whiteSpace: 'nowrap', textAlign: 'center',
          fontWeight: allViewed ? 400 : 600,
          color: allViewed ? 'var(--text-muted)' : 'var(--text-primary)',
        }}>
          {group.display_name || group.username}
        </span>
      </button>
    );
  }

  const myPressId = 'my-story';
  const isMyPressed = pressed === myPressId;

  return (
    <>
      <style>{`
        @keyframes tg-dot-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(0.85); }
        }
        @keyframes tg-ring-spin {
          from { stroke-dashoffset: 144; }
          to { stroke-dashoffset: 0; }
        }
      `}</style>
      <div style={{
        display: 'flex', overflowX: 'auto', padding: '4px 8px 8px',
        borderBottom: '1px solid var(--border-color)',
        scrollbarWidth: 'none', gap: 4,
      }}>
        {/* My story button */}
        <button
          onPointerDown={() => setPressed(myPressId)}
          onPointerUp={() => { setPressed(null); setTimeout(onOpen, 80); }}
          onPointerLeave={() => setPressed(null)}
          className="flex flex-col items-center gap-1 flex-shrink-0"
          style={{
            touchAction: 'manipulation',
            transform: isMyPressed ? 'scale(0.88)' : 'scale(1)',
            transition: 'transform 0.15s cubic-bezier(0.34,1.56,0.64,1)',
            outline: 'none', background: 'transparent', border: 'none',
            padding: '4px 2px', cursor: 'pointer', minWidth: 52,
          }}>
          <div style={{ position: 'relative', width: 50, height: 50 }}>
            {myGroup ? (
              <>
                <svg width={50} height={50} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                  <defs>
                    <linearGradient id="my-grad" x1="0%" y1="100%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#f09433" />
                      <stop offset="100%" stopColor="#bc1888" />
                    </linearGradient>
                  </defs>
                  <circle cx="25" cy="25" r="23" fill="none" stroke="url(#my-grad)"
                    strokeWidth="2" strokeLinecap="round" transform="rotate(-90 25 25)" />
                </svg>
                <div style={{ position: 'absolute', inset: 3, borderRadius: '50%', overflow: 'hidden', border: '2px solid var(--bg-secondary)' }}>
                  {profile?.avatar_url
                    ? <img src={profile.avatar_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                    : <div style={{ width: '100%', height: '100%', background: myColor, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 15 }}>{myInit}</div>}
                </div>
              </>
            ) : (
              <>
                <div style={{ position: 'absolute', inset: 3, borderRadius: '50%', overflow: 'hidden', border: '2px dashed rgba(128,128,128,0.4)' }}>
                  <div style={{ width: '100%', height: '100%', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Camera size={18} style={{ color: 'var(--text-muted)' }} />
                  </div>
                </div>
              </>
            )}
            {/* Plus badge */}
            <div style={{
              position: 'absolute', bottom: 0, right: 0,
              width: 16, height: 16, borderRadius: '50%',
              background: '#1d9bf0',
              border: '2px solid var(--bg-secondary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, color: 'white', fontWeight: 700, lineHeight: 1,
            }}>+</div>
          </div>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', maxWidth: 50, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center' }}>
            {fa ? 'استوری من' : 'My Story'}
          </span>
        </button>

        {/* Others' story circles */}
        {others.map(group => (
          <StoryCircle key={group.author_id} group={group} id={group.author_id} />
        ))}
      </div>
    </>
  );
}

function ConvAvatar({ src, initials, type }: { src?: string | null; initials: string; type: string }) {
  const [err, setErr] = useState(false);
  const bg = type === 'group' ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : type === 'channel' ? 'linear-gradient(135deg,#0ea5e9,#2563eb)' : 'linear-gradient(135deg,#2563eb,#1d4ed8)';
  if (src && !err) {
    return <img src={src} alt="" className="w-10 h-10 rounded-full object-cover" onError={() => setErr(true)} />;
  }
  return (
    <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white text-sm" style={{ background: bg }}>
      {initials}
    </div>
  );
}

const FOLDERS = [
  { id: 'all',      labelFa: 'همه',          label: 'All',      icon: '💬' },
  { id: 'direct',   labelFa: 'پیام‌ها',      label: 'Direct',   icon: '👤' },
  { id: 'groups',   labelFa: 'گروه‌ها',      label: 'Groups',   icon: '👥' },
  { id: 'channels', labelFa: 'کانال‌ها',     label: 'Channels', icon: '📢' },
  { id: 'unread',   labelFa: 'خوانده‌نشده',  label: 'Unread',   icon: '🔔' },
];

export function ChatList({ conversations, selectedId, onSelect, onCreateGroup, onCreateChannel, onSavedMessages, onOpenStories }: ChatListProps) {
  const { user } = useAuth();
  const { language, t } = useTheme();
  const fa = language === 'fa';
  const [activeFolder, setActiveFolder] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [globalSearch, setGlobalSearch] = useState('');
  const [globalResults, setGlobalResults] = useState<{ users: any[]; groups: any[]; channels: any[] }>({ users: [], groups: [], channels: [] });
  const [globalSearchLoading, setGlobalSearchLoading] = useState(false);
  const [modal, setModal] = useState<'none' | 'newChat' | 'newGroup' | 'newChannel'>('none');
  const [searchUsers, setSearchUsers] = useState<Profile[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupDesc, setGroupDesc] = useState('');
  const [channelName, setChannelName] = useState('');
  const [channelDesc, setChannelDesc] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<Profile[]>([]);
  const [memberSearch, setMemberSearch] = useState('');
  const [memberResults, setMemberResults] = useState<Profile[]>([]);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Long-press peek + context menu
  const [peekConv, setPeekConv] = useState<Conversation | null>(null);
  const [peekMessages, setPeekMessages] = useState<any[]>([]);
  const [deletePending, setDeletePending] = useState<{ conv: Conversation; timer: ReturnType<typeof setTimeout>; countdown: number } | null>(null);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('kw_pinned') || '[]')); } catch { return new Set(); }
  });
  const [mutedIds, setMutedIds] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('kw_muted') || '[]')); } catch { return new Set(); }
  });
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);
  const deleteCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Intersection Observer-based lazy loading for long conversation lists
  const [visibleCount, setVisibleCount] = useState(30);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const obs = new IntersectionObserver(entries => {
      if (entries[0]?.isIntersecting) {
        setVisibleCount(n => n + 20);
      }
    }, { threshold: 0.1 });
    if (sentinelRef.current) obs.observe(sentinelRef.current);
    return () => obs.disconnect();
  }, []);

  function openPeek(conv: Conversation) {
    setPeekConv(conv);
    supabase.from('messages').select('*, sender:profiles!sender_id(display_name,username)')
      .eq('conversation_id', conv.id).eq('is_deleted', false)
      .order('created_at', { ascending: false }).limit(6)
      .then(({ data }) => setPeekMessages((data || []).reverse()));
  }

  function closePeek() { setPeekConv(null); setPeekMessages([]); }

  function markAsRead(conv: Conversation) {
    const token = localStorage.getItem('kingwolf_token');
    fetch('/api/messages/read', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ conversation_id: conv.id }) }).catch(() => {});
    closePeek();
  }

  function togglePin(conv: Conversation) {
    setPinnedIds(prev => {
      const next = new Set(prev);
      if (next.has(conv.id)) next.delete(conv.id); else next.add(conv.id);
      localStorage.setItem('kw_pinned', JSON.stringify([...next]));
      return next;
    });
    closePeek();
  }

  function toggleMute(conv: Conversation) {
    setMutedIds(prev => {
      const next = new Set(prev);
      if (next.has(conv.id)) next.delete(conv.id); else next.add(conv.id);
      localStorage.setItem('kw_muted', JSON.stringify([...next]));
      return next;
    });
    closePeek();
  }

  function initiateDelete(conv: Conversation) {
    closePeek();
    // Hide immediately
    setDeletedIds(prev => new Set([...prev, conv.id]));
    // Start 20s countdown for undo
    let count = 20;
    const timer = setTimeout(async () => {
      // Actually delete
      await supabase.from('conversations').delete().eq('id', conv.id);
      setDeletePending(null);
      if (deleteCountdownRef.current) clearInterval(deleteCountdownRef.current);
    }, 20000);
    setDeletePending({ conv, timer, countdown: 20 });
    deleteCountdownRef.current = setInterval(() => {
      setDeletePending(prev => prev ? { ...prev, countdown: prev.countdown - 1 } : null);
    }, 1000);
  }

  function undoDelete() {
    if (!deletePending) return;
    clearTimeout(deletePending.timer);
    if (deleteCountdownRef.current) clearInterval(deleteCountdownRef.current);
    setDeletedIds(prev => { const n = new Set(prev); n.delete(deletePending.conv.id); return n; });
    setDeletePending(null);
  }

  useEffect(() => {
    if (deletePending?.countdown <= 0) {
      if (deleteCountdownRef.current) clearInterval(deleteCountdownRef.current);
    }
  }, [deletePending?.countdown]);

  useEffect(() => { setVisibleCount(30); }, [search, activeFolder]);


  const filtered = useMemo(() => {
    let list = conversations.filter((c) => {
      if (c.name === '__saved__') return false; // shown as pinned button, not in list
      // Folder filter overrides tab filter when not 'all'
      if (activeFolder === 'direct')   return c.type === 'direct';
      if (activeFolder === 'groups')   return c.type === 'group';
      if (activeFolder === 'channels') return c.type === 'channel';
      if (activeFolder === 'unread')   return ((c as any).unread_count || 0) > 0;
      return true;
    });
    if (search) {
      list = list.filter(c => {
        const name = c.type === 'direct' ? (c.other_user?.display_name || c.other_user?.username || c.name) : c.name;
        return name.toLowerCase().includes(search.toLowerCase());
      });
    }
    return list;
  }, [conversations, search, activeFolder]);

  // Item 4: require 80% of username typed before showing results
  function apply80pFilter(profiles: any[], q: string) {
    return profiles.filter(p => q.length >= Math.ceil((p.username || '').length * 0.8));
  }

  async function searchForUsers(q: string) {
    if (!q.trim() || q.length < 3) { setSearchUsers([]); return; }
    setSearchLoading(true);
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .ilike('username', `${q}%`)
      .neq('id', user?.id)
      .limit(20);
    setSearchUsers(apply80pFilter((data as Profile[]) || [], q));
    setSearchLoading(false);
  }

  async function searchForMembers(q: string) {
    if (!q.trim() || q.length < 3) { setMemberResults([]); return; }
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .ilike('username', `${q}%`)
      .neq('id', user?.id)
      .limit(20);
    setMemberResults(apply80pFilter((data as Profile[]) || [], q));
  }

  async function doGlobalSearch(q: string) {
    const raw = q.startsWith('@') ? q.slice(1) : q;
    if (!raw.trim() || raw.length < 3) { setGlobalResults({ users: [], groups: [], channels: [] }); return; }
    setGlobalSearchLoading(true);
    const [{ data: users }, { data: groups }, { data: channels }] = await Promise.all([
      supabase.from('profiles').select('*').ilike('username', `${raw}%`).neq('id', user?.id).limit(20),
      supabase.from('conversations').select('*').eq('type', 'group').ilike('name', `%${raw}%`).limit(4),
      supabase.from('conversations').select('*').eq('type', 'channel').ilike('name', `%${raw}%`).limit(4),
    ]);
    setGlobalResults({
      users: apply80pFilter((users as any[]) || [], raw),
      groups: (groups as any[]) || [],
      channels: (channels as any[]) || [],
    });
    setGlobalSearchLoading(false);
  }

  function toggleMember(p: Profile) {
    setSelectedMembers((prev) =>
      prev.find((m) => m.id === p.id) ? prev.filter((m) => m.id !== p.id) : [...prev, p]
    );
  }

  async function handleCreateGroup() {
    if (!groupName.trim()) return;
    await onCreateGroup(groupName.trim(), groupDesc.trim(), selectedMembers.map((m) => m.id));
    setModal('none'); setGroupName(''); setGroupDesc(''); setSelectedMembers([]);
  }

  async function handleCreateChannel() {
    if (!channelName.trim()) return;
    await onCreateChannel(channelName.trim(), channelDesc.trim());
    setModal('none'); setChannelName(''); setChannelDesc('');
  }

  function getDisplayName(c: Conversation) {
    if (c.name === '__saved__') return t('پیام‌های ذخیره‌شده', 'Saved Messages');
    if (c.type === 'direct') return c.other_user?.display_name || c.other_user?.username || t('کاربر', 'User');
    return c.name;
  }

  function getAvatar(c: Conversation) {
    if (c.name === '__saved__') return null;
    if (c.type === 'direct') return c.other_user?.avatar_url;
    return c.avatar_url;
  }

  function getInitials(c: Conversation) {
    const name = getDisplayName(c);
    return name.charAt(0).toUpperCase();
  }

  function formatTime(iso: string) {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const locale = fa ? 'fa-IR' : 'en-US';
    if (diff < 86400000) return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
    if (diff < 604800000) return d.toLocaleDateString(locale, { weekday: 'short' });
    return d.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
  }

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-secondary)' }}>
      {/* Header — title only */}
      <div className="px-3 pb-2 flex-shrink-0" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
        <div className="flex items-center gap-2 py-1">
          <h2 className="font-bold text-base flex-1" style={{ color: 'var(--text-primary)' }}>{t('پیام‌ها', 'Messages')}</h2>
          <button
            onClick={() => setModal('newChat')}
            className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors"
            style={{ background: 'var(--bg-input)' }}
          >
            <Plus size={16} style={{ color: 'var(--text-secondary)' }} />
          </button>
        </div>
      </div>

      {/* ── Chat Folders ─────────────────────────────────────────────── */}
      <div
        className="flex gap-1.5 px-3 py-2 overflow-x-auto no-scrollbar border-b border-[var(--border)]"
        style={{ scrollbarWidth: 'none', borderColor: 'var(--border-color)' }}
      >
        {FOLDERS.map(folder => (
          <button
            key={folder.id}
            onClick={() => setActiveFolder(folder.id)}
            className={`flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-150 ${
              activeFolder === folder.id
                ? 'text-white'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
            style={activeFolder === folder.id ? {
              background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
              filter: 'drop-shadow(0 0 6px rgba(168,85,247,0.4))',
            } : {
              background: 'rgba(168,85,247,0.06)',
              border: '1px solid rgba(168,85,247,0.12)',
            }}
          >
            <span>{folder.icon}</span>
            <span>{fa ? folder.labelFa : folder.label}</span>
          </button>
        ))}
      </div>

      {/* ── Telegram-style Stories Bar (above search, below title) ── */}
      {!globalSearch && <TelegramStoriesBar onOpen={onOpenStories} />}

      {/* Search section */}
      <div className="px-3 pt-2 pb-1 flex-shrink-0">
        {/* Search */}
        <div className="relative mb-1">
          <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          <input
            value={globalSearch}
            onChange={(e) => {
              const v = e.target.value;
              setGlobalSearch(v);
              setSearch(v);
              if (searchTimer.current) clearTimeout(searchTimer.current);
              searchTimer.current = setTimeout(() => doGlobalSearch(v), 300);
            }}
            placeholder={t('@نام‌کاربری یا جستجو...', '@username or search...')}
            className="w-full pr-8 pl-3 py-2 rounded-xl text-sm outline-none"
            style={{ background: 'var(--bg-input)', color: 'var(--text-primary)' }}
          />
          {globalSearch && (
            <button onClick={() => { setGlobalSearch(''); setSearch(''); setGlobalResults({ users: [], groups: [], channels: [] }); }}
              className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }}>
              <X size={13} />
            </button>
          )}
        </div>
        {/* Global search results */}
        {globalSearch && (globalResults.users.length > 0 || globalResults.groups.length > 0 || globalResults.channels.length > 0 || globalSearchLoading) && (
          <div className="mb-2 rounded-xl overflow-hidden border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
            {globalSearchLoading && (
              <div className="flex justify-center py-3"><div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
            )}
            {globalResults.users.map(u => (
              <button key={u.id} onClick={() => { onSelect(`direct:${u.id}`); setGlobalSearch(''); setSearch(''); setGlobalResults({ users: [], groups: [], channels: [] }); }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-right transition-colors"
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <ConvAvatar src={u.avatar_url} initials={(u.display_name || u.username || '?').charAt(0).toUpperCase()} type="direct" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{u.display_name || u.username}</p>
                    {!!u.is_verified && <BadgeCheck size={13} className="text-blue-400 flex-shrink-0" />}
                  </div>
                  <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>@{u.username}</p>
                </div>
                <MessageSquare size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              </button>
            ))}
            {globalResults.groups.map(g => (
              <button key={g.id} onClick={() => { onSelect(g.id); setGlobalSearch(''); setSearch(''); setGlobalResults({ users: [], groups: [], channels: [] }); }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-right transition-colors"
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0" style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
                  {(g.name || 'G').charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{g.name}</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('گروه', 'Group')}</p>
                </div>
                <Users size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              </button>
            ))}
            {globalResults.channels.map(c => (
              <button key={c.id} onClick={() => { onSelect(c.id); setGlobalSearch(''); setSearch(''); setGlobalResults({ users: [], groups: [], channels: [] }); }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-right transition-colors"
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-white flex-shrink-0" style={{ background: 'linear-gradient(135deg,#0ea5e9,#2563eb)' }}>
                  <Hash size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{c.name}</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('کانال', 'Channel')}</p>
                </div>
                <Radio size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              </button>
            ))}
          </div>
        )}
        {!globalSearch && <div className="mb-2" />}
      </div>

      {/* Saved Messages */}
      {(activeFolder === 'all' || activeFolder === 'direct') && (
        <button
          onClick={onSavedMessages}
          className="mx-3 mb-1 px-3 py-2.5 rounded-xl flex items-center gap-3 transition-colors"
          style={{ background: 'rgba(37,99,235,0.08)' }}
        >
          <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
            <Bookmark size={16} className="text-white" />
          </div>
          <div className="text-right flex-1 min-w-0">
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t('پیام‌های ذخیره‌شده', 'Saved Messages')}</p>
            <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{t('ذخیره پیام‌ها برای خودت', 'Save messages for yourself')}</p>
          </div>
        </button>
      )}

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto px-2 space-y-0.5 chat-list-scroll">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            {activeFolder === 'channels' ? <Radio size={32} className="mb-3 opacity-30" style={{ color: 'var(--text-muted)' }} /> : activeFolder === 'groups' ? <Users size={32} className="mb-3 opacity-30" style={{ color: 'var(--text-muted)' }} /> : <MessageSquare size={32} className="mb-3 opacity-30" style={{ color: 'var(--text-muted)' }} />}
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {activeFolder === 'groups' ? t('عضو گروهی نیستید', 'Not in any group') : activeFolder === 'channels' ? t('کانالی ندارید', 'No channels') : t('هنوز مکالمه‌ای ندارید', 'No conversations yet')}
            </p>
            <button
              onClick={() => setModal(activeFolder === 'groups' ? 'newGroup' : activeFolder === 'channels' ? 'newChannel' : 'newChat')}
              className="mt-3 text-xs text-blue-400 hover:text-blue-300"
            >
              {activeFolder === 'groups' ? t('+ ساخت گروه', '+ New Group') : activeFolder === 'channels' ? t('+ ساخت کانال', '+ New Channel') : t('+ شروع مکالمه', '+ New Chat')}
            </button>
          </div>
        ) : (
          filtered.filter(c => !deletedIds.has(c.id)).slice(0, visibleCount).map((c) => (
            <button
              key={c.id}
              onClick={() => { if (!longPressFired.current) onSelect(c.id); }}
              onContextMenu={e => { e.preventDefault(); openPeek(c); }}
              onTouchStart={e => {
                longPressFired.current = false;
                const touch = e.touches[0];
                longPressTimer.current = setTimeout(() => {
                  longPressFired.current = true;
                  openPeek(c);
                }, 500);
              }}
              onTouchEnd={() => { if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; } }}
              onTouchMove={() => { if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; } }}
              className="w-full px-3 py-2.5 rounded-xl flex items-center gap-3 text-right kw-chat-item kw-card kw-list-item animate-fadeIn"
              style={{
                background: selectedId === c.id ? 'var(--bg-active)' : 'transparent',
                transition: 'background 0.15s ease, transform 0.12s ease',
                borderRight: selectedId === c.id ? '2px solid var(--accent)' : '2px solid transparent',
              }}
              onMouseEnter={(e) => { if (selectedId !== c.id) e.currentTarget.style.background = 'var(--bg-hover)'; }}
              onMouseLeave={(e) => { if (selectedId !== c.id) e.currentTarget.style.background = 'transparent'; }}
            >
              <div className="relative flex-shrink-0">
                {c.name === 'KingWolf' && (c.type === 'group' || c.type === 'channel') ? (
                  <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg,#1e3a8a,#1d4ed8)' }}>
                    <WolfLogo size={28} />
                  </div>
                ) : c.type === 'channel' ? (
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-white" style={{ background: 'linear-gradient(135deg,#0ea5e9,#2563eb)' }}>
                    <Hash size={16} />
                  </div>
                ) : (
                  <ConvAvatar src={getAvatar(c)} initials={getInitials(c)} type={c.type} />
                )}
                {c.type === 'direct' && c.other_user?.online_status === 'online' && (
                  <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-400 rounded-full border-2" style={{ borderColor: 'var(--bg-secondary)' }} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <div className="flex items-center gap-1 min-w-0 flex-1">
                    <span className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                      {getDisplayName(c)}
                    </span>
                    {!!c.is_verified && (
                      <BadgeCheck size={14} className="flex-shrink-0 text-blue-400" />
                    )}
                  </div>
                  <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                    {formatTime(c.last_message_at)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-1 mt-0.5">
                  <p className="text-xs truncate flex-1" style={{ color: 'var(--text-secondary)' }}>
                    {c.last_message_preview || (c.type === 'group' ? t('گروه', 'Group') : c.type === 'channel' ? t('کانال', 'Channel') : t('شروع مکالمه...', 'Start chatting...'))}
                  </p>
                  {!!((c as any).unread_count) && (
                    <span className="min-w-[20px] h-[20px] px-1.5 rounded-full text-[11px] font-bold text-white flex items-center justify-center flex-shrink-0" style={{ background: 'var(--accent)' }}>
                      {(c as any).unread_count > 99 ? '99+' : (c as any).unread_count}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))
        )}
        {/* Sentinel: triggers loading more items when scrolled into view */}
        <div ref={sentinelRef} className="h-1" />
      </div>

      {/* Modals */}
      {modal === 'newChat' && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-sm rounded-2xl overflow-hidden animate-slideUp" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <div className="p-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-color)' }}>
              <button onClick={() => { setModal('none'); setSearchUsers([]); }} style={{ color: 'var(--text-secondary)' }}><X size={20} /></button>
              <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>{t('مکالمه جدید', 'New Chat')}</h3>
            </div>
            <div className="p-3 space-y-2">
              <div className="flex gap-2">
                <button onClick={() => setModal('newGroup')} className="flex-1 py-3 rounded-xl flex flex-col items-center gap-1.5 transition-colors" style={{ background: 'var(--bg-input)' }}>
                  <Users size={20} style={{ color: 'var(--accent)' }} />
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t('گروه جدید', 'New Group')}</span>
                </button>
                <button onClick={() => setModal('newChannel')} className="flex-1 py-3 rounded-xl flex flex-col items-center gap-1.5 transition-colors" style={{ background: 'var(--bg-input)' }}>
                  <Radio size={20} style={{ color: 'var(--accent)' }} />
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t('کانال جدید', 'New Channel')}</span>
                </button>
              </div>
              <div className="relative">
                <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                <input
                  placeholder={t('جستجوی کاربر...', 'Search users...')}
                  className="w-full pr-9 pl-3 py-2.5 rounded-xl text-sm outline-none"
                  style={{ background: 'var(--bg-input)', color: 'var(--text-primary)' }}
                  onChange={(e) => {
                    if (searchTimer.current) clearTimeout(searchTimer.current);
                    searchTimer.current = setTimeout(() => searchForUsers(e.target.value), 300);
                  }}
                />
              </div>
              {searchLoading && <div className="text-center py-2"><div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" /></div>}
              <div className="space-y-1 max-h-60 overflow-y-auto">
                {searchUsers.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => { onSelect(`direct:${u.id}`); setModal('none'); setSearchUsers([]); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-right transition-colors"
                    style={{ background: 'var(--bg-input)' }}
                  >
                    {u.avatar_url ? (
                      <img src={u.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                        <span className="text-white text-sm font-bold">{(u.display_name || u.username).charAt(0).toUpperCase()}</span>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{u.display_name || u.username}</p>
                      <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>@{u.username}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {modal === 'newGroup' && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-sm rounded-2xl overflow-hidden animate-slideUp" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <div className="p-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-color)' }}>
              <button onClick={() => setModal('newChat')} style={{ color: 'var(--text-secondary)' }}><X size={20} /></button>
              <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>{t('گروه جدید', 'New Group')}</h3>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex justify-center">
                <div className="w-16 h-16 rounded-2xl bg-indigo-600 flex items-center justify-center">
                  <Users size={28} className="text-white" />
                </div>
              </div>
              <input
                value={groupName} onChange={(e) => setGroupName(e.target.value)}
                placeholder={t('نام گروه', 'Group name')}
                className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-input)' }}
              />
              <input
                value={groupDesc} onChange={(e) => setGroupDesc(e.target.value)}
                placeholder={t('توضیحات گروه (اختیاری)', 'Description (optional)')}
                className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-input)' }}
              />
              {/* Member Selection */}
              {selectedMembers.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selectedMembers.map((m) => (
                    <span key={m.id} className="flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-blue-600/20 text-blue-300">
                      {m.display_name || m.username}
                      <button onClick={() => toggleMember(m)}><X size={10} /></button>
                    </span>
                  ))}
                </div>
              )}
              <div className="relative">
                <UserPlus size={14} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                <input
                  value={memberSearch} onChange={(e) => { setMemberSearch(e.target.value); searchForMembers(e.target.value); }}
                  placeholder={t('جستجو برای افزودن عضو...', 'Search to add member...')}
                  className="w-full pr-9 pl-3 py-2.5 rounded-xl text-sm outline-none"
                  style={{ background: 'var(--bg-input)', color: 'var(--text-primary)' }}
                />
              </div>
              {memberResults.length > 0 && (
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {memberResults.map((u) => {
                    const selected = !!selectedMembers.find((m) => m.id === u.id);
                    return (
                      <button
                        key={u.id}
                        onClick={() => toggleMember(u)}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-right transition-colors"
                        style={{ background: selected ? 'rgba(37,99,235,0.15)' : 'var(--bg-input)' }}
                      >
                        <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                          <span className="text-white text-xs font-bold">{(u.display_name || u.username).charAt(0).toUpperCase()}</span>
                        </div>
                        <span className="flex-1 text-sm" style={{ color: 'var(--text-primary)' }}>{u.display_name || u.username}</span>
                        {selected && <Check size={14} className="text-blue-400 flex-shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}
              <button
                onClick={handleCreateGroup}
                disabled={!groupName.trim()}
                className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all"
                style={{ background: groupName.trim() ? 'var(--accent)' : 'var(--bg-input)', color: groupName.trim() ? 'white' : 'var(--text-muted)' }}
              >
                {t('ساخت گروه', 'Create Group')} {selectedMembers.length > 0 ? `(${selectedMembers.length + 1} ${t('نفر', 'members')})` : ''}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === 'newChannel' && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-sm rounded-2xl overflow-hidden animate-slideUp" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <div className="p-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-color)' }}>
              <button onClick={() => setModal('newChat')} style={{ color: 'var(--text-secondary)' }}><X size={20} /></button>
              <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>{t('کانال جدید', 'New Channel')}</h3>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex justify-center">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#0ea5e9,#2563eb)' }}>
                  <Hash size={28} className="text-white" />
                </div>
              </div>
              <input
                value={channelName} onChange={(e) => setChannelName(e.target.value)}
                placeholder={t('نام کانال', 'Channel name')}
                className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-input)' }}
              />
              <textarea
                value={channelDesc} onChange={(e) => setChannelDesc(e.target.value)}
                placeholder={t('توضیحات کانال (اختیاری)', 'Description (optional)')}
                rows={3}
                className="w-full px-4 py-3 rounded-xl text-sm outline-none resize-none"
                style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-input)' }}
              />
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('کانال فقط به صورت broadcast است - اعضا نمی‌توانند پیام ارسال کنند', 'Channels are broadcast-only — members cannot send messages')}</p>
              <button
                onClick={handleCreateChannel}
                disabled={!channelName.trim()}
                className="w-full py-3 rounded-xl text-sm font-semibold transition-all"
                style={{ background: channelName.trim() ? 'var(--accent)' : 'var(--bg-input)', color: channelName.trim() ? 'white' : 'var(--text-muted)' }}
              >
                {t('ساخت کانال', 'Create Channel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Long-press Peek Modal ───────────────────────────── */}
      {peekConv && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={closePeek}>
          <div
            className="w-full max-w-sm rounded-t-3xl overflow-hidden animate-slideUp"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Peek header */}
            <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--border-color)' }}>
              <ConvAvatar src={getAvatar(peekConv)} initials={getInitials(peekConv)} type={peekConv.type} />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{getDisplayName(peekConv)}</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {peekConv.type === 'direct' ? (fa ? 'گفتگوی شخصی' : 'Direct message') : peekConv.type === 'group' ? (fa ? 'گروه' : 'Group') : (fa ? 'کانال' : 'Channel')}
                </p>
              </div>
            </div>

            {/* Mini message preview */}
            <div className="px-4 py-3 max-h-52 overflow-y-auto space-y-2" style={{ direction: fa ? 'rtl' : 'ltr' }}>
              {peekMessages.length === 0
                ? <p className="text-xs text-center py-4" style={{ color: 'var(--text-muted)' }}>{fa ? 'هنوز پیامی نیست' : 'No messages yet'}</p>
                : peekMessages.map(msg => {
                    const isOwn = msg.sender_id === user?.id;
                    return (
                      <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                        <div className="max-w-[75%] rounded-2xl px-3 py-1.5 text-xs"
                          style={{ background: isOwn ? 'var(--msg-own-bg)' : 'var(--msg-other-bg)', color: isOwn ? 'var(--msg-own-text)' : 'var(--msg-other-text)' }}>
                          {!isOwn && <p className="text-[10px] font-semibold mb-0.5 opacity-70">{msg.sender?.display_name || msg.sender?.username}</p>}
                          <p className="break-words line-clamp-2">{msg.type === 'image' ? '📷' : msg.type === 'video' ? '🎬' : msg.type === 'audio' ? '🎙️' : msg.content}</p>
                        </div>
                      </div>
                    );
                  })
              }
            </div>

            {/* Action buttons */}
            <div style={{ borderTop: '1px solid var(--border-color)' }}>
              <button className="w-full flex items-center gap-3 px-4 py-3.5 transition-colors"
                style={{ color: 'var(--text-primary)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                onClick={() => markAsRead(peekConv)}>
                <CheckCheck size={18} />
                <span className="text-sm">{fa ? 'علامت‌گذاری به عنوان خوانده‌شده' : 'Mark as read'}</span>
              </button>
              <button className="w-full flex items-center gap-3 px-4 py-3.5 transition-colors"
                style={{ color: 'var(--text-primary)', borderTop: '1px solid var(--border-color)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                onClick={() => toggleMute(peekConv)}>
                {mutedIds.has(peekConv.id) ? <Bell size={18} /> : <BellOff size={18} />}
                <span className="text-sm">{mutedIds.has(peekConv.id) ? (fa ? 'لغو بی‌صدا' : 'Unmute') : (fa ? 'بی‌صدا' : 'Mute')}</span>
              </button>
              <button className="w-full flex items-center gap-3 px-4 py-3.5 transition-colors"
                style={{ color: 'var(--text-primary)', borderTop: '1px solid var(--border-color)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                onClick={() => togglePin(peekConv)}>
                {pinnedIds.has(peekConv.id) ? <PinOff size={18} /> : <Pin size={18} />}
                <span className="text-sm">{pinnedIds.has(peekConv.id) ? (fa ? 'لغو پین' : 'Unpin') : (fa ? 'پین کردن' : 'Pin')}</span>
              </button>
              <button className="w-full flex items-center gap-3 px-4 py-3.5 transition-colors"
                style={{ color: '#ef4444', borderTop: '1px solid var(--border-color)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.08)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                onClick={() => initiateDelete(peekConv)}>
                <Trash2 size={18} />
                <span className="text-sm font-medium">{fa ? 'حذف گفتگو' : 'Delete chat'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Undo Toast ───────────────────────────────── */}
      {deletePending && (
        <div className="fixed bottom-20 inset-x-0 flex justify-center z-[70] px-4"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <div className="flex items-center gap-3 px-4 py-3 rounded-2xl shadow-2xl max-w-sm w-full"
            style={{ background: '#1f2937', border: '1px solid rgba(255,255,255,0.1)' }}>
            <AlertTriangle size={16} className="text-amber-400 flex-shrink-0" />
            <span className="flex-1 text-sm text-white/90">
              {fa ? 'گفتگو حذف خواهد شد' : 'Chat will be deleted'} ({deletePending.countdown}s)
            </span>
            <button onClick={undoDelete} className="text-sm font-bold px-3 py-1 rounded-lg flex-shrink-0"
              style={{ background: 'var(--accent)', color: 'white' }}>
              {fa ? 'بازگردانی' : 'Undo'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
