import { useState, useRef, useEffect } from 'react';
import { MessageSquare, Settings, Sun, Moon, Phone, PhoneOff, Mic, MicOff, Video, VideoOff, Volume2, PhoneIncoming, PhoneMissed } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useConversations } from '../hooks/useConversations';
import { useIsMobile } from '../hooks/use-mobile';
import { ChatList } from '../components/chat/ChatList';
import { ChatWindow } from '../components/chat/ChatWindow';
import { FeedPage } from './FeedPage';
import { SettingsPage } from './SettingsPage';
import { Conversation } from '../types';
import { supabase, onSignal, offSignal, sendSignal } from '../lib/supabase';
import { WolfLogo } from '../components/ui/WolfLogo';
import { Avatar } from '../components/Avatar';
import { CallsPage } from './CallsPage';
import { StoriesPage } from './StoriesPage';

type Page = 'messages' | 'calls' | 'feed' | 'stories' | 'settings';

// Instagram-style Stories icon
function StoriesIcon({ size = 22, active = false }: { size?: number; active?: boolean }) {
  const id = `ig-grad-${size}`;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#f09433" />
          <stop offset="25%" stopColor="#e6683c" />
          <stop offset="50%" stopColor="#dc2743" />
          <stop offset="75%" stopColor="#cc2366" />
          <stop offset="100%" stopColor="#bc1888" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="10.5" stroke={active ? `url(#${id})` : 'currentColor'} strokeWidth={active ? '2' : '1.5'} fill="none" />
      <rect x="7" y="7" width="10" height="10" rx="3" stroke={active ? `url(#${id})` : 'currentColor'} strokeWidth="1.5" fill="none" />
      <circle cx="12" cy="12" r="2.5" fill={active ? `url(#${id})` : 'currentColor'} />
      <circle cx="15.5" cy="8.5" r="0.8" fill={active ? `url(#${id})` : 'currentColor'} />
    </svg>
  );
}

// Old Twitter bird SVG
function TwitterBird({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z" />
    </svg>
  );
}

export function MessengerLayout() {
  const { profile, signOut } = useAuth();
  const { user } = useAuth();
  const { theme, language, setTheme, setLanguage } = useTheme();
  const isMobile = useIsMobile();
  const { conversations, loading, refresh, createDirectConversation, createGroup, createChannel, getSavedMessagesConversation, setActiveConversation } = useConversations();
  const [page, setPage] = useState<Page>('messages');
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [showChatOnMobile, setShowChatOnMobile] = useState(false);

  const selectedConv = conversations.find((c) => c.id === selectedConvId) ?? null;

  // ── WebRTC call state ──────────────────────────────────────────────────────
  type CallState = { type: 'voice' | 'video'; status: 'calling' | 'active'; targetUserId: string; displayName: string; avatar?: string };
  type IncomingCall = { fromUserId: string; fromName: string; fromAvatar?: string; callType: 'voice' | 'video'; offer: RTCSessionDescriptionInit };

  const [callState, setCallState] = useState<CallState | null>(null);
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [videoOn, setVideoOn] = useState(true);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const pendingIce = useRef<RTCIceCandidateInit[]>([]);
  const callTargetRef = useRef<string | null>(null);
  const callTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const callStateRef = useRef<CallState | null>(null);
  const callIdRef = useRef<string | null>(null);
  const callStartTimeRef = useRef<number | null>(null);
  useEffect(() => { callStateRef.current = callState; }, [callState]);

  // Swipe-to-go-back gesture (like Telegram)
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  function onMainTouchStart(e: React.TouchEvent) {
    swipeStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }
  function onMainTouchEnd(e: React.TouchEvent) {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = Math.abs(e.changedTouches[0].clientY - start.y);
    if (dx > 80 && dy < dx * 0.7) {
      if (page === 'messages' && showChatOnMobile) {
        setShowChatOnMobile(false);
        setSelectedConvId(null);
        setActiveConversation(null);
      } else if (page !== 'messages') {
        setPage('messages');
        setShowChatOnMobile(false);
      }
    }
  }

  function getToken() { return localStorage.getItem('kingwolf_token') || ''; }

  async function saveCallRecord(receiverId: string, type: 'voice' | 'video', status: string): Promise<string | null> {
    try {
      const res = await fetch('/api/calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ receiver_id: receiverId, type, status }),
      });
      const data = await res.json();
      return data.id || null;
    } catch { return null; }
  }

  async function updateCallRecord(callId: string, duration: number, status?: string) {
    try {
      await fetch(`/api/calls/${callId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ duration, status }),
      });
    } catch {}
  }

  // Call duration timer
  useEffect(() => {
    if (callState?.status === 'active') {
      callTimerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000);
    } else {
      if (callTimerRef.current) { clearInterval(callTimerRef.current); callTimerRef.current = null; }
      if (!callState) setCallDuration(0);
    }
    return () => { if (callTimerRef.current) { clearInterval(callTimerRef.current); callTimerRef.current = null; } };
  }, [callState?.status]);

  function cleanupCall() {
    if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
    if (localStreamRef.current) { localStreamRef.current.getTracks().forEach(t => t.stop()); localStreamRef.current = null; }
    if (callTimerRef.current) { clearInterval(callTimerRef.current); callTimerRef.current = null; }
    pendingIce.current = [];
    callTargetRef.current = null;
    setCallState(null);
    setCallDuration(0);
    setMuted(false);
    setVideoOn(true);
  }

  function buildPc() {
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    pc.onicecandidate = (e) => {
      if (e.candidate && callTargetRef.current) {
        sendSignal(callTargetRef.current, { type: 'call-ice-candidate', candidate: e.candidate.toJSON() });
      }
    };
    pc.ontrack = (e) => {
      if (remoteVideoRef.current && e.streams[0]) {
        remoteVideoRef.current.srcObject = e.streams[0];
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setCallState(s => s ? { ...s, status: 'active' } : null);
      } else if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) {
        cleanupCall();
      }
    };
    return pc;
  }

  async function startCall(type: 'voice' | 'video', targetUserId: string) {
    if (callStateRef.current || !user) return;
    const conv = conversations.find(c => c.other_user?.id === targetUserId || c.id === targetUserId);
    const displayName = conv?.other_user?.display_name || conv?.other_user?.username || conv?.name || targetUserId;
    const avatar = conv?.other_user?.avatar_url;
    callTargetRef.current = targetUserId;
    try {
      let stream: MediaStream;
      if (type === 'video') {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true },
            video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
          });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        }
      } else {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
      }
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.muted = true;
        localVideoRef.current.playsInline = true;
        try { await localVideoRef.current.play(); } catch { /* autoplay may be blocked */ }
      }
      const pc = buildPc();
      pcRef.current = pc;
      stream.getTracks().forEach(t => pc.addTrack(t, stream));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendSignal(targetUserId, {
        type: 'call-ring',
        callType: type,
        fromName: profile?.display_name || profile?.username || '',
        fromAvatar: profile?.avatar_url || '',
        offer,
      });
      setCallState({ type, status: 'calling', targetUserId, displayName, avatar });
      // Record outgoing call
      const cid = await saveCallRecord(targetUserId, type, 'outgoing');
      callIdRef.current = cid;
      callStartTimeRef.current = Date.now();
    } catch {
      cleanupCall();
    }
  }

  async function acceptCall() {
    if (!incomingCall) return;
    const { fromUserId, callType, offer, fromName, fromAvatar } = incomingCall;
    callTargetRef.current = fromUserId;
    try {
      let stream: MediaStream;
      if (callType === 'video') {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true },
            video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
          });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        }
      } else {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
      }
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.muted = true;
        localVideoRef.current.playsInline = true;
        try { await localVideoRef.current.play(); } catch { /* autoplay */ }
      }
      const pc = buildPc();
      pcRef.current = pc;
      stream.getTracks().forEach(t => pc.addTrack(t, stream));
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      for (const c of pendingIce.current) {
        await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
      }
      pendingIce.current = [];
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendSignal(fromUserId, { type: 'call-answer', answer });
      setCallState({ type: callType, status: 'active', targetUserId: fromUserId, displayName: fromName, avatar: fromAvatar });
      setIncomingCall(null);
      callStartTimeRef.current = Date.now();
    } catch {
      cleanupCall();
      setIncomingCall(null);
    }
  }

  function rejectCall() {
    if (!incomingCall) return;
    sendSignal(incomingCall.fromUserId, { type: 'call-reject' });
    setIncomingCall(null);
  }

  function endCall() {
    const duration = callStartTimeRef.current ? Math.round((Date.now() - callStartTimeRef.current) / 1000) : 0;
    if (callIdRef.current) {
      updateCallRecord(callIdRef.current, duration, callState?.status === 'active' ? 'outgoing' : 'missed');
    }
    callIdRef.current = null;
    callStartTimeRef.current = null;
    if (callTargetRef.current) sendSignal(callTargetRef.current, { type: 'call-end' });
    cleanupCall();
  }

  function toggleMute() {
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = muted; });
    setMuted(m => !m);
  }

  function toggleVideo() {
    localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = !videoOn; });
    setVideoOn(v => !v);
  }

  function formatCallDuration(s: number) {
    const m = Math.floor(s / 60), sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }

  // WebRTC signal handler
  useEffect(() => {
    function handleSignal(payload: any, fromUserId: string) {
      if (payload.type === 'call-ring') {
        if (callStateRef.current) {
          sendSignal(fromUserId, { type: 'call-reject' });
          return;
        }
        setIncomingCall({ fromUserId, fromName: payload.fromName || fromUserId, fromAvatar: payload.fromAvatar, callType: payload.callType, offer: payload.offer });
      } else if (payload.type === 'call-answer') {
        if (pcRef.current && payload.answer) {
          pcRef.current.setRemoteDescription(new RTCSessionDescription(payload.answer)).catch(() => {});
        }
      } else if (payload.type === 'call-ice-candidate') {
        if (payload.candidate) {
          if (pcRef.current?.remoteDescription) {
            pcRef.current.addIceCandidate(new RTCIceCandidate(payload.candidate)).catch(() => {});
          } else {
            pendingIce.current.push(payload.candidate);
          }
        }
      } else if (payload.type === 'call-reject' || payload.type === 'call-end') {
        cleanupCall();
      }
    }
    onSignal(handleSignal);
    return () => offSignal(handleSignal);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSelectConversation(id: string) {
    if (id.startsWith('direct:')) {
      const targetUserId = id.replace('direct:', '');
      const convId = await createDirectConversation(targetUserId);
      if (convId) {
        setSelectedConvId(convId);
        setActiveConversation(convId);
        setShowChatOnMobile(true);
        setPage('messages');
      }
      return;
    }
    setSelectedConvId(id);
    setActiveConversation(id);
    setShowChatOnMobile(true);
    setPage('messages');
  }

  async function handleSavedMessages() {
    const existing = conversations.find(c => c.name === '__saved__');
    if (existing) {
      setSelectedConvId(existing.id);
      setShowChatOnMobile(true);
      setPage('messages');
      return;
    }
    const convId = await getSavedMessagesConversation();
    if (convId) {
      setSelectedConvId(convId);
      setShowChatOnMobile(true);
      setPage('messages');
      await refresh();
    }
  }

  async function handleCreateGroup(name: string, desc: string, members: string[]) {
    const convId = await createGroup(name, desc, members);
    if (convId) { setSelectedConvId(convId); setShowChatOnMobile(true); }
  }

  async function handleCreateChannel(name: string, desc: string) {
    const convId = await createChannel(name, desc);
    if (convId) { setSelectedConvId(convId); setShowChatOnMobile(true); }
  }

  const fa = language === 'fa';

  const navItems = [
    { id: 'messages' as Page, label: fa ? 'پیام‌ها' : 'Messages', icon: MessageSquare },
    { id: 'calls'   as Page, label: fa ? 'تماس‌ها' : 'Calls',    icon: Phone },
    { id: 'feed'    as Page, label: fa ? 'توییت'    : 'Tweet',    icon: null /* uses TwitterBird */ },
    { id: 'settings'as Page, label: fa ? 'تنظیمات'  : 'Settings', icon: Settings },
  ];

  // Bottom nav height: 56px + safe-area; add as paddingBottom to content so input isn't hidden
  const mobileNavHeight = 'calc(56px + env(safe-area-inset-bottom))';

  return (
    <div
      className="flex overflow-hidden"
      style={{ background: 'var(--bg-primary)', height: '100dvh', paddingTop: 'env(safe-area-inset-top)', boxSizing: 'border-box' }}
      dir={fa ? 'rtl' : 'ltr'}
      onTouchStart={onMainTouchStart}
      onTouchEnd={onMainTouchEnd}
    >
      {/* ── Desktop sidebar ─────────────────────────────── */}
      <div
        className="hidden md:flex flex-col w-16 flex-shrink-0 py-3 items-center gap-2"
        style={{ background: 'var(--bg-card)', borderLeft: '1px solid var(--border-color)' }}
      >
        <div className="mb-2">
          <WolfLogo size={32} />
        </div>

        <div className="flex-1 flex flex-col gap-1 w-full px-2">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setPage(item.id)}
              className="w-full h-10 rounded-xl flex items-center justify-center transition-all group relative"
              style={{
                background: page === item.id ? 'var(--accent)' : 'transparent',
                color: page === item.id ? 'white' : 'var(--text-secondary)',
              }}
              title={item.label}
            >
              {item.id === 'stories' ? <StoriesIcon size={18} active={page === 'stories'} /> : item.icon ? <item.icon size={18} /> : <TwitterBird size={18} />}
              <span
                className="absolute right-full mr-2 text-xs whitespace-nowrap px-2 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                style={{ background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}
              >
                {item.label}
              </span>
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-1 w-full px-2 mb-2">
          <button
            onClick={() => setLanguage(fa ? 'en' : 'fa')}
            className="w-full h-9 rounded-xl flex items-center justify-center transition-colors text-xs font-bold"
            style={{ background: 'var(--bg-input)', color: 'var(--text-secondary)' }}
            title={fa ? 'Switch to English' : 'تغییر به فارسی'}
          >
            {fa ? 'EN' : 'FA'}
          </button>

          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="w-full h-9 rounded-xl flex items-center justify-center transition-colors"
            style={{ background: 'var(--bg-input)', color: 'var(--text-secondary)' }}
            title={theme === 'dark' ? (fa ? 'روشن' : 'Light') : (fa ? 'تاریک' : 'Dark')}
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>

          <button
            onClick={() => setPage('settings')}
            className="w-full h-10 rounded-xl flex items-center justify-center transition-colors overflow-hidden mt-1"
            title={profile?.display_name || profile?.username}
          >
            <Avatar src={profile?.avatar_url} name={profile?.display_name} username={profile?.username} size={32} />
          </button>
        </div>
      </div>

      {/* ── Chat list panel (messages page only) ────────── */}
      {page === 'messages' && (
        <div
          className={`flex-shrink-0 w-full md:w-80 ${showChatOnMobile ? 'hidden md:flex' : 'flex'} flex-col`}
          style={{
            borderColor: 'var(--border-color)',
            borderLeft: '1px solid var(--border-color)',
            // On mobile, leave room for bottom nav
            paddingBottom: isMobile ? mobileNavHeight : undefined,
          }}
        >
          <ChatList
            conversations={conversations}
            selectedId={selectedConvId}
            onSelect={handleSelectConversation}
            onCreateGroup={handleCreateGroup}
            onCreateChannel={handleCreateChannel}
            onSavedMessages={handleSavedMessages}
            onOpenStories={() => setPage('stories')}
          />
        </div>
      )}

      {/* ── Main content area ────────────────────────────── */}
      <div
        className={`flex-1 flex flex-col min-w-0 overflow-hidden ${
          page === 'messages' && !showChatOnMobile ? 'hidden md:flex' : 'flex'
        }`}
        style={{
          // CRITICAL: push content up so bottom nav doesn't cover input
          paddingBottom: isMobile ? mobileNavHeight : 'env(safe-area-inset-bottom)',
        }}
      >
        {/* Mobile header for non-messages pages */}
        {page !== 'messages' && page !== 'calls' && page !== 'settings' && (
          <div
            className="flex-shrink-0 flex items-center gap-3 px-4 py-3 md:hidden"
            style={{
              background: 'var(--bg-card)',
              borderBottom: '1px solid var(--border-color)',
              paddingTop: 'max(12px, env(safe-area-inset-top))',
            }}
          >
            <WolfLogo size={24} />
            <h1 className="font-bold flex-1" style={{ color: 'var(--text-primary)' }}>
              {page === 'feed' ? (fa ? 'توییت' : 'Tweet') : page === 'stories' ? (fa ? 'استوری' : 'Stories') : (fa ? 'تنظیمات' : 'Settings')}
            </h1>
            {/* Language + theme quick toggles in header */}
            <button
              onClick={() => setLanguage(fa ? 'en' : 'fa')}
              className="text-xs font-bold px-2 py-1 rounded-lg"
              style={{ background: 'var(--bg-input)', color: 'var(--text-secondary)' }}
            >
              {fa ? 'EN' : 'FA'}
            </button>
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: 'var(--bg-input)', color: 'var(--text-secondary)' }}
            >
              {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
            </button>
          </div>
        )}

        <div key={page} className="flex-1 flex flex-col min-w-0 overflow-hidden kw-page-in">
          {page === 'messages' ? (
            <ChatWindow
              conversation={selectedConv}
              conversations={conversations}
              onBack={() => { setShowChatOnMobile(false); setSelectedConvId(null); setActiveConversation(null); }}
              onSelectConv={handleSelectConversation}
              onStartCall={startCall}
            />
          ) : page === 'calls' ? (
            <CallsPage onCall={startCall} contacts={conversations.filter(c => c.type === 'direct' && c.other_user)} />
          ) : page === 'feed' ? (
            <FeedPage />
          ) : page === 'stories' ? (
            <StoriesPage />
          ) : (
            <SettingsPage onClose={() => setPage('messages')} />
          )}
        </div>
      </div>

      {/* ── Incoming call overlay ────────────────────────── */}
      {incomingCall && (
        <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-8 px-6"
          style={{ background: 'linear-gradient(135deg,#0f2027,#203a43,#2c5364)' }}>
          <div className="text-center">
            <p className="text-white/60 text-sm mb-2">{incomingCall.callType === 'voice' ? '🎙️ تماس صوتی ورودی' : '📹 تماس تصویری ورودی'}</p>
            {incomingCall.fromAvatar
              ? <img src={incomingCall.fromAvatar} className="w-28 h-28 rounded-full object-cover border-4 border-white/20 mx-auto mb-3" alt="" />
              : <div className="w-28 h-28 rounded-full bg-blue-700 flex items-center justify-center border-4 border-white/20 mx-auto mb-3">
                  <span className="text-white text-5xl font-bold">{incomingCall.fromName.charAt(0).toUpperCase()}</span>
                </div>
            }
            <h2 className="text-white text-2xl font-bold">{incomingCall.fromName}</h2>
            <div className="mt-3 flex gap-1 justify-center">
              {[0, 1, 2].map(i => (
                <div key={i} className="w-2 h-2 rounded-full bg-white/40 animate-pulse" style={{ animationDelay: `${i * 0.3}s` }} />
              ))}
            </div>
          </div>
          <div className="flex items-center gap-12">
            <div className="flex flex-col items-center gap-2">
              <button onClick={rejectCall}
                className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-500 flex items-center justify-center transition-colors">
                <PhoneMissed size={26} className="text-white" />
              </button>
              <span className="text-white/60 text-xs">{fa ? 'رد' : 'Decline'}</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <button onClick={acceptCall}
                className="w-16 h-16 rounded-full bg-green-600 hover:bg-green-500 flex items-center justify-center transition-colors">
                <PhoneIncoming size={26} className="text-white" />
              </button>
              <span className="text-white/60 text-xs">{fa ? 'پذیرش' : 'Accept'}</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Active/outgoing call overlay ─────────────────── */}
      {callState && (
        <div className="fixed inset-0 z-[60] flex flex-col items-center justify-between py-16"
          style={{ background: callState.type === 'video' ? '#0a0a0a' : 'linear-gradient(135deg,#1e3a5f,#0f1b2d)' }}>
          {/* Remote stream: full-screen for video, hidden (audio only) for voice */}
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className={callState.type === 'video' ? 'absolute inset-0 w-full h-full object-cover' : 'hidden'}
          />
          {/* Local video preview (picture-in-picture, video calls only) */}
          {callState.type === 'video' && videoOn && (
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="absolute bottom-28 right-4 w-28 h-40 rounded-2xl object-cover border-2 border-white/20 z-10"
            />
          )}

          {/* Call header */}
          <div className="text-center relative z-10">
            <p className="text-white/60 text-sm mb-1">{callState.type === 'voice' ? '🎙️ تماس صوتی' : '📹 تماس تصویری'}</p>
            <h2 className="text-white text-2xl font-bold">{callState.displayName}</h2>
            <p className="text-white/60 text-sm mt-1">
              {callState.status === 'calling' ? (fa ? 'در حال برقراری ارتباط...' : 'Connecting...') : formatCallDuration(callDuration)}
            </p>
          </div>

          {/* Avatar (voice calls / while connecting) */}
          {(callState.type === 'voice' || callState.status === 'calling') && (
            <div className="flex flex-col items-center relative z-10">
              {callState.avatar
                ? <img src={callState.avatar} className="w-32 h-32 rounded-full object-cover border-4 border-white/20" alt="" />
                : <div className="w-32 h-32 rounded-full bg-blue-700 flex items-center justify-center border-4 border-white/20">
                    <span className="text-white text-5xl font-bold">{callState.displayName.charAt(0)}</span>
                  </div>
              }
              {callState.status === 'calling' && (
                <div className="mt-4 flex gap-1">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="w-2 h-2 rounded-full bg-white/40 animate-pulse" style={{ animationDelay: `${i * 0.3}s` }} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Call controls */}
          <div className="flex items-center gap-6 relative z-10">
            <button onClick={toggleMute}
              className="w-14 h-14 rounded-full flex items-center justify-center transition-colors"
              style={{ background: muted ? '#ef4444' : 'rgba(255,255,255,0.15)' }}>
              {muted ? <MicOff size={22} className="text-white" /> : <Mic size={22} className="text-white" />}
            </button>
            <button onClick={endCall}
              className="w-16 h-16 rounded-full flex items-center justify-center bg-red-600 hover:bg-red-500 transition-colors">
              <PhoneOff size={26} className="text-white" />
            </button>
            {callState.type === 'video' ? (
              <button onClick={toggleVideo}
                className="w-14 h-14 rounded-full flex items-center justify-center transition-colors"
                style={{ background: videoOn ? 'rgba(255,255,255,0.15)' : '#ef4444' }}>
                {videoOn ? <Video size={22} className="text-white" /> : <VideoOff size={22} className="text-white" />}
              </button>
            ) : (
              <button className="w-14 h-14 rounded-full flex items-center justify-center transition-colors"
                style={{ background: 'rgba(255,255,255,0.15)' }}>
                <Volume2 size={22} className="text-white" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Mobile bottom navigation ─────────────────────── */}
      <div
        className="fixed bottom-0 inset-x-0 md:hidden z-40 flex"
        style={{
          background: 'var(--bg-card)',
          borderTop: '1px solid var(--border-color)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          // Subtle shadow upward
          boxShadow: '0 -2px 12px rgba(0,0,0,0.15)',
        }}
      >
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => {
              setPage(item.id);
              if (item.id !== 'messages') setShowChatOnMobile(false);
            }}
            className="flex-1 py-2 flex flex-col items-center gap-0.5 transition-colors"
            style={{
              color: page === item.id ? 'var(--accent)' : 'var(--text-muted)',
              touchAction: 'manipulation',
              minHeight: 44,
            }}
          >
            {item.id === 'stories' ? (
              <StoriesIcon size={page === item.id ? 22 : 20} active={page === 'stories'} />
            ) : item.icon ? (
              <item.icon size={page === item.id ? 22 : 20} />
            ) : (
              <TwitterBird size={page === item.id ? 22 : 20} />
            )}
            <span className="text-[10px] font-medium">{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
