import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Heart, MessageCircle, Repeat2, Bookmark, Share2, MoreHorizontal,
  Search, TrendingUp, Users, Flame, Send, X, Image as ImageIcon,
  Bell, BarChart2, Calendar, UserPlus, UserCheck, Quote,
  Pin, Trash2, Flag, Check, Clock, ChevronRight, Volume2,
  List, DollarSign, BadgeCheck, Sparkles, AtSign, Hash,
  Home, Compass, PenSquare, Ban,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useIsMobile } from '../hooks/use-mobile';
import { ProfilePage } from './ProfilePage';
import { WolfLogo } from '../components/ui/WolfLogo';

// ─── API helpers ───────────────────────────────────────────────────────────────
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

// ─── Types ─────────────────────────────────────────────────────────────────────
type FeedTab = 'foryou' | 'following' | 'explore' | 'notifications' | 'bookmarks';
interface Post {
  id: string; author_id: string; content: string;
  media_urls: string[]; media_types: string[];
  reply_to_id: string | null; repost_of_id: string | null;
  is_deleted: number; is_pinned: number;
  likes_count: number; reposts_count: number; comments_count: number;
  bookmarks_count: number; views_count: number;
  hashtags: string[]; mentions: string[]; visibility: string;
  created_at: string; updated_at: string;
  author?: { id: string; username: string; display_name: string; avatar_url: string; bio?: string; is_admin?: boolean };
  quoted_post?: Post;
}
interface Notif {
  id: string; type: string;
  actor_username: string; actor_display_name: string; actor_avatar: string;
  target_id: string; target_type: string; is_read: number; created_at: string;
}

// ─── Utilities ─────────────────────────────────────────────────────────────────
const CHAR_LIMIT = 280;
function fmtTime(iso: string, lang: string) {
  const d = Date.now() - new Date(iso).getTime();
  if (lang === 'fa') {
    if (d < 60000) return 'الان';
    if (d < 3600000) return `${Math.floor(d / 60000)}د`;
    if (d < 86400000) return `${Math.floor(d / 3600000)}س`;
    if (d < 604800000) return `${Math.floor(d / 86400000)}ر`;
    return new Date(iso).toLocaleDateString('fa-IR');
  }
  if (d < 60000) return 'now';
  if (d < 3600000) return `${Math.floor(d / 60000)}m`;
  if (d < 86400000) return `${Math.floor(d / 3600000)}h`;
  if (d < 604800000) return `${Math.floor(d / 86400000)}d`;
  return new Date(iso).toLocaleDateString('en-US');
}
function fmtN(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n ? n.toString() : '';
}
function avatar(profile?: Post['author']) {
  if (!profile) return null;
  const init = (profile.display_name || profile.username || '?').charAt(0).toUpperCase();
  const color = `hsl(${(init.charCodeAt(0) * 17 + 100) % 360},55%,48%)`;
  return profile.avatar_url
    ? <img src={profile.avatar_url} className="w-full h-full object-cover" alt="" loading="lazy" />
    : <div className="w-full h-full flex items-center justify-center text-white text-sm font-bold" style={{ background: color }}>{init}</div>;
}
async function hydratePost(p: any, authorsById: Record<string, any>): Promise<Post> {
  return {
    ...p,
    hashtags: typeof p.hashtags === 'string' ? JSON.parse(p.hashtags || '[]') : (p.hashtags || []),
    mentions: typeof p.mentions === 'string' ? JSON.parse(p.mentions || '[]') : (p.mentions || []),
    media_urls: typeof p.media_urls === 'string' ? JSON.parse(p.media_urls || '[]') : (p.media_urls || []),
    media_types: typeof p.media_types === 'string' ? JSON.parse(p.media_types || '[]') : (p.media_types || []),
    author: authorsById[p.author_id] || { id: p.author_id, username: 'unknown', display_name: 'Unknown', avatar_url: '' },
  };
}
async function fetchPosts(filters: any[] = [], limit = 30): Promise<Post[]> {
  let q = supabase.from('feed_posts').select('*').eq('is_deleted', 0).order('created_at', { ascending: false }).limit(limit);
  for (const f of filters) q = (q as any)[f.op](f.col, f.val);
  const { data } = await q;
  if (!data?.length) return [];
  const ids = [...new Set((data as any[]).map((p: any) => p.author_id))];
  const { data: authors } = await supabase.from('profiles').select('*').in('id', ids);
  const map: Record<string, any> = {};
  (authors as any[] || []).forEach((a) => { map[a.id] = a; });
  return Promise.all((data as any[]).map((p) => hydratePost(p, map)));
}

// ─── ComingSoon ────────────────────────────────────────────────────────────────
function ComingSoon({ children, block }: { children: React.ReactNode; block?: boolean }) {
  const { language } = useTheme();
  const [show, setShow] = useState(false);
  return (
    <div
      className="relative"
      style={{ display: block ? 'block' : 'inline-flex' }}
      onClick={() => { setShow(true); setTimeout(() => setShow(false), 1800); }}>
      {children}
      {show && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-white z-50 pointer-events-none whitespace-nowrap"
          style={{ background: 'rgba(0,0,0,0.88)' }}>
          ⏳ {language === 'fa' ? 'به زودی' : 'Coming soon'}
        </div>
      )}
    </div>
  );
}

// ─── MediaGrid ─────────────────────────────────────────────────────────────────
function MediaGrid({ urls }: { urls: string[] }) {
  if (!urls.length) return null;
  const n = urls.length;
  return (
    <div className={`grid gap-0.5 mt-3 rounded-2xl overflow-hidden ${n === 1 ? '' : n === 2 ? 'grid-cols-2' : n === 3 ? 'grid-cols-2' : 'grid-cols-2'}`}
      style={{ maxHeight: 340 }}>
      {urls.slice(0, 4).map((url, i) => (
        <div key={i} className={`relative overflow-hidden bg-gray-900 ${n === 3 && i === 0 ? 'row-span-2' : ''}`}
          style={{ aspectRatio: n === 1 ? '16/9' : '1' }}>
          <img src={url} className="w-full h-full object-cover" alt="" loading="lazy" />
          {n > 4 && i === 3 && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white font-bold text-xl">+{n - 4}</div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── PostContent ───────────────────────────────────────────────────────────────
function PostContent({ content, language }: { content: string; language: string }) {
  const parts = content.split(/(#[؀-ۿA-Za-z0-9_]+|@[A-Za-z0-9_]+)/g);
  return (
    <p style={{
      color: 'var(--text-primary)',
      textAlign: language === 'fa' ? 'right' : 'left',
      direction: 'auto',
      fontSize: 15,
      lineHeight: '1.55',
      marginTop: 4,
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-words',
    }}>
      {parts.map((part, i) =>
        part.startsWith('#') || part.startsWith('@')
          ? <span key={i} style={{ color: '#1d9bf0' }}>{part}</span>
          : part
      )}
    </p>
  );
}

// ─── QuotedPost ────────────────────────────────────────────────────────────────
function QuotedPost({ post, language }: { post: Post; language: string }) {
  return (
    <div className="mt-3 rounded-xl p-3 cursor-pointer transition-colors"
      style={{ border: '1px solid var(--border-color)', background: 'var(--bg-primary)' }}>
      <div className="flex items-center gap-2 mb-1" style={{ direction: 'ltr' }}>
        <div className="w-5 h-5 rounded-full overflow-hidden flex-shrink-0">{avatar(post.author)}</div>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{post.author?.display_name || post.author?.username}</span>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>@{post.author?.username}</span>
      </div>
      <PostContent content={post.content} language={language} />
      {post.media_urls?.length > 0 && <MediaGrid urls={post.media_urls.slice(0, 1)} />}
    </div>
  );
}

// ─── ReplyModal ─────────────────────────────────────────────────────────────────
function ReplyModal({ post, onClose, onReplied, language }: { post: Post; onClose: () => void; onReplied: () => void; language: string }) {
  const { user, profile } = useAuth();
  const { t } = useTheme();
  const [text, setText] = useState('');
  const [replies, setReplies] = useState<any[]>([]);
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('post_comments').select('*').eq('post_id', post.id).eq('is_deleted', 0).order('created_at', { ascending: true }).limit(30);
      if (data?.length) {
        const ids = [...new Set((data as any[]).map((c: any) => c.author_id))];
        const { data: authors } = await supabase.from('profiles').select('*').in('id', ids);
        const map: Record<string, any> = {};
        (authors as any[] || []).forEach((a) => { map[a.id] = a; });
        setReplies((data as any[]).map((c) => ({ ...c, author: map[c.author_id] })));
      }
    })();
  }, [post.id]);

  async function submitReply() {
    if (!text.trim() || !user) return;
    setPosting(true);
    try {
      const { data } = await supabase.from('post_comments').insert({ post_id: post.id, author_id: user.id, content: text.trim() });
      if (data) {
        await supabase.from('feed_posts').update({ comments_count: post.comments_count + 1 }).eq('id', post.id);
        setText('');
        onReplied();
        setReplies(prev => [...prev, { ...(data as any), author: profile }]);
      }
    } catch {}
    setPosting(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div className="w-full md:w-[600px] max-h-[90vh] flex flex-col"
        style={{
          background: 'var(--bg-card)',
          borderRadius: '20px 20px 0 0',
        }}
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--border-color)' }}>
          <button onClick={onClose} className="p-2 rounded-full transition-colors"
            style={{ color: 'var(--text-muted)', touchAction: 'manipulation' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-primary)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
            <X size={18} />
          </button>
          <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>{t('پاسخ‌ها', 'Replies')}</span>
          <div className="w-9" />
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-4"
          style={{ WebkitOverflowScrolling: 'touch' }}>
          {/* Original post mini */}
          <div className="flex gap-3 pb-4" style={{ borderBottom: '1px solid var(--border-color)' }}>
            <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0">{avatar(post.author)}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{post.author?.display_name}</span>
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>@{post.author?.username}</span>
              </div>
              <PostContent content={post.content} language={language} />
            </div>
          </div>
          {/* Replies */}
          {replies.map(r => (
            <div key={r.id} className="flex gap-3">
              <div className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0">{avatar(r.author)}</div>
              <div className="flex-1 min-w-0 rounded-2xl p-3"
                style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-color)' }}>
                <div className="flex items-center gap-1.5 mb-1">
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{r.author?.display_name || r.author?.username}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtTime(r.created_at, language)}</span>
                </div>
                <p style={{ fontSize: 14, color: 'var(--text-primary)' }}>{r.content}</p>
              </div>
            </div>
          ))}
          {replies.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <MessageCircle size={32} style={{ color: 'var(--text-muted)', opacity: 0.3 }} />
              <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>{t('اولین نفری باش که پاسخ می‌دهی', 'Be the first to reply')}</p>
            </div>
          )}
        </div>

        {/* Compose reply */}
        <div className="p-3 flex-shrink-0" style={{ borderTop: '1px solid var(--border-color)' }}>
          <div className="flex gap-3 items-center">
            <div className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0">{avatar(profile as any)}</div>
            <input
              value={text} onChange={e => setText(e.target.value)}
              placeholder={t('پاسخ بنویسید...', 'Write a reply...')}
              className="flex-1 outline-none bg-transparent"
              style={{ fontSize: 14, color: 'var(--text-primary)', direction: 'auto' }}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitReply(); } }}
            />
            <button onClick={submitReply} disabled={!text.trim() || posting}
              className="rounded-full flex-shrink-0 flex items-center justify-center transition-all"
              style={{
                width: 36, height: 36,
                background: text.trim() ? '#1d9bf0' : 'var(--bg-primary)',
                color: 'white',
                touchAction: 'manipulation',
              }}>
              {posting
                ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <Send size={15} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── QuoteModal ─────────────────────────────────────────────────────────────────
function QuoteModal({ post, onClose, onPosted, language }: { post: Post; onClose: () => void; onPosted: (p: Post) => void; language: string }) {
  const { user, profile } = useAuth();
  const { t } = useTheme();
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);

  async function submit() {
    if (!user) return;
    setPosting(true);
    try {
      const { data } = await supabase.from('feed_posts').insert({
        author_id: user.id, content: text.trim(),
        repost_of_id: post.id, visibility: 'public',
        hashtags: '[]', mentions: '[]', media_urls: '[]', media_types: '[]',
      }).select().single() as any;
      if (data) {
        await supabase.from('feed_posts').update({ reposts_count: post.reposts_count + 1 }).eq('id', post.id);
        onPosted({ ...(data as any), author: profile, quoted_post: post, hashtags: [], mentions: [], media_urls: [], media_types: [] });
      }
    } catch {}
    setPosting(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div className="w-full md:w-[600px] overflow-hidden"
        style={{ background: 'var(--bg-card)', borderRadius: '20px 20px 0 0' }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: '1px solid var(--border-color)' }}>
          <button onClick={onClose} className="p-2 rounded-full transition-colors"
            style={{ color: 'var(--text-muted)', touchAction: 'manipulation' }}>
            <X size={18} />
          </button>
          <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>{t('نقل‌قول', 'Quote')}</span>
          <button onClick={submit} disabled={posting}
            className="rounded-full px-4 py-1.5 font-bold text-white transition-all"
            style={{ background: '#1d9bf0', fontSize: 14, touchAction: 'manipulation' }}>
            {posting ? '...' : t('ارسال', 'Post')}
          </button>
        </div>
        <div className="p-4 space-y-3">
          <textarea value={text} onChange={e => setText(e.target.value)} rows={3}
            placeholder={t('نظرتان را اضافه کنید...', 'Add a comment...')}
            className="w-full bg-transparent outline-none resize-none"
            style={{ fontSize: 15, color: 'var(--text-primary)', direction: 'auto' }} />
          <QuotedPost post={post} language={language} />
        </div>
      </div>
    </div>
  );
}

// ─── PostMenu ──────────────────────────────────────────────────────────────────
function PostMenu({ post, isOwn, isAdmin, onDelete, onPin, onReport, onBlock, onClose, t }: {
  post: Post; isOwn: boolean; isAdmin: boolean;
  onDelete: () => void; onPin: () => void; onReport: () => void; onBlock: () => void; onClose: () => void;
  t: (fa: string, en?: string) => string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="w-full max-w-sm overflow-hidden"
        style={{ background: 'var(--bg-card)', borderRadius: '20px 20px 0 0' }}
        onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 rounded-full mx-auto mt-3 mb-2" style={{ background: 'var(--border-color)' }} />
        {isOwn && (
          <button onClick={onDelete} className="w-full flex items-center gap-3 px-5 py-4"
            style={{ color: '#f43f5e', borderBottom: '1px solid var(--border-color)', touchAction: 'manipulation', fontSize: 15 }}>
            <Trash2 size={18} /><span>{t('حذف پست', 'Delete post')}</span>
          </button>
        )}
        {isAdmin && (
          <button onClick={onPin} className="w-full flex items-center gap-3 px-5 py-4"
            style={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--border-color)', touchAction: 'manipulation', fontSize: 15 }}>
            <Pin size={18} /><span>{post.is_pinned ? t('برداشتن پین', 'Unpin') : t('پین کردن', 'Pin')}</span>
          </button>
        )}
        {!isOwn && (
          <button onClick={() => { onReport(); onClose(); }} className="w-full flex items-center gap-3 px-5 py-4"
            style={{ color: '#f59e0b', borderBottom: '1px solid var(--border-color)', touchAction: 'manipulation', fontSize: 15 }}>
            <Flag size={18} /><span>{t('گزارش تخلف', 'Report')}</span>
          </button>
        )}
        {!isOwn && (
          <button onClick={() => { onBlock(); onClose(); }} className="w-full flex items-center gap-3 px-5 py-4"
            style={{ color: '#f43f5e', borderBottom: '1px solid var(--border-color)', touchAction: 'manipulation', fontSize: 15 }}>
            <Ban size={18} /><span>{t('بلاک کردن', 'Block user')}</span>
          </button>
        )}
        <ComingSoon>
          <button className="w-full flex items-center gap-3 px-5 py-4"
            style={{ color: 'var(--text-primary)', touchAction: 'manipulation', fontSize: 15 }}>
            <Share2 size={18} /><span>{t('اشتراک‌گذاری', 'Share')}</span>
          </button>
        </ComingSoon>
        <button onClick={onClose} className="w-full py-4 text-center font-bold mt-1"
          style={{ color: '#1d9bf0', borderTop: '1px solid var(--border-color)', touchAction: 'manipulation', fontSize: 15 }}>
          {t('لغو', 'Cancel')}
        </button>
      </div>
    </div>
  );
}

// ─── ReportModal ───────────────────────────────────────────────────────────────
function ReportModal({ targetType, targetId, onClose, t }: {
  targetType: string; targetId: string;
  onClose: () => void; t: (fa: string, en?: string) => string;
}) {
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  const reasons = [
    { id: 'spam', label: t('اسپم', 'Spam') },
    { id: 'harassment', label: t('آزار و اذیت', 'Harassment') },
    { id: 'misinformation', label: t('اطلاعات نادرست', 'Misinformation') },
    { id: 'violence', label: t('خشونت', 'Violence') },
    { id: 'inappropriate', label: t('محتوای نامناسب', 'Inappropriate content') },
    { id: 'other', label: t('سایر', 'Other') },
  ];

  async function submit() {
    if (!reason) return;
    setSending(true);
    try {
      await apiPost('/reports', { target_type: targetType, target_id: targetId, reason, details });
      setDone(true);
      setTimeout(onClose, 1500);
    } catch {}
    setSending(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div className="w-full max-w-sm overflow-hidden" style={{ background: 'var(--bg-card)', borderRadius: '20px 20px 0 0' }} onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 rounded-full mx-auto mt-3 mb-3" style={{ background: 'var(--border-color)' }} />
        {done ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
              <Flag size={22} style={{ color: '#22c55e' }} />
            </div>
            <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{t('گزارش ارسال شد', 'Report submitted')}</p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{t('از گزارش شما متشکریم', 'Thank you for your report')}</p>
          </div>
        ) : (
          <div className="px-5 pb-6">
            <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>{t('گزارش تخلف', 'Report')}</p>
            <div className="space-y-2 mb-4">
              {reasons.map(r => (
                <button key={r.id} onClick={() => setReason(r.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all"
                  style={{
                    background: reason === r.id ? 'rgba(245,158,11,0.15)' : 'var(--bg-primary)',
                    border: `1px solid ${reason === r.id ? '#f59e0b' : 'var(--border-color)'}`,
                    color: reason === r.id ? '#f59e0b' : 'var(--text-primary)',
                    fontSize: 14, touchAction: 'manipulation',
                  }}>
                  {r.label}
                </button>
              ))}
            </div>
            <textarea value={details} onChange={e => setDetails(e.target.value)}
              placeholder={t('جزئیات بیشتر (اختیاری)...', 'More details (optional)...')}
              rows={2}
              className="w-full rounded-xl p-3 resize-none outline-none mb-4"
              style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13, border: '1px solid var(--border-color)' }} />
            <button onClick={submit} disabled={!reason || sending}
              className="w-full py-3 rounded-2xl font-bold text-white transition-all"
              style={{ background: reason ? '#f59e0b' : 'var(--bg-primary)', fontSize: 15, touchAction: 'manipulation' }}>
              {sending ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" /> : t('ارسال گزارش', 'Submit Report')}
            </button>
            <button onClick={onClose} className="w-full py-3 text-center mt-1" style={{ color: 'var(--text-muted)', fontSize: 14, touchAction: 'manipulation' }}>
              {t('لغو', 'Cancel')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── PostCard ──────────────────────────────────────────────────────────────────
function PostCard({
  post, liked, bookmarked, following,
  onLike, onBookmark, onReply, onRepost, onQuote, onFollow, onDelete, onPin,
  onProfileClick, onReport, onBlock,
  isOwn, isAdmin, language, t,
}: {
  post: Post; liked: boolean; bookmarked: boolean; following: boolean;
  onLike: () => void; onBookmark: () => void;
  onReply: () => void; onRepost: () => void; onQuote: () => void;
  onFollow: (id: string) => void; onDelete: () => void; onPin: () => void;
  onProfileClick: (userId: string) => void; onReport: () => void; onBlock: () => void;
  isOwn: boolean; isAdmin: boolean; language: string;
  t: (fa: string, en?: string) => string;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const [showRepostMenu, setShowRepostMenu] = useState(false);
  const [hovered, setHovered] = useState(false);

  return (
    <article
      className="px-4 py-3 cursor-pointer transition-colors"
      style={{
        borderBottom: '1px solid var(--border-color)',
        background: hovered ? 'var(--bg-primary)' : 'transparent',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Pinned label */}
      {post.is_pinned && (
        <div className="flex items-center gap-1.5 mb-2"
          style={{ color: 'var(--text-muted)', fontSize: 13, paddingLeft: 52 }}>
          <Pin size={11} /><span>{t('پین‌شده', 'Pinned')}</span>
        </div>
      )}
      {/* Repost label */}
      {post.repost_of_id && !post.content && (
        <div className="flex items-center gap-1.5 mb-2"
          style={{ color: 'var(--text-muted)', fontSize: 13, paddingLeft: 52 }}>
          <Repeat2 size={11} />
          <span>{post.author?.display_name} {t('ریپست کرد', 'reposted')}</span>
        </div>
      )}

      <div className="flex gap-3">
        {/* Avatar */}
        <div className="flex-shrink-0">
          <div className="rounded-full overflow-hidden cursor-pointer"
            style={{ width: 40, height: 40 }}
            onClick={e => { e.stopPropagation(); onProfileClick(post.author_id); }}>
            {avatar(post.author)}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          {/* Header row */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-wrap items-center gap-x-1 min-w-0" style={{ direction: 'ltr' }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', cursor: 'pointer' }}
                onClick={e => { e.stopPropagation(); onProfileClick(post.author_id); }}>
                {post.author?.display_name || post.author?.username}
              </span>
              {post.author?.is_admin && (
                <BadgeCheck size={15} style={{ color: '#1d9bf0', flexShrink: 0 }} />
              )}
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                @{post.author?.username}
              </span>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>·</span>
              <span style={{ fontSize: 13, color: 'var(--text-muted)', flexShrink: 0 }}>
                {fmtTime(post.created_at, language)}
              </span>
            </div>
            <button
              onClick={e => { e.stopPropagation(); setShowMenu(true); }}
              className="rounded-full p-1.5 flex-shrink-0 transition-colors"
              style={{ color: 'var(--text-muted)', touchAction: 'manipulation' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(29,155,240,0.1)'; e.currentTarget.style.color = '#1d9bf0'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}>
              <MoreHorizontal size={17} />
            </button>
          </div>

          {/* Content */}
          {post.content && <PostContent content={post.content} language={language} />}

          {/* Media */}
          <MediaGrid urls={post.media_urls || []} />

          {/* Quoted post */}
          {post.quoted_post && <QuotedPost post={post.quoted_post} language={language} />}

          {/* Action bar */}
          <div className="flex items-center justify-between mt-2" style={{ direction: 'ltr', maxWidth: 400 }}>
            {/* Reply */}
            <ActionBtn
              onClick={onReply}
              icon={<MessageCircle size={17} />}
              count={post.comments_count}
              hoverColor="rgba(29,155,240,0.1)"
              activeColor="#1d9bf0"
            />

            {/* Repost */}
            <div className="relative">
              <ActionBtn
                onClick={() => setShowRepostMenu(p => !p)}
                icon={<Repeat2 size={17} />}
                count={post.reposts_count}
                hoverColor="rgba(0,186,124,0.1)"
                activeColor="#00ba7c"
              />
              {showRepostMenu && (
                <div className="absolute bottom-full mb-1 rounded-2xl overflow-hidden z-40 shadow-2xl"
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    minWidth: 160,
                    left: language === 'fa' ? 'auto' : 0,
                    right: language === 'fa' ? 0 : 'auto',
                  }}>
                  <button onClick={() => { onRepost(); setShowRepostMenu(false); }}
                    className="w-full flex items-center gap-2.5 px-4 py-3 transition-colors"
                    style={{ color: 'var(--text-primary)', fontSize: 14, touchAction: 'manipulation' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-primary)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <Repeat2 size={16} />{t('ریپست', 'Repost')}
                  </button>
                  <button onClick={() => { onQuote(); setShowRepostMenu(false); }}
                    className="w-full flex items-center gap-2.5 px-4 py-3 transition-colors"
                    style={{ color: 'var(--text-primary)', fontSize: 14, touchAction: 'manipulation', borderTop: '1px solid var(--border-color)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-primary)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <Quote size={16} />{t('نقل‌قول', 'Quote')}
                  </button>
                </div>
              )}
            </div>

            {/* Like */}
            <ActionBtn
              onClick={onLike}
              icon={<Heart size={17} fill={liked ? 'currentColor' : 'none'} />}
              count={post.likes_count}
              hoverColor="rgba(244,63,94,0.1)"
              activeColor="#f43f5e"
              active={liked}
            />

            {/* Bookmark */}
            <ActionBtn
              onClick={onBookmark}
              icon={<Bookmark size={17} fill={bookmarked ? 'currentColor' : 'none'} />}
              count={0}
              hoverColor="rgba(29,155,240,0.1)"
              activeColor="#1d9bf0"
              active={bookmarked}
            />

            {/* Share */}
            <ComingSoon>
              <ActionBtn
                onClick={() => {}}
                icon={<Share2 size={17} />}
                count={0}
                hoverColor="rgba(29,155,240,0.1)"
                activeColor="#1d9bf0"
              />
            </ComingSoon>
          </div>
        </div>
      </div>

      {/* Context menus */}
      {showMenu && (
        <PostMenu post={post} isOwn={isOwn} isAdmin={isAdmin}
          onDelete={() => { onDelete(); setShowMenu(false); }}
          onPin={() => { onPin(); setShowMenu(false); }}
          onReport={onReport} onBlock={onBlock}
          onClose={() => setShowMenu(false)} t={t} />
      )}
      {showRepostMenu && (
        <div className="fixed inset-0 z-30" onClick={() => setShowRepostMenu(false)} />
      )}
    </article>
  );
}

// ─── ActionBtn helper ──────────────────────────────────────────────────────────
function ActionBtn({ onClick, icon, count, hoverColor, activeColor, active }: {
  onClick: () => void; icon: React.ReactNode; count: number;
  hoverColor: string; activeColor: string; active?: boolean;
}) {
  const [hov, setHov] = useState(false);
  const color = active ? activeColor : hov ? activeColor : 'var(--text-muted)';
  return (
    <button
      onClick={e => { e.stopPropagation(); onClick(); }}
      className="flex items-center gap-1 group"
      style={{ touchAction: 'manipulation', minWidth: 44, minHeight: 44, justifyContent: 'center' }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}>
      <div className="flex items-center justify-center rounded-full transition-all"
        style={{
          width: 34, height: 34,
          background: hov ? hoverColor : 'transparent',
          color,
          transition: 'background 0.15s, color 0.15s',
        }}>
        {icon}
      </div>
      {count > 0 && (
        <span style={{ fontSize: 13, color, transition: 'color 0.15s' }}>{fmtN(count)}</span>
      )}
    </button>
  );
}

// ─── ComposeBox ─────────────────────────────────────────────────────────────────
function ComposeBox({ onPosted, placeholder }: { onPosted: (p: Post) => void; placeholder?: string }) {
  const { user, profile } = useAuth();
  const { t, language } = useTheme();
  const [text, setText] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [posting, setPosting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const charsLeft = CHAR_LIMIT - text.length;
  const overLimit = charsLeft < 0;

  async function handleImages(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []).slice(0, 4 - images.length);
    if (!files.length) return;
    setUploading(true);
    for (const file of files) {
      const { data, error } = await supabase.storage.from('media').upload('', file);
      if (!error && data?.path) {
        const { data: u } = supabase.storage.from('media').getPublicUrl(data.path);
        setImages(p => [...p, u.publicUrl]);
      }
    }
    e.target.value = '';
    setUploading(false);
  }

  async function post() {
    if ((!text.trim() && !images.length) || !user || overLimit) return;
    setPosting(true);
    const content = text.trim();
    const hashtags = [...new Set((content.match(/#([؀-ۿA-Za-z0-9_]+)/g) || []).map(h => h.slice(1)))];
    const mentions = [...new Set((content.match(/@([A-Za-z0-9_]+)/g) || []).map(m => m.slice(1)))];
    try {
      const { data } = await supabase.from('feed_posts').insert({
        author_id: user.id, content, visibility: 'public',
        hashtags: JSON.stringify(hashtags), mentions: JSON.stringify(mentions),
        media_urls: JSON.stringify(images), media_types: JSON.stringify(images.map(() => 'image')),
      }).select().single() as any;
      if (data) {
        onPosted({ ...(data as any), author: profile, hashtags, mentions, media_urls: images, media_types: [] });
        for (const tag of hashtags) {
          try { await supabase.from('hashtag_stats').upsert({ tag, use_count: 1, last_used_at: new Date().toISOString() }, { onConflict: 'tag' }); } catch {}
        }
      }
    } catch {}
    setText(''); setImages([]);
    setPosting(false);
  }

  return (
    <div className="px-4 pt-3 pb-2" style={{ borderBottom: '1px solid var(--border-color)' }}>
      <div className="flex gap-3">
        <div className="flex-shrink-0 rounded-full overflow-hidden" style={{ width: 40, height: 40 }}>
          {avatar(profile as any)}
        </div>
        <div className="flex-1 min-w-0">
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={placeholder || t('چه خبره؟ ...', "What's happening?...")}
            rows={text.length > 80 ? 4 : 2}
            className="w-full bg-transparent outline-none resize-none"
            style={{
              fontSize: 17,
              color: 'var(--text-primary)',
              direction: 'auto',
              minHeight: 52,
              paddingTop: 8,
            }}
          />

          {/* Image previews */}
          {images.length > 0 && (
            <div className={`grid gap-1.5 mt-2 rounded-2xl overflow-hidden ${images.length > 1 ? 'grid-cols-2' : ''}`}>
              {images.map((u, i) => (
                <div key={i} className="relative rounded-xl overflow-hidden"
                  style={{ aspectRatio: images.length === 1 ? '16/9' : '1' }}>
                  <img src={u} className="w-full h-full object-cover" alt="" />
                  <button onClick={() => setImages(p => p.filter((_, j) => j !== i))}
                    className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full flex items-center justify-center"
                    style={{ background: 'rgba(0,0,0,0.75)', touchAction: 'manipulation' }}>
                    <X size={13} className="text-white" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Toolbar */}
          <div className="flex items-center justify-between mt-2 pt-2"
            style={{ borderTop: '1px solid var(--border-color)' }}>
            <div className="flex items-center gap-0.5">
              {images.length < 4 && (
                <button onClick={() => fileRef.current?.click()} disabled={uploading}
                  className="p-2 rounded-full transition-colors"
                  style={{ color: '#1d9bf0', touchAction: 'manipulation' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(29,155,240,0.1)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  {uploading
                    ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    : <ImageIcon size={18} />}
                </button>
              )}
              <ComingSoon>
                <button className="p-2 rounded-full" style={{ color: 'var(--text-muted)', touchAction: 'manipulation' }}>
                  <BarChart2 size={18} />
                </button>
              </ComingSoon>
              <ComingSoon>
                <button className="p-2 rounded-full" style={{ color: 'var(--text-muted)', touchAction: 'manipulation' }}>
                  <Calendar size={18} />
                </button>
              </ComingSoon>
              <ComingSoon>
                <button className="p-2 rounded-full" style={{ color: 'var(--text-muted)', touchAction: 'manipulation' }}>
                  <AtSign size={18} />
                </button>
              </ComingSoon>
            </div>

            <div className="flex items-center gap-3">
              {text.length > 200 && (
                <span style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: overLimit ? '#f87171' : charsLeft <= 20 ? '#fbbf24' : 'var(--text-muted)',
                }}>
                  {charsLeft}
                </span>
              )}
              <button
                onClick={post}
                disabled={(!text.trim() && !images.length) || posting || overLimit}
                className="rounded-full font-bold text-white transition-all"
                style={{
                  padding: '6px 18px',
                  fontSize: 14,
                  background: (text.trim() || images.length) && !overLimit ? '#1d9bf0' : 'rgba(29,155,240,0.4)',
                  touchAction: 'manipulation',
                }}>
                {posting
                  ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mx-3" />
                  : t('ارسال', 'Post')}
              </button>
            </div>
          </div>
        </div>
      </div>
      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImages} />
    </div>
  );
}

// ─── NotificationsTab ──────────────────────────────────────────────────────────
function NotificationsTab({ language, t }: { language: string; t: (fa: string, en?: string) => string }) {
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const res = await apiGet('/notifications');
      setNotifs(res.data || []);
      setLoading(false);
      apiPost('/notifications/read');
    })();
  }, []);

  const typeLabel = (type: string) => {
    const map: Record<string, [string, string]> = {
      like: ['پست شما را لایک کرد', 'liked your post'],
      repost: ['پست شما را ریپست کرد', 'reposted your post'],
      follow: ['شما را دنبال کرد', 'followed you'],
      mention: ['شما را منشن کرد', 'mentioned you'],
      comment: ['به پست شما پاسخ داد', 'replied to your post'],
      join: ['به KingWolf پیوست', 'joined KingWolf'],
    };
    const entry = map[type] || ['اعلان جدید', 'new notification'];
    return language === 'fa' ? entry[0] : entry[1];
  };
  const typeIcon = (type: string) => {
    if (type === 'like') return <Heart size={13} style={{ color: '#f43f5e' }} fill="currentColor" />;
    if (type === 'repost') return <Repeat2 size={13} style={{ color: '#00ba7c' }} />;
    if (type === 'follow') return <UserPlus size={13} style={{ color: '#1d9bf0' }} />;
    if (type === 'comment') return <MessageCircle size={13} style={{ color: '#1d9bf0' }} />;
    if (type === 'join') return <UserPlus size={13} style={{ color: '#7c3aed' }} />;
    return <Bell size={13} style={{ color: '#1d9bf0' }} />;
  };

  if (loading) return (
    <div className="flex items-center justify-center h-40">
      <div className="w-6 h-6 border-2 rounded-full animate-spin"
        style={{ borderColor: '#1d9bf0', borderTopColor: 'transparent' }} />
    </div>
  );
  if (!notifs.length) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <Bell size={40} style={{ color: 'var(--text-muted)', opacity: 0.2 }} />
      <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>{t('هیچ اعلانی ندارید', 'No notifications yet')}</p>
    </div>
  );

  return (
    <div>
      {notifs.map(n => (
        <div key={n.id} className="flex items-center gap-3 px-4 py-3 transition-colors"
          style={{
            borderBottom: '1px solid var(--border-color)',
            background: n.is_read ? 'transparent' : 'rgba(29,155,240,0.05)',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-primary)'}
          onMouseLeave={e => e.currentTarget.style.background = n.is_read ? 'transparent' : 'rgba(29,155,240,0.05)'}>
          <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 relative">
            {n.actor_avatar
              ? <img src={n.actor_avatar} className="w-full h-full object-cover" alt="" />
              : (
                <div className="w-full h-full flex items-center justify-center text-white font-bold"
                  style={{ background: `hsl(${(n.actor_username?.charCodeAt(0) || 0) * 17 % 360},55%,48%)`, fontSize: 14 }}>
                  {(n.actor_display_name || n.actor_username || '?').charAt(0).toUpperCase()}
                </div>
              )}
            <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center"
              style={{ background: 'var(--bg-card)', border: '1.5px solid var(--bg-card)' }}>
              {typeIcon(n.type)}
            </div>
          </div>
          <div className="flex-1 min-w-0" style={{ textAlign: language === 'fa' ? 'right' : 'left' }}>
            <p style={{ fontSize: 14, color: 'var(--text-primary)' }}>
              <span style={{ fontWeight: 700 }}>{n.actor_display_name || n.actor_username}</span>{' '}
              {typeLabel(n.type)}
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{fmtTime(n.created_at, language)}</p>
          </div>
          {!n.is_read && (
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#1d9bf0' }} />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── ExploreTab ────────────────────────────────────────────────────────────────
function ExploreTab({ language, t, following, onFollow }: { language: string; t: (fa: string, en?: string) => string; following: Set<string>; onFollow: (id: string) => void }) {
  const [query, setQuery] = useState('');
  const [trending, setTrending] = useState<Array<{ tag: string; use_count: number }>>([]);
  const [suggested, setSuggested] = useState<any[]>([]);
  const [results, setResults] = useState<Post[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: tags } = await supabase.from('hashtag_stats').select('*').order('use_count', { ascending: false }).limit(8);
      setTrending((tags as any[]) || []);
      const { data: users } = await supabase.from('profiles').select('*').eq('is_approved', 1).eq('is_active', 1).limit(6);
      setSuggested((users as any[]) || []);
    })();
  }, []);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      const posts = await fetchPosts();
      const q = query.toLowerCase();
      setResults(posts.filter(p =>
        p.content.toLowerCase().includes(q) ||
        p.hashtags?.some(h => h.toLowerCase().includes(q.replace('#', ''))) ||
        p.author?.username?.toLowerCase().includes(q) ||
        p.author?.display_name?.toLowerCase().includes(q)
      ));
      setSearching(false);
    }, 400);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div>
      {/* Search box */}
      <div className="px-4 py-3 sticky top-0 z-10"
        style={{ borderBottom: '1px solid var(--border-color)', background: 'var(--bg-card)' }}>
        <div className="relative">
          <Search size={15}
            className="absolute top-1/2 -translate-y-1/2 pointer-events-none"
            style={{
              color: 'var(--text-muted)',
              [language === 'fa' ? 'right' : 'left']: 14,
            }} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={t('جستجوی پست‌ها، افراد، هشتگ‌ها...', 'Search posts, people, hashtags...')}
            className="w-full outline-none rounded-full"
            style={{
              background: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              fontSize: 15,
              padding: '10px 16px',
              [language === 'fa' ? 'paddingRight' : 'paddingLeft']: 42,
              textAlign: language === 'fa' ? 'right' : 'left',
              direction: 'auto',
            }}
          />
        </div>
      </div>

      {query ? (
        searching
          ? <div className="flex justify-center py-10">
              <div className="w-6 h-6 border-2 rounded-full animate-spin"
                style={{ borderColor: '#1d9bf0', borderTopColor: 'transparent' }} />
            </div>
          : results.length === 0
            ? <div className="text-center py-12">
                <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>{t('نتیجه‌ای یافت نشد', 'No results found')}</p>
              </div>
            : <div style={{ color: 'var(--text-muted)', padding: '8px 16px', fontSize: 13 }}>
                {t(`${results.length} نتیجه`, `${results.length} results`)}
              </div>
      ) : (
        <>
          {trending.length > 0 && (
            <div>
              <div className="flex items-center gap-2 px-4 py-3"
                style={{ borderBottom: '1px solid var(--border-color)' }}>
                <TrendingUp size={16} style={{ color: '#1d9bf0' }} />
                <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>
                  {t('ترند‌های امروز', 'Trending today')}
                </span>
              </div>
              {trending.map((tag, i) => (
                <button key={tag.tag} onClick={() => setQuery(tag.tag)}
                  className="w-full flex items-center justify-between px-4 py-3 transition-colors"
                  style={{
                    borderBottom: i < trending.length - 1 ? '1px solid var(--border-color)' : 'none',
                    textAlign: language === 'fa' ? 'right' : 'left',
                    touchAction: 'manipulation',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-primary)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                    {fmtN(tag.use_count || 0)} {t('پست', 'posts')}
                  </span>
                  <div style={{ textAlign: language === 'fa' ? 'right' : 'left' }}>
                    <p style={{ fontSize: 15, fontWeight: 700, color: '#1d9bf0' }}>#{tag.tag}</p>
                    <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{t('ترند در KingWolf', 'Trending in KingWolf')}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {suggested.length > 0 && (
            <div>
              <div className="flex items-center gap-2 px-4 py-3"
                style={{ borderBottom: '1px solid var(--border-color)' }}>
                <Users size={16} style={{ color: '#7c3aed' }} />
                <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>
                  {t('افراد پیشنهادی', 'Suggested people')}
                </span>
              </div>
              {suggested.slice(0, 5).map((u, i) => {
                const init = (u.display_name || u.username || '?').charAt(0).toUpperCase();
                return (
                  <div key={u.id} className="flex items-center gap-3 px-4 py-3 transition-colors"
                    style={{ borderBottom: i < 4 ? '1px solid var(--border-color)' : 'none' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-primary)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <div className="rounded-full overflow-hidden flex-shrink-0" style={{ width: 40, height: 40 }}>
                      {u.avatar_url
                        ? <img src={u.avatar_url} className="w-full h-full object-cover" alt="" />
                        : <div className="w-full h-full flex items-center justify-center text-white font-bold"
                            style={{ background: `hsl(${init.charCodeAt(0) * 17 % 360},55%,48%)` }}>{init}</div>}
                    </div>
                    <div className="flex-1 min-w-0" style={{ textAlign: language === 'fa' ? 'right' : 'left' }}>
                      <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}
                        className="truncate">{u.display_name || u.username}</p>
                      <p style={{ fontSize: 13, color: 'var(--text-muted)' }}
                        className="truncate">@{u.username}{u.bio ? ` · ${u.bio.slice(0, 30)}` : ''}</p>
                    </div>
                    <button
                      onClick={() => onFollow(u.id)}
                      className="rounded-full font-bold flex-shrink-0 transition-all"
                      style={{
                        background: following.has(u.id) ? 'transparent' : '#1d9bf0',
                        border: `1px solid ${following.has(u.id) ? 'var(--border-color)' : '#1d9bf0'}`,
                        color: following.has(u.id) ? 'var(--text-muted)' : 'white',
                        fontSize: 13,
                        padding: '5px 14px',
                        touchAction: 'manipulation',
                      }}>
                      {following.has(u.id) ? t('دنبال‌شده', 'Following') : t('دنبال کن', 'Follow')}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <div className="px-4 pt-4 pb-4">
            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 12 }}>
              {t('قابلیت‌های در راه', 'Coming soon')}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { icon: Volume2, label: t('Spaces صوتی', 'Spaces') },
                { icon: List, label: t('لیست‌ها', 'Lists') },
                { icon: DollarSign, label: t('کسب درآمد', 'Monetize') },
                { icon: BadgeCheck, label: t('تیک آبی', 'Verification') },
              ].map(item => (
                <ComingSoon key={item.label} block>
                  <button className="w-full flex items-center gap-2.5 p-3 rounded-2xl transition-colors"
                    style={{
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border-color)',
                      touchAction: 'manipulation',
                      width: '100%',
                    }}>
                    <item.icon size={18} style={{ color: '#1d9bf0', flexShrink: 0 }} />
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{item.label}</p>
                  </button>
                </ComingSoon>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── LeftSidebar ───────────────────────────────────────────────────────────────
function LeftSidebar({
  profile, tab, tabs, onTabChange, onCompose, language, t,
}: {
  profile: any;
  tab: FeedTab;
  tabs: Array<{ id: FeedTab; label: string; icon: React.ElementType; badge?: number }>;
  onTabChange: (t: FeedTab) => void;
  onCompose: () => void;
  language: string;
  t: (fa: string, en?: string) => string;
}) {
  const init = profile ? (profile.display_name || profile.username || '?').charAt(0).toUpperCase() : '?';
  const bgColor = `hsl(${(init.charCodeAt(0) * 17 + 100) % 360},55%,48%)`;

  return (
    <div className="flex flex-col h-full py-4" style={{ paddingLeft: 12, paddingRight: 12 }}>
      {/* Mini profile card */}
      {profile && (
        <div className="rounded-2xl p-3 mb-4"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <div className="flex items-center gap-3">
            <div className="rounded-full overflow-hidden flex-shrink-0" style={{ width: 44, height: 44 }}>
              {profile.avatar_url
                ? <img src={profile.avatar_url} className="w-full h-full object-cover" alt="" />
                : <div className="w-full h-full flex items-center justify-center text-white font-bold"
                    style={{ background: bgColor, fontSize: 16 }}>{init}</div>}
            </div>
            <div className="flex-1 min-w-0" style={{ textAlign: language === 'fa' ? 'right' : 'left' }}>
              <p className="truncate" style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                {profile.display_name || profile.username}
              </p>
              <p className="truncate" style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                @{profile.username}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Nav tabs */}
      <nav className="flex flex-col gap-1 flex-1">
        {tabs.map(item => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-full transition-colors w-full"
              style={{
                background: active ? 'var(--bg-primary)' : 'transparent',
                color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                fontWeight: active ? 700 : 400,
                fontSize: 15,
                textAlign: language === 'fa' ? 'right' : 'left',
                direction: language === 'fa' ? 'rtl' : 'ltr',
                touchAction: 'manipulation',
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--bg-primary)'; }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}>
              <div className="relative flex-shrink-0">
                <item.icon size={21} />
                {item.badge ? (
                  <div className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 flex items-center justify-center text-white"
                    style={{ fontSize: 9 }}>
                    {item.badge > 9 ? '9+' : item.badge}
                  </div>
                ) : null}
              </div>
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Compose button */}
      <button
        onClick={onCompose}
        className="w-full rounded-full font-bold text-white mt-4 transition-all"
        style={{
          background: '#1d9bf0',
          padding: '12px 0',
          fontSize: 15,
          touchAction: 'manipulation',
        }}
        onMouseEnter={e => e.currentTarget.style.background = '#1a8cd8'}
        onMouseLeave={e => e.currentTarget.style.background = '#1d9bf0'}>
        {t('پست جدید', 'New Post')}
      </button>
    </div>
  );
}

// ─── RightSidebar ──────────────────────────────────────────────────────────────
function RightSidebar({ language, t, following, onFollow }: { language: string; t: (fa: string, en?: string) => string; following: Set<string>; onFollow: (id: string) => void }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [trending, setTrending] = useState<Array<{ tag: string; use_count: number }>>([]);
  const [suggested, setSuggested] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const { data: tags } = await supabase.from('hashtag_stats').select('*').order('use_count', { ascending: false }).limit(5);
      setTrending((tags as any[]) || []);
      const { data: users } = await supabase.from('profiles').select('*').eq('is_approved', 1).eq('is_active', 1).limit(4);
      setSuggested((users as any[]) || []);
    })();
  }, []);

  return (
    <div className="py-4" style={{ paddingLeft: 16, paddingRight: 4 }}>
      {/* Search */}
      <div className="relative mb-4">
        <Search size={14}
          className="absolute top-1/2 -translate-y-1/2 pointer-events-none"
          style={{
            color: 'var(--text-muted)',
            [language === 'fa' ? 'right' : 'left']: 14,
          }} />
        <input
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder={t('جستجو...', 'Search...')}
          className="w-full outline-none rounded-full"
          style={{
            background: 'var(--bg-card)',
            color: 'var(--text-primary)',
            fontSize: 14,
            padding: '9px 16px',
            [language === 'fa' ? 'paddingRight' : 'paddingLeft']: 40,
            direction: 'auto',
          }}
        />
      </div>

      {/* Trending */}
      {trending.length > 0 && (
        <div className="rounded-2xl overflow-hidden mb-4"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border-color)' }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>
              {t('ترندها', 'Trends')}
            </span>
          </div>
          {trending.map((tag, i) => (
            <div key={tag.tag}
              className="flex items-center justify-between px-4 py-3 cursor-pointer transition-colors"
              style={{ borderBottom: i < trending.length - 1 ? '1px solid var(--border-color)' : 'none' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-primary)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <div style={{ textAlign: language === 'fa' ? 'right' : 'left' }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: '#1d9bf0' }}>#{tag.tag}</p>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>
                  {fmtN(tag.use_count || 0)} {t('پست', 'posts')}
                </p>
              </div>
              <TrendingUp size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            </div>
          ))}
        </div>
      )}

      {/* Who to follow */}
      {suggested.length > 0 && (
        <div className="rounded-2xl overflow-hidden"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border-color)' }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>
              {t('پیشنهادی', 'Who to follow')}
            </span>
          </div>
          {suggested.map((u, i) => {
            const init = (u.display_name || u.username || '?').charAt(0).toUpperCase();
            return (
              <div key={u.id}
                className="flex items-center gap-3 px-4 py-3 transition-colors"
                style={{ borderBottom: i < suggested.length - 1 ? '1px solid var(--border-color)' : 'none' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-primary)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <div className="rounded-full overflow-hidden flex-shrink-0" style={{ width: 38, height: 38 }}>
                  {u.avatar_url
                    ? <img src={u.avatar_url} className="w-full h-full object-cover" alt="" />
                    : <div className="w-full h-full flex items-center justify-center text-white font-bold"
                        style={{ background: `hsl(${init.charCodeAt(0) * 17 % 360},55%,48%)`, fontSize: 14 }}>{init}</div>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate" style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                    {u.display_name || u.username}
                  </p>
                  <p className="truncate" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    @{u.username}
                  </p>
                </div>
                <button
                  onClick={() => onFollow(u.id)}
                  className="rounded-full font-bold flex-shrink-0 transition-all"
                  style={{
                    border: `1px solid ${following.has(u.id) ? 'var(--border-color)' : 'var(--text-primary)'}`,
                    background: following.has(u.id) ? 'transparent' : 'var(--text-primary)',
                    color: following.has(u.id) ? 'var(--text-muted)' : 'var(--bg-primary)',
                    fontSize: 12,
                    padding: '4px 12px',
                    touchAction: 'manipulation',
                  }}>
                  {following.has(u.id) ? t('دنبال‌شده', 'Following') : t('دنبال', 'Follow')}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── FeedPage (main) ───────────────────────────────────────────────────────────
export function FeedPage() {
  const { user, profile } = useAuth();
  const { language, t } = useTheme();
  const isMobile = useIsMobile();
  const [tab, setTab] = useState<FeedTab>('foryou');
  const [posts, setPosts] = useState<Post[]>([]);
  const [followingPosts, setFollowingPosts] = useState<Post[]>([]);
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [bookmarked, setBookmarked] = useState<Set<string>>(new Set());
  const [following, setFollowing] = useState<Set<string>>(new Set());
  const [bookmarkPosts, setBookmarkPosts] = useState<Post[]>([]);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [replyTarget, setReplyTarget] = useState<Post | null>(null);
  const [quoteTarget, setQuoteTarget] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [showComposeModal, setShowComposeModal] = useState(false);
  const [viewProfileId, setViewProfileId] = useState<string | null>(null);
  const [reportTarget, setReportTarget] = useState<{ type: string; id: string } | null>(null);

  // Load initial data
  useEffect(() => {
    (async () => {
      setLoading(true);
      const allPosts = await fetchPosts([], 40);
      setPosts(allPosts);

      if (user) {
        const { data: myLikes } = await supabase.from('likes').select('post_id').eq('user_id', user.id);
        if (myLikes) setLiked(new Set((myLikes as any[]).map((l: any) => l.post_id)));
        const { data: myBm } = await supabase.from('bookmarks').select('post_id').eq('user_id', user.id);
        if (myBm) setBookmarked(new Set((myBm as any[]).map((b: any) => b.post_id)));
        const { data: myFollows } = await supabase.from('follows').select('followed_id').eq('follower_id', user.id);
        if (myFollows) setFollowing(new Set((myFollows as any[]).map((f: any) => f.followed_id)));
        const nRes = await apiGet('/notifications');
        setUnreadNotifs(nRes.unread || 0);
      }
      setLoading(false);
    })();
  }, [user]);

  // Load following-feed when tab selected
  useEffect(() => {
    if (tab !== 'following' || !user || followingPosts.length) return;
    (async () => {
      const followedIds = [...following];
      if (!followedIds.length) { setFollowingPosts([]); return; }
      const fps = await fetchPosts([{ op: 'in', col: 'author_id', val: followedIds }], 30);
      setFollowingPosts(fps);
    })();
  }, [tab, user, following]);

  // Load bookmarks
  useEffect(() => {
    if (tab !== 'bookmarks' || !user || bookmarkPosts.length) return;
    (async () => {
      const { data: bmIds } = await supabase.from('bookmarks').select('post_id').eq('user_id', user.id).order('created_at', { ascending: false }).limit(30);
      if (!bmIds?.length) return;
      const ids = (bmIds as any[]).map((b: any) => b.post_id);
      const fps = await fetchPosts([{ op: 'in', col: 'id', val: ids }], 30);
      setBookmarkPosts(fps);
    })();
  }, [tab, user]);

  const toggleLike = useCallback(async (postId: string) => {
    if (!user) return;
    const wasLiked = liked.has(postId);
    setLiked(p => { const n = new Set(p); wasLiked ? n.delete(postId) : n.add(postId); return n; });
    const delta = wasLiked ? -1 : 1;
    const updateList = (list: Post[]) => list.map(p => p.id === postId ? { ...p, likes_count: Math.max(0, p.likes_count + delta) } : p);
    setPosts(updateList); setFollowingPosts(updateList); setBookmarkPosts(updateList);
    await apiPost(`/social/like/${postId}`);
  }, [user, liked]);

  const toggleBookmark = useCallback(async (postId: string) => {
    if (!user) return;
    const wasBm = bookmarked.has(postId);
    setBookmarked(p => { const n = new Set(p); wasBm ? n.delete(postId) : n.add(postId); return n; });
    if (wasBm) setBookmarkPosts(p => p.filter(x => x.id !== postId));
    await apiPost(`/social/bookmark/${postId}`);
  }, [user, bookmarked]);

  const doRepost = useCallback(async (post: Post) => {
    if (!user) return;
    try {
      const { data } = await supabase.from('feed_posts').insert({
        author_id: user.id, content: '', repost_of_id: post.id, visibility: 'public',
        hashtags: '[]', mentions: '[]', media_urls: '[]', media_types: '[]',
      }).select().single() as any;
      if (data) {
        const newPost: Post = { ...(data as any), author: profile, hashtags: [], mentions: [], media_urls: [], media_types: [] };
        setPosts(p => [newPost, ...p]);
        setPosts(p => p.map(x => x.id === post.id ? { ...x, reposts_count: x.reposts_count + 1 } : x));
      }
    } catch {}
  }, [user, profile]);

  const deletePost = useCallback(async (postId: string) => {
    await supabase.from('feed_posts').update({ is_deleted: 1 }).eq('id', postId);
    const remove = (list: Post[]) => list.filter(p => p.id !== postId);
    setPosts(remove); setFollowingPosts(remove); setBookmarkPosts(remove);
  }, []);

  const pinPost = useCallback(async (post: Post) => {
    const newPin = post.is_pinned ? 0 : 1;
    await supabase.from('feed_posts').update({ is_pinned: newPin }).eq('id', post.id);
    const update = (list: Post[]) => list.map(p => p.id === post.id ? { ...p, is_pinned: newPin } : p);
    setPosts(update); setFollowingPosts(update);
  }, []);

  const addPost = useCallback((p: Post) => {
    setPosts(prev => [p, ...prev]);
    if (p.author?.id === user?.id) setFollowingPosts(prev => [p, ...prev]);
  }, [user]);

  const handleTabChange = (newTab: FeedTab) => {
    setTab(newTab);
    if (newTab === 'notifications') setUnreadNotifs(0);
  };

  const currentPosts = tab === 'following' ? followingPosts : posts;

  const tabs: Array<{ id: FeedTab; label: string; icon: React.ElementType; badge?: number }> = [
    { id: 'foryou', label: t('برای شما', 'For You'), icon: Sparkles },
    { id: 'following', label: t('دنبال‌شده‌ها', 'Following'), icon: Users },
    { id: 'explore', label: t('کاوش', 'Explore'), icon: Compass },
    { id: 'notifications', label: t('اعلان‌ها', 'Notifications'), icon: Bell, badge: unreadNotifs },
    { id: 'bookmarks', label: t('ذخیره‌شده‌ها', 'Saved'), icon: Bookmark },
  ];

  // ─── Post list shared renderer ────────────────────────────────────────────────
  function renderPostList(postList: Post[], emptyIcon: React.ReactNode, emptyMsg: string) {
    if (loading) return (
      <div className="flex justify-center py-12">
        <div className="w-7 h-7 border-2 rounded-full animate-spin"
          style={{ borderColor: '#1d9bf0', borderTopColor: 'transparent' }} />
      </div>
    );
    if (postList.length === 0) return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        {emptyIcon}
        <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>{emptyMsg}</p>
      </div>
    );
    return postList.map(post => {
      const displayPost = (post.author_id === user?.id && profile)
        ? { ...post, author: { ...post.author!, avatar_url: profile.avatar_url || post.author?.avatar_url || '', display_name: profile.display_name || post.author?.display_name || '' } }
        : post;
      return (<PostCard key={post.id} post={displayPost}
        liked={liked.has(post.id)} bookmarked={bookmarked.has(post.id)} following={following.has(post.author_id)}
        onLike={() => toggleLike(post.id)}
        onBookmark={() => toggleBookmark(post.id)}
        onReply={() => setReplyTarget(post)}
        onRepost={() => doRepost(post)}
        onQuote={() => setQuoteTarget(post)}
        onFollow={id => apiPost(`/social/follow/${id}`)}
        onDelete={() => deletePost(post.id)}
        onPin={() => pinPost(post)}
        onProfileClick={id => setViewProfileId(id)}
        onReport={() => setReportTarget({ type: 'post', id: post.id })}
        onBlock={() => { apiPost(`/social/block/${post.author_id}`); setPosts(p => p.filter(x => x.author_id !== post.author_id)); }}
        isOwn={post.author_id === user?.id}
        isAdmin={!!(profile as any)?.is_admin}
        language={language} t={t}
      />);
    });
  }

  // ─── Center column header with tabs (desktop) / sticky tab bar (mobile) ───────
  function CenterHeader() {
    if (isMobile) {
      return (
        <div className="sticky top-0 z-20 flex overflow-x-auto"
          style={{
            background: 'var(--bg-card)',
            borderBottom: '1px solid var(--border-color)',
            scrollbarWidth: 'none',
          }}>
          {tabs.map(item => (
            <button key={item.id}
              onClick={() => handleTabChange(item.id)}
              className="relative flex-shrink-0 flex flex-col items-center justify-center px-4 py-3 gap-0.5 transition-colors"
              style={{
                color: tab === item.id ? 'var(--text-primary)' : 'var(--text-muted)',
                touchAction: 'manipulation',
                minWidth: 60,
              }}>
              <div className="relative">
                <item.icon size={19} />
                {item.badge ? (
                  <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 flex items-center justify-center text-white"
                    style={{ fontSize: 9 }}>
                    {item.badge > 9 ? '9+' : item.badge}
                  </div>
                ) : null}
              </div>
              <span style={{ fontSize: 10, fontWeight: tab === item.id ? 700 : 400 }} className="hidden sm:block">
                {item.label}
              </span>
              {tab === item.id && (
                <div className="absolute bottom-0 inset-x-3 h-0.5 rounded-full"
                  style={{ background: '#1d9bf0' }} />
              )}
            </button>
          ))}
        </div>
      );
    }
    // Desktop: two-tab header (foryou / following) when on feed tabs
    if (tab === 'foryou' || tab === 'following') {
      return (
        <div className="sticky top-0 z-20 flex"
          style={{
            background: 'rgba(var(--bg-card-rgb, 17,17,17), 0.85)',
            backdropFilter: 'blur(12px)',
            borderBottom: '1px solid var(--border-color)',
          }}>
          {[tabs[0], tabs[1]].map(item => (
            <button key={item.id}
              onClick={() => handleTabChange(item.id)}
              className="relative flex-1 flex items-center justify-center py-4 font-semibold transition-colors"
              style={{
                fontSize: 15,
                color: tab === item.id ? 'var(--text-primary)' : 'var(--text-muted)',
                touchAction: 'manipulation',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-primary)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              {item.label}
              {tab === item.id && (
                <div className="absolute bottom-0 w-14 h-1 rounded-full" style={{ background: '#1d9bf0' }} />
              )}
            </button>
          ))}
        </div>
      );
    }
    // Other tabs: title header
    const currentTab = tabs.find(t => t.id === tab);
    return (
      <div className="sticky top-0 z-20 flex items-center px-4 py-4"
        style={{
          background: 'rgba(var(--bg-card-rgb, 17,17,17), 0.85)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid var(--border-color)',
        }}>
        <span style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-primary)' }}>
          {currentTab?.label}
        </span>
      </div>
    );
  }

  // ─── Compose modal (desktop floating compose) ─────────────────────────────────
  function ComposeModal() {
    if (!showComposeModal) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-start justify-center pt-16"
        style={{ background: 'rgba(0,0,0,0.7)' }}
        onClick={() => setShowComposeModal(false)}>
        <div className="w-full max-w-[600px] rounded-2xl overflow-hidden"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
          onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between px-4 pt-3 pb-0">
            <button onClick={() => setShowComposeModal(false)}
              className="p-2 rounded-full transition-colors"
              style={{ color: 'var(--text-muted)', touchAction: 'manipulation' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-primary)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <X size={18} />
            </button>
          </div>
          <ComposeBox onPosted={p => { addPost(p); setShowComposeModal(false); }} />
        </div>
      </div>
    );
  }

  // ─── Mobile header (Twitter-style: avatar left, logo center, bell right) ──────
  function MobileTopBar() {
    const myInit = (profile?.display_name || profile?.username || '?').charAt(0).toUpperCase();
    const myColor = `hsl(${(myInit.charCodeAt(0) * 17 + 100) % 360},55%,48%)`;
    return (
      <div className="flex items-center justify-between px-4 py-2 flex-shrink-0"
        style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border-color)' }}>
        <button onClick={() => user && setViewProfileId(user.id)} style={{ touchAction: 'manipulation' }}>
          <div className="rounded-full overflow-hidden" style={{ width: 34, height: 34 }}>
            {profile?.avatar_url
              ? <img src={profile.avatar_url} className="w-full h-full object-cover" alt="" />
              : <div className="w-full h-full flex items-center justify-center text-white font-bold text-sm" style={{ background: myColor }}>{myInit}</div>}
          </div>
        </button>
        <WolfLogo size={30} />
        <div className="relative">
          <button onClick={() => handleTabChange('notifications')} className="p-1.5 rounded-full"
            style={{ color: 'var(--text-muted)', touchAction: 'manipulation' }}>
            <Bell size={22} />
          </button>
          {unreadNotifs > 0 && (
            <div className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 flex items-center justify-center text-white pointer-events-none"
              style={{ fontSize: 9 }}>
              {unreadNotifs > 9 ? '9+' : unreadNotifs}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────────
  if (isMobile) {
    // Mobile: full-width single column
    return (
      <div className="flex flex-col h-full" dir={language === 'fa' ? 'rtl' : 'ltr'}
        style={{ background: 'var(--bg-primary)' }}>
        <MobileTopBar />
        <CenterHeader />
        <div className="flex-1 overflow-y-auto overscroll-contain"
          style={{ WebkitOverflowScrolling: 'touch' }}>
          {/* Compose on feed tabs */}
          {(tab === 'foryou' || tab === 'following') && user && (
            <ComposeBox onPosted={addPost} />
          )}

          {/* Feed */}
          {(tab === 'foryou' || tab === 'following') && renderPostList(
            currentPosts,
            tab === 'following'
              ? <Users size={40} style={{ color: 'var(--text-muted)', opacity: 0.2 }} />
              : <Flame size={40} style={{ color: 'var(--text-muted)', opacity: 0.2 }} />,
            tab === 'following'
              ? t('هنوز کسی را دنبال نکرده‌اید', "You're not following anyone yet")
              : t('هیچ پستی وجود ندارد', 'No posts yet'),
          )}

          {tab === 'explore' && <ExploreTab language={language} t={t} following={following} onFollow={id => { apiPost(`/social/follow/${id}`); setFollowing(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; }); }} />}
          {tab === 'notifications' && <NotificationsTab language={language} t={t} />}

          {tab === 'bookmarks' && renderPostList(
            bookmarkPosts,
            <Bookmark size={40} style={{ color: 'var(--text-muted)', opacity: 0.2 }} />,
            t('هیچ پستی ذخیره نکرده‌اید', 'No saved posts'),
          )}
        </div>

        {/* Modals */}
        {replyTarget && (
          <ReplyModal post={replyTarget} language={language}
            onClose={() => setReplyTarget(null)}
            onReplied={() => {
              setPosts(p => p.map(x => x.id === replyTarget!.id ? { ...x, comments_count: x.comments_count + 1 } : x));
              setReplyTarget(null);
            }} />
        )}
        {quoteTarget && (
          <QuoteModal post={quoteTarget} language={language}
            onClose={() => setQuoteTarget(null)}
            onPosted={p => { addPost(p); setQuoteTarget(null); }} />
        )}
        {viewProfileId && (
          <div className="fixed inset-0 z-50" style={{ background: 'var(--bg-primary)' }}>
            <ProfilePage
              userId={viewProfileId}
              onBack={() => setViewProfileId(null)}
              onMessageUser={userId => { setViewProfileId(null); }}
            />
          </div>
        )}
        {reportTarget && (
          <ReportModal
            targetType={reportTarget.type}
            targetId={reportTarget.id}
            onClose={() => setReportTarget(null)}
            t={t}
          />
        )}
      </div>
    );
  }

  // Desktop: 3-column layout
  return (
    <div className="flex h-full" dir={language === 'fa' ? 'rtl' : 'ltr'}
      style={{ background: 'var(--bg-primary)' }}>

      {/* Left sidebar — 260px */}
      <div className="flex-shrink-0 overflow-y-auto border-l border-r"
        style={{
          width: 260,
          borderColor: 'var(--border-color)',
          position: 'sticky',
          top: 0,
          height: '100vh',
          overflowY: 'auto',
        }}>
        <LeftSidebar
          profile={profile}
          tab={tab}
          tabs={tabs}
          onTabChange={handleTabChange}
          onCompose={() => setShowComposeModal(true)}
          language={language}
          t={t}
        />
      </div>

      {/* Center feed — max-w-[590px] flex-1 */}
      <div className="flex-1 flex flex-col min-w-0"
        style={{ borderRight: '1px solid var(--border-color)', maxWidth: 590 }}>
        <div className="h-full overflow-y-auto overscroll-contain"
          style={{ WebkitOverflowScrolling: 'touch' }}>
          <CenterHeader />

          {/* Compose box in center (foryou/following only) */}
          {(tab === 'foryou' || tab === 'following') && user && (
            <ComposeBox onPosted={addPost} />
          )}

          {/* Feed */}
          {(tab === 'foryou' || tab === 'following') && renderPostList(
            currentPosts,
            tab === 'following'
              ? <Users size={40} style={{ color: 'var(--text-muted)', opacity: 0.2 }} />
              : <Flame size={40} style={{ color: 'var(--text-muted)', opacity: 0.2 }} />,
            tab === 'following'
              ? t('هنوز کسی را دنبال نکرده‌اید', "You're not following anyone yet")
              : t('هیچ پستی وجود ندارد', 'No posts yet'),
          )}

          {tab === 'explore' && <ExploreTab language={language} t={t} following={following} onFollow={id => { apiPost(`/social/follow/${id}`); setFollowing(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; }); }} />}
          {tab === 'notifications' && <NotificationsTab language={language} t={t} />}

          {tab === 'bookmarks' && renderPostList(
            bookmarkPosts,
            <Bookmark size={40} style={{ color: 'var(--text-muted)', opacity: 0.2 }} />,
            t('هیچ پستی ذخیره نکرده‌اید', 'No saved posts'),
          )}
        </div>
      </div>

      {/* Right sidebar — 300px */}
      <div className="flex-shrink-0 overflow-y-auto hidden lg:block"
        style={{ width: 300 }}>
        <RightSidebar language={language} t={t} following={following} onFollow={id => { apiPost(`/social/follow/${id}`); setFollowing(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; }); }} />
      </div>

      {/* Modals */}
      {replyTarget && (
        <ReplyModal post={replyTarget} language={language}
          onClose={() => setReplyTarget(null)}
          onReplied={() => {
            setPosts(p => p.map(x => x.id === replyTarget!.id ? { ...x, comments_count: x.comments_count + 1 } : x));
            setReplyTarget(null);
          }} />
      )}
      {quoteTarget && (
        <QuoteModal post={quoteTarget} language={language}
          onClose={() => setQuoteTarget(null)}
          onPosted={p => { addPost(p); setQuoteTarget(null); }} />
      )}
      {viewProfileId && (
        <div className="fixed inset-0 z-50" style={{ background: 'var(--bg-primary)' }}>
          <ProfilePage
            userId={viewProfileId}
            onBack={() => setViewProfileId(null)}
            onMessageUser={userId => { setViewProfileId(null); }}
          />
        </div>
      )}
      {reportTarget && (
        <ReportModal
          targetType={reportTarget.type}
          targetId={reportTarget.id}
          onClose={() => setReportTarget(null)}
          t={t}
        />
      )}
      <ComposeModal />
    </div>
  );
}
