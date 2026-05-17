import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Camera, Plus, X, Eye, ChevronLeft, ChevronRight, Trash2,
  Send, Volume2, VolumeX, Smile, Type, Music2,
  Image as ImageIcon, Video,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';

function getToken() { try { return localStorage.getItem('kingwolf_token'); } catch { return null; } }
async function apiFetch(path: string, opts: RequestInit = {}) {
  const token = getToken();
  const headers: Record<string, string> = { ...(opts.headers as any) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(`/api${path}`, { ...opts, headers });
}

interface Story {
  id: string; author_id: string; media_url: string; media_type: string;
  caption: string; views_count: number; viewed: boolean; created_at: string;
}
interface StoryGroup {
  author_id: string; username: string; display_name: string; avatar_url: string;
  stories: Story[];
}

function StoryAvatar({ src, name, size = 56 }: { src?: string; name: string; size?: number }) {
  const [err, setErr] = useState(false);
  if (src && !err) {
    return <img src={src} className="w-full h-full object-cover" alt="" onError={() => setErr(true)} />;
  }
  return (
    <div className="w-full h-full flex items-center justify-center" style={{ background: '#1e3a5f' }}>
      <svg width={size * 0.65} height={size * 0.65} viewBox="0 0 100 100" fill="none">
        <polygon points="20,45 10,15 35,35" fill="url(#wg)" />
        <polygon points="80,45 90,15 65,35" fill="url(#wg)" />
        <ellipse cx="50" cy="55" rx="35" ry="30" fill="url(#wg)" />
        <ellipse cx="50" cy="68" rx="16" ry="10" fill="#1E40AF" />
        <ellipse cx="37" cy="50" rx="5" ry="6" fill="#0F172A" />
        <ellipse cx="63" cy="50" rx="5" ry="6" fill="#0F172A" />
        <circle cx="39" cy="48" r="2" fill="white" opacity="0.8" />
        <circle cx="65" cy="48" r="2" fill="white" opacity="0.8" />
        <polygon points="50,8 44,22 38,16 42,28 50,24 58,28 62,16 56,22" fill="#F59E0B" />
        <defs>
          <linearGradient id="wg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3B82F6" />
            <stop offset="100%" stopColor="#1D4ED8" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

function StoryRing({ allViewed, size = 64 }: { allViewed: boolean; size?: number }) {
  const r = size / 2 - 3;
  const STOPS = ['#f09433', '#e6683c', '#dc2743', '#cc2366', '#bc1888'];
  const gradId = `sg-${size}-${allViewed ? 'v' : 'u'}`;
  if (allViewed) return (
    <svg width={size} height={size} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="2" />
    </svg>
  );
  return (
    <svg width={size} height={size} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <defs>
        <linearGradient id={gradId} x1="0%" y1="100%" x2="100%" y2="0%">
          {STOPS.map((c, i) => <stop key={i} offset={`${(i / (STOPS.length - 1)) * 100}%`} stopColor={c} />)}
        </linearGradient>
      </defs>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`url(#${gradId})`} strokeWidth="2.5"
        strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`} />
    </svg>
  );
}

const TEXT_BACKGROUNDS = [
  'linear-gradient(135deg,#667eea,#764ba2)',
  'linear-gradient(135deg,#f093fb,#f5576c)',
  'linear-gradient(135deg,#4facfe,#00f2fe)',
  'linear-gradient(135deg,#43e97b,#38f9d7)',
  'linear-gradient(135deg,#fa709a,#fee140)',
  'linear-gradient(135deg,#a18cd1,#fbc2eb)',
  'linear-gradient(135deg,#fd7043,#ff8a65)',
  'linear-gradient(135deg,#000000,#434343)',
  'linear-gradient(135deg,#1a1a2e,#16213e)',
];

const REACTION_EMOJIS = ['❤️', '😂', '😮', '😢', '👏', '🔥'];
const QUICK_REACT_EMOJIS = ['❤️', '🔥', '😂', '😮', '😢', '👏', '🎉', '✨'];
const STICKER_EMOJIS = ['😂', '❤️', '🔥', '👏', '😍', '🎉', '😭', '🤣', '✨', '💯', '🙏', '😊', '😎', '💪', '🥳', '🤩', '😢', '😡', '👀', '💀', '🫶', '🤯', '🫡', '🤝'];


export function StoriesPage() {
  const { user, profile } = useAuth();
  const { language } = useTheme();
  const fa = language === 'fa';
  const [groups, setGroups] = useState<StoryGroup[]>([]);
  const [viewing, setViewing] = useState<{ groupIdx: number; storyIdx: number } | null>(null);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);

  // Dual mode
  const [dualMode, setDualMode] = useState(false);

  // Creator
  const [showCreator, setShowCreator] = useState(false);
  const [creatorMode, setCreatorMode] = useState<'text' | 'media'>('media');
  const [textContent, setTextContent] = useState('');
  const [textBgIdx, setTextBgIdx] = useState(0);
  const [textAlign, setTextAlign] = useState<'center' | 'left' | 'right'>('center');
  const [overlay, setOverlay] = useState('');
  const [overlayEmojis, setOverlayEmojis] = useState<string[]>([]);
  const [musicInfo, setMusicInfo] = useState('');
  const [mediaPreview, setMediaPreview] = useState<{ url: string; type: string; file: File } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showMusicInput, setShowMusicInput] = useState(false);
  const [placedEmojis, setPlacedEmojis] = useState<Array<{ id: string; emoji: string; x: number; y: number }>>([]);
  const [showEmojiStickers, setShowEmojiStickers] = useState(false);
  const [dragEmoji, setDragEmoji] = useState<{ id: string; startX: number; startY: number; origX: number; origY: number } | null>(null);

  // Toast
  const [toast, setToast] = useState<string | null>(null);

  // Viewer reactions
  const [showReactions, setShowReactions] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const STORY_DURATION = 5000;
  // Swipe-to-close for story viewer
  const viewerSwipe = useRef<{ x: number; y: number } | null>(null);
  // Android back button: push history state when emoji picker opens, pop to close
  useEffect(() => {
    if (showEmojiPicker) {
      history.pushState({ emojiPicker: true }, '');
      const handler = (e: PopStateEvent) => {
        if (e.state?.emojiPicker !== true) setShowEmojiPicker(false);
      };
      window.addEventListener('popstate', handler);
      return () => window.removeEventListener('popstate', handler);
    }
  }, [showEmojiPicker]);

  const load = useCallback(async () => {
    const res = await apiFetch('/stories');
    const { data } = await res.json();
    setGroups((data as StoryGroup[]) || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const currentGroup = viewing !== null ? groups[viewing.groupIdx] : null;
  const currentStory = currentGroup?.stories[viewing?.storyIdx ?? 0];

  function markViewed(storyId: string) {
    apiFetch(`/stories/${storyId}/view`, { method: 'POST' }).catch(() => {});
  }

  function openGroup(groupIdx: number, storyIdx = 0) {
    setViewing({ groupIdx, storyIdx });
    setProgress(0);
    setReplyText('');
    markViewed(groups[groupIdx]?.stories[storyIdx]?.id);
  }

  function closeViewer() { setViewing(null); setProgress(0); setDualMode(false); }

  function nextStory() {
    if (!viewing || !currentGroup) return;
    if (viewing.storyIdx + 1 < currentGroup.stories.length) {
      const next = { ...viewing, storyIdx: viewing.storyIdx + 1 };
      setViewing(next);
      setProgress(0);
      setReplyText('');
      markViewed(currentGroup.stories[next.storyIdx]?.id);
    } else if (viewing.groupIdx + 1 < groups.length) {
      openGroup(viewing.groupIdx + 1, 0);
    } else {
      closeViewer();
    }
  }

  function prevStory() {
    if (!viewing || !currentGroup) return;
    if (viewing.storyIdx > 0) {
      setViewing({ ...viewing, storyIdx: viewing.storyIdx - 1 });
      setProgress(0);
    } else if (viewing.groupIdx > 0) {
      const prevGroup = groups[viewing.groupIdx - 1];
      setViewing({ groupIdx: viewing.groupIdx - 1, storyIdx: prevGroup.stories.length - 1 });
      setProgress(0);
    }
  }

  useEffect(() => {
    if (!viewing || paused) { if (timerRef.current) clearInterval(timerRef.current); return; }
    const isVideo = currentStory?.media_type === 'video';
    if (isVideo) return;
    setProgress(0);
    if (timerRef.current) clearInterval(timerRef.current);
    const step = 100;
    const inc = (step / STORY_DURATION) * 100;
    timerRef.current = setInterval(() => {
      setProgress(p => {
        if (p >= 100) { nextStory(); return 0; }
        return p + inc;
      });
    }, step);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [viewing?.groupIdx, viewing?.storyIdx, paused]);

  async function uploadTextStory() {
    if (!textContent.trim()) return;
    setUploading(true);
    const bg = TEXT_BACKGROUNDS[textBgIdx];
    const caption = textContent.trim();
    // We create a canvas image for text story
    const canvas = document.createElement('canvas');
    canvas.width = 720; canvas.height = 1280;
    const ctx = canvas.getContext('2d')!;
    // Draw gradient background
    const gradColors = bg.match(/#[0-9a-fA-F]{6}/g) || ['#667eea', '#764ba2'];
    const grd = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradColors.forEach((c, i) => grd.addColorStop(i / (gradColors.length - 1), c));
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Draw text
    ctx.fillStyle = 'white';
    ctx.font = 'bold 72px Arial';
    ctx.textAlign = textAlign === 'left' ? 'left' : textAlign === 'right' ? 'right' : 'center';
    const xPos = textAlign === 'left' ? 60 : textAlign === 'right' ? canvas.width - 60 : canvas.width / 2;
    const words = caption.split(' ');
    const lines: string[] = [];
    let cur = '';
    for (const w of words) {
      const test = cur ? `${cur} ${w}` : w;
      if (ctx.measureText(test).width > canvas.width - 120) { lines.push(cur); cur = w; }
      else cur = test;
    }
    if (cur) lines.push(cur);
    const lineH = 90;
    const startY = canvas.height / 2 - (lines.length * lineH) / 2;
    lines.forEach((line, i) => ctx.fillText(line, xPos, startY + i * lineH));
    // Add overlay emojis (legacy strip)
    ctx.font = '80px serif';
    overlayEmojis.forEach((em, i) => ctx.fillText(em, 100 + i * 120, canvas.height - 200));
    // Add placed (draggable) emojis at their positioned locations
    ctx.font = '96px serif';
    placedEmojis.forEach(pe => ctx.fillText(pe.emoji, (pe.x / 100) * canvas.width, (pe.y / 100) * canvas.height));
    // Convert to blob
    canvas.toBlob(async (blob) => {
      if (!blob) { setUploading(false); return; }
      const file = new File([blob], `text-story-${Date.now()}.png`, { type: 'image/png' });
      const fd = new FormData();
      fd.append('file', file);
      fd.append('caption', overlay || musicInfo ? `${overlay}${musicInfo ? ` 🎵 ${musicInfo}` : ''}` : '');
      await apiFetch('/stories', { method: 'POST', body: fd });
      resetCreator();
      load();
    }, 'image/png');
  }

  async function uploadMediaStory() {
    if (!mediaPreview) return;
    setUploading(true);
    const fd = new FormData();
    fd.append('file', mediaPreview.file);
    const allEmojis = [...overlayEmojis, ...placedEmojis.map(pe => pe.emoji)];
    const cap = [overlay, musicInfo ? `🎵 ${musicInfo}` : '', allEmojis.join(' ')].filter(Boolean).join(' · ');
    if (cap) fd.append('caption', cap);
    await apiFetch('/stories', { method: 'POST', body: fd });
    resetCreator();
    load();
  }

  function resetCreator() {
    setShowCreator(false);
    setTextContent('');
    setOverlay('');
    setOverlayEmojis([]);
    setMusicInfo('');
    setMediaPreview(null);
    setUploading(false);
    setShowEmojiPicker(false);
    setShowMusicInput(false);
    setPlacedEmojis([]);
    setShowEmojiStickers(false);
  }

  async function deleteStory(storyId: string) {
    await apiFetch(`/stories/${storyId}`, { method: 'DELETE' });
    closeViewer();
    load();
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  async function sendStoryReplyMessage(text: string, story: Story) {
    if (!text.trim() || !user) return;
    // Step 1: find or create DM with story author
    const convRes = await apiFetch('/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'direct', participant_id: story.author_id }),
    });
    if (!convRes.ok) throw new Error('conv failed');
    const convData = await convRes.json() as { id: string };
    const convId = convData.id;
    if (!convId) throw new Error('no convId');
    // Step 2: send story_reply message
    const storyPreview = JSON.stringify({
      text: text.trim(),
      story_id: story.id,
      story_media_url: story.media_url,
      story_author: story.author_id,
    });
    await apiFetch(`/conversations/${convId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: storyPreview, type: 'story_reply' }),
    });
  }

  async function sendReaction(emoji: string) {
    if (!currentStory || !user) return;
    setShowReactions(false);
    try {
      await sendStoryReplyMessage(emoji, currentStory);
      showToast(fa ? 'واکنش ارسال شد' : 'Reaction sent');
    } catch {}
  }

  async function sendStoryReply() {
    if (!replyText.trim() || !currentStory) return;
    setSendingReply(true);
    try {
      await sendStoryReplyMessage(replyText, currentStory);
      setReplyText('');
      showToast(fa ? 'پاسخ ارسال شد ✓' : 'Reply sent ✓');
    } catch {
      showToast(fa ? 'خطا در ارسال' : 'Send failed');
    }
    setSendingReply(false);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const url = URL.createObjectURL(file);
    const type = file.type.startsWith('video') ? 'video' : 'image';
    setMediaPreview({ url, type, file });
    setCreatorMode('media');
    setShowCreator(true);
  }

  const myGroup = user ? groups.find(g => g.author_id === user.id) : null;
  const myHasStories = !!myGroup?.stories.length;
  const isOwnStory = currentGroup?.author_id === user?.id;

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-primary)' }} dir={fa ? 'rtl' : 'ltr'}>
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border-color)', background: 'var(--bg-card)' }}>
        <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>{fa ? 'استوری‌ها' : 'Stories'}</span>
        <button
          onClick={() => setShowCreator(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-full font-semibold"
          style={{ background: 'linear-gradient(135deg,#f09433,#dc2743,#bc1888)', color: 'white', fontSize: 13 }}>
          <Camera size={15} />{fa ? 'استوری جدید' : 'New Story'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* ── My story row ── */}
        <div className="px-4 py-4" style={{ borderBottom: '1px solid var(--border-color)' }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
            {fa ? 'استوری شما' : 'Your Story'}
          </p>
          <div className="flex items-center gap-3">
            <button onClick={() => myHasStories ? openGroup(groups.findIndex(g => g.author_id === user?.id)) : setShowCreator(true)}
              className="flex-shrink-0 relative" style={{ width: 64, height: 64 }}>
              <div className="w-full h-full rounded-full overflow-hidden" style={{ border: '2px solid var(--bg-primary)' }}>
                <StoryAvatar src={profile?.avatar_url} name={profile?.display_name || profile?.username || '?'} size={64} />
              </div>
              {myHasStories
                ? <StoryRing allViewed={false} size={68} />
                : (
                  <div className="absolute bottom-0 right-0 w-6 h-6 rounded-full flex items-center justify-center"
                    style={{ background: 'linear-gradient(135deg,#f09433,#bc1888)', border: '2px solid var(--bg-primary)' }}>
                    <Plus size={12} className="text-white" />
                  </div>
                )}
            </button>
            <div>
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                {myHasStories ? (fa ? 'استوری شما' : 'Your story') : (fa ? 'استوری اضافه کن' : 'Add to story')}
              </p>
              <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {myHasStories
                  ? `${myGroup?.stories.length} ${fa ? 'استوری' : 'stories'}`
                  : (fa ? 'متن، عکس یا ویدیو اشتراک‌گذاری کن' : 'Share text, photo or video')}
              </p>
            </div>
          </div>
        </div>

        {/* ── Others' stories ── */}
        {groups.filter(g => g.author_id !== user?.id).length > 0 && (
          <div className="px-4 py-4">
            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
              {fa ? 'استوری دیگران' : 'Others'}
            </p>
            <div className="flex flex-col gap-2">
              {groups.filter(g => g.author_id !== user?.id).map(group => {
                const groupIdx = groups.findIndex(g => g.author_id === group.author_id);
                const allViewed = group.stories.every(s => s.viewed);
                return (
                  <button key={group.author_id}
                    onClick={() => openGroup(groupIdx)}
                    className="flex items-center gap-3 p-3 rounded-2xl transition-colors"
                    style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', touchAction: 'manipulation' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-primary)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-card)'}>
                    <div className="relative flex-shrink-0" style={{ width: 52, height: 52 }}>
                      <div className="w-full h-full rounded-full overflow-hidden" style={{ border: '2px solid var(--bg-primary)' }}>
                        <StoryAvatar src={group.avatar_url} name={group.display_name || group.username} size={52} />
                      </div>
                      <StoryRing allViewed={allViewed} size={56} />
                    </div>
                    <div className="flex-1 min-w-0" style={{ textAlign: fa ? 'right' : 'left' }}>
                      <p style={{ fontSize: 14, fontWeight: allViewed ? 400 : 700, color: 'var(--text-primary)' }} className="truncate">
                        {group.display_name || group.username}
                      </p>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {group.stories.length} {fa ? 'استوری' : 'stories'} · {allViewed ? (fa ? 'دیده شده' : 'Seen') : (fa ? 'جدید' : 'New')}
                      </p>
                    </div>
                    {!allViewed && (
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: 'linear-gradient(135deg,#f09433,#bc1888)' }} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {groups.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 gap-3 px-8">
            <div className="w-20 h-20 rounded-full flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg,#f09433,#dc2743,#bc1888)' }}>
              <Camera size={32} className="text-white" />
            </div>
            <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', textAlign: 'center' }}>
              {fa ? 'هنوز استوری‌ای نیست' : 'No stories yet'}
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>
              {fa ? 'اولین نفری باش که استوری می‌گذاری!' : 'Be the first to share a story!'}
            </p>
            <button onClick={() => setShowCreator(true)}
              className="px-5 py-2.5 rounded-full font-semibold text-white"
              style={{ background: 'linear-gradient(135deg,#f09433,#dc2743,#bc1888)', fontSize: 14 }}>
              {fa ? 'افزودن استوری' : 'Add Story'}
            </button>
          </div>
        )}
      </div>

      {/* ─────────────────── Story Creator ─────────────────── */}
      {showCreator && (
        <div className="fixed inset-0 z-[998] flex flex-col" style={{ background: '#000' }}>
          {/* Creator top bar */}
          <div className="flex items-center justify-between px-4 flex-shrink-0 z-10"
            style={{ paddingTop: 'max(12px, calc(env(safe-area-inset-top) + 8px))', paddingBottom: 12 }}>
            <button onClick={resetCreator} className="p-2 rounded-full" style={{ background: 'rgba(255,255,255,0.15)' }}>
              <X size={20} className="text-white" />
            </button>
            <div className="flex gap-2">
              <button onClick={() => setCreatorMode('text')}
                className="px-3 py-1.5 rounded-full text-sm font-semibold transition-all"
                style={{ background: creatorMode === 'text' ? 'white' : 'rgba(255,255,255,0.2)', color: creatorMode === 'text' ? '#000' : 'white' }}>
                {fa ? 'متن' : 'Text'}
              </button>
              <button onClick={() => fileRef.current?.click()}
                className="px-3 py-1.5 rounded-full text-sm font-semibold transition-all"
                style={{ background: creatorMode === 'media' && mediaPreview ? 'white' : 'rgba(255,255,255,0.2)', color: creatorMode === 'media' && mediaPreview ? '#000' : 'white' }}>
                {fa ? 'رسانه' : 'Media'}
              </button>
            </div>
            <button
              onClick={() => creatorMode === 'text' ? uploadTextStory() : uploadMediaStory()}
              disabled={uploading || (creatorMode === 'text' ? !textContent.trim() : !mediaPreview)}
              className="px-4 py-2 rounded-full text-sm font-bold text-white transition-all"
              style={{
                background: uploading ? 'rgba(255,255,255,0.3)' : 'linear-gradient(135deg,#f09433,#bc1888)',
                opacity: (creatorMode === 'text' ? !textContent.trim() : !mediaPreview) && !uploading ? 0.5 : 1,
              }}>
              {uploading
                ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : (fa ? 'ارسال' : 'Share')}
            </button>
          </div>

          {/* Creator content area */}
          <div className="flex-1 relative flex items-center justify-center overflow-hidden"
            onPointerMove={e => {
              if (!dragEmoji) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const x = ((e.clientX - rect.left) / rect.width) * 100;
              const y = ((e.clientY - rect.top) / rect.height) * 100;
              setPlacedEmojis(prev => prev.map(p => p.id === dragEmoji.id ? { ...p, x: Math.max(5, Math.min(95, x)), y: Math.max(5, Math.min(95, y)) } : p));
            }}
            onPointerUp={() => setDragEmoji(null)}
            onPointerLeave={() => setDragEmoji(null)}
          >
            {creatorMode === 'text' ? (
              <div className="w-full h-full flex items-center justify-center"
                style={{ background: TEXT_BACKGROUNDS[textBgIdx] }}>
                <textarea
                  value={textContent}
                  onChange={e => setTextContent(e.target.value)}
                  placeholder={fa ? 'متن استوری را بنویس...' : 'Write your story...'}
                  className="bg-transparent border-none outline-none resize-none text-center text-white w-full px-8"
                  style={{
                    fontSize: 28, fontWeight: 700, lineHeight: 1.4,
                    direction: 'auto',
                    textAlign: textAlign,
                    textShadow: '0 2px 8px rgba(0,0,0,0.5)',
                    maxWidth: 500,
                  }}
                  rows={4}
                  autoFocus
                />
                {/* Emoji overlays preview */}
                {overlayEmojis.length > 0 && (
                  <div className="absolute bottom-40 left-1/2 -translate-x-1/2 flex gap-3">
                    {overlayEmojis.map((em, i) => (
                      <button key={i} onClick={() => setOverlayEmojis(prev => prev.filter((_, j) => j !== i))}
                        className="text-4xl hover:scale-110 transition-transform">{em}</button>
                    ))}
                  </div>
                )}
              </div>
            ) : mediaPreview ? (
              <div className="w-full h-full relative">
                {mediaPreview.type === 'video'
                  ? <video src={mediaPreview.url} className="w-full h-full object-contain" autoPlay loop muted playsInline />
                  : <img src={mediaPreview.url} className="w-full h-full object-contain" alt="" />}
                {/* Text overlay on media */}
                {overlay && (
                  <div className="absolute bottom-32 inset-x-0 px-6 flex justify-center">
                    <div className="px-4 py-2 rounded-xl"
                      style={{ background: 'rgba(0,0,0,0.6)', color: 'white', fontSize: 18, fontWeight: 600, textAlign: 'center', direction: 'auto', maxWidth: 320 }}>
                      {overlay}
                    </div>
                  </div>
                )}
                {/* Emoji overlays */}
                {overlayEmojis.length > 0 && (
                  <div className="absolute top-20 left-1/2 -translate-x-1/2 flex gap-3">
                    {overlayEmojis.map((em, i) => (
                      <button key={i} onClick={() => setOverlayEmojis(prev => prev.filter((_, j) => j !== i))}
                        className="text-5xl hover:scale-110 transition-transform">{em}</button>
                    ))}
                  </div>
                )}
                {/* Music info */}
                {musicInfo && (
                  <div className="absolute bottom-20 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded-full"
                    style={{ background: 'rgba(0,0,0,0.75)', color: 'white', fontSize: 13, whiteSpace: 'nowrap' }}>
                    <Music2 size={14} /><span>{musicInfo}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-6">
                <button onClick={() => fileRef.current?.click()}
                  className="flex flex-col items-center gap-3 p-8 rounded-3xl transition-all"
                  style={{ background: 'rgba(255,255,255,0.1)', border: '2px dashed rgba(255,255,255,0.3)' }}>
                  <ImageIcon size={48} className="text-white opacity-70" />
                  <span className="text-white font-semibold">{fa ? 'انتخاب عکس یا ویدیو' : 'Select Photo or Video'}</span>
                </button>
                <div className="flex gap-4 text-white/60 text-sm">
                  <div className="flex items-center gap-1.5"><ImageIcon size={14} /><span>{fa ? 'عکس' : 'Photo'}</span></div>
                  <div className="flex items-center gap-1.5"><Video size={14} /><span>{fa ? 'ویدیو' : 'Video'}</span></div>
                </div>
              </div>
            )}

            {/* Draggable placed emojis */}
            {placedEmojis.map(pe => (
              <div
                key={pe.id}
                className="absolute select-none cursor-grab active:cursor-grabbing"
                style={{
                  left: `${pe.x}%`,
                  top: `${pe.y}%`,
                  transform: 'translate(-50%, -50%)',
                  fontSize: 48,
                  touchAction: 'none',
                  userSelect: 'none',
                  filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.5))',
                  zIndex: 15,
                }}
                onPointerDown={e => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  setDragEmoji({ id: pe.id, startX: e.clientX, startY: e.clientY, origX: pe.x, origY: pe.y });
                }}
                onDoubleClick={() => setPlacedEmojis(prev => prev.filter(p => p.id !== pe.id))}
              >
                {pe.emoji}
              </div>
            ))}
          </div>

          {/* Creator bottom tools */}
          <div className="flex-shrink-0 z-10">
            {/* Overlay text input (for media mode) */}
            {creatorMode === 'media' && mediaPreview && !showMusicInput && (
              <div className="px-4 py-2">
                <input value={overlay} onChange={e => setOverlay(e.target.value)}
                  placeholder={fa ? 'متن روی استوری...' : 'Add text to story...'}
                  className="w-full outline-none rounded-xl px-3 py-2.5 text-white text-sm"
                  style={{ background: 'rgba(255,255,255,0.15)', direction: 'auto', fontSize: 15 }} />
              </div>
            )}
            {/* Music input */}
            {showMusicInput && (
              <div className="px-4 py-2">
                <input value={musicInfo} onChange={e => setMusicInfo(e.target.value)}
                  placeholder={fa ? 'نام آهنگ · خواننده' : 'Song name · Artist'}
                  className="w-full outline-none rounded-xl px-3 py-2.5 text-white text-sm"
                  style={{ background: 'rgba(255,255,255,0.15)', direction: 'auto', fontSize: 15 }} />
              </div>
            )}

            {/* Text background switcher (text mode) */}
            {creatorMode === 'text' && (
              <div className="flex gap-2 px-4 py-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
                {TEXT_BACKGROUNDS.map((bg, i) => (
                  <button key={i} onClick={() => setTextBgIdx(i)}
                    className="flex-shrink-0 rounded-full transition-all"
                    style={{
                      width: 32, height: 32,
                      background: bg,
                      border: textBgIdx === i ? '3px solid white' : '2px solid rgba(255,255,255,0.3)',
                      transform: textBgIdx === i ? 'scale(1.2)' : 'scale(1)',
                    }} />
                ))}
              </div>
            )}

            {/* Tool bar */}
            <div className="flex items-center justify-around px-6 py-3"
              style={{ paddingBottom: 'max(24px, calc(env(safe-area-inset-bottom) + 12px))' }}>
              {/* Emoji sticker toggle */}
              <button onClick={() => { setShowEmojiStickers(p => !p); setShowEmojiPicker(false); }}
                className="flex flex-col items-center gap-1"
                style={{ color: showEmojiStickers ? '#f09433' : 'rgba(255,255,255,0.8)', touchAction: 'manipulation' }}>
                <Smile size={26} />
                <span className="text-xs">{fa ? 'استیکر' : 'Sticker'}</span>
              </button>
              {/* Music */}
              <button onClick={() => setShowMusicInput(p => !p)}
                className="flex flex-col items-center gap-1"
                style={{ color: musicInfo ? '#f09433' : 'rgba(255,255,255,0.8)', touchAction: 'manipulation' }}>
                <Music2 size={26} />
                <span className="text-xs">{fa ? 'موزیک' : 'Music'}</span>
              </button>
              {/* File picker (media mode) */}
              {creatorMode === 'media' && (
                <button onClick={() => fileRef.current?.click()}
                  className="flex flex-col items-center gap-1"
                  style={{ color: 'rgba(255,255,255,0.8)', touchAction: 'manipulation' }}>
                  <ImageIcon size={26} />
                  <span className="text-xs">{fa ? 'رسانه' : 'Media'}</span>
                </button>
              )}
              {/* Text align toggle (text mode) */}
              {creatorMode === 'text' && (
                <button onClick={() => setTextAlign(a => a === 'center' ? 'left' : a === 'left' ? 'right' : 'center')}
                  className="flex flex-col items-center gap-1"
                  style={{ color: 'rgba(255,255,255,0.8)', touchAction: 'manipulation' }}>
                  <Type size={26} />
                  <span className="text-xs">{textAlign === 'center' ? (fa ? 'وسط' : 'Center') : textAlign === 'left' ? (fa ? 'چپ' : 'Left') : (fa ? 'راست' : 'Right')}</span>
                </button>
              )}
            </div>
          </div>

          {/* Emoji sticker panel */}
          {showEmojiStickers && (
            <div className="absolute bottom-0 inset-x-0 z-20 rounded-t-3xl p-4"
              style={{ background: 'rgba(15,15,15,0.97)', paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
              <p className="text-white/60 text-xs text-center mb-3">{fa ? 'روی ایموجی بزن تا روی استوری بیاد' : 'Tap to place on story'}</p>
              <div className="flex flex-wrap gap-3 justify-center">
                {STICKER_EMOJIS.map((em, idx) => (
                  <button key={idx} onClick={() => {
                    const id = `em-${Date.now()}-${Math.random()}`;
                    setPlacedEmojis(prev => [...prev, { id, emoji: em, x: 50, y: 50 }]);
                    setShowEmojiStickers(false);
                  }}
                    className="text-4xl hover:scale-125 active:scale-110 transition-transform" style={{ touchAction: 'manipulation' }}>
                    {em}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─────────────────── Story Viewer ─────────────────── */}
      {/* Feature 3: modal overlay — fixed inset-0 z-[999], opens/closes via local state */}
      {viewing && currentGroup && currentStory && (
        <div
          className="fixed inset-0 z-[999] flex flex-col"
          style={{ background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(12px)', touchAction: 'none' }}
          onTouchStart={e => { viewerSwipe.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
          onTouchEnd={e => {
            const s = viewerSwipe.current;
            viewerSwipe.current = null;
            if (!s) return;
            const dx = e.changedTouches[0].clientX - s.x;
            const dy = Math.abs(e.changedTouches[0].clientY - s.y);
            if (dx > 80 && dy < dx * 0.7) closeViewer();
          }}
        >

          {/* Progress bars */}
          <div className="absolute top-0 inset-x-0 z-20 flex gap-1 px-2 pt-2"
            style={{ paddingTop: 'max(8px, env(safe-area-inset-top))' }}>
            {currentGroup.stories.map((s, i) => (
              <div key={s.id} className="flex-1 rounded-full overflow-hidden" style={{ height: 2, background: 'rgba(255,255,255,0.3)' }}>
                <div className="h-full rounded-full"
                  style={{
                    background: 'white',
                    width: i < (viewing?.storyIdx ?? 0) ? '100%' : i === (viewing?.storyIdx ?? 0) ? `${progress}%` : '0%',
                  }} />
              </div>
            ))}
          </div>

          {/* Author header */}
          <div className="absolute top-0 inset-x-0 z-20 flex items-center gap-2.5 px-3"
            style={{ paddingTop: 'max(24px, calc(env(safe-area-inset-top) + 16px))' }}>
            <div className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0 border-2 border-white/40">
              <StoryAvatar src={currentGroup.avatar_url} name={currentGroup.display_name || currentGroup.username} size={36} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold text-sm truncate">{currentGroup.display_name || currentGroup.username}</p>
              <p className="text-white/50 text-xs">{new Date(currentStory.created_at).toLocaleTimeString(fa ? 'fa-IR' : 'en', { hour: '2-digit', minute: '2-digit' })}</p>
            </div>
            {isOwnStory && (
              <button className="flex items-center gap-1 text-white/70 text-xs px-2">
                <Eye size={13} /><span>{currentStory.views_count}</span>
              </button>
            )}
            {currentStory.media_type === 'video' && (
              <button onClick={() => setMuted(m => !m)} className="text-white/70 p-1.5">
                {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
              </button>
            )}
            {isOwnStory && (
              <button onClick={() => deleteStory(currentStory.id)} className="text-white/70 p-1.5">
                <Trash2 size={20} />
              </button>
            )}
            {currentGroup.stories.length > 1 && (
              <button
                onClick={() => setDualMode(d => !d)}
                className={`p-2 rounded-full transition-all ${dualMode ? 'text-purple-400' : 'text-white/60 hover:text-white'}`}
                style={dualMode ? { filter: 'drop-shadow(0 0 8px #a855f7)' } : {}}
                title="Dual Stories"
              >
                <span className="text-sm font-bold">⊞</span>
              </button>
            )}
            <button onClick={closeViewer} className="text-white/80 p-1.5">
              <X size={22} />
            </button>
          </div>

          {/* Media */}
          <div className="absolute inset-0 flex items-center justify-center">
            {dualMode && currentGroup.stories.length > 1 ? (
              <div className="flex h-full w-full">
                {/* Left story — current */}
                <div
                  className="flex-1 relative overflow-hidden"
                  style={{ borderRight: '1px solid rgba(168,85,247,0.3)', boxShadow: '2px 0 20px rgba(168,85,247,0.12)' }}
                  onClick={e => { e.stopPropagation(); }}
                >
                  {currentStory.media_type === 'video'
                    ? (
                      <video
                        ref={videoRef}
                        src={currentStory.media_url}
                        className="w-full h-full object-cover"
                        autoPlay playsInline muted={muted}
                        onEnded={nextStory}
                        onTimeUpdate={e => {
                          const v = e.currentTarget;
                          if (v.duration) setProgress((v.currentTime / v.duration) * 100);
                        }}
                      />
                    )
                    : <img src={currentStory.media_url} className="w-full h-full object-cover" alt="" />}
                  {/* Progress bar overlay */}
                  <div className="absolute top-0 left-0 right-0 h-0.5 bg-white/20 pointer-events-none">
                    <div className="h-full bg-purple-400 transition-none" style={{ width: `${progress}%` }} />
                  </div>
                </div>
                {/* Right story — next */}
                <div
                  className="flex-1 relative overflow-hidden cursor-pointer"
                  onClick={e => { e.stopPropagation(); nextStory(); }}
                >
                  {(() => {
                    const nextIdx = (viewing.storyIdx + 1) % currentGroup.stories.length;
                    const nextStory = currentGroup.stories[nextIdx];
                    return nextStory ? (
                      nextStory.media_type === 'video'
                        ? <video src={nextStory.media_url} className="w-full h-full object-cover opacity-75" autoPlay playsInline muted loop />
                        : <img src={nextStory.media_url} className="w-full h-full object-cover opacity-75" alt="" />
                    ) : null;
                  })()}
                  {/* "Tap to switch" hint */}
                  <div className="absolute inset-0 flex items-end justify-center pb-4 pointer-events-none">
                    <span className="text-white/50 text-xs px-3 py-1 rounded-full" style={{ background: 'rgba(0,0,0,0.4)' }}>
                      {fa ? 'ضربه برای بعدی' : 'Tap to go next'}
                    </span>
                  </div>
                </div>
                {/* Neon divider glow */}
                <div
                  className="absolute top-0 bottom-0 pointer-events-none"
                  style={{
                    left: '50%',
                    width: 1,
                    background: 'linear-gradient(to bottom, transparent, #a855f7, transparent)',
                    boxShadow: '0 0 12px 3px #a855f7',
                  }}
                />
              </div>
            ) : (
              currentStory.media_type === 'video'
                ? (
                  <video
                    ref={videoRef}
                    src={currentStory.media_url}
                    className="w-full h-full object-contain"
                    autoPlay playsInline muted={muted}
                    onEnded={nextStory}
                    onTimeUpdate={e => {
                      const v = e.currentTarget;
                      if (v.duration) setProgress((v.currentTime / v.duration) * 100);
                    }}
                  />
                )
                : <img src={currentStory.media_url} className="w-full h-full object-contain" alt="" />
            )}
          </div>

          {/* Caption */}
          {currentStory.caption && (
            <div className="absolute bottom-28 inset-x-0 px-5 z-20">
              <div className="rounded-2xl px-4 py-2 mx-auto" style={{ background: 'rgba(0,0,0,0.6)', maxWidth: 360, textAlign: 'center' }}>
                <p className="text-white text-sm" style={{ direction: 'auto' }}>{currentStory.caption}</p>
              </div>
            </div>
          )}

          {/* Group navigation dots */}
          {groups.length > 1 && (
            <div className="absolute bottom-20 inset-x-0 flex justify-center gap-1.5 z-20">
              {groups.map((g, i) => (
                <div key={g.author_id} className="rounded-full transition-all"
                  style={{ width: i === viewing.groupIdx ? 16 : 6, height: 6, background: i === viewing.groupIdx ? 'white' : 'rgba(255,255,255,0.4)' }} />
              ))}
            </div>
          )}

          {/* Bottom action bar: reactions + reply */}
          <div className="absolute bottom-0 inset-x-0 z-20 px-4"
            style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}>
            {!isOwnStory ? (
              <div>
                {/* Quick react emoji bar */}
                <div className="flex justify-center gap-2 mb-2">
                  {QUICK_REACT_EMOJIS.map(em => (
                    <button key={em} onClick={() => sendReaction(em)}
                      className="text-2xl hover:scale-125 active:scale-110 transition-transform"
                      style={{ touchAction: 'manipulation', filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.6))' }}>
                      {em}
                    </button>
                  ))}
                </div>
                {/* Reaction emoji panel (expanded) */}
                {showReactions && (
                  <div className="flex justify-center gap-3 mb-2">
                    {REACTION_EMOJIS.map(em => (
                      <button key={em} onClick={() => sendReaction(em)}
                        className="text-3xl hover:scale-125 transition-transform"
                        style={{ touchAction: 'manipulation' }}>
                        {em}
                      </button>
                    ))}
                  </div>
                )}
                {/* Reply row */}
                <div className="flex items-center gap-2">
                  <button onClick={() => setShowReactions(p => !p)} className="p-2 text-white/70 flex-shrink-0">
                    <Smile size={24} />
                  </button>
                  <div className="flex-1 flex items-center rounded-full px-4 py-2"
                    style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)' }}>
                    <input
                      value={replyText}
                      onChange={e => setReplyText(e.target.value)}
                      placeholder={fa ? `پاسخ به ${currentGroup.display_name || currentGroup.username}...` : `Reply to ${currentGroup.display_name || currentGroup.username}...`}
                      className="flex-1 bg-transparent outline-none text-white text-sm"
                      style={{ direction: 'auto' }}
                      onFocus={() => setPaused(true)}
                      onBlur={() => setPaused(false)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendStoryReply(); } }}
                    />
                  </div>
                  {replyText.trim() && (
                    <button onClick={sendStoryReply} disabled={sendingReply} className="p-2 text-white flex-shrink-0">
                      {sendingReply
                        ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        : <Send size={20} />}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2 text-white/60 text-sm pb-2">
                <Eye size={16} />
                <span>{currentStory.views_count} {fa ? 'نفر دیده‌اند' : 'views'}</span>
              </div>
            )}
          </div>

          {/* Toast inside viewer */}
          {toast && (
            <div className="absolute top-20 inset-x-0 z-30 flex justify-center pointer-events-none">
              <div className="px-5 py-2 rounded-full text-white text-sm font-semibold shadow-lg"
                style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}>
                {toast}
              </div>
            </div>
          )}

          {/* Tap zones */}
          <div className="absolute inset-0 z-10 flex" style={{ bottom: 80 }}>
            <div style={{ flex: 1 }}
              onPointerDown={() => setPaused(true)}
              onPointerUp={() => setPaused(false)}
              onClick={prevStory} />
            <div style={{ flex: 2 }}
              onPointerDown={() => setPaused(true)}
              onPointerUp={() => setPaused(false)}
              onClick={nextStory} />
          </div>

          {/* Arrow buttons */}
          <button onClick={prevStory}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.4)' }}>
            <ChevronLeft size={20} className="text-white" />
          </button>
          <button onClick={nextStory}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.4)' }}>
            <ChevronRight size={20} className="text-white" />
          </button>
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleFileSelect} />
    </div>
  );
}
