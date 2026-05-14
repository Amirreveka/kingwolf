import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Heart, MessageCircle, Repeat2, Bookmark, Share2, MoreHorizontal,
  Search, TrendingUp, Users, Flame, Send, X, Image as ImageIcon,
  Bell, BarChart2, Calendar, UserPlus, UserCheck, Quote,
  Pin, Trash2, Flag, Check, Clock, ChevronRight, Volume2,
  List, DollarSign, BadgeCheck, Sparkles, AtSign, Hash,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';

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
function ComingSoon({ children }: { children: React.ReactNode }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative inline-flex" onClick={() => { setShow(true); setTimeout(() => setShow(false), 1800); }}>
      {children}
      {show && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-white z-50 pointer-events-none whitespace-nowrap"
          style={{ background: 'rgba(0,0,0,0.88)', backdropFilter: 'none' }}>
          ⏳ به زودی
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
    <div className={`grid gap-1 mt-2 rounded-2xl overflow-hidden ${n === 1 ? '' : n === 2 ? 'grid-cols-2' : n === 3 ? 'grid-cols-2' : 'grid-cols-2'}`}
      style={{ maxHeight: 340 }}>
      {urls.slice(0, 4).map((url, i) => (
        <div key={i} className={`relative overflow-hidden bg-gray-800 ${n === 3 && i === 0 ? 'row-span-2' : ''}`}
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
    <p className="text-sm leading-relaxed whitespace-pre-wrap break-words"
      style={{ color: 'var(--text-primary)', textAlign: language === 'fa' ? 'right' : 'left', direction: 'auto' }}>
      {parts.map((part, i) =>
        part.startsWith('#') || part.startsWith('@')
          ? <span key={i} className="text-blue-400">{part}</span>
          : part
      )}
    </p>
  );
}

// ─── QuotedPost ────────────────────────────────────────────────────────────────
function QuotedPost({ post, language }: { post: Post; language: string }) {
  return (
    <div className="mt-2 rounded-xl p-3" style={{ border: '1px solid var(--border-color)', background: 'var(--bg-input)' }}>
      <div className="flex items-center gap-2 mb-1">
        <div className="w-5 h-5 rounded-full overflow-hidden flex-shrink-0">{avatar(post.author)}</div>
        <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{post.author?.display_name || post.author?.username}</span>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>@{post.author?.username}</span>
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
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div className="w-full md:w-[600px] max-h-[90vh] flex flex-col rounded-t-3xl md:rounded-3xl overflow-hidden"
        style={{ background: 'var(--bg-card)' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border-color)' }}>
          <button onClick={onClose} className="p-1 rounded-full" style={{ color: 'var(--text-muted)', touchAction: 'manipulation' }}>
            <X size={20} />
          </button>
          <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{t('پاسخ‌ها', 'Replies')}</span>
          <div className="w-8" />
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-3">
          {/* Original post mini */}
          <div className="flex gap-3 pb-3" style={{ borderBottom: '1px solid var(--border-color)' }}>
            <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0">{avatar(post.author)}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{post.author?.display_name}</span>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>@{post.author?.username}</span>
              </div>
              <PostContent content={post.content} language={language} />
            </div>
          </div>
          {/* Replies */}
          {replies.map(r => (
            <div key={r.id} className="flex gap-3">
              <div className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0 flex-shrink-0">{avatar(r.author)}</div>
              <div className="flex-1 min-w-0 rounded-2xl p-3" style={{ background: 'var(--bg-input)' }}>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{r.author?.display_name || r.author?.username}</span>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{fmtTime(r.created_at, language)}</span>
                </div>
                <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{r.content}</p>
              </div>
            </div>
          ))}
          {replies.length === 0 && (
            <div className="text-center py-6" style={{ color: 'var(--text-muted)' }}>
              <MessageCircle size={28} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">{t('اولین نفری باش که پاسخ می‌دهی', 'Be the first to reply')}</p>
            </div>
          )}
        </div>
        {/* Compose reply */}
        <div className="p-3" style={{ borderTop: '1px solid var(--border-color)' }}>
          <div className="flex gap-3 items-center">
            <div className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0">{avatar(profile as any)}</div>
            <input
              value={text} onChange={e => setText(e.target.value)}
              placeholder={t('پاسخ بنویسید...', 'Write a reply...')}
              className="flex-1 bg-transparent outline-none text-sm py-2"
              style={{ color: 'var(--text-primary)', direction: 'auto' }}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitReply(); } }}
            />
            <button onClick={submitReply} disabled={!text.trim() || posting}
              className="p-2 rounded-full text-white flex-shrink-0"
              style={{ background: text.trim() ? 'var(--accent)' : 'var(--bg-input)', touchAction: 'manipulation' }}>
              {posting ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Send size={16} />}
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
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div className="w-full md:w-[600px] rounded-t-3xl md:rounded-3xl overflow-hidden" style={{ background: 'var(--bg-card)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border-color)' }}>
          <button onClick={onClose} style={{ color: 'var(--text-muted)', touchAction: 'manipulation' }}><X size={20} /></button>
          <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{t('نقل‌قول', 'Quote')}</span>
          <button onClick={submit} disabled={posting}
            className="px-3 py-1.5 rounded-full text-sm font-semibold text-white"
            style={{ background: 'var(--accent)', touchAction: 'manipulation' }}>
            {posting ? '...' : t('ارسال', 'Post')}
          </button>
        </div>
        <div className="p-4 space-y-3">
          <textarea value={text} onChange={e => setText(e.target.value)} rows={3}
            placeholder={t('نظرتان را اضافه کنید...', 'Add a comment...')}
            className="w-full bg-transparent outline-none text-sm resize-none"
            style={{ color: 'var(--text-primary)', direction: 'auto' }} />
          <QuotedPost post={post} language={language} />
        </div>
      </div>
    </div>
  );
}

// ─── PostMenu ──────────────────────────────────────────────────────────────────
function PostMenu({ post, isOwn, isAdmin, onDelete, onPin, onClose, t }: {
  post: Post; isOwn: boolean; isAdmin: boolean;
  onDelete: () => void; onPin: () => void; onClose: () => void;
  t: (fa: string, en?: string) => string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="w-full max-w-sm rounded-t-3xl overflow-hidden mb-0" style={{ background: 'var(--bg-card)' }} onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 bg-gray-600 rounded-full mx-auto mt-3 mb-2" />
        {isOwn && (
          <button onClick={onDelete} className="w-full flex items-center gap-3 px-5 py-4 text-red-400"
            style={{ borderBottom: '1px solid var(--border-color)', touchAction: 'manipulation' }}>
            <Trash2 size={18} /><span>{t('حذف پست', 'Delete post')}</span>
          </button>
        )}
        {isAdmin && (
          <button onClick={onPin} className="w-full flex items-center gap-3 px-5 py-4"
            style={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--border-color)', touchAction: 'manipulation' }}>
            <Pin size={18} /><span>{post.is_pinned ? t('برداشتن پین', 'Unpin') : t('پین کردن', 'Pin')}</span>
          </button>
        )}
        <ComingSoon>
          <button className="w-full flex items-center gap-3 px-5 py-4"
            style={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--border-color)', touchAction: 'manipulation' }}>
            <Flag size={18} /><span>{t('گزارش', 'Report')}</span>
          </button>
        </ComingSoon>
        <ComingSoon>
          <button className="w-full flex items-center gap-3 px-5 py-4" style={{ color: 'var(--text-primary)', touchAction: 'manipulation' }}>
            <Share2 size={18} /><span>{t('اشتراک‌گذاری', 'Share')}</span>
          </button>
        </ComingSoon>
        <button onClick={onClose} className="w-full py-4 text-center font-semibold mt-1"
          style={{ color: 'var(--accent)', borderTop: '1px solid var(--border-color)', touchAction: 'manipulation' }}>
          {t('لغو', 'Cancel')}
        </button>
      </div>
    </div>
  );
}

// ─── PostCard ──────────────────────────────────────────────────────────────────
function PostCard({
  post, liked, bookmarked, following,
  onLike, onBookmark, onReply, onRepost, onQuote, onFollow, onDelete, onPin,
  isOwn, isAdmin, language, t,
}: {
  post: Post; liked: boolean; bookmarked: boolean; following: boolean;
  onLike: () => void; onBookmark: () => void;
  onReply: () => void; onRepost: () => void; onQuote: () => void;
  onFollow: (id: string) => void; onDelete: () => void; onPin: () => void;
  isOwn: boolean; isAdmin: boolean; language: string;
  t: (fa: string, en?: string) => string;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const [showRepostMenu, setShowRepostMenu] = useState(false);

  return (
    <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border-color)', background: post.is_pinned ? 'var(--bg-card)' : 'transparent' }}>
      {post.is_pinned && (
        <div className="flex items-center gap-1.5 mb-2 text-xs" style={{ color: 'var(--text-muted)' }}>
          <Pin size={11} /><span>{t('پین‌شده', 'Pinned')}</span>
        </div>
      )}
      {post.repost_of_id && !post.content && (
        <div className="flex items-center gap-1.5 mb-2 text-xs" style={{ color: 'var(--text-muted)' }}>
          <Repeat2 size={11} /><span>{post.author?.display_name} {t('ریپست کرد', 'reposted')}</span>
        </div>
      )}

      <div className="flex gap-3">
        {/* Avatar */}
        <button onClick={() => {}} className="flex-shrink-0" style={{ touchAction: 'manipulation' }}>
          <div className="w-10 h-10 rounded-full overflow-hidden">{avatar(post.author)}</div>
        </button>

        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center justify-between mb-0.5">
            <div className="flex items-center gap-1.5 min-w-0" style={{ flexDirection: language === 'fa' ? 'row-reverse' : 'row' }}>
              <button onClick={() => {}} className="flex items-center gap-1 min-w-0" style={{ touchAction: 'manipulation' }}>
                <span className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>{post.author?.display_name || post.author?.username}</span>
                {post.author?.is_admin && <BadgeCheck size={14} className="text-blue-400 flex-shrink-0" />}
              </button>
              <span className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>@{post.author?.username}</span>
              <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)' }}>· {fmtTime(post.created_at, language)}</span>
            </div>
            <button onClick={() => setShowMenu(true)} className="p-1 rounded-full flex-shrink-0" style={{ color: 'var(--text-muted)', touchAction: 'manipulation' }}>
              <MoreHorizontal size={16} />
            </button>
          </div>

          {/* Content */}
          {post.content && <PostContent content={post.content} language={language} />}

          {/* Media */}
          <MediaGrid urls={post.media_urls || []} />

          {/* Quoted post */}
          {post.quoted_post && <QuotedPost post={post.quoted_post} language={language} />}

          {/* Actions */}
          <div className="flex items-center justify-between mt-2.5" style={{ direction: 'ltr' }}>
            {/* Reply */}
            <button onClick={onReply} className="flex items-center gap-1 group" style={{ touchAction: 'manipulation', minWidth: 44, minHeight: 44, justifyContent: 'center' }}>
              <div className="p-2 rounded-full group-hover:bg-blue-500/10 transition-colors">
                <MessageCircle size={16} style={{ color: 'var(--text-muted)' }} />
              </div>
              {!!post.comments_count && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{fmtN(post.comments_count)}</span>}
            </button>

            {/* Repost */}
            <div className="relative">
              <button onClick={() => setShowRepostMenu(p => !p)} className="flex items-center gap-1 group" style={{ touchAction: 'manipulation', minWidth: 44, minHeight: 44, justifyContent: 'center' }}>
                <div className="p-2 rounded-full group-hover:bg-green-500/10 transition-colors">
                  <Repeat2 size={16} style={{ color: 'var(--text-muted)' }} />
                </div>
                {!!post.reposts_count && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{fmtN(post.reposts_count)}</span>}
              </button>
              {showRepostMenu && (
                <div className="absolute bottom-full left-0 mb-1 rounded-2xl overflow-hidden z-40 shadow-xl min-w-[160px]"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                  <button onClick={() => { onRepost(); setShowRepostMenu(false); }}
                    className="w-full flex items-center gap-2.5 px-4 py-3 text-sm hover:bg-white/5"
                    style={{ color: 'var(--text-primary)', touchAction: 'manipulation' }}>
                    <Repeat2 size={15} />{t('ریپست', 'Repost')}
                  </button>
                  <button onClick={() => { onQuote(); setShowRepostMenu(false); }}
                    className="w-full flex items-center gap-2.5 px-4 py-3 text-sm hover:bg-white/5"
                    style={{ color: 'var(--text-primary)', touchAction: 'manipulation', borderTop: '1px solid var(--border-color)' }}>
                    <Quote size={15} />{t('نقل‌قول', 'Quote')}
                  </button>
                </div>
              )}
            </div>

            {/* Like */}
            <button onClick={onLike} className="flex items-center gap-1 group" style={{ touchAction: 'manipulation', minWidth: 44, minHeight: 44, justifyContent: 'center' }}>
              <div className="p-2 rounded-full group-hover:bg-red-500/10 transition-colors">
                <Heart size={16} fill={liked ? 'currentColor' : 'none'} style={{ color: liked ? '#f43f5e' : 'var(--text-muted)' }} />
              </div>
              {!!post.likes_count && <span className="text-xs" style={{ color: liked ? '#f43f5e' : 'var(--text-muted)' }}>{fmtN(post.likes_count)}</span>}
            </button>

            {/* Bookmark */}
            <button onClick={onBookmark} className="flex items-center gap-1 group" style={{ touchAction: 'manipulation', minWidth: 44, minHeight: 44, justifyContent: 'center' }}>
              <div className="p-2 rounded-full group-hover:bg-blue-500/10 transition-colors">
                <Bookmark size={16} fill={bookmarked ? 'currentColor' : 'none'} style={{ color: bookmarked ? '#60a5fa' : 'var(--text-muted)' }} />
              </div>
            </button>

            {/* Share (coming soon) */}
            <ComingSoon>
              <button className="flex items-center group" style={{ touchAction: 'manipulation', minWidth: 44, minHeight: 44, justifyContent: 'center' }}>
                <div className="p-2 rounded-full group-hover:bg-blue-500/10 transition-colors">
                  <Share2 size={16} style={{ color: 'var(--text-muted)' }} />
                </div>
              </button>
            </ComingSoon>
          </div>
        </div>
      </div>

      {/* Context menus */}
      {showMenu && (
        <PostMenu post={post} isOwn={isOwn} isAdmin={isAdmin}
          onDelete={() => { onDelete(); setShowMenu(false); }}
          onPin={() => { onPin(); setShowMenu(false); }}
          onClose={() => setShowMenu(false)} t={t} />
      )}
      {showRepostMenu && <div className="fixed inset-0 z-30" onClick={() => setShowRepostMenu(false)} />}
    </div>
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
    <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border-color)' }}>
      <div className="flex gap-3">
        <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0">{avatar(profile as any)}</div>
        <div className="flex-1 min-w-0">
          <textarea value={text} onChange={e => setText(e.target.value)}
            placeholder={placeholder || t('چه خبره؟ ...', "What's happening?...")}
            rows={text.length > 80 ? 4 : 2}
            className="w-full bg-transparent outline-none text-sm resize-none pt-2"
            style={{ color: 'var(--text-primary)', direction: 'auto', minHeight: 48 }} />
          {images.length > 0 && (
            <div className={`grid gap-1.5 mt-2 ${images.length > 1 ? 'grid-cols-2' : ''}`}>
              {images.map((u, i) => (
                <div key={i} className="relative rounded-xl overflow-hidden" style={{ aspectRatio: images.length === 1 ? '16/9' : '1' }}>
                  <img src={u} className="w-full h-full object-cover" alt="" />
                  <button onClick={() => setImages(p => p.filter((_, j) => j !== i))}
                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/70 flex items-center justify-center"
                    style={{ touchAction: 'manipulation' }}>
                    <X size={12} className="text-white" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between mt-2 pt-2" style={{ borderTop: '1px solid var(--border-color)' }}>
            <div className="flex items-center gap-1">
              {images.length < 4 && (
                <button onClick={() => fileRef.current?.click()} disabled={uploading}
                  className="p-2 rounded-full transition-colors" style={{ color: 'var(--accent)', touchAction: 'manipulation' }}>
                  {uploading ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <ImageIcon size={18} />}
                </button>
              )}
              <ComingSoon><button className="p-2 rounded-full" style={{ color: 'var(--text-muted)', touchAction: 'manipulation' }}><BarChart2 size={18} /></button></ComingSoon>
              <ComingSoon><button className="p-2 rounded-full" style={{ color: 'var(--text-muted)', touchAction: 'manipulation' }}><Calendar size={18} /></button></ComingSoon>
              <ComingSoon><button className="p-2 rounded-full" style={{ color: 'var(--text-muted)', touchAction: 'manipulation' }}><AtSign size={18} /></button></ComingSoon>
            </div>
            <div className="flex items-center gap-3">
              {text.length > 200 && (
                <span className={`text-xs font-medium ${overLimit ? 'text-red-400' : charsLeft <= 20 ? 'text-yellow-400' : ''}`}
                  style={{ color: overLimit ? '#f87171' : charsLeft <= 20 ? '#fbbf24' : 'var(--text-muted)' }}>
                  {charsLeft}
                </span>
              )}
              <button onClick={post} disabled={(!text.trim() && !images.length) || posting || overLimit}
                className="px-4 py-1.5 rounded-full text-sm font-bold text-white transition-all"
                style={{ background: (text.trim() || images.length) && !overLimit ? 'var(--accent)' : 'var(--bg-input)', touchAction: 'manipulation' }}>
                {posting ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mx-3" /> : t('ارسال', 'Post')}
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
    };
    const entry = map[type] || ['اعلان جدید', 'new notification'];
    return language === 'fa' ? entry[0] : entry[1];
  };
  const typeIcon = (type: string) => {
    if (type === 'like') return <Heart size={16} className="text-red-400" />;
    if (type === 'repost') return <Repeat2 size={16} className="text-green-400" />;
    if (type === 'follow') return <UserPlus size={16} className="text-blue-400" />;
    if (type === 'comment') return <MessageCircle size={16} className="text-blue-400" />;
    return <Bell size={16} style={{ color: 'var(--accent)' }} />;
  };

  if (loading) return <div className="flex items-center justify-center h-40"><div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} /></div>;
  if (!notifs.length) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <Bell size={40} className="opacity-20" style={{ color: 'var(--text-muted)' }} />
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{t('هیچ اعلانی ندارید', 'No notifications yet')}</p>
    </div>
  );

  return (
    <div>
      {notifs.map(n => (
        <div key={n.id} className="flex items-center gap-3 px-4 py-3"
          style={{ borderBottom: '1px solid var(--border-color)', background: n.is_read ? 'transparent' : 'var(--accent)/5', opacity: 1 }}>
          <div className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0 relative">
            {n.actor_avatar ? <img src={n.actor_avatar} className="w-full h-full object-cover" alt="" /> : (
              <div className="w-full h-full flex items-center justify-center text-white text-sm font-bold"
                style={{ background: `hsl(${(n.actor_username?.charCodeAt(0) || 0) * 17 % 360},55%,48%)` }}>
                {(n.actor_display_name || n.actor_username || '?').charAt(0).toUpperCase()}
              </div>
            )}
            <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center"
              style={{ background: 'var(--bg-card)' }}>
              {typeIcon(n.type)}
            </div>
          </div>
          <div className="flex-1 min-w-0" style={{ textAlign: language === 'fa' ? 'right' : 'left' }}>
            <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
              <span className="font-semibold">{n.actor_display_name || n.actor_username}</span>{' '}
              {typeLabel(n.type)}
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{fmtTime(n.created_at, language)}</p>
          </div>
          {!n.is_read && <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: 'var(--accent)' }} />}
        </div>
      ))}
    </div>
  );
}

// ─── ExploreTab ────────────────────────────────────────────────────────────────
function ExploreTab({ language, t }: { language: string; t: (fa: string, en?: string) => string }) {
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
      <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border-color)' }}>
        <div className="relative">
          <Search size={16} className="absolute top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)', [language === 'fa' ? 'right' : 'left']: 12 }} />
          <input value={query} onChange={e => setQuery(e.target.value)}
            placeholder={t('جستجوی پست‌ها، افراد، هشتگ‌ها...', 'Search posts, people, hashtags...')}
            className="w-full py-2.5 rounded-2xl text-sm outline-none"
            style={{
              background: 'var(--bg-input)', color: 'var(--text-primary)',
              [language === 'fa' ? 'paddingRight' : 'paddingLeft']: 40,
              [language === 'fa' ? 'paddingLeft' : 'paddingRight']: 16,
              textAlign: language === 'fa' ? 'right' : 'left', direction: 'auto',
            }} />
        </div>
      </div>

      {query ? (
        searching
          ? <div className="flex justify-center py-10"><div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} /></div>
          : results.length === 0
            ? <div className="text-center py-12"><p className="text-sm" style={{ color: 'var(--text-muted)' }}>{t('نتیجه‌ای یافت نشد', 'No results found')}</p></div>
            : <div style={{ color: 'var(--text-muted)', padding: '8px 16px', fontSize: 12 }}>{t(`${results.length} نتیجه`, `${results.length} results`)}</div>
      ) : (
        <>
          {/* Trending */}
          {trending.length > 0 && (
            <div className="mb-1">
              <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid var(--border-color)' }}>
                <TrendingUp size={16} className="text-blue-400" />
                <span className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>{t('ترند‌های امروز', 'Trending today')}</span>
              </div>
              {trending.map((tag, i) => (
                <button key={tag.tag} onClick={() => setQuery(tag.tag)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors"
                  style={{ borderBottom: i < trending.length - 1 ? '1px solid var(--border-color)' : 'none', textAlign: language === 'fa' ? 'right' : 'left', touchAction: 'manipulation' }}>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{fmtN(tag.use_count || 0)} {t('پست', 'posts')}</span>
                  <div style={{ textAlign: language === 'fa' ? 'right' : 'left' }}>
                    <p className="text-sm font-bold text-blue-400">#{tag.tag}</p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('ترند در KingWolf', 'Trending in KingWolf')}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
          {/* Suggested people */}
          {suggested.length > 0 && (
            <div>
              <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid var(--border-color)' }}>
                <Users size={16} className="text-purple-400" />
                <span className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>{t('افراد پیشنهادی', 'Suggested people')}</span>
              </div>
              {suggested.slice(0, 5).map((u, i) => {
                const init = (u.display_name || u.username || '?').charAt(0).toUpperCase();
                return (
                  <div key={u.id} className="flex items-center gap-3 px-4 py-3"
                    style={{ borderBottom: i < 4 ? '1px solid var(--border-color)' : 'none' }}>
                    <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0">
                      {u.avatar_url ? <img src={u.avatar_url} className="w-full h-full object-cover" alt="" /> : (
                        <div className="w-full h-full flex items-center justify-center text-white font-bold"
                          style={{ background: `hsl(${init.charCodeAt(0) * 17 % 360},55%,48%)` }}>{init}</div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0" style={{ textAlign: language === 'fa' ? 'right' : 'left' }}>
                      <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{u.display_name || u.username}</p>
                      <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>@{u.username}{u.bio ? ` · ${u.bio.slice(0, 30)}` : ''}</p>
                    </div>
                    <ComingSoon>
                      <button className="px-3 py-1.5 rounded-full text-xs font-semibold text-white flex-shrink-0"
                        style={{ background: 'var(--accent)', touchAction: 'manipulation' }}>
                        {t('دنبال کن', 'Follow')}
                      </button>
                    </ComingSoon>
                  </div>
                );
              })}
            </div>
          )}
          {/* Coming soon features */}
          <div className="px-4 pt-4 pb-2">
            <p className="text-xs font-semibold mb-3" style={{ color: 'var(--text-muted)' }}>{t('قابلیت‌های در راه', 'Coming soon')}</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { icon: Volume2, label: t('Spaces صوتی', 'Spaces'), desc: t('به زودی', 'Coming soon') },
                { icon: List, label: t('لیست‌ها', 'Lists'), desc: t('به زودی', 'Coming soon') },
                { icon: DollarSign, label: t('کسب درآمد', 'Monetize'), desc: t('به زودی', 'Coming soon') },
                { icon: BadgeCheck, label: t('تیک آبی', 'Verification'), desc: t('به زودی', 'Coming soon') },
              ].map(item => (
                <ComingSoon key={item.label}>
                  <button className="w-full flex items-center gap-2 p-3 rounded-2xl text-right transition-colors"
                    style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', touchAction: 'manipulation', width: '100%' }}>
                    <item.icon size={18} style={{ color: 'var(--accent)' }} />
                    <div>
                      <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{item.label}</p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{item.desc}</p>
                    </div>
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

// ─── FeedPage (main) ───────────────────────────────────────────────────────────
export function FeedPage() {
  const { user, profile } = useAuth();
  const { language, t } = useTheme();
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

  const currentPosts = tab === 'following' ? followingPosts : posts;

  const tabs = [
    { id: 'foryou' as FeedTab, label: t('برای شما', 'For You'), icon: Sparkles },
    { id: 'following' as FeedTab, label: t('دنبال‌شده‌ها', 'Following'), icon: Users },
    { id: 'explore' as FeedTab, label: t('کاوش', 'Explore'), icon: Hash },
    { id: 'notifications' as FeedTab, label: t('اعلان‌ها', 'Alerts'), icon: Bell, badge: unreadNotifs },
    { id: 'bookmarks' as FeedTab, label: t('ذخیره‌شده‌ها', 'Saved'), icon: Bookmark },
  ];

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-primary)' }}>
      {/* Header */}
      <div className="flex-shrink-0" style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border-color)', paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="flex overflow-x-auto scrollbar-hide">
          {tabs.map(tab_ => (
            <button key={tab_.id} onClick={() => { setTab(tab_.id); if (tab_.id === 'notifications') setUnreadNotifs(0); }}
              className="relative flex-shrink-0 flex flex-col items-center justify-center px-4 py-3 gap-0.5 transition-colors"
              style={{ color: tab === tab_.id ? 'var(--text-primary)' : 'var(--text-muted)', touchAction: 'manipulation', minWidth: 64 }}>
              <div className="relative">
                <tab_.icon size={18} />
                {tab_.badge ? <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 flex items-center justify-center text-white" style={{ fontSize: 9 }}>{tab_.badge > 9 ? '9+' : tab_.badge}</div> : null}
              </div>
              <span className="text-xs font-medium hidden sm:block">{tab_.label}</span>
              {tab === tab_.id && <div className="absolute bottom-0 inset-x-0 h-0.5 rounded-full" style={{ background: 'var(--accent)' }} />}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
        {/* Compose (on foryou & following) */}
        {(tab === 'foryou' || tab === 'following') && user && (
          <ComposeBox onPosted={addPost} />
        )}

        {/* Feed posts */}
        {(tab === 'foryou' || tab === 'following') && (
          <>
            {loading ? (
              <div className="flex justify-center py-12"><div className="w-7 h-7 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} /></div>
            ) : currentPosts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                {tab === 'following'
                  ? <><Users size={40} className="opacity-20" style={{ color: 'var(--text-muted)' }} /><p className="text-sm" style={{ color: 'var(--text-muted)' }}>{t('هنوز کسی را دنبال نکرده‌اید', 'You\'re not following anyone yet')}</p></>
                  : <><Flame size={40} className="opacity-20" style={{ color: 'var(--text-muted)' }} /><p className="text-sm" style={{ color: 'var(--text-muted)' }}>{t('هیچ پستی وجود ندارد', 'No posts yet')}</p></>
                }
              </div>
            ) : (
              currentPosts.map(post => (
                <PostCard key={post.id} post={post}
                  liked={liked.has(post.id)} bookmarked={bookmarked.has(post.id)} following={following.has(post.author_id)}
                  onLike={() => toggleLike(post.id)}
                  onBookmark={() => toggleBookmark(post.id)}
                  onReply={() => setReplyTarget(post)}
                  onRepost={() => doRepost(post)}
                  onQuote={() => setQuoteTarget(post)}
                  onFollow={id => apiPost(`/social/follow/${id}`)}
                  onDelete={() => deletePost(post.id)}
                  onPin={() => pinPost(post)}
                  isOwn={post.author_id === user?.id}
                  isAdmin={!!(profile as any)?.is_admin}
                  language={language} t={t}
                />
              ))
            )}
          </>
        )}

        {tab === 'explore' && <ExploreTab language={language} t={t} />}
        {tab === 'notifications' && <NotificationsTab language={language} t={t} />}

        {tab === 'bookmarks' && (
          <>
            {bookmarkPosts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Bookmark size={40} className="opacity-20" style={{ color: 'var(--text-muted)' }} />
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{t('هیچ پستی ذخیره نکرده‌اید', 'No saved posts')}</p>
              </div>
            ) : bookmarkPosts.map(post => (
              <PostCard key={post.id} post={post}
                liked={liked.has(post.id)} bookmarked={bookmarked.has(post.id)} following={following.has(post.author_id)}
                onLike={() => toggleLike(post.id)} onBookmark={() => toggleBookmark(post.id)}
                onReply={() => setReplyTarget(post)} onRepost={() => doRepost(post)} onQuote={() => setQuoteTarget(post)}
                onFollow={id => apiPost(`/social/follow/${id}`)}
                onDelete={() => deletePost(post.id)} onPin={() => pinPost(post)}
                isOwn={post.author_id === user?.id} isAdmin={!!(profile as any)?.is_admin}
                language={language} t={t}
              />
            ))}
          </>
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
    </div>
  );
}
