import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, ArrowRight, Smile, MoreVertical, Phone, Video, Users, UserPlus, UserMinus, X, Search, Shield, Crown, Reply, Edit2, Forward, Copy, Trash2, Check, CheckCheck, PhoneOff, MicOff, Mic, VideoOff, Volume2, Info, BadgeCheck } from 'lucide-react';
import { useMessages } from '../../hooks/useMessages';
import { useAuth } from '../../contexts/AuthContext';
import { Conversation, Message, Profile } from '../../types';
import { supabase } from '../../lib/supabase';
import { WolfLogo } from '../ui/WolfLogo';

interface ChatWindowProps {
  conversation: Conversation | null;
  conversations: Conversation[];
  onBack: () => void;
  onSelectConv?: (id: string) => void;
}

const EMOJI_LIST = ['😀','😂','❤️','👍','🔥','✅','🎉','💯','🙏','😍','🤔','😎','👏','🥳','💪','🌟','😊','🤣','😭','🙄'];
const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api';

async function apiCall(path: string, opts: RequestInit = {}) {
  const token = localStorage.getItem('kingwolf_token');
  const headers: Record<string,string> = { 'Content-Type': 'application/json', ...(opts.headers as any) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  try { return await res.json(); } catch { return {}; }
}

function ConvAvatar({ conversation, size = 10 }: { conversation: Conversation; size?: number }) {
  const cls = `w-${size} h-${size} rounded-full flex-shrink-0`;
  if (conversation.name === 'KingWolf') {
    return (
      <div className={`${cls} flex items-center justify-center`} style={{ background: 'linear-gradient(135deg,#1e3a8a,#1d4ed8)' }}>
        <WolfLogo size={size * 3.2} />
      </div>
    );
  }
  if (conversation.avatar_url) return <img src={conversation.avatar_url} className={`${cls} object-cover`} alt="" />;
  if (conversation.type === 'group') return (
    <div className={`${cls} font-bold text-white text-sm flex items-center justify-center`} style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
      {conversation.name.charAt(0).toUpperCase()}
    </div>
  );
  if (conversation.type === 'channel') return (
    <div className={`${cls} text-white flex items-center justify-center`} style={{ background: 'linear-gradient(135deg,#0ea5e9,#2563eb)' }}>
      <span className="text-sm font-bold">#</span>
    </div>
  );
  return (
    <div className={`${cls} bg-blue-600 font-bold text-white text-sm flex items-center justify-center`}>
      {conversation.name.charAt(0).toUpperCase()}
    </div>
  );
}

function renderContent(text: string): React.ReactNode {
  if (!text) return null;
  const regex = /(https?:\/\/[^\s<>"']+)|(www\.[^\s<>"']+)|(@\w+)/g;
  const parts: React.ReactNode[] = [];
  let last = 0, m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const matched = m[0];
    if (matched.startsWith('@')) {
      parts.push(
        <span key={m.index} style={{ color: '#60a5fa', cursor: 'pointer' }}
          onClick={() => {}} className="hover:underline">
          {matched}
        </span>
      );
    } else {
      const href = matched.startsWith('www.') ? `https://${matched}` : matched;
      parts.push(
        <a key={m.index} href={href} target="_blank" rel="noopener noreferrer"
          style={{ color: '#60a5fa' }} className="hover:underline"
          onClick={e => e.stopPropagation()}>
          {matched}
        </a>
      );
    }
    last = m.index + matched.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

export function ChatWindow({ conversation, conversations, onBack, onSelectConv }: ChatWindowProps) {
  const { user, profile } = useAuth();
  const { messages, loading, sendMessage, editMessage, deleteMessage } = useMessages(conversation?.id ?? null);

  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ msg: Message; x: number; y: number } | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [members, setMembers] = useState<(Profile & { role: string })[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [addSearch, setAddSearch] = useState('');
  const [addResults, setAddResults] = useState<Profile[]>([]);
  const [showAddMember, setShowAddMember] = useState(false);

  // Reply / Edit / Forward
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [forwardMsg, setForwardMsg] = useState<Message | null>(null);
  const [copied, setCopied] = useState(false);

  // Call
  const [callState, setCallState] = useState<{ type: 'voice' | 'video'; status: 'calling' | 'active' } | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [videoOn, setVideoOn] = useState(true);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const callTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isAdmin = !!(profile as any)?.is_admin;
  const isGroupOrChannel = conversation?.type === 'group' || conversation?.type === 'channel';
  const isChannel = conversation?.type === 'channel';
  const canSend = !isChannel || conversation?.created_by === user?.id || isAdmin;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    function handleClick() { setShowEmoji(false); setContextMenu(null); setShowHeaderMenu(false); }
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  useEffect(() => {
    if (showInfo && conversation) loadMembers();
  }, [showInfo, conversation?.id]);

  // Call timer
  useEffect(() => {
    if (callState?.status === 'active') {
      callTimerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000);
    } else {
      if (callTimerRef.current) clearInterval(callTimerRef.current);
      setCallDuration(0);
    }
    return () => { if (callTimerRef.current) clearInterval(callTimerRef.current); };
  }, [callState?.status]);

  // Simulate call connection after 2s
  useEffect(() => {
    if (callState?.status === 'calling') {
      const t = setTimeout(() => setCallState(s => s ? { ...s, status: 'active' } : null), 2000);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [callState?.status]);

  // Reset states on conversation change
  useEffect(() => {
    setReplyTo(null);
    setEditingId(null);
    setEditText('');
    setForwardMsg(null);
    setText('');
    setShowInfo(false);
  }, [conversation?.id]);

  async function loadMembers() {
    if (!conversation) return;
    setMembersLoading(true);
    const data = await apiCall(`/conversations/${conversation.id}/members`);
    setMembers(data.data || []);
    setMembersLoading(false);
  }

  async function searchToAdd(q: string) {
    setAddSearch(q);
    if (!q.trim()) { setAddResults([]); return; }
    const { data } = await supabase.from('profiles').select('*').ilike('username', `%${q}%`).limit(8);
    const currentIds = new Set(members.map(m => m.id));
    setAddResults(((data as Profile[]) || []).filter(p => !currentIds.has(p.id)));
  }

  async function addMember(userId: string) {
    if (!conversation) return;
    await apiCall(`/conversations/${conversation.id}/members`, { method: 'POST', body: JSON.stringify({ user_id: userId }) });
    setAddSearch(''); setAddResults([]);
    await loadMembers();
  }

  async function removeMember(userId: string) {
    if (!conversation) return;
    await apiCall(`/conversations/${conversation.id}/members/${userId}`, { method: 'DELETE' });
    await loadMembers();
  }

  async function handleSend() {
    if (sending) return;
    const content = text.trim();
    if (!content) return;

    if (editingId) {
      await editMessage(editingId, content);
      setEditingId(null); setEditText(''); setText('');
      return;
    }

    setSending(true);
    const ok = await sendMessage(content, { replyToId: replyTo?.id });
    if (ok) { setText(''); setReplyTo(null); }
    setSending(false);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    if (e.key === 'Escape') { setReplyTo(null); setEditingId(null); setEditText(''); setText(''); }
  }

  function autoResize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }

  function startEdit(msg: Message) {
    setEditingId(msg.id);
    setEditText(msg.content);
    setText(msg.content);
    setReplyTo(null);
    setContextMenu(null);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }

  function startReply(msg: Message) {
    setReplyTo(msg);
    setEditingId(null);
    setContextMenu(null);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }

  async function handleForward(targetConvId: string) {
    if (!forwardMsg) return;
    await sendMessage(forwardMsg.content, { forwardFromId: forwardMsg.id });
    // Also send to target if different
    if (targetConvId !== conversation?.id) {
      const token = localStorage.getItem('kingwolf_token');
      await fetch(`${API_BASE}/messages/forward`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ messageId: forwardMsg.id, targetConversationId: targetConvId }),
      });
    }
    setForwardMsg(null);
  }

  async function copyText(text: string) {
    try { await navigator.clipboard.writeText(text); } catch { }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    setContextMenu(null);
  }

  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('fa-IR', { weekday: 'long', month: 'long', day: 'numeric' });
  }

  function isSameDay(a: string, b: string) {
    return new Date(a).toDateString() === new Date(b).toDateString();
  }

  function formatCallDuration(s: number) {
    const m = Math.floor(s / 60), sec = s % 60;
    return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  }

  function getDisplayName() {
    if (!conversation) return '';
    if (conversation.name === '__saved__') return 'پیام‌های ذخیره‌شده';
    if (conversation.type === 'direct') return conversation.other_user?.display_name || conversation.other_user?.username || 'کاربر';
    return conversation.name;
  }

  function getStatus() {
    if (!conversation) return '';
    if (conversation.name === '__saved__') return 'پیام‌های شخصی شما';
    if (conversation.type === 'direct') {
      return conversation.other_user?.online_status === 'online' ? 'آنلاین' : 'آفلاین';
    }
    if (conversation.type === 'group') return `${members.length || conversation.member_count || 0} عضو`;
    if (conversation.type === 'channel') return 'کانال';
    return '';
  }

  // Find reply message in current messages list
  const replyMsgMap = Object.fromEntries(messages.map(m => [m.id, m]));

  if (!conversation) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
        <div className="text-center max-w-xs">
          <div className="w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: 'var(--bg-card)' }}>
            <WolfLogo size={48} />
          </div>
          <h3 className="font-bold text-lg mb-2" style={{ color: 'var(--text-primary)' }}>KingWolf Messenger</h3>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>یک مکالمه از فهرست انتخاب کنید</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex min-w-0 overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
      {/* Chat Column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3 shadow-sm" style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border-color)' }}>
          <button onClick={onBack} className="md:hidden p-1 rounded-lg" style={{ color: 'var(--text-secondary)' }}>
            <ArrowRight size={20} />
          </button>
          <button className="flex items-center gap-3 flex-1 min-w-0 text-right" onClick={() => isGroupOrChannel && setShowInfo(v => !v)}>
            {conversation.type === 'direct' && conversation.name !== '__saved__' ? (
              conversation.other_user?.avatar_url
                ? <img src={conversation.other_user.avatar_url} className="w-10 h-10 rounded-full object-cover flex-shrink-0" alt="" />
                : <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0"><span className="text-white font-bold text-sm">{getDisplayName().charAt(0).toUpperCase()}</span></div>
            ) : <ConvAvatar conversation={conversation} size={10} />}
            <div className="min-w-0 text-right">
              <div className="flex items-center gap-1.5">
                <p className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{getDisplayName()}</p>
                {!!conversation.is_verified && <BadgeCheck size={14} className="text-blue-400 flex-shrink-0" />}
              </div>
              <p className="text-xs truncate" style={{ color: conversation.other_user?.online_status === 'online' ? '#4ade80' : 'var(--text-muted)' }}>{getStatus()}</p>
            </div>
          </button>

          <div className="flex items-center gap-1 flex-shrink-0">
            {conversation.type === 'direct' && conversation.name !== '__saved__' && (
              <>
                <button onClick={() => setCallState({ type: 'voice', status: 'calling' })}
                  className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors hover:bg-green-500/10"
                  style={{ color: 'var(--text-secondary)' }} title="تماس صوتی">
                  <Phone size={16} />
                </button>
                <button onClick={() => setCallState({ type: 'video', status: 'calling' })}
                  className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors hover:bg-blue-500/10"
                  style={{ color: 'var(--text-secondary)' }} title="تماس تصویری">
                  <Video size={16} />
                </button>
              </>
            )}
            {isGroupOrChannel && (
              <button onClick={() => setShowInfo(v => !v)}
                className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors"
                style={{ color: showInfo ? 'var(--accent)' : 'var(--text-secondary)', background: showInfo ? 'rgba(37,99,235,0.12)' : 'transparent' }}>
                <Users size={16} />
              </button>
            )}
            {/* Three-dot header menu */}
            <div className="relative">
              <button onClick={e => { e.stopPropagation(); setShowHeaderMenu(v => !v); }}
                className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{ color: 'var(--text-secondary)' }}>
                <MoreVertical size={16} />
              </button>
              {showHeaderMenu && (
                <div className="absolute top-full left-0 mt-1 w-48 rounded-xl py-1 shadow-xl z-50"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
                  onClick={e => e.stopPropagation()}>
                  {isGroupOrChannel && (
                    <button onClick={() => { setShowInfo(true); setShowHeaderMenu(false); }}
                      className="flex items-center gap-2 px-4 py-2.5 w-full text-right text-sm transition-colors hover:bg-white/5"
                      style={{ color: 'var(--text-primary)' }}>
                      <Info size={14} /><span>{conversation.type === 'group' ? 'اعضای گروه' : 'اعضای کانال'}</span>
                    </button>
                  )}
                  <button onClick={async () => {
                    const confirmResult = window.confirm('آیا مطمئنید که می‌خواهید تمام پیام‌های این چت را پاک کنید؟');
                    if (!confirmResult) { setShowHeaderMenu(false); return; }
                    // Clear messages locally
                    for (const msg of messages) { if (msg.sender_id === user?.id || isAdmin) await deleteMessage(msg.id); }
                    setShowHeaderMenu(false);
                  }} className="flex items-center gap-2 px-4 py-2.5 w-full text-right text-sm text-red-400 hover:bg-red-500/10 transition-colors">
                    <Trash2 size={14} /><span>پاک کردن تاریخچه</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1" onClick={() => { setContextMenu(null); setShowHeaderMenu(false); }}>
          {loading && (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {messages.map((msg, idx) => {
            const isOwn = msg.sender_id === user?.id;
            const prevMsg = messages[idx - 1];
            const showDate = !prevMsg || !isSameDay(prevMsg.created_at, msg.created_at);
            const showAvatar = !isOwn && (!messages[idx + 1] || messages[idx + 1].sender_id !== msg.sender_id);
            const repliedMsg = msg.reply_to_id ? replyMsgMap[msg.reply_to_id] : null;

            return (
              <div key={msg.id}>
                {showDate && (
                  <div className="flex justify-center my-3">
                    <span className="text-xs px-3 py-1 rounded-full" style={{ background: 'var(--bg-card)', color: 'var(--text-muted)' }}>
                      {formatDate(msg.created_at)}
                    </span>
                  </div>
                )}
                <div className={`flex items-end gap-2 mb-0.5 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                  {!isOwn && (
                    <div className={`w-7 h-7 flex-shrink-0 ${showAvatar ? '' : 'invisible'}`}>
                      {msg.sender?.avatar_url
                        ? <img src={msg.sender.avatar_url} className="w-7 h-7 rounded-full object-cover" alt="" />
                        : <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center"><span className="text-white text-xs font-bold">{(msg.sender?.display_name || msg.sender?.username || '?').charAt(0).toUpperCase()}</span></div>
                      }
                    </div>
                  )}
                  <div
                    className={`max-w-[72%] rounded-2xl px-3 py-2 cursor-pointer select-text ${isOwn ? 'rounded-br-sm' : 'rounded-bl-sm'}`}
                    style={{
                      background: isOwn ? 'var(--msg-own-bg)' : 'var(--msg-other-bg)',
                      color: isOwn ? 'var(--msg-own-text)' : 'var(--msg-other-text)',
                    }}
                    onContextMenu={e => { e.preventDefault(); setContextMenu({ msg, x: e.clientX, y: e.clientY }); }}
                    onDoubleClick={() => startReply(msg)}
                  >
                    {/* Group sender name */}
                    {!isOwn && conversation.type === 'group' && showAvatar && (
                      <p className="text-xs font-semibold mb-1" style={{ color: '#93c5fd' }}>{msg.sender?.display_name || msg.sender?.username}</p>
                    )}
                    {/* Reply preview */}
                    {repliedMsg && (
                      <div className="mb-1.5 pl-2 border-r-2 border-blue-400 py-0.5 opacity-80 rounded-sm">
                        <p className="text-xs font-semibold" style={{ color: '#93c5fd' }}>{repliedMsg.sender?.display_name || repliedMsg.sender?.username}</p>
                        <p className="text-xs truncate opacity-70">{repliedMsg.content}</p>
                      </div>
                    )}
                    {/* Forwarded label */}
                    {msg.forwarded_from_id && (
                      <p className="text-xs opacity-60 mb-0.5 flex items-center gap-1"><Forward size={10} />فوروارد شده</p>
                    )}
                    {/* Content with link detection */}
                    <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">{renderContent(msg.content)}</p>
                    {/* Footer */}
                    <div className={`flex items-center gap-1 mt-0.5 ${isOwn ? 'justify-start flex-row-reverse' : 'justify-end'}`}>
                      {!!msg.is_edited && <span className="text-xs opacity-40">ویرایش‌شده</span>}
                      <span className="text-xs opacity-60">{formatTime(msg.created_at)}</span>
                      {isOwn && <CheckCheck size={13} className="opacity-60" />}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* Context Menu */}
        {contextMenu && (
          <div
            className="fixed z-50 rounded-xl py-1 shadow-xl overflow-hidden w-44"
            style={{ left: contextMenu.x, top: contextMenu.y, background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
            onClick={e => e.stopPropagation()}
          >
            {[
              { icon: Reply, label: 'ریپلای', color: 'var(--text-primary)', action: () => startReply(contextMenu.msg) },
              ...(contextMenu.msg.sender_id === user?.id ? [{ icon: Edit2, label: 'ویرایش', color: 'var(--text-primary)', action: () => startEdit(contextMenu.msg) }] : []),
              { icon: Forward, label: 'فوروارد', color: 'var(--text-primary)', action: () => { setForwardMsg(contextMenu.msg); setContextMenu(null); } },
              { icon: Copy, label: 'کپی متن', color: 'var(--text-primary)', action: () => copyText(contextMenu.msg.content) },
              ...(contextMenu.msg.sender_id === user?.id || isAdmin ? [{ icon: Trash2, label: 'حذف', color: '#f87171', action: () => { deleteMessage(contextMenu.msg.id); setContextMenu(null); } }] : []),
            ].map(item => (
              <button key={item.label}
                className="flex items-center gap-2.5 px-3 py-2.5 w-full text-right text-sm transition-colors hover:bg-white/5"
                style={{ color: item.color }}
                onClick={item.action}>
                <item.icon size={14} /><span>{item.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Copied toast */}
        {copied && (
          <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl text-sm text-white" style={{ background: 'rgba(0,0,0,0.8)' }}>
            کپی شد ✓
          </div>
        )}

        {/* Reply / Edit bar */}
        {(replyTo || editingId) && (
          <div className="flex-shrink-0 flex items-center gap-2 px-4 py-2" style={{ background: 'var(--bg-card)', borderTop: '1px solid var(--border-color)' }}>
            <div className="flex-1 min-w-0 pr-2 border-r-2 border-blue-400">
              <p className="text-xs font-semibold" style={{ color: '#60a5fa' }}>
                {editingId ? '✏️ ویرایش پیام' : `↩ ریپلای به ${replyTo?.sender?.display_name || replyTo?.sender?.username}`}
              </p>
              <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                {editingId ? editText : replyTo?.content}
              </p>
            </div>
            <button onClick={() => { setReplyTo(null); setEditingId(null); setEditText(''); if (editingId) setText(''); }}
              className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center"
              style={{ background: 'var(--bg-input)', color: 'var(--text-muted)' }}>
              <X size={12} />
            </button>
          </div>
        )}

        {/* Input */}
        {canSend ? (
          <div className="flex-shrink-0 p-3" style={{ background: 'var(--bg-card)', borderTop: '1px solid var(--border-color)' }}>
            <div className="flex items-end gap-2 p-2 rounded-2xl" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)' }}>
              <div className="relative flex-shrink-0">
                <button onClick={e => { e.stopPropagation(); setShowEmoji(!showEmoji); }}
                  className="w-8 h-8 flex items-center justify-center rounded-xl mb-0.5"
                  style={{ color: 'var(--text-muted)' }}>
                  <Smile size={18} />
                </button>
                {showEmoji && (
                  <div className="absolute bottom-10 right-0 p-2 rounded-2xl grid grid-cols-5 gap-1 shadow-xl z-10"
                    style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
                    onClick={e => e.stopPropagation()}>
                    {EMOJI_LIST.map(em => (
                      <button key={em} onClick={() => { setText(t => t + em); setShowEmoji(false); textareaRef.current?.focus(); }}
                        className="w-8 h-8 rounded-lg text-lg flex items-center justify-center hover:bg-blue-500/10">
                        {em}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <textarea
                ref={textareaRef}
                value={text}
                onChange={e => { setText(e.target.value); autoResize(); }}
                onKeyDown={handleKey}
                placeholder={editingId ? 'ویرایش پیام...' : conversation.name === '__saved__' ? 'یادداشت بنویسید...' : 'پیام بنویسید...'}
                rows={1}
                className="flex-1 bg-transparent outline-none text-sm resize-none py-1.5 min-h-[32px] max-h-[120px]"
                style={{ color: 'var(--text-primary)' }}
              />
              <button onClick={handleSend} disabled={!text.trim() || sending}
                className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mb-0.5 transition-all"
                style={{ background: text.trim() ? (editingId ? '#10b981' : 'var(--accent)') : 'transparent', color: text.trim() ? 'white' : 'var(--text-muted)' }}>
                {sending
                  ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  : editingId ? <Check size={15} /> : <Send size={15} />}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-shrink-0 p-3 text-center" style={{ background: 'var(--bg-card)', borderTop: '1px solid var(--border-color)' }}>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>فقط مدیران می‌توانند در کانال پیام ارسال کنند</p>
          </div>
        )}
      </div>

      {/* Info / Members Panel */}
      {showInfo && isGroupOrChannel && (
        <div className="fixed inset-0 z-50 md:static md:z-auto md:inset-auto md:w-72 flex-shrink-0 flex flex-col overflow-hidden" style={{ background: 'var(--bg-secondary)', borderRight: '1px solid var(--border-color)' }}>
          <div className="flex-shrink-0 px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-color)', background: 'var(--bg-card)' }}>
            <button onClick={() => setShowInfo(false)} style={{ color: 'var(--text-secondary)' }}><X size={18} /></button>
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              {conversation.type === 'group' ? 'اعضای گروه' : 'اعضای کانال'}
            </span>
          </div>
          <div className="flex-shrink-0 p-4 text-center" style={{ borderBottom: '1px solid var(--border-color)' }}>
            <div className="flex justify-center mb-2"><ConvAvatar conversation={conversation} size={16} /></div>
            <p className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>{conversation.name}</p>
            {conversation.description && <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{conversation.description}</p>}
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{members.length} {conversation.type === 'group' ? 'عضو' : 'مشترک'}</p>
          </div>
          {isAdmin && (
            <div className="flex-shrink-0 px-3 py-2" style={{ borderBottom: '1px solid var(--border-color)' }}>
              {showAddMember ? (
                <div className="space-y-2">
                  <div className="relative">
                    <Search size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                    <input value={addSearch} onChange={e => searchToAdd(e.target.value)} placeholder="جستجوی کاربر..."
                      className="w-full pr-8 pl-3 py-2 rounded-xl text-xs outline-none" style={{ background: 'var(--bg-input)', color: 'var(--text-primary)' }} autoFocus />
                  </div>
                  <div className="space-y-1 max-h-36 overflow-y-auto">
                    {addResults.map(u => (
                      <button key={u.id} onClick={() => addMember(u.id)}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-xl text-right transition-colors"
                        style={{ background: 'var(--bg-input)' }}>
                        {u.avatar_url ? <img src={u.avatar_url} className="w-7 h-7 rounded-full object-cover flex-shrink-0" alt="" />
                          : <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0"><span className="text-white text-xs font-bold">{(u.display_name||u.username).charAt(0)}</span></div>}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>{u.display_name || u.username}</p>
                          <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>@{u.username}</p>
                        </div>
                        <UserPlus size={12} className="text-blue-400 flex-shrink-0" />
                      </button>
                    ))}
                  </div>
                  <button onClick={() => { setShowAddMember(false); setAddSearch(''); setAddResults([]); }} className="text-xs w-full text-center" style={{ color: 'var(--text-muted)' }}>بستن</button>
                </div>
              ) : (
                <button onClick={() => setShowAddMember(true)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-xl transition-colors"
                  style={{ background: 'rgba(37,99,235,0.1)', color: '#60a5fa' }}>
                  <UserPlus size={14} />
                  <span className="text-xs font-medium">افزودن عضو</span>
                </button>
              )}
            </div>
          )}
          <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
            {membersLoading ? <div className="flex justify-center py-6"><div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
              : members.map(m => (
              <div key={m.id} className="flex items-center gap-2.5 px-2 py-2 rounded-xl">
                <div className="relative flex-shrink-0">
                  {m.avatar_url ? <img src={m.avatar_url} className="w-9 h-9 rounded-full object-cover" alt="" />
                    : <div className="w-9 h-9 rounded-full bg-blue-700 flex items-center justify-center"><span className="text-white text-xs font-bold">{(m.display_name||m.username).charAt(0).toUpperCase()}</span></div>}
                  {m.online_status === 'online' && <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-400 rounded-full border-2" style={{ borderColor: 'var(--bg-secondary)' }} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>{m.display_name || m.username}</span>
                    {m.role === 'admin' && <Crown size={10} className="text-yellow-400 flex-shrink-0" />}
                    {(m as any).is_admin && <Shield size={10} className="text-blue-400 flex-shrink-0" />}
                  </div>
                  <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>@{m.username}</p>
                </div>
                {isAdmin && m.id !== user?.id && (
                  <button onClick={() => removeMember(m.id)} title="حذف از گروه"
                    className="flex-shrink-0 w-6 h-6 rounded-lg flex items-center justify-center hover:bg-red-500/20"
                    style={{ color: 'var(--text-muted)' }}>
                    <UserMinus size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* FORWARD MODAL */}
      {forwardMsg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }} onClick={() => setForwardMsg(null)}>
          <div className="w-full max-w-sm rounded-2xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }} onClick={e => e.stopPropagation()} dir="rtl">
            <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-color)' }}>
              <button onClick={() => setForwardMsg(null)} style={{ color: 'var(--text-secondary)' }}><X size={18} /></button>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>فوروارد به...</h3>
            </div>
            <div className="max-h-80 overflow-y-auto p-2 space-y-1">
              {conversations.filter(c => c.name !== '__saved__').map(c => (
                <button key={c.id} onClick={() => handleForward(c.id)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-right transition-colors hover:bg-white/5">
                  {c.type === 'direct' && c.other_user?.avatar_url
                    ? <img src={c.other_user.avatar_url} className="w-9 h-9 rounded-full object-cover flex-shrink-0" alt="" />
                    : <ConvAvatar conversation={c} size={9} />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                      {c.type === 'direct' ? (c.other_user?.display_name || c.other_user?.username) : c.name}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {c.type === 'direct' ? 'پیام خصوصی' : c.type === 'group' ? 'گروه' : 'کانال'}
                    </p>
                  </div>
                  <Forward size={14} style={{ color: 'var(--text-muted)' }} />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* CALL OVERLAY */}
      {callState && (
        <div className="fixed inset-0 z-[60] flex flex-col items-center justify-between py-16"
          style={{ background: callState.type === 'video' ? '#0a0a0a' : 'linear-gradient(135deg,#1e3a5f,#0f1b2d)' }}>
          {/* Call header */}
          <div className="text-center">
            <p className="text-white/60 text-sm mb-1">{callState.type === 'voice' ? '🎙️ تماس صوتی' : '📹 تماس تصویری'}</p>
            <h2 className="text-white text-2xl font-bold">{getDisplayName()}</h2>
            <p className="text-white/60 text-sm mt-1">
              {callState.status === 'calling' ? 'در حال برقراری ارتباط...' : formatCallDuration(callDuration)}
            </p>
          </div>

          {/* Avatar */}
          <div className="flex flex-col items-center">
            {conversation.other_user?.avatar_url
              ? <img src={conversation.other_user.avatar_url} className="w-32 h-32 rounded-full object-cover border-4 border-white/20" alt="" />
              : <div className="w-32 h-32 rounded-full bg-blue-700 flex items-center justify-center border-4 border-white/20"><span className="text-white text-5xl font-bold">{getDisplayName().charAt(0)}</span></div>
            }
            {callState.status === 'calling' && (
              <div className="mt-4 flex gap-1">
                {[0,1,2].map(i => (
                  <div key={i} className="w-2 h-2 rounded-full bg-white/40 animate-pulse" style={{ animationDelay: `${i*0.3}s` }} />
                ))}
              </div>
            )}
          </div>

          {/* Call controls */}
          <div className="flex items-center gap-6">
            <button onClick={() => setMuted(!muted)}
              className="w-14 h-14 rounded-full flex items-center justify-center transition-colors"
              style={{ background: muted ? '#ef4444' : 'rgba(255,255,255,0.15)' }}>
              {muted ? <MicOff size={22} className="text-white" /> : <Mic size={22} className="text-white" />}
            </button>
            <button onClick={() => { setCallState(null); setMuted(false); setSpeakerOn(true); setVideoOn(true); }}
              className="w-16 h-16 rounded-full flex items-center justify-center bg-red-600 hover:bg-red-500 transition-colors">
              <PhoneOff size={26} className="text-white" />
            </button>
            {callState.type === 'video' ? (
              <button onClick={() => setVideoOn(!videoOn)}
                className="w-14 h-14 rounded-full flex items-center justify-center transition-colors"
                style={{ background: videoOn ? 'rgba(255,255,255,0.15)' : '#ef4444' }}>
                {videoOn ? <Video size={22} className="text-white" /> : <VideoOff size={22} className="text-white" />}
              </button>
            ) : (
              <button onClick={() => setSpeakerOn(!speakerOn)}
                className="w-14 h-14 rounded-full flex items-center justify-center transition-colors"
                style={{ background: speakerOn ? 'rgba(255,255,255,0.15)' : '#ef4444' }}>
                <Volume2 size={22} className="text-white" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
