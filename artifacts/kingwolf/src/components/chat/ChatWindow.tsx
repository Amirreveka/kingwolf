import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, ArrowRight, Smile, MoreVertical, Phone, Video, Users, UserPlus, UserMinus, X, Search, Shield, Crown, Reply, Edit2, Forward, Copy, Trash2, Check, CheckCheck, PhoneOff, MicOff, Mic, VideoOff, Volume2, Info, BadgeCheck, Paperclip, FileText, Image, Film, FileUp, MapPin, Link2, Flag, BellOff, LogOut, Square, Download, Mic2 } from 'lucide-react';
import { useMessages } from '../../hooks/useMessages';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { Conversation, Message, Profile } from '../../types';
import { supabase } from '../../lib/supabase';
import { WolfLogo } from '../ui/WolfLogo';
import { Avatar } from '../Avatar';

interface ChatWindowProps {
  conversation: Conversation | null;
  conversations: Conversation[];
  onBack: () => void;
  onSelectConv?: (id: string) => void;
  onStartCall?: (type: 'voice' | 'video', targetUserId: string) => void;
}

const EMOJI_CATEGORIES = {
  '😀': ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🫡','🤐','🤨','😐','😑','😶','😶‍🌫️','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🤧','🥵','🥶','🥴','😵','💫','🤯','🤠','🥸','😎','🧐','🤓','😭','😢','😥','😓','🤗','😤','😠','😡','🤬','😈','👿','💀','☠️','💩','🤡','👹','👺','👻','👽','👾','🤖'],
  '👋': ['👋','🤚','🖐','✋','🖖','🫱','🫲','🫳','🫴','👌','🤌','🤏','✌️','🤞','🫰','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','🫵','👍','👎','✊','👊','🤛','🤜','👏','🙌','🫶','👐','🤲','🙏','✍️','💅','🤳','💪','🦾','🦿','🦵','🦶','👂','🦻','👃','🫀','🫁','🧠','🦷','🦴','👀','👁','👅','👄','🫦'],
  '❤️': ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❤️‍🔥','❤️‍🩹','❣️','💕','💞','💓','💗','💖','💘','💝','💟','☮️','✝️','☪️','🕉','☸️','🪯','✡️','🔯','🕎','☯️','☦️','🛐','⛎','♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓','🆔','⚕️'],
  '🐶': ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐒','🦆','🐦','🦅','🦉','🦇','🐝','🪱','🐛','🦋','🐌','🐞','🐜','🪲','🦟','🦗','🕷','🦂','🐢','🐍','🦎','🦖','🦕','🐙','🦑','🦐','🦞','🦀','🐡','🐟','🐠','🐬','🐳','🐋','🦈','🐊','🐅','🐆','🦓','🫏','🦍','🦧','🦣','🐘','🦛','🦏','🐪','🐫','🦒','🦘','🦬','🐃','🐂','🐄','🐎','🐖','🐏','🐑','🦙','🐐','🦌','🐕','🐩','🦮','🐕‍🦺','🐈','🐈‍⬛','🪶','🐓','🦃','🦤','🦚','🦜','🦢','🦩','🕊','🐇','🦝','🦨','🦡','🦫','🦦','🦥','🐁','🐀','🐿','🦔'],
  '🍎': ['🍎','🍐','🍊','🍋','🍋‍🟩','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🍆','🥑','🫛','🥦','🥬','🥒','🌶','🫑','🧄','🧅','🥔','🌽','🍠','🫚','🥐','🥯','🍞','🥖','🥨','🧀','🥚','🍳','🧈','🥞','🧇','🥓','🥩','🍗','🍖','🦴','🌭','🍔','🍟','🍕','🫓','🥪','🥙','🧆','🌮','🌯','🫔','🥗','🥘','🫕','🥫','🍝','🍜','🍲','🍛','🍣','🍱','🥟','🦪','🍤','🍙','🍚','🍘','🍥','🥮','🍢','🧁','🍰','🎂','🍮','🍭','🍬','🍫','🍿','🍩','🍪','🌰','🥜','🍯','🧃','🥤','🧋','☕','🍵','🫖','🍺','🍻','🥂','🍷','🫗','🥃','🍸','🍹','🧉','🍾','🧊'],
  '⚽': ['⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🪀','🏓','🏸','🏒','🏑','🥍','🏏','🪃','🥅','⛳','🪁','🎣','🤿','🎽','🎿','🛷','🥌','🎯','🪃','🎱','🔫','🎮','🕹','🎰','🎲','♟','🧩','🪅','🎭','🎨','🖼','🎪','🎤','🎧','🎼','🎹','🥁','🪘','🎷','🎺','🪗','🎸','🪕','🎻','🎬','🎥','📽','🎞','📞','☎️','📟','📠','📺','📻','🧭','⏱','⏰','🕰','⌛','📡','🔋','🔌','💡','🔦','🕯','🪔','🧱','💰','💴','💵','💶','💷','💸','💳','🪙','💹'],
  '🚗': ['🚗','🚕','🚙','🚌','🚎','🏎','🚓','🚑','🚒','🚐','🛻','🚚','🚛','🚜','🏍','🛵','🚲','🛴','🛹','🛼','🚏','🛣','🛤','⛽','🚨','🚥','🚦','🛑','🚧','⚓','🛟','⛵','🚤','🛥','🛳','⛴','🚢','✈️','🛩','🛫','🛬','💺','🚁','🚟','🚠','🚡','🛰','🚀','🛸','🪂','🪐','🌍','🌎','🌏','🌐','🗺','🧭','🏔','⛰','🌋','🗻','🏕','🏖','🏜','🏝','🏞','🏟','🏛','🏗','🧱','🏘','🏚','🏠','🏡','🏢','🏣','🏤','🏥','🏦','🏨','🏩','🏪','🏫','🏬','🏭','🏯','🏰','💒','🗼','🗽','⛪','🕌','🛕','🕍','⛩','🕋','⛲','⛺','🏕','🌁','🌃','🏙','🌄','🌅','🌆','🌇','🌉','♨️','🌌','🌠','🎇','🎆','🗾'],
  '💯': ['💯','🔥','✨','🌟','⭐','🌈','☀️','🌤','⛅','🌥','☁️','🌦','🌧','⛈','🌩','🌨','❄️','☃️','⛄','🌬','💨','💧','💦','☔','☂️','🌊','🌀','🌪','🌫','🌈','🌂','🔑','🗝','🔒','🔓','🔏','🔐','🔔','🔕','🔇','🔈','🔉','🔊','📢','📣','📯','🔔','🔕','🎵','🎶','🎼','🎹','🥁','🎷','🎺','🎸','🎻','🎤','🎧','📻','🎙','🎚','🎛','📱','📲','💻','⌨️','🖥','🖨','🖱','🖲','💾','💿','📀','📷','📸','📹','🎥','📽','🎞','📞','☎️','📟','📠','📺','📻','🧭','⏱','⏲','⏰','🕰','⌛','⏳'],
};

const EMOJI_CAT_LABELS: Record<string, string> = {
  '😀': 'چهره', '👋': 'دست', '❤️': 'احساس', '🐶': 'حیوانات', '🍎': 'غذا', '⚽': 'ورزش', '🚗': 'سفر', '💯': 'متفرقه'
};
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

export function ChatWindow({ conversation, conversations, onBack, onSelectConv, onStartCall }: ChatWindowProps) {
  const { user, profile } = useAuth();
  const { language } = useTheme();
  const fa = language === 'fa';
  const { messages, loading, sendMessage, sendMediaMessage, editMessage, deleteMessage, readMessageIds, reactions, toggleReaction } = useMessages(conversation?.id ?? null);

  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [emojiCat, setEmojiCat] = useState('😀');
  const [contextMenu, setContextMenu] = useState<{ msg: Message; x: number; y: number } | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [members, setMembers] = useState<(Profile & { role: string })[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [addSearch, setAddSearch] = useState('');
  const [addResults, setAddResults] = useState<Profile[]>([]);
  const [showAddMember, setShowAddMember] = useState(false);
  const [memberCount, setMemberCount] = useState(0);
  const [membersRestricted, setMembersRestricted] = useState(false);
  const [myConvRole, setMyConvRole] = useState<string>('member');
  const [showSetUsername, setShowSetUsername] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [usernameMsg, setUsernameMsg] = useState('');

  // Reply / Edit / Forward
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [forwardMsg, setForwardMsg] = useState<Message | null>(null);
  const [copied, setCopied] = useState(false);

  const [showUserProfile, setShowUserProfile] = useState<Profile | null>(null);

  const [showReport, setShowReport] = useState<{ type: 'user' | 'group' | 'channel'; targetId: string; name: string } | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [reportDetails, setReportDetails] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportDone, setReportDone] = useState(false);
  const [recording, setRecording] = useState(false);
  const [chatMuted, setChatMuted] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [showAttach, setShowAttach] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isAdmin = !!(profile as any)?.is_admin;
  const isGroupOrChannel = conversation?.type === 'group' || conversation?.type === 'channel';
  const isChannel = conversation?.type === 'channel';
  const isConvAdmin = myConvRole === 'owner' || myConvRole === 'admin' || isAdmin;
  const isConvOwner = myConvRole === 'owner' || conversation?.created_by === user?.id || isAdmin;
  const canSend = !isChannel || isConvAdmin;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    function handleClick() { setShowEmoji(false); setContextMenu(null); setShowHeaderMenu(false); setShowAttach(false); }
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  useEffect(() => {
    if (showInfo && conversation) loadMembers();
  }, [showInfo, conversation?.id]);

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
    try {
      const data = await apiCall(`/conversations/${conversation.id}/members`);
      setMembers(data.data || []);
      setMemberCount(data.count || data.data?.length || 0);
      setMembersRestricted(!!data.restricted);
      const me = (data.data || []).find((m: any) => m.id === user?.id);
      if (me) setMyConvRole(me.role || 'member');
    } catch {
      setMembers([]);
    } finally {
      setMembersLoading(false);
    }
  }

  async function promoteMember(userId: string) {
    if (!conversation) return;
    await apiCall(`/conversations/${conversation.id}/promote`, { method: 'POST', body: JSON.stringify({ user_id: userId, permissions: ['post_messages', 'delete_messages', 'add_members'] }) });
    await loadMembers();
  }

  async function demoteMember(userId: string) {
    if (!conversation) return;
    await apiCall(`/conversations/${conversation.id}/demote`, { method: 'POST', body: JSON.stringify({ user_id: userId }) });
    await loadMembers();
  }

  async function setConvUsername() {
    if (!conversation || !newUsername.trim()) return;
    const r = await apiCall(`/conversations/${conversation.id}/username`, { method: 'POST', body: JSON.stringify({ username: newUsername.trim() }) });
    if (r.ok) { setUsernameMsg(fa ? '✓ ذخیره شد' : '✓ Saved'); setTimeout(() => { setUsernameMsg(''); setShowSetUsername(false); }, 1500); }
    else setUsernameMsg(r.error || 'error');
  }

  async function searchToAdd(q: string) {
    setAddSearch(q);
    if (!q.trim() || q.length < 3) { setAddResults([]); return; }
    const { data } = await supabase.from('profiles').select('*').ilike('username', `${q}%`).limit(20);
    const currentIds = new Set(members.map(m => m.id));
    // Only show users where query covers at least 80% of their username (security: item 4)
    const filtered = ((data as Profile[]) || []).filter(p =>
      !currentIds.has(p.id) && q.length >= Math.ceil(p.username.length * 0.8)
    );
    setAddResults(filtered);
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

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !conversation) return;
    e.target.value = '';
    setUploadingFile(true);
    await sendMediaMessage(file, { replyToId: replyTo?.id });
    setReplyTo(null);
    setUploadingFile(false);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  }

  async function startVoiceRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4'
        : '';
      const mr = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      const ext = mimeType.includes('mp4') ? 'm4a' : mimeType.includes('ogg') ? 'ogg' : 'webm';
      audioChunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const actualMime = mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: actualMime });
        const file = new File([blob], `voice_${Date.now()}.${ext}`, { type: actualMime });
        setRecording(false);
        setUploadingFile(true);
        await sendMediaMessage(file, { replyToId: replyTo?.id });
        setReplyTo(null);
        setUploadingFile(false);
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setRecording(true);
    } catch {
      alert(fa ? 'دسترسی به میکروفن داده نشد' : 'Microphone access denied');
    }
  }

  function stopVoiceRecording() {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
  }

  async function submitReport() {
    if (!showReport || !reportReason || reportSubmitting) return;
    setReportSubmitting(true);
    try {
      await apiCall('/reports', {
        method: 'POST',
        body: JSON.stringify({ target_type: showReport.type, target_id: showReport.targetId, reason: reportReason, details: reportDetails }),
      });
      setReportDone(true);
      setTimeout(() => { setShowReport(null); setReportReason(''); setReportDetails(''); setReportDone(false); setReportSubmitting(false); }, 1500);
    } catch {
      setReportSubmitting(false);
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).catch(() => {
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    });
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

  function getDisplayName() {
    if (!conversation) return '';
    if (conversation.name === '__saved__') return fa ? 'پیام‌های ذخیره‌شده' : 'Saved Messages';
    if (conversation.type === 'direct') return conversation.other_user?.display_name || conversation.other_user?.username || (fa ? 'کاربر' : 'User');
    return conversation.name;
  }

  function formatLastSeen(lastSeen: string | undefined): string {
    if (!lastSeen) return fa ? 'آفلاین' : 'Offline';
    const diff = Math.floor((Date.now() - new Date(lastSeen).getTime()) / 1000);
    if (diff < 60) return fa ? 'لحظاتی پیش' : 'just now';
    if (diff < 3600) { const m = Math.floor(diff / 60); return fa ? `${m} دقیقه پیش` : `${m}m ago`; }
    if (diff < 86400) { const h = Math.floor(diff / 3600); return fa ? `${h} ساعت پیش` : `${h}h ago`; }
    const d = Math.floor(diff / 86400);
    return fa ? `${d} روز پیش` : `${d}d ago`;
  }

  function getStatus() {
    if (!conversation) return '';
    if (conversation.name === '__saved__') return fa ? 'پیام‌های شخصی شما' : 'Your personal messages';
    if (conversation.type === 'direct') {
      const ou = conversation.other_user;
      if (ou?.online_status === 'online') return fa ? 'آنلاین' : 'Online';
      return fa ? `آخرین بازدید: ${formatLastSeen(ou?.last_seen)}` : `Last seen: ${formatLastSeen(ou?.last_seen)}`;
    }
    const cnt = memberCount || members.length || (conversation as any).member_count || 0;
    if (conversation.type === 'group') return `${cnt} ${fa ? 'عضو' : 'members'}`;
    if (conversation.type === 'channel') return `${cnt} ${fa ? 'مشترک' : 'subscribers'}`;
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
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {fa ? 'یک مکالمه از فهرست انتخاب کنید' : 'Select a conversation from the list'}
          </p>
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
          <button className="flex items-center gap-3 flex-1 min-w-0 text-right" onClick={() => {
            if (isGroupOrChannel) { setShowInfo(v => !v); }
            else if (conversation.other_user && conversation.name !== '__saved__') { setShowUserProfile(conversation.other_user as any); }
          }}>
            {conversation.type === 'direct' && conversation.name !== '__saved__' ? (
              <Avatar src={conversation.other_user?.avatar_url} name={conversation.other_user?.display_name} username={conversation.other_user?.username} size={40} />
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
                <button onClick={() => conversation.other_user?.id && onStartCall?.('voice', conversation.other_user.id)}
                  className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors hover:bg-green-500/10"
                  style={{ color: 'var(--text-secondary)' }} title="تماس صوتی">
                  <Phone size={16} />
                </button>
                <button onClick={() => conversation.other_user?.id && onStartCall?.('video', conversation.other_user.id)}
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
                <div className={`absolute top-full ${fa ? 'left-0' : 'right-0'} mt-1 w-56 rounded-2xl py-1.5 shadow-2xl z-50`}
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
                  onClick={e => e.stopPropagation()}>
                  {isGroupOrChannel && (
                    <button onClick={() => { setShowInfo(true); setShowHeaderMenu(false); }}
                      className="flex items-center gap-3 px-4 py-2.5 w-full text-right text-sm transition-colors hover:bg-white/5"
                      style={{ color: 'var(--text-primary)' }}>
                      <Info size={15} /><span>{conversation.type === 'group' ? (fa ? 'اطلاعات گروه' : 'Group Info') : (fa ? 'اطلاعات کانال' : 'Channel Info')}</span>
                    </button>
                  )}
                  {conversation.type === 'direct' && conversation.name !== '__saved__' && (
                    <button onClick={() => { setShowUserProfile(conversation.other_user as any); setShowHeaderMenu(false); }}
                      className="flex items-center gap-3 px-4 py-2.5 w-full text-right text-sm transition-colors hover:bg-white/5"
                      style={{ color: 'var(--text-primary)' }}>
                      <Users size={15} /><span>{fa ? 'مشاهده پروفایل' : 'View Profile'}</span>
                    </button>
                  )}
                  <button onClick={() => { setChatMuted(v => !v); setShowHeaderMenu(false); }}
                    className="flex items-center gap-3 px-4 py-2.5 w-full text-right text-sm transition-colors hover:bg-white/5"
                    style={{ color: 'var(--text-primary)' }}>
                    <BellOff size={15} /><span>{chatMuted ? (fa ? 'رفع سکوت' : 'Unmute') : (fa ? 'بی‌صدا' : 'Mute')}</span>
                  </button>
                  {isGroupOrChannel && (conversation as any).username && (
                    <button onClick={() => {
                      const link = `${window.location.origin}/@${(conversation as any).username}`;
                      copyToClipboard(link);
                      setShowHeaderMenu(false);
                      alert(fa ? 'لینک کپی شد' : 'Link copied');
                    }}
                      className="flex items-center gap-3 px-4 py-2.5 w-full text-right text-sm transition-colors hover:bg-white/5"
                      style={{ color: 'var(--text-primary)' }}>
                      <Link2 size={15} /><span>{fa ? 'کپی لینک' : 'Copy Link'}</span>
                    </button>
                  )}
                  <div style={{ height: 1, background: 'var(--border-color)', margin: '4px 0' }} />
                  {isGroupOrChannel && !isConvOwner && (
                    <button onClick={async () => {
                      if (!window.confirm(fa ? 'از گروه خارج شوید؟' : 'Leave group?')) { setShowHeaderMenu(false); return; }
                      await apiCall(`/conversations/${conversation.id}/leave`, { method: 'POST' });
                      setShowHeaderMenu(false);
                    }}
                      className="flex items-center gap-3 px-4 py-2.5 w-full text-right text-sm transition-colors hover:bg-red-500/10"
                      style={{ color: '#f87171' }}>
                      <LogOut size={15} /><span>{fa ? 'خروج از گروه' : 'Leave Group'}</span>
                    </button>
                  )}
                  {conversation.type !== 'direct' && !isConvOwner && (
                    <button onClick={() => {
                      setShowReport({ type: conversation.type as any, targetId: conversation.id, name: conversation.name });
                      setShowHeaderMenu(false);
                    }}
                      className="flex items-center gap-3 px-4 py-2.5 w-full text-right text-sm transition-colors hover:bg-red-500/10"
                      style={{ color: '#f87171' }}>
                      <Flag size={15} /><span>{fa ? 'گزارش' : 'Report'}</span>
                    </button>
                  )}
                  {conversation.type === 'direct' && conversation.name !== '__saved__' && (
                    <button onClick={() => {
                      const otherId = conversation.other_user?.id;
                      if (otherId) setShowReport({ type: 'user', targetId: otherId, name: conversation.other_user?.display_name || conversation.other_user?.username || '' });
                      setShowHeaderMenu(false);
                    }}
                      className="flex items-center gap-3 px-4 py-2.5 w-full text-right text-sm transition-colors hover:bg-red-500/10"
                      style={{ color: '#f87171' }}>
                      <Flag size={15} /><span>{fa ? 'گزارش کاربر' : 'Report User'}</span>
                    </button>
                  )}
                  <button onClick={async () => {
                    if (!window.confirm(fa ? 'تاریخچه پیام‌ها پاک شود؟' : 'Clear message history?')) { setShowHeaderMenu(false); return; }
                    for (const msg of messages) { if (msg.sender_id === user?.id || isAdmin) await deleteMessage(msg.id); }
                    setShowHeaderMenu(false);
                  }} className="flex items-center gap-3 px-4 py-2.5 w-full text-right text-sm text-red-400 hover:bg-red-500/10 transition-colors">
                    <Trash2 size={15} /><span>{fa ? 'پاک کردن تاریخچه' : 'Clear History'}</span>
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
                    <div className={`flex-shrink-0 ${showAvatar ? 'cursor-pointer' : 'invisible'}`}
                      onClick={e => { e.stopPropagation(); if (showAvatar && msg.sender) setShowUserProfile(msg.sender as any); }}>
                      <Avatar src={msg.sender?.avatar_url} name={msg.sender?.display_name} username={msg.sender?.username} size={28} />
                    </div>
                  )}
                  <div
                    className={`max-w-[72%] rounded-2xl px-3 py-2 cursor-pointer select-text kw-bubble-in ${isOwn ? 'rounded-br-sm' : 'rounded-bl-sm'}`}
                    style={{
                      background: isOwn ? 'var(--msg-own-bg)' : 'var(--msg-other-bg)',
                      color: isOwn ? 'var(--msg-own-text)' : 'var(--msg-other-text)',
                    }}
                    onContextMenu={e => { e.preventDefault(); setContextMenu({ msg, x: e.clientX, y: e.clientY }); }}
                    onDoubleClick={() => startReply(msg)}
                    onTouchStart={e => {
                      longPressFired.current = false;
                      const touch = e.touches[0];
                      longPressTimer.current = setTimeout(() => {
                        longPressFired.current = true;
                        setContextMenu({ msg, x: touch.clientX, y: touch.clientY });
                      }, 500);
                    }}
                    onTouchEnd={() => {
                      if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
                    }}
                    onTouchMove={() => {
                      if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
                    }}
                  >
                    {/* Group sender name */}
                    {!isOwn && conversation.type === 'group' && showAvatar && (
                      <div className="flex items-center gap-1 mb-1 cursor-pointer"
                        onClick={e => { e.stopPropagation(); if (msg.sender) setShowUserProfile(msg.sender as any); }}>
                        <p className="text-xs font-semibold" style={{ color: '#93c5fd' }}>
                          {msg.sender?.display_name || msg.sender?.username}
                        </p>
                        {!!(msg.sender as any)?.is_verified && <BadgeCheck size={11} className="text-blue-400 flex-shrink-0" />}
                      </div>
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
                    {/* Media content */}
                    {msg.media_url && msg.type === 'image' && (
                      <img src={msg.media_url} alt="" className="rounded-xl max-w-full max-h-64 object-cover mb-1 cursor-pointer block" onClick={() => window.open(msg.media_url!, '_blank')} onError={e => { (e.target as HTMLImageElement).style.display='none'; }} />
                    )}
                    {msg.media_url && msg.type === 'video' && (
                      <video controls className="rounded-xl max-w-full max-h-64 mb-1 block" style={{ maxWidth: 280 }}>
                        <source src={msg.media_url} />
                      </video>
                    )}
                    {msg.media_url && msg.type === 'audio' && (
                      <audio controls className="mb-1 block" style={{ maxWidth: 240, height: 36 }}>
                        <source src={msg.media_url} />
                      </audio>
                    )}
                    {msg.media_url && msg.type === 'file' && (
                      <a href={msg.media_url} download target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2 px-3 py-2 rounded-xl mb-1 text-sm hover:opacity-80"
                        style={{ background: 'rgba(255,255,255,0.1)' }}>
                        <Download size={16} /><span className="truncate max-w-[200px]">{msg.content.replace(/^📎\s*/, '')}</span>
                      </a>
                    )}
                    {/* Location message — fully local, no external map API */}
                    {msg.type === 'location' && (() => {
                      try {
                        const loc = JSON.parse(msg.content);
                        const mapUrl = `https://www.openstreetmap.org/?mlat=${loc.lat}&mlon=${loc.lng}&zoom=15`;
                        return (
                          <div className="rounded-xl overflow-hidden mt-1"
                            style={{ border: '1px solid rgba(255,255,255,0.1)', maxWidth: 260 }}>
                            {/* Local SVG map preview — works 100% offline */}
                            <div className="relative flex items-center justify-center" style={{ height: 120, background: 'linear-gradient(135deg, #0d2137 0%, #0a1929 100%)' }}>
                              {/* Grid lines */}
                              <svg className="absolute inset-0 w-full h-full opacity-20" viewBox="0 0 260 120" preserveAspectRatio="none">
                                {[20,40,60,80,100].map(y => <line key={y} x1="0" y1={y} x2="260" y2={y} stroke="#38bdf8" strokeWidth="0.5"/>)}
                                {[40,80,120,160,200].map(x => <line key={x} x1={x} y1="0" x2={x} y2="120" stroke="#38bdf8" strokeWidth="0.5"/>)}
                                <circle cx="130" cy="60" r="30" fill="none" stroke="#38bdf8" strokeWidth="0.5" strokeDasharray="4 3"/>
                                <circle cx="130" cy="60" r="55" fill="none" stroke="#38bdf8" strokeWidth="0.5" strokeDasharray="4 3"/>
                              </svg>
                              <div className="relative flex flex-col items-center gap-1">
                                <MapPin size={28} style={{ color: '#ef4444', filter: 'drop-shadow(0 2px 6px rgba(239,68,68,0.6))' }} />
                                <div className="text-center">
                                  <p className="text-xs font-mono font-bold text-sky-300">{Number(loc.lat).toFixed(4)}°N</p>
                                  <p className="text-xs font-mono font-bold text-sky-300">{Number(loc.lng).toFixed(4)}°E</p>
                                </div>
                              </div>
                              {/* Local mode badge */}
                              <div className="absolute top-2 left-2 flex items-center gap-1 px-1.5 py-0.5 rounded text-xs" style={{ background: 'rgba(14,165,233,0.2)', color: '#38bdf8', fontSize: '9px' }}>
                                <span className="w-1 h-1 rounded-full bg-sky-400" />
                                حالت محلی
                              </div>
                            </div>
                            {/* Open in external map link (works when online) */}
                            <a href={mapUrl} target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-2 px-3 py-2 hover:opacity-80 transition-opacity"
                              style={{ background: 'rgba(14,165,233,0.08)' }}>
                              <MapPin size={14} style={{ color: '#ef4444', flexShrink: 0 }} />
                              <span className="text-xs">{fa ? 'موقعیت مکانی — باز کردن در نقشه' : 'Location — open in map'}</span>
                            </a>
                          </div>
                        );
                      } catch {
                        return <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">{renderContent(msg.content)}</p>;
                      }
                    })()}
                    {/* Text content - show for text type OR when no media_url */}
                    {(msg.type === 'text' || (!msg.media_url && msg.type !== 'image' && msg.type !== 'video' && msg.type !== 'file' && msg.type !== 'audio' && msg.type !== 'location')) && (
                      <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">{renderContent(msg.content)}</p>
                    )}
                    {/* Footer */}
                    <div className={`flex items-center gap-1 mt-0.5 ${isOwn ? 'justify-start flex-row-reverse' : 'justify-end'}`}>
                      {!!msg.is_edited && <span className="text-xs opacity-40">{fa ? 'ویرایش‌شده' : 'edited'}</span>}
                      <span className="text-xs opacity-60">{formatTime(msg.created_at)}</span>
                      {isOwn && (
                        readMessageIds.has(msg.id)
                          ? <CheckCheck size={13} className="text-blue-400 opacity-90" />
                          : <Check size={13} className="opacity-50" />
                      )}
                    </div>
                  </div>
                  {/* Reactions display */}
                  {reactions[msg.id]?.length > 0 && (
                    <div className={`flex flex-wrap gap-1 mt-1 ${isOwn ? 'justify-end' : 'justify-start'}`}
                      style={{ paddingLeft: isOwn ? 0 : 0 }}>
                      {reactions[msg.id].map(r => (
                        <button
                          key={r.emoji}
                          onClick={e => { e.stopPropagation(); toggleReaction(msg.id, r.emoji); }}
                          className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs transition-all"
                          style={{
                            background: r.myReaction ? 'rgba(37,99,235,0.25)' : 'var(--bg-card)',
                            border: `1px solid ${r.myReaction ? 'rgba(37,99,235,0.5)' : 'var(--border-color)'}`,
                            fontSize: '13px',
                          }}
                        >
                          <span>{r.emoji}</span>
                          {r.count > 1 && <span style={{ color: 'var(--text-secondary)', fontSize: '10px' }}>{r.count}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* Telegram-style Context Menu */}
        {contextMenu && (() => {
          const x = Math.min(Math.max(contextMenu.x - 96, 8), window.innerWidth - 208);
          const y = contextMenu.y > window.innerHeight - 280 ? contextMenu.y - 280 : contextMenu.y + 8;
          const QUICK_EMOJIS = ['❤️', '👍', '😂', '😮', '😢', '👎'];
          const actions = [
            { icon: Reply, label: fa ? 'ریپلای' : 'Reply', color: 'var(--text-primary)', action: () => startReply(contextMenu.msg) },
            ...(contextMenu.msg.sender_id === user?.id && contextMenu.msg.type === 'text' ? [{ icon: Edit2, label: fa ? 'ویرایش' : 'Edit', color: 'var(--text-primary)', action: () => startEdit(contextMenu.msg) }] : []),
            { icon: Forward, label: fa ? 'فوروارد' : 'Forward', color: 'var(--text-primary)', action: () => { setForwardMsg(contextMenu.msg); setContextMenu(null); } },
            { icon: Copy, label: fa ? 'کپی متن' : 'Copy', color: 'var(--text-primary)', action: () => copyText(contextMenu.msg.content) },
            ...(contextMenu.msg.sender_id === user?.id || isAdmin ? [{ icon: Trash2, label: fa ? 'حذف' : 'Delete', color: '#f87171', action: () => { deleteMessage(contextMenu.msg.id); setContextMenu(null); } }] : []),
          ];
          return (
            <div
              className="fixed z-[60] rounded-2xl shadow-2xl overflow-hidden"
              style={{ left: x, top: y, width: 200, background: 'var(--bg-card)', border: '1px solid var(--border-color)', backdropFilter: 'blur(12px)' }}
              onClick={e => e.stopPropagation()}
            >
              {/* Quick emoji reactions */}
              <div className="flex items-center justify-around px-2 py-2.5" style={{ borderBottom: '1px solid var(--border-color)' }}>
                {QUICK_EMOJIS.map(emoji => {
                  const myR = reactions[contextMenu.msg.id]?.find(r => r.emoji === emoji && r.myReaction);
                  return (
                    <button key={emoji}
                      onClick={() => { toggleReaction(contextMenu.msg.id, emoji); setContextMenu(null); }}
                      className="w-9 h-9 rounded-full flex items-center justify-center text-xl transition-all hover:scale-125 active:scale-110"
                      style={{ background: myR ? 'rgba(37,99,235,0.2)' : 'transparent', transform: myR ? 'scale(1.15)' : undefined }}
                      title={emoji}
                    >
                      {emoji}
                    </button>
                  );
                })}
              </div>
              {/* Action items */}
              {actions.map(item => (
                <button key={item.label}
                  className="flex items-center gap-3 px-4 py-2.5 w-full text-right text-sm transition-colors hover:bg-white/5 active:bg-white/10"
                  style={{ color: item.color }}
                  onClick={item.action}>
                  <item.icon size={15} /><span>{item.label}</span>
                </button>
              ))}
            </div>
          );
        })()}

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
          <div className="flex-shrink-0" style={{ background: 'var(--bg-card)', borderTop: '1px solid var(--border-color)' }}>
            {/* Hidden file inputs */}
            <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
            <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={handleFileUpload} />
            <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.txt,.zip,.rar,.xls,.xlsx,.ppt,.pptx" className="hidden" onChange={handleFileUpload} />

            {/* Attachment options row */}
            {showAttach && (
              <div className="flex items-center gap-3 px-4 py-3 overflow-x-auto" style={{ borderBottom: '1px solid var(--border-color)' }}
                onClick={e => e.stopPropagation()}>
                {[
                  { icon: Image, label: fa ? 'عکس' : 'Photo', color: '#3b82f6', action: () => { imageInputRef.current?.click(); setShowAttach(false); } },
                  { icon: Film, label: fa ? 'ویدیو' : 'Video', color: '#8b5cf6', action: () => { videoInputRef.current?.click(); setShowAttach(false); } },
                  { icon: FileUp, label: fa ? 'فایل' : 'File', color: '#10b981', action: () => { fileInputRef.current?.click(); setShowAttach(false); } },
                  { icon: Mic2, label: fa ? 'ضبط صدا' : 'Voice', color: '#f59e0b', action: () => { setShowAttach(false); startVoiceRecording(); } },
                  { icon: MapPin, label: fa ? 'موقعیت' : 'Location', color: '#ef4444', action: () => {
                    setShowAttach(false);
                    if (!navigator.geolocation) { alert(fa ? 'موقعیت‌یابی پشتیبانی نمی‌شود' : 'Geolocation not supported'); return; }
                    navigator.geolocation.getCurrentPosition(
                      async pos => {
                        const { latitude: lat, longitude: lng } = pos.coords;
                        await apiCall('/messages/location', { method: 'POST', body: JSON.stringify({ conversation_id: conversation?.id, lat, lng, label: '' }) });
                      },
                      () => { alert(fa ? 'دسترسی به موقعیت رد شد' : 'Location access denied'); }
                    );
                  }},
                ].map(opt => (
                  <button key={opt.label} onClick={opt.action}
                    className="flex flex-col items-center gap-1.5 flex-shrink-0">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                      style={{ background: `${opt.color}20` }}>
                      <opt.icon size={22} style={{ color: opt.color }} />
                    </div>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{opt.label}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-end gap-2 p-3">
              <div className="relative flex-shrink-0">
                <button
                  onClick={e => { e.stopPropagation(); if (!uploadingFile) setShowAttach(v => !v); }}
                  className="w-12 h-12 flex items-center justify-center rounded-xl"
                  style={{ color: showAttach ? 'var(--accent)' : 'var(--text-muted)' }}
                  disabled={uploadingFile}
                  title={fa ? 'پیوست' : 'Attach'}
                >
                  {uploadingFile
                    ? <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    : <Paperclip size={26} />}
                </button>
              </div>
            <div className="flex items-end gap-2 flex-1 p-2 rounded-2xl" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)' }}>
              <div className="relative flex-shrink-0">
                <button onClick={e => { e.stopPropagation(); setShowEmoji(!showEmoji); }}
                  className="w-8 h-8 flex items-center justify-center rounded-xl mb-0.5"
                  style={{ color: 'var(--text-muted)' }}>
                  <Smile size={18} />
                </button>
                {showEmoji && (
                  <div className="absolute bottom-12 right-0 rounded-2xl shadow-2xl z-20 flex flex-col overflow-hidden"
                    style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', width: '300px', maxHeight: '320px' }}
                    onClick={e => e.stopPropagation()}>
                    {/* Category tabs */}
                    <div className="flex border-b overflow-x-auto flex-shrink-0 scrollbar-none" style={{ borderColor: 'var(--border-color)' }}>
                      {Object.keys(EMOJI_CATEGORIES).map(cat => (
                        <button key={cat} onClick={() => setEmojiCat(cat)}
                          className="flex-shrink-0 px-2 py-2 text-base transition-colors"
                          style={{ borderBottom: emojiCat === cat ? '2px solid var(--accent)' : '2px solid transparent', opacity: emojiCat === cat ? 1 : 0.5 }}>
                          {cat}
                        </button>
                      ))}
                    </div>
                    {/* Emoji grid */}
                    <div className="overflow-y-auto p-2 grid grid-cols-8 gap-0.5 flex-1">
                      {(EMOJI_CATEGORIES as any)[emojiCat]?.map((em: string) => (
                        <button key={em} onClick={() => { setText(t => t + em); textareaRef.current?.focus(); }}
                          className="w-8 h-8 rounded-lg text-lg flex items-center justify-center transition-colors hover:bg-blue-500/15">
                          {em}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {recording ? (
                <div className="flex-1 flex items-center gap-2 py-1.5">
                  <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{fa ? 'در حال ضبط...' : 'Recording...'}</span>
                </div>
              ) : (
              <textarea
                ref={textareaRef}
                value={text}
                onChange={e => { setText(e.target.value); autoResize(); }}
                onKeyDown={handleKey}
                placeholder={editingId ? (fa ? 'ویرایش پیام...' : 'Edit message...') : conversation.name === '__saved__' ? (fa ? 'یادداشت بنویسید...' : 'Write a note...') : (fa ? 'پیام بنویسید...' : 'Write a message...')}
                rows={1}
                className="flex-1 bg-transparent outline-none text-sm resize-none py-1.5 min-h-[32px] max-h-[120px]"
                style={{ color: 'var(--text-primary)' }}
              />
              )}
              {recording ? (
                <button onClick={stopVoiceRecording}
                  className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mb-0.5 bg-red-500">
                  <Square size={14} className="text-white" />
                </button>
              ) : (
              <button onClick={handleSend} disabled={!text.trim() || sending}
                className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mb-0.5 transition-all"
                style={{ background: text.trim() ? (editingId ? '#10b981' : 'var(--accent)') : 'transparent', color: text.trim() ? 'white' : 'var(--text-muted)' }}>
                {sending
                  ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  : editingId ? <Check size={15} /> : <Send size={15} />}
              </button>
              )}
            </div>
            </div>
          </div>
        ) : (
          <div className="flex-shrink-0 p-3 text-center" style={{ background: 'var(--bg-card)', borderTop: '1px solid var(--border-color)' }}>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {fa ? 'فقط مدیران می‌توانند در کانال پیام ارسال کنند' : 'Only admins can send messages in this channel'}
          </p>
          </div>
        )}
      </div>

      {/* Direct user profile modal */}
      {showUserProfile && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => setShowUserProfile(null)}>
          <div className="w-full max-w-sm rounded-t-3xl md:rounded-2xl p-5 space-y-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-4">
              {showUserProfile.avatar_url
                ? <img src={showUserProfile.avatar_url} className="w-16 h-16 rounded-full object-cover flex-shrink-0" alt="" />
                : <div className="w-16 h-16 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0"><span className="text-white text-2xl font-bold">{(showUserProfile.display_name || showUserProfile.username || '?').charAt(0).toUpperCase()}</span></div>}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="font-bold text-lg truncate" style={{ color: 'var(--text-primary)' }}>{showUserProfile.display_name || showUserProfile.username}</p>
                  {!!(showUserProfile as any).is_verified && <BadgeCheck size={16} className="text-blue-400 flex-shrink-0" />}
                </div>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>@{showUserProfile.username}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className={`w-2 h-2 rounded-full ${showUserProfile.online_status === 'online' ? 'bg-green-400' : 'bg-gray-500'}`} />
                  <span className="text-xs" style={{ color: showUserProfile.online_status === 'online' ? '#4ade80' : 'var(--text-muted)' }}>
                    {showUserProfile.online_status === 'online'
                      ? (fa ? 'آنلاین' : 'Online')
                      : (fa ? `آخرین بازدید: ${formatLastSeen(showUserProfile.last_seen)}` : `Last seen: ${formatLastSeen(showUserProfile.last_seen)}`)}
                  </span>
                </div>
              </div>
            </div>
            {showUserProfile.bio && <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{showUserProfile.bio}</p>}
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  if (!window.confirm(fa ? 'این کاربر مسدود شود؟' : 'Block this user?')) return;
                  await apiCall(`/social/block/${showUserProfile.id}`, { method: 'POST', body: JSON.stringify({ reason: 'user_block' }) });
                  setShowUserProfile(null);
                }}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium"
                style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171' }}>
                {fa ? 'مسدود کردن' : 'Block'}
              </button>
              <button
                onClick={async () => {
                  const reason = window.prompt(fa ? 'دلیل گزارش:' : 'Report reason:');
                  if (!reason) return;
                  await apiCall('/reports', { method: 'POST', body: JSON.stringify({ target_type: 'user', target_id: showUserProfile.id, reason }) });
                  setShowUserProfile(null);
                  alert(fa ? 'گزارش ارسال شد' : 'Report submitted');
                }}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium"
                style={{ background: 'rgba(245,158,11,0.12)', color: '#fbbf24' }}>
                {fa ? 'گزارش' : 'Report'}
              </button>
            </div>
            <button onClick={() => setShowUserProfile(null)} className="w-full py-2 rounded-xl text-sm" style={{ background: 'var(--bg-input)', color: 'var(--text-muted)' }}>
              {fa ? 'بستن' : 'Close'}
            </button>
          </div>
        </div>
      )}

      {/* Info / Members Panel */}
      {showInfo && isGroupOrChannel && (
        <div className="fixed inset-0 z-50 md:static md:z-auto md:inset-auto md:w-72 flex-shrink-0 flex flex-col overflow-hidden" style={{ background: 'var(--bg-secondary)', borderRight: '1px solid var(--border-color)' }}>
          <div className="flex-shrink-0 px-3 py-3 flex items-center gap-3" style={{ borderBottom: '1px solid var(--border-color)', background: 'var(--bg-card)', paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
            <button onClick={() => setShowInfo(false)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl font-semibold text-sm transition-colors"
              style={{ background: 'var(--bg-input)', color: 'var(--text-primary)' }}>
              <ArrowRight size={16} />
              {fa ? 'بازگشت' : 'Back'}
            </button>
            <span className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
              {conversation.type === 'group' ? (fa ? 'اطلاعات گروه' : 'Group Info') : (fa ? 'اطلاعات کانال' : 'Channel Info')}
            </span>
          </div>
          <div className="flex-shrink-0 p-4 text-center" style={{ borderBottom: '1px solid var(--border-color)' }}>
            <div className="flex justify-center mb-2"><ConvAvatar conversation={conversation} size={16} /></div>
            <p className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>{conversation.name}</p>
            {(conversation as any).username && (
              <p className="text-xs mt-0.5 font-mono" style={{ color: '#1d9bf0' }}>@{(conversation as any).username}</p>
            )}
            {conversation.description && <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{conversation.description}</p>}
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{memberCount || members.length} {conversation.type === 'group' ? (fa ? 'عضو' : 'members') : (fa ? 'مشترک' : 'subscribers')}</p>
            {/* Set username (owner only) */}
            {isConvOwner && !showSetUsername && (
              <button onClick={() => { setShowSetUsername(true); setNewUsername((conversation as any).username || ''); }}
                className="mt-2 text-xs px-3 py-1 rounded-full transition-colors"
                style={{ background: 'rgba(29,155,240,0.1)', color: '#1d9bf0' }}>
                {(conversation as any).username ? (fa ? '✏️ تغییر شناسه' : '✏️ Change @ID') : (fa ? '+ تنظیم شناسه @' : '+ Set @ID')}
              </button>
            )}
            {showSetUsername && (
              <div className="mt-2 flex gap-1 items-center">
                <span className="text-sm" style={{ color: 'var(--text-muted)' }}>@</span>
                <input value={newUsername} onChange={e => setNewUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                  className="flex-1 text-xs px-2 py-1.5 rounded-lg outline-none font-mono"
                  style={{ background: 'var(--bg-input)', color: 'var(--text-primary)' }}
                  placeholder="channel_id"
                  onKeyDown={e => { if (e.key === 'Enter') setConvUsername(); if (e.key === 'Escape') setShowSetUsername(false); }} />
                <button onClick={setConvUsername} className="text-xs px-2 py-1.5 rounded-lg font-bold" style={{ background: '#1d9bf0', color: 'white' }}>
                  {fa ? 'ذخیره' : 'Save'}
                </button>
              </div>
            )}
            {usernameMsg && <p className="text-xs mt-1" style={{ color: usernameMsg.startsWith('✓') ? '#4ade80' : '#f87171' }}>{usernameMsg}</p>}
            {(conversation as any).username && (
              <button
                onClick={() => {
                  const link = `${window.location.origin}/@${(conversation as any).username}`;
                  copyToClipboard(link);
                  alert(fa ? 'لینک دعوت کپی شد' : 'Invite link copied');
                }}
                className="mt-2 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full mx-auto transition-colors"
                style={{ background: 'rgba(29,155,240,0.1)', color: '#1d9bf0' }}>
                <Link2 size={11} />
                <span>@{(conversation as any).username}</span>
                <Copy size={11} />
              </button>
            )}
          </div>
          {isConvAdmin && (
            <div className="flex-shrink-0 px-3 py-2" style={{ borderBottom: '1px solid var(--border-color)' }}>
              {showAddMember ? (
                <div className="space-y-2">
                  <div className="relative">
                    <Search size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                    <input value={addSearch} onChange={e => searchToAdd(e.target.value)} placeholder={fa ? 'جستجوی کاربر...' : 'Search user...'}
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
            {membersLoading ? (
              <div className="flex justify-center py-6"><div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
            ) : membersRestricted ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2 text-center px-4">
                <Shield size={28} style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {fa ? 'فقط مدیران می‌توانند لیست اعضا را ببینند' : 'Only admins can view the member list'}
                </p>
              </div>
            ) : members.map(m => {
              const role = (m as any).role || 'member';
              const isOwnerRow = role === 'owner';
              const isAdminRow = role === 'admin';
              return (
                <div key={m.id} className="flex items-center gap-2.5 px-2 py-2 rounded-xl group transition-colors"
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <div className="relative flex-shrink-0">
                    {m.avatar_url ? <img src={m.avatar_url} className="w-9 h-9 rounded-full object-cover" alt="" />
                      : <div className="w-9 h-9 rounded-full bg-blue-700 flex items-center justify-center"><span className="text-white text-xs font-bold">{(m.display_name||m.username).charAt(0).toUpperCase()}</span></div>}
                    {(m as any).online_status === 'online' && <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-400 rounded-full border-2" style={{ borderColor: 'var(--bg-secondary)' }} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>{m.display_name || m.username}</span>
                      {isOwnerRow && <Crown size={10} className="text-yellow-400 flex-shrink-0" title={fa ? 'مالک' : 'Owner'} />}
                      {isAdminRow && <Shield size={10} className="text-blue-400 flex-shrink-0" title={fa ? 'مدیر' : 'Admin'} />}
                      {(m as any).is_admin && <BadgeCheck size={10} className="text-sky-400 flex-shrink-0" />}
                    </div>
                    <div className="flex items-center gap-1">
                      <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>@{m.username}</p>
                      {isOwnerRow && <span className="text-xs px-1 rounded" style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24' }}>{fa ? 'مالک' : 'Owner'}</span>}
                      {isAdminRow && <span className="text-xs px-1 rounded" style={{ background: 'rgba(59,130,246,0.15)', color: '#60a5fa' }}>{fa ? 'مدیر' : 'Admin'}</span>}
                    </div>
                  </div>
                  {isConvOwner && m.id !== user?.id && (
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {isAdminRow ? (
                        <button onClick={() => demoteMember(m.id)} title={fa ? 'لغو مدیریت' : 'Demote'}
                          className="w-6 h-6 rounded-lg flex items-center justify-center hover:bg-red-500/20"
                          style={{ color: '#f87171' }}>
                          <UserMinus size={12} />
                        </button>
                      ) : !isOwnerRow ? (
                        <button onClick={() => promoteMember(m.id)} title={fa ? 'ارتقاء به مدیر' : 'Promote'}
                          className="w-6 h-6 rounded-lg flex items-center justify-center hover:bg-blue-500/20"
                          style={{ color: '#60a5fa' }}>
                          <Shield size={12} />
                        </button>
                      ) : null}
                      {!isOwnerRow && (
                        <button onClick={() => removeMember(m.id)} title={fa ? 'حذف از گروه' : 'Remove'}
                          className="w-6 h-6 rounded-lg flex items-center justify-center hover:bg-red-500/20"
                          style={{ color: 'var(--text-muted)' }}>
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* FORWARD MODAL */}
      {forwardMsg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }} onClick={() => setForwardMsg(null)}>
          <div className="w-full max-w-sm rounded-2xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }} onClick={e => e.stopPropagation()} dir="rtl">
            <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-color)' }}>
              <button onClick={() => setForwardMsg(null)} style={{ color: 'var(--text-secondary)' }}><X size={18} /></button>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{fa ? 'فوروارد به...' : 'Forward to...'}</h3>
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

      {/* Report Modal */}
      {showReport && (
        <div className="fixed inset-0 z-[70] flex items-end md:items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={() => setShowReport(null)}>
          <div className="w-full max-w-sm rounded-t-3xl md:rounded-2xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }} onClick={e => e.stopPropagation()} dir={fa ? 'rtl' : 'ltr'}>
            <div className="flex items-center justify-between px-4 py-3.5" style={{ borderBottom: '1px solid var(--border-color)' }}>
              <button onClick={() => setShowReport(null)} style={{ color: 'var(--text-muted)' }}><X size={18} /></button>
              <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                {fa ? `گزارش ${showReport.name}` : `Report ${showReport.name}`}
              </h3>
              <Flag size={18} className="text-red-400" />
            </div>
            <div className="p-4 space-y-3">
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{fa ? 'دلیل گزارش را انتخاب کنید:' : 'Select a reason for reporting:'}</p>
              {[
                { val: 'spam', label: fa ? 'اسپم' : 'Spam' },
                { val: 'violence', label: fa ? 'خشونت' : 'Violence' },
                { val: 'nudity', label: fa ? 'محتوای نامناسب' : 'Inappropriate Content' },
                { val: 'harassment', label: fa ? 'آزار و اذیت' : 'Harassment' },
                { val: 'scam', label: fa ? 'کلاهبرداری' : 'Scam/Fraud' },
                { val: 'other', label: fa ? 'سایر' : 'Other' },
              ].map(opt => (
                <button key={opt.val} onClick={() => setReportReason(opt.val)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-right transition-colors"
                  style={{ background: reportReason === opt.val ? 'rgba(239,68,68,0.12)' : 'var(--bg-input)', color: reportReason === opt.val ? '#f87171' : 'var(--text-primary)', border: reportReason === opt.val ? '1px solid rgba(239,68,68,0.3)' : '1px solid transparent' }}>
                  <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${reportReason === opt.val ? 'border-red-400 bg-red-400' : ''}`} style={{ borderColor: reportReason === opt.val ? '#f87171' : 'var(--border-color)' }}>
                    {reportReason === opt.val && <div className="w-2 h-2 rounded-full bg-white" />}
                  </div>
                  {opt.label}
                </button>
              ))}
              <textarea
                value={reportDetails}
                onChange={e => setReportDetails(e.target.value)}
                placeholder={fa ? 'توضیحات بیشتر (اختیاری)...' : 'Additional details (optional)...'}
                rows={2}
                className="w-full px-3 py-2 rounded-xl text-sm outline-none resize-none"
                style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-input)' }}
              />
              {reportDone ? (
                <div className="w-full py-3 rounded-xl text-sm font-semibold text-center" style={{ background: 'rgba(34,197,94,0.15)', color: '#4ade80' }}>
                  ✓ {fa ? 'گزارش ارسال شد' : 'Report submitted'}
                </div>
              ) : (
                <button
                  onClick={submitReport}
                  disabled={!reportReason || reportSubmitting}
                  className="w-full py-3 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2"
                  style={{ background: reportReason ? '#ef4444' : 'var(--bg-input)', color: reportReason ? 'white' : 'var(--text-muted)' }}>
                  {reportSubmitting && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  {fa ? 'ارسال گزارش' : 'Submit Report'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
