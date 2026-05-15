import { useState, useEffect } from 'react';
import { ArrowRight, BadgeCheck, UserPlus, UserMinus, MessageSquare, BarChart2, Link2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';

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

function fmtTime(iso: string, fa: boolean) {
  const d = Date.now() - new Date(iso).getTime();
  if (fa) {
    if (d < 60000) return 'الان';
    if (d < 3600000) return `${Math.floor(d / 60000)}د`;
    if (d < 86400000) return `${Math.floor(d / 3600000)}س`;
    return new Date(iso).toLocaleDateString('fa-IR');
  }
  if (d < 60000) return 'now';
  if (d < 3600000) return `${Math.floor(d / 60000)}m`;
  if (d < 86400000) return `${Math.floor(d / 3600000)}h`;
  return new Date(iso).toLocaleDateString('en-US');
}

function fmtN(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

interface ProfileUser {
  id: string; username: string; display_name: string;
  bio?: string; avatar_url?: string; is_admin?: boolean;
  created_at: string;
}
interface Post {
  id: string; content: string; media_urls: string[];
  likes_count: number; reposts_count: number; comments_count: number;
  created_at: string; is_pinned: number;
}

interface ProfilePageProps {
  userId: string;
  onBack: () => void;
  onMessageUser?: (userId: string) => void;
}

export function ProfilePage({ userId, onBack, onMessageUser }: ProfilePageProps) {
  const { user: me, profile: myProfile } = useAuth();
  const { language } = useTheme();
  const fa = language === 'fa';

  const [profileUser, setProfileUser] = useState<ProfileUser | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [followLoading, setFollowLoading] = useState(false);
  const [tab, setTab] = useState<'posts' | 'media'>('posts');

  const isOwn = me?.id === userId;

  // When viewing own profile, merge real-time AuthContext data so Settings changes reflect instantly
  const effectiveProfile: ProfileUser | null = (isOwn && myProfile && profileUser)
    ? {
        ...profileUser,
        avatar_url: myProfile.avatar_url || effectiveProfile.avatar_url,
        display_name: myProfile.display_name || profileUser.display_name,
        bio: myProfile.bio !== undefined ? myProfile.bio : effectiveProfile.bio,
      }
    : profileUser;

  useEffect(() => { load(); }, [userId]);

  async function load() {
    setLoading(true);
    const { data: prof } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (prof) setProfileUser(prof as ProfileUser);

    const { data: postsData } = await supabase
      .from('feed_posts').select('*').eq('author_id', userId)
      .eq('is_deleted', 0).order('created_at', { ascending: false }).limit(30);
    if (postsData) setPosts(postsData.map((p: any) => ({
      ...p,
      media_urls: typeof p.media_urls === 'string' ? JSON.parse(p.media_urls || '[]') : (p.media_urls || []),
    })));

    const { data: followersData } = await supabase
      .from('follows').select('*').eq('followed_id', userId);
    setFollowerCount(followersData?.length || 0);

    const { data: followingData } = await supabase
      .from('follows').select('*').eq('follower_id', userId);
    setFollowingCount(followingData?.length || 0);

    if (me?.id && me.id !== userId) {
      const { data: followCheckData } = await supabase
        .from('follows').select('*').eq('follower_id', me.id).eq('followed_id', userId);
      setIsFollowing((followCheckData?.length || 0) > 0);
    }
    setLoading(false);
  }

  async function toggleFollow() {
    if (!me?.id) return;
    setFollowLoading(true);
    const result = await apiPost(`/social/follow/${userId}`);
    const nowFollowing = result?.following === true;
    setIsFollowing(nowFollowing);
    setFollowerCount(c => nowFollowing ? c + 1 : Math.max(0, c - 1));
    setFollowLoading(false);
  }

  const mediaPosts = posts.filter(p => p.media_urls.length > 0);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!effectiveProfile) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
        <p style={{ color: 'var(--text-muted)' }}>{fa ? 'کاربر یافت نشد' : 'User not found'}</p>
      </div>
    );
  }

  const initials = (effectiveProfile.display_name || effectiveProfile.username || '?').charAt(0).toUpperCase();
  const avatarColor = `hsl(${(initials.charCodeAt(0) * 17 + 100) % 360},55%,42%)`;

  return (
    <div className="flex-1 flex flex-col overflow-hidden" style={{ background: 'var(--bg-primary)' }} dir={fa ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div
        className="flex-shrink-0 flex items-center gap-3 px-4 py-3"
        style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border-color)' }}
      >
        <button onClick={onBack} className="p-1.5 rounded-xl" style={{ color: 'var(--text-secondary)' }}>
          <ArrowRight size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm truncate" style={{ color: 'var(--text-primary)' }}>
            {effectiveProfile.display_name || effectiveProfile.username}
          </p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {fmtN(posts.length)} {fa ? 'توییت' : 'tweets'}
          </p>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' } as any}>
        {/* Banner */}
        <div className="h-28 w-full" style={{ background: 'linear-gradient(135deg,#1d4ed8,#4f46e5,#7c3aed)' }} />

        {/* Profile info */}
        <div className="px-4 pb-4 relative" style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border-color)' }}>
          {/* Avatar */}
          <div className="flex items-end justify-between" style={{ marginTop: -44 }}>
            <div className="w-20 h-20 rounded-full border-4 overflow-hidden flex-shrink-0"
              style={{ borderColor: 'var(--bg-card)', background: avatarColor }}>
              {effectiveProfile.avatar_url
                ? <img src={effectiveProfile.avatar_url} className="w-full h-full object-cover" alt="" />
                : <div className="w-full h-full flex items-center justify-center text-white text-2xl font-bold">{initials}</div>
              }
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 mt-2">
              {!isOwn && onMessageUser && (
                <button
                  onClick={() => onMessageUser(userId)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold border"
                  style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                >
                  <MessageSquare size={14} />
                  {fa ? 'پیام' : 'Message'}
                </button>
              )}
              {!isOwn && (
                <button
                  onClick={toggleFollow}
                  disabled={followLoading}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-bold transition-all"
                  style={{
                    background: isFollowing ? 'transparent' : '#1d9bf0',
                    color: isFollowing ? 'var(--text-primary)' : 'white',
                    border: isFollowing ? '1px solid var(--border-color)' : 'none',
                  }}
                >
                  {followLoading
                    ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    : isFollowing
                      ? <><UserMinus size={14} />{fa ? 'انفالو' : 'Unfollow'}</>
                      : <><UserPlus size={14} />{fa ? 'فالو' : 'Follow'}</>
                  }
                </button>
              )}
            </div>
          </div>

          {/* Name + bio */}
          <div className="mt-3">
            <div className="flex items-center gap-1.5">
              <h1 className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>
                {effectiveProfile.display_name || effectiveProfile.username}
              </h1>
              {effectiveProfile.is_admin && <BadgeCheck size={18} className="text-blue-400" />}
            </div>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>@{effectiveProfile.username}</p>
            {effectiveProfile.bio && (
              <p className="text-sm mt-2 leading-relaxed" style={{ color: 'var(--text-primary)' }}>{effectiveProfile.bio}</p>
            )}
            <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
              <span className="inline-flex items-center gap-1">
                <Link2 size={12} />
                {fa
                  ? `تاریخ عضویت: ${new Date(effectiveProfile.created_at).toLocaleDateString('fa-IR')}`
                  : `Joined ${new Date(effectiveProfile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`
                }
              </span>
            </p>

            {/* Followers / Following */}
            <div className="flex items-center gap-4 mt-3">
              <button className="flex items-center gap-1 text-sm hover:underline" style={{ color: 'var(--text-primary)' }}>
                <span className="font-bold">{fmtN(followingCount)}</span>
                <span style={{ color: 'var(--text-muted)' }}>{fa ? 'دنبال‌شده' : 'Following'}</span>
              </button>
              <button className="flex items-center gap-1 text-sm hover:underline" style={{ color: 'var(--text-primary)' }}>
                <span className="font-bold">{fmtN(followerCount)}</span>
                <span style={{ color: 'var(--text-muted)' }}>{fa ? 'دنبال‌کننده' : 'Followers'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex" style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border-color)' }}>
          {([
            { id: 'posts' as const, label: fa ? 'توییت‌ها' : 'Tweets' },
            { id: 'media' as const, label: fa ? 'رسانه' : 'Media' },
          ]).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex-1 py-3 text-sm font-semibold transition-colors relative"
              style={{ color: tab === t.id ? '#1d9bf0' : 'var(--text-muted)' }}
            >
              {t.label}
              {tab === t.id && (
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-0.5 rounded-full bg-blue-400" />
              )}
            </button>
          ))}
        </div>

        {/* Posts */}
        {tab === 'posts' && (
          <div>
            {posts.length === 0 ? (
              <div className="p-12 text-center">
                <BarChart2 size={36} className="mx-auto mb-3 opacity-30" style={{ color: 'var(--text-muted)' }} />
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  {fa ? 'هنوز توییتی نیست' : 'No tweets yet'}
                </p>
              </div>
            ) : (
              posts.map(post => (
                <div
                  key={post.id}
                  className="px-4 py-3"
                  style={{ borderBottom: '1px solid var(--border-color)' }}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full flex-shrink-0 overflow-hidden" style={{ background: avatarColor }}>
                      {effectiveProfile.avatar_url
                        ? <img src={effectiveProfile.avatar_url} className="w-full h-full object-cover" alt="" />
                        : <div className="w-full h-full flex items-center justify-center text-white font-bold text-sm">{initials}</div>
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>{effectiveProfile.display_name || effectiveProfile.username}</span>
                        {effectiveProfile.is_admin && <BadgeCheck size={14} className="text-blue-400" />}
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>@{effectiveProfile.username}</span>
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>·</span>
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{fmtTime(post.created_at, fa)}</span>
                      </div>
                      <p className="text-sm mt-1 leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>
                        {post.content}
                      </p>
                      {post.media_urls.length > 0 && (
                        <div className={`mt-2 gap-1 grid ${post.media_urls.length === 1 ? 'grid-cols-1' : 'grid-cols-2'} rounded-xl overflow-hidden`}>
                          {post.media_urls.slice(0, 4).map((url: string, i: number) => (
                            <img key={i} src={url} className="w-full object-cover" style={{ maxHeight: 200 }} alt="" loading="lazy" />
                          ))}
                        </div>
                      )}
                      <div className="flex items-center gap-5 mt-2">
                        {[
                          { count: post.comments_count, label: fa ? 'کامنت' : 'replies' },
                          { count: post.reposts_count, label: fa ? 'ریپست' : 'reposts' },
                          { count: post.likes_count, label: fa ? 'لایک' : 'likes' },
                        ].map(item => (
                          <span key={item.label} className="text-xs flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                            <span className="font-semibold" style={{ color: 'var(--text-secondary)' }}>{fmtN(item.count)}</span>
                            {item.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Media grid */}
        {tab === 'media' && (
          <div>
            {mediaPosts.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  {fa ? 'رسانه‌ای نیست' : 'No media'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-0.5">
                {mediaPosts.flatMap(p => p.media_urls).map((url, i) => (
                  <img key={i} src={url} className="w-full aspect-square object-cover" alt="" loading="lazy" />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
