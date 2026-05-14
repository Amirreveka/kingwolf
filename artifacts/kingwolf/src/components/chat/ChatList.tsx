import { useState, useRef } from 'react';
import { Search, Plus, MessageSquare, Users, Radio, Bookmark, X, Check, Hash, UserPlus, BadgeCheck } from 'lucide-react';
import { Conversation, Profile } from '../../types';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { WolfLogo } from '../ui/WolfLogo';

interface ChatListProps {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreateGroup: (name: string, desc: string, members: string[]) => Promise<void>;
  onCreateChannel: (name: string, desc: string) => Promise<void>;
  onSavedMessages: () => void;
}

type Tab = 'direct' | 'groups' | 'channels';

export function ChatList({ conversations, selectedId, onSelect, onCreateGroup, onCreateChannel, onSavedMessages }: ChatListProps) {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('direct');
  const [search, setSearch] = useState('');
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

  const tabs = [
    { id: 'direct' as Tab, label: 'شخصی', icon: MessageSquare },
    { id: 'groups' as Tab, label: 'گروه‌ها', icon: Users },
    { id: 'channels' as Tab, label: 'کانال‌ها', icon: Radio },
  ];

  const filtered = conversations.filter((c) => {
    if (c.name === '__saved__') return false; // shown as pinned button, not in list
    const matchTab = tab === 'direct'
      ? c.type === 'direct'
      : tab === 'groups' ? c.type === 'group'
      : c.type === 'channel';
    const name = c.type === 'direct' ? (c.other_user?.display_name || c.other_user?.username || c.name) : c.name;
    const matchSearch = !search || name.toLowerCase().includes(search.toLowerCase());
    return matchTab && matchSearch;
  });

  async function searchForUsers(q: string) {
    if (!q.trim()) { setSearchUsers([]); return; }
    setSearchLoading(true);
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .ilike('username', `%${q}%`)
      .neq('id', user?.id)
      .limit(10);
    setSearchUsers((data as Profile[]) || []);
    setSearchLoading(false);
  }

  async function searchForMembers(q: string) {
    if (!q.trim()) { setMemberResults([]); return; }
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .ilike('username', `%${q}%`)
      .neq('id', user?.id)
      .limit(8);
    setMemberResults((data as Profile[]) || []);
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
    if (c.name === '__saved__') return 'پیام‌های ذخیره‌شده';
    if (c.type === 'direct') return c.other_user?.display_name || c.other_user?.username || 'کاربر';
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
    if (diff < 86400000) return d.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
    if (diff < 604800000) return d.toLocaleDateString('fa-IR', { weekday: 'short' });
    return d.toLocaleDateString('fa-IR', { month: 'short', day: 'numeric' });
  }

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-secondary)' }}>
      {/* Header */}
      <div className="p-3 pb-2 flex-shrink-0" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="font-bold text-base flex-1" style={{ color: 'var(--text-primary)' }}>پیام‌ها</h2>
          <button
            onClick={() => setModal('newChat')}
            className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors"
            style={{ background: 'var(--bg-input)' }}
          >
            <Plus size={16} style={{ color: 'var(--text-secondary)' }} />
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="جستجو..."
            className="w-full pr-8 pl-3 py-2 rounded-xl text-sm outline-none"
            style={{ background: 'var(--bg-input)', color: 'var(--text-primary)' }}
          />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--bg-input)' }}>
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex-1 py-1.5 rounded-lg text-xs font-medium flex items-center justify-center gap-1 transition-all"
              style={{
                background: tab === t.id ? 'var(--accent)' : 'transparent',
                color: tab === t.id ? 'white' : 'var(--text-muted)',
              }}
            >
              <t.icon size={12} />
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Saved Messages (only in direct tab) */}
      {tab === 'direct' && (
        <button
          onClick={onSavedMessages}
          className="mx-3 mb-1 px-3 py-2.5 rounded-xl flex items-center gap-3 transition-colors"
          style={{ background: 'rgba(37,99,235,0.08)' }}
        >
          <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
            <Bookmark size={16} className="text-white" />
          </div>
          <div className="text-right flex-1 min-w-0">
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>پیام‌های ذخیره‌شده</p>
            <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>ذخیره پیام‌ها برای خودت</p>
          </div>
        </button>
      )}

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto px-2 space-y-0.5 chat-list-scroll">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            {tab === 'direct' && <MessageSquare size={32} className="mb-3 opacity-30" style={{ color: 'var(--text-muted)' }} />}
            {tab === 'groups' && <Users size={32} className="mb-3 opacity-30" style={{ color: 'var(--text-muted)' }} />}
            {tab === 'channels' && <Radio size={32} className="mb-3 opacity-30" style={{ color: 'var(--text-muted)' }} />}
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {tab === 'direct' ? 'هنوز مکالمه‌ای ندارید' : tab === 'groups' ? 'عضو گروهی نیستید' : 'کانالی ندارید'}
            </p>
            <button
              onClick={() => setModal(tab === 'direct' ? 'newChat' : tab === 'groups' ? 'newGroup' : 'newChannel')}
              className="mt-3 text-xs text-blue-400 hover:text-blue-300"
            >
              {tab === 'direct' ? '+ شروع مکالمه' : tab === 'groups' ? '+ ساخت گروه' : '+ ساخت کانال'}
            </button>
          </div>
        ) : (
          filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              className="w-full px-3 py-2.5 rounded-xl flex items-center gap-3 transition-all text-right"
              style={{
                background: selectedId === c.id ? 'var(--bg-active)' : 'transparent',
              }}
              onMouseEnter={(e) => { if (selectedId !== c.id) e.currentTarget.style.background = 'var(--bg-hover)'; }}
              onMouseLeave={(e) => { if (selectedId !== c.id) e.currentTarget.style.background = 'transparent'; }}
            >
              <div className="relative flex-shrink-0">
                {c.name === 'KingWolf' && (c.type === 'group' || c.type === 'channel') ? (
                  <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg,#1e3a8a,#1d4ed8)' }}>
                    <WolfLogo size={28} />
                  </div>
                ) : getAvatar(c) ? (
                  <img src={getAvatar(c)!} alt="" className="w-10 h-10 rounded-full object-cover" />
                ) : c.type === 'group' ? (
                  <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white text-sm" style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
                    {getInitials(c)}
                  </div>
                ) : c.type === 'channel' ? (
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-white" style={{ background: 'linear-gradient(135deg,#0ea5e9,#2563eb)' }}>
                    <Hash size={16} />
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white text-sm" style={{ background: 'linear-gradient(135deg,#2563eb,#1d4ed8)' }}>
                    {getInitials(c)}
                  </div>
                )}
                {c.type === 'direct' && c.other_user?.online_status === 'online' && (
                  <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-400 rounded-full border-2" style={{ borderColor: 'var(--bg-secondary)' }} />
                )}
              </div>
              <div className="flex-1 min-w-0 text-right">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                    {formatTime(c.last_message_at)}
                  </span>
                  <div className="flex items-center gap-1 min-w-0">
                    <span className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                      {getDisplayName(c)}
                    </span>
                    {!!c.is_verified && (
                      <BadgeCheck size={14} className="flex-shrink-0 text-blue-400" />
                    )}
                  </div>
                </div>
                <p className="text-xs truncate text-right" style={{ color: 'var(--text-secondary)' }}>
                  {c.last_message_preview || (c.type === 'group' ? 'گروه' : c.type === 'channel' ? 'کانال' : 'شروع مکالمه...')}
                </p>
              </div>
            </button>
          ))
        )}
      </div>

      {/* Modals */}
      {modal === 'newChat' && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-sm rounded-2xl overflow-hidden animate-slideUp" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <div className="p-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-color)' }}>
              <button onClick={() => { setModal('none'); setSearchUsers([]); }} style={{ color: 'var(--text-secondary)' }}><X size={20} /></button>
              <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>مکالمه جدید</h3>
            </div>
            <div className="p-3 space-y-2">
              <div className="flex gap-2">
                <button onClick={() => setModal('newGroup')} className="flex-1 py-3 rounded-xl flex flex-col items-center gap-1.5 transition-colors" style={{ background: 'var(--bg-input)' }}>
                  <Users size={20} style={{ color: 'var(--accent)' }} />
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>گروه جدید</span>
                </button>
                <button onClick={() => setModal('newChannel')} className="flex-1 py-3 rounded-xl flex flex-col items-center gap-1.5 transition-colors" style={{ background: 'var(--bg-input)' }}>
                  <Radio size={20} style={{ color: 'var(--accent)' }} />
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>کانال جدید</span>
                </button>
              </div>
              <div className="relative">
                <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                <input
                  placeholder="جستجوی کاربر..."
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
              <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>گروه جدید</h3>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex justify-center">
                <div className="w-16 h-16 rounded-2xl bg-indigo-600 flex items-center justify-center">
                  <Users size={28} className="text-white" />
                </div>
              </div>
              <input
                value={groupName} onChange={(e) => setGroupName(e.target.value)}
                placeholder="نام گروه"
                className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-input)' }}
              />
              <input
                value={groupDesc} onChange={(e) => setGroupDesc(e.target.value)}
                placeholder="توضیحات گروه (اختیاری)"
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
                  placeholder="جستجو برای افزودن عضو..."
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
                ساخت گروه {selectedMembers.length > 0 ? `(${selectedMembers.length + 1} نفر)` : ''}
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
              <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>کانال جدید</h3>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex justify-center">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#0ea5e9,#2563eb)' }}>
                  <Hash size={28} className="text-white" />
                </div>
              </div>
              <input
                value={channelName} onChange={(e) => setChannelName(e.target.value)}
                placeholder="نام کانال"
                className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-input)' }}
              />
              <textarea
                value={channelDesc} onChange={(e) => setChannelDesc(e.target.value)}
                placeholder="توضیحات کانال (اختیاری)"
                rows={3}
                className="w-full px-4 py-3 rounded-xl text-sm outline-none resize-none"
                style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-input)' }}
              />
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>کانال فقط به صورت broadcast است - اعضا نمی‌توانند پیام ارسال کنند</p>
              <button
                onClick={handleCreateChannel}
                disabled={!channelName.trim()}
                className="w-full py-3 rounded-xl text-sm font-semibold transition-all"
                style={{ background: channelName.trim() ? 'var(--accent)' : 'var(--bg-input)', color: channelName.trim() ? 'white' : 'var(--text-muted)' }}
              >
                ساخت کانال
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
