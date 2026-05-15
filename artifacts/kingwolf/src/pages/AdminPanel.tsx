import { useState, useEffect, useRef } from 'react';
import {
  Users, Settings, BarChart2, Shield, LogIn, Check, Ban, Eye, EyeOff, RefreshCw,
  UserCheck, Lock, Key, CheckCircle2, Server, HardDrive, Cpu, X,
  BadgeCheck, Activity, ChevronDown, Newspaper, Pin, PinOff, Trash2, FileText,
  Flag, MessageSquare, CheckCheck, Download, Upload, Bot, UserPlus, AlertTriangle,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { WolfLogo } from '../components/ui/WolfLogo';
import { Profile } from '../types';

type AdminTab = 'dashboard' | 'users' | 'content' | 'reports' | 'settings' | 'status' | 'backup' | 'bot';

const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api';
async function adminFetch(path: string, opts: RequestInit = {}) {
  const token = localStorage.getItem('kingwolf_token');
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(opts.headers as any) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  let body: any = null;
  try { body = await res.json(); } catch {}
  return { ok: res.ok, body };
}

function fmtBytes(b: number) {
  if (b >= 1e9) return (b / 1e9).toFixed(1) + ' GB';
  if (b >= 1e6) return (b / 1e6).toFixed(0) + ' MB';
  return (b / 1e3).toFixed(0) + ' KB';
}
function fmtUptime(s: number) {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d > 0 ? `${d}روز ${h}ساعت ${m}دقیقه` : h > 0 ? `${h}ساعت ${m}دقیقه` : `${m}دقیقه`;
}

interface FeedPost {
  id: string;
  author_id: string;
  content: string;
  created_at: string;
  is_deleted: number;
  is_pinned: number;
  authorUsername?: string;
  authorDisplay?: string;
}

function BackupTab() {
  const [loading, setLoading] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function downloadBackup() {
    setLoading(true);
    const token = localStorage.getItem('kingwolf_token');
    const res = await fetch(`${API_BASE}/admin/backup`, { headers: { Authorization: `Bearer ${token}` } });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `kingwolf-backup-${Date.now()}.json`; a.click();
    URL.revokeObjectURL(url);
    setLoading(false);
  }

  async function handleRestore(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setRestoreLoading(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const res = await adminFetch('/admin/restore', { method: 'POST', body: JSON.stringify(parsed) });
      setMsg(res.ok ? `✅ بازیابی موفق — ${res.added} مورد اضافه شد` : `❌ خطا: ${res.error}`);
    } catch { setMsg('❌ فایل نامعتبر است'); }
    setRestoreLoading(false);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function resetAll() {
    if (!window.confirm('⚠️ تمام داده‌های کاربران و پیام‌ها پاک می‌شوند. ادامه می‌دهید؟')) return;
    if (!window.confirm('این عمل برگشت‌ناپذیر است. مطمئنید؟')) return;
    setResetLoading(true);
    const res = await adminFetch('/admin/reset-data', { method: 'POST', body: JSON.stringify({ confirm: 'DELETE_ALL' }) });
    setMsg(res.ok ? '✅ تمام داده‌ها پاک شدند' : `❌ خطا: ${res.error}`);
    setResetLoading(false);
  }

  return (
    <div className="p-5 space-y-4 max-w-lg kw-tab-in">
      <div className="rounded-2xl p-5 space-y-4" style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(34,197,94,0.15)', backdropFilter: 'blur(12px)' }}>
        <h2 className="text-sm font-bold text-white flex items-center gap-2"><Download size={16} className="text-green-400" />دریافت بکاپ</h2>
        <p className="text-xs text-gray-400">یک فایل JSON شامل تمام پیام‌ها، کاربران، و محتوا دریافت کنید.</p>
        <button onClick={downloadBackup} disabled={loading}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white transition-all kw-btn-press"
          style={{ background: 'linear-gradient(135deg, #16a34a, #15803d)', boxShadow: '0 4px 16px rgba(34,197,94,0.2)' }}>
          {loading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Download size={16} />}
          دریافت فایل بکاپ
        </button>
      </div>

      <div className="rounded-2xl p-5 space-y-4" style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(59,130,246,0.15)', backdropFilter: 'blur(12px)' }}>
        <h2 className="text-sm font-bold text-white flex items-center gap-2"><Upload size={16} className="text-blue-400" />بارگذاری بکاپ</h2>
        <p className="text-xs text-gray-400">فایل بکاپ JSON را بارگذاری کنید. اطلاعات تکراری نادیده گرفته می‌شوند.</p>
        <input ref={fileRef} type="file" accept=".json" onChange={handleRestore} className="hidden" />
        <button onClick={() => fileRef.current?.click()} disabled={restoreLoading}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-blue-300 transition-all kw-btn-press"
          style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)' }}>
          {restoreLoading ? <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" /> : <Upload size={16} />}
          انتخاب فایل بکاپ
        </button>
      </div>

      <div className="rounded-2xl p-5 space-y-4" style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(239,68,68,0.2)', backdropFilter: 'blur(12px)' }}>
        <h2 className="text-sm font-bold text-red-400 flex items-center gap-2"><AlertTriangle size={16} />حذف کل داده‌ها</h2>
        <p className="text-xs text-gray-400">تمام پیام‌ها، کاربران غیرادمین، گروه‌ها، و کانال‌ها پاک می‌شوند. حساب ادمین باقی می‌ماند.</p>
        <button onClick={resetAll} disabled={resetLoading}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-red-400 transition-all kw-btn-press"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}>
          {resetLoading ? <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" /> : <Trash2 size={16} />}
          حذف همه داده‌ها
        </button>
      </div>

      {msg && <p className="text-sm text-center rounded-xl p-3" style={{ background: msg.startsWith('✅') ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', color: msg.startsWith('✅') ? '#4ade80' : '#f87171' }}>{msg}</p>}
    </div>
  );
}

function BotTab() {
  const [settings, setSettings] = useState({ token: '', username: '', sources: '', interval: '10', enabled: false });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    adminFetch('/admin/bot-settings').then(r => { if (r.data) setSettings(s => ({ ...s, ...r.data })); });
  }, []);

  async function save() {
    setSaving(true);
    await adminFetch('/admin/bot-settings', { method: 'POST', body: JSON.stringify(settings) });
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="p-5 space-y-4 max-w-lg kw-tab-in">
      <div className="rounded-2xl p-5 space-y-4" style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(192,132,252,0.15)', backdropFilter: 'blur(12px)' }}>
        <div className="flex items-center gap-2">
          <Bot size={18} className="text-purple-400" />
          <h2 className="text-sm font-bold text-white">اتصال بات</h2>
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(167,139,250,0.15)', color: '#a78bfa' }}>زیرساخت آماده</span>
        </div>
        <p className="text-xs text-gray-400">اطلاعات بات را وارد کنید. بات در مراحل بعدی فعال می‌شود.</p>

        {[
          { label: 'توکن API بات', key: 'token', placeholder: 'bot_token_here', type: 'password' },
          { label: 'نام کاربری بات', key: 'username', placeholder: '@mybot', type: 'text' },
          { label: 'آدرس‌های منبع توییتر (هر خط یک آدرس)', key: 'sources', placeholder: '@user1\n@user2', type: 'textarea' },
          { label: 'فاصله زمانی بررسی (دقیقه)', key: 'interval', placeholder: '10', type: 'number' },
        ].map(field => (
          <div key={field.key}>
            <label className="text-xs text-gray-400 mb-1 block">{field.label}</label>
            {field.type === 'textarea'
              ? <textarea value={(settings as any)[field.key]} onChange={e => setSettings(s => ({ ...s, [field.key]: e.target.value }))}
                  placeholder={field.placeholder} rows={3}
                  className="w-full px-3 py-2 rounded-xl text-xs text-white outline-none resize-none" style={{ background: '#161b22', border: '1px solid #30363d' }} />
              : <input type={field.type} value={(settings as any)[field.key]} onChange={e => setSettings(s => ({ ...s, [field.key]: e.target.value }))}
                  placeholder={field.placeholder}
                  className="w-full px-3 py-2 rounded-xl text-xs text-white outline-none" style={{ background: '#161b22', border: '1px solid #30363d' }} />
            }
          </div>
        ))}

        <div className="flex items-center gap-3">
          <button onClick={() => setSettings(s => ({ ...s, enabled: !s.enabled }))}
            className="relative w-10 h-5 rounded-full transition-colors"
            style={{ background: settings.enabled ? '#7c3aed' : '#374151' }}>
            <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow"
              style={{ transform: settings.enabled ? 'translateX(-1.25rem)' : 'translateX(0.125rem)' }} />
          </button>
          <span className="text-xs text-gray-400">{settings.enabled ? 'بات فعال است' : 'بات غیرفعال است'}</span>
        </div>

        <button onClick={save} disabled={saving}
          className="w-full py-2.5 rounded-xl text-sm font-medium text-white transition-colors flex items-center justify-center gap-2"
          style={{ background: saved ? '#1a7f37' : '#7c3aed' }}>
          {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : null}
          {saved ? '✅ ذخیره شد' : 'ذخیره تنظیمات'}
        </button>
        <p className="text-xs text-center text-gray-600">بات در نسخه‌های بعدی فعال می‌شود — اطلاعات الان ذخیره می‌شوند</p>
      </div>
    </div>
  );
}

export function AdminPanel() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<AdminTab>('dashboard');
  const [users, setUsers] = useState<Profile[]>([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, active: 0, banned: 0 });
  const [appSettings, setAppSettings] = useState<Record<string, string>>({});
  const [feedPostsCount, setFeedPostsCount] = useState<number | null>(null);
  const [liveStats, setLiveStats] = useState<Record<string, number>>({});
  const liveStatsRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [newPw, setNewPw] = useState('');
  const [newPw2, setNewPw2] = useState('');
  const [showNewPw, setShowNewPw] = useState(false);
  const [pwMsg, setPwMsg] = useState('');
  const [pwErr, setPwErr] = useState('');
  const [pwLoading, setPwLoading] = useState(false);

  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  const [userPasswords, setUserPasswords] = useState<Record<string, string>>({});
  const [loadingPasswordId, setLoadingPasswordId] = useState<string | null>(null);
  const [resetPwTarget, setResetPwTarget] = useState<Profile | null>(null);
  const [resetPwValue, setResetPwValue] = useState('');
  const [resetPwMsg, setResetPwMsg] = useState('');

  // Content tab state
  const [feedPosts, setFeedPosts] = useState<FeedPost[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedMsg, setFeedMsg] = useState('');

  // Reports tab state
  const [chatReports, setChatReports] = useState<any[]>([]);
  const [chatReportsLoading, setChatReportsLoading] = useState(false);
  const [feedReports, setFeedReports] = useState<any[]>([]);
  const [feedReportsLoading, setFeedReportsLoading] = useState(false);
  const [resolvedReportIds, setResolvedReportIds] = useState<Set<string>>(new Set());
  const [loginAttempts, setLoginAttempts] = useState<any[]>([]);
  const [loginAttemptsLoading, setLoginAttemptsLoading] = useState(false);
  const [reportsSubTab, setReportsSubTab] = useState<'chat' | 'feed' | 'login'>('chat');

  // Blue tick loading states
  const [blueTickLoadingId, setBlueTickLoadingId] = useState<string | null>(null);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError('');
    const email = `${username.toLowerCase().trim()}@kingwolf.internal`;
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError || !authData?.user) {
      setError('نام کاربری یا رمز عبور اشتباه است');
      setLoading(false); return;
    }
    const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', authData.user.id).single();
    if (!profile?.is_admin) {
      await supabase.auth.signOut();
      setError('شما دسترسی مدیریتی ندارید');
      setLoading(false); return;
    }
    setLoggedIn(true);
    loadData();
    setLoading(false);
    // Refresh live stats every 15 seconds
    if (liveStatsRef.current) clearInterval(liveStatsRef.current);
    liveStatsRef.current = setInterval(() => fetchLiveStats(), 15000);
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwErr(''); setPwMsg('');
    if (!newPw || newPw.length < 6) { setPwErr('رمز جدید باید حداقل ۶ کاراکتر باشد'); return; }
    if (newPw !== newPw2) { setPwErr('رمزهای جدید یکسان نیستند'); return; }
    setPwLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPw });
    setPwLoading(false);
    if (error) { setPwErr('خطا: ' + error.message); return; }
    setPwMsg('رمز عبور تغییر کرد ✅');
    setNewPw(''); setNewPw2('');
    setTimeout(() => setPwMsg(''), 4000);
  }

  async function fetchLiveStats() {
    const { ok, body } = await adminFetch('/admin/stats');
    if (ok && body) {
      setLiveStats(body);
      setFeedPostsCount(body.totalPosts ?? 0);
    }
  }

  async function loadData() {
    const { data: profilesData } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
    if (profilesData) {
      const p = profilesData as Profile[];
      setUsers(p);
      setStats({ total: p.length, pending: p.filter(u => !u.is_approved).length, active: p.filter(u => u.is_approved && !u.is_banned).length, banned: p.filter(u => u.is_banned).length });
    }
    const { data: settingsData } = await supabase.from('app_settings').select('key, value');
    if (settingsData) setAppSettings(settingsData.reduce((acc: any, row: any) => ({ ...acc, [row.key]: row.value }), {}));
    await fetchLiveStats();
  }

  async function loadFeedPosts() {
    setFeedLoading(true);
    try {
      const { data: posts } = await supabase
        .from('feed_posts')
        .select('*')
        .eq('is_deleted', 0)
        .order('created_at', { ascending: false })
        .limit(100);

      if (posts && posts.length > 0) {
        const authorIds = [...new Set(posts.map((p: any) => p.author_id))];
        const { data: authors } = await supabase
          .from('profiles')
          .select('id, username, display_name')
          .in('id', authorIds);

        const authorMap: Record<string, { username: string; display_name: string }> = {};
        (authors || []).forEach((a: any) => { authorMap[a.id] = a; });

        const enriched: FeedPost[] = posts.map((p: any) => ({
          ...p,
          authorUsername: authorMap[p.author_id]?.username ?? '—',
          authorDisplay: authorMap[p.author_id]?.display_name ?? '',
        }));
        setFeedPosts(enriched);
        setFeedPostsCount(enriched.length);
      } else {
        setFeedPosts([]);
        setFeedPostsCount(0);
      }
    } catch (err: any) {
      setFeedMsg('❌ خطا در بارگذاری پست‌ها');
    }
    setFeedLoading(false);
  }

  async function deletePost(postId: string) {
    await supabase.from('feed_posts').update({ is_deleted: 1 }).eq('id', postId);
    setFeedPosts(prev => prev.filter(p => p.id !== postId));
    setFeedPostsCount(prev => (prev !== null ? prev - 1 : null));
    setFeedMsg('✅ پست حذف شد');
    setTimeout(() => setFeedMsg(''), 3000);
  }

  async function togglePin(post: FeedPost) {
    const newVal = post.is_pinned === 1 ? 0 : 1;
    await supabase.from('feed_posts').update({ is_pinned: newVal }).eq('id', post.id);
    setFeedPosts(prev => prev.map(p => p.id === post.id ? { ...p, is_pinned: newVal } : p));
    setFeedMsg(newVal === 1 ? '📌 پست سنجاق شد' : '✅ سنجاق برداشته شد');
    setTimeout(() => setFeedMsg(''), 3000);
  }

  async function grantBlueTick(userId: string) {
    setBlueTickLoadingId(userId);
    const res = await adminFetch(`/admin/verify/${userId}`, { method: 'POST' });
    setBlueTickLoadingId(null);
    if (res.ok) {
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_verified: true } : u));
      setSelectedUser(prev => prev?.id === userId ? { ...prev, is_verified: true } : prev);
    }
  }

  async function revokeBlueTick(userId: string) {
    setBlueTickLoadingId(userId);
    const res = await adminFetch(`/admin/unverify/${userId}`, { method: 'POST' });
    setBlueTickLoadingId(null);
    if (res.ok) {
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_verified: false } : u));
      setSelectedUser(prev => prev?.id === userId ? { ...prev, is_verified: false } : prev);
    }
  }

  async function approveUser(userId: string) {
    await supabase.from('profiles').update({ is_approved: true }).eq('id', userId);
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_approved: true } : u));
  }
  async function banUser(userId: string) {
    await supabase.from('profiles').update({ is_banned: true, ban_reason: 'تخلف از قوانین' }).eq('id', userId);
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_banned: true } : u));
  }
  async function unbanUser(userId: string) {
    await supabase.from('profiles').update({ is_banned: false, ban_reason: '' }).eq('id', userId);
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_banned: false } : u));
  }

  async function revealPassword(user: Profile, e: React.MouseEvent) {
    e.stopPropagation();
    if (userPasswords[user.id]) {
      setUserPasswords(prev => { const n = { ...prev }; delete n[user.id]; return n; });
      return;
    }
    setLoadingPasswordId(user.id);
    const profileId = db_getUserId(user);
    const { ok, body } = await adminFetch(`/admin/password/${profileId}`);
    setLoadingPasswordId(null);
    if (ok) setUserPasswords(prev => ({ ...prev, [user.id]: body.password }));
  }

  function db_getUserId(user: Profile) { return user.id; }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!resetPwTarget || !resetPwValue || resetPwValue.length < 6) return;
    const { ok, body } = await adminFetch(`/admin/password/${resetPwTarget.id}`, {
      method: 'POST', body: JSON.stringify({ password: resetPwValue }),
    });
    if (ok) {
      setResetPwMsg('✅ رمز تغییر کرد');
      setUserPasswords(prev => ({ ...prev, [resetPwTarget.id]: resetPwValue }));
      setTimeout(() => { setResetPwTarget(null); setResetPwValue(''); setResetPwMsg(''); }, 2000);
    } else {
      setResetPwMsg('❌ خطا: ' + body?.error);
    }
  }

  async function saveSetting(key: string, value: string) {
    await supabase.from('app_settings').upsert({ key, value });
    setAppSettings(prev => ({ ...prev, [key]: value }));
  }

  // Load feed posts when content tab becomes active
  useEffect(() => {
    if (tab === 'content' && feedPosts.length === 0) {
      loadFeedPosts();
    }
    if (tab === 'reports' && chatReports.length === 0) {
      loadChatReports();
    }
  }, [tab]);

  async function loadChatReports() {
    setChatReportsLoading(true);
    const { body } = await adminFetch('/admin/reports?type=chat');
    if (body?.data) setChatReports(body.data);
    setChatReportsLoading(false);
  }

  async function loadFeedReports() {
    setFeedReportsLoading(true);
    const { body } = await adminFetch('/admin/reports?type=feed');
    if (body?.data) setFeedReports(body.data);
    setFeedReportsLoading(false);
  }

  async function loadLoginAttempts() {
    setLoginAttemptsLoading(true);
    const { body } = await adminFetch('/admin/login-attempts');
    if (body?.data) setLoginAttempts(body.data);
    setLoginAttemptsLoading(false);
  }

  async function clearLoginAttempt(email?: string) {
    await adminFetch('/admin/login-attempts/clear', { method: 'POST', body: JSON.stringify({ email }) });
    await loadLoginAttempts();
  }

  async function resolveReport(id: string, action: string) {
    await adminFetch(`/admin/reports/${id}/resolve`, { method: 'POST', body: JSON.stringify({ status: 'resolved', action }) });
    setResolvedReportIds(prev => new Set([...prev, id]));
  }

  async function dismissReport(id: string) {
    await adminFetch(`/admin/reports/${id}/resolve`, { method: 'POST', body: JSON.stringify({ status: 'dismissed', action: 'dismissed' }) });
    setResolvedReportIds(prev => new Set([...prev, id]));
  }

  const tabTitle: Record<AdminTab, string> = {
    dashboard: 'داشبورد',
    users: 'مدیریت کاربران',
    content: 'مدیریت محتوا',
    reports: 'گزارش‌های تخلف',
    settings: 'تنظیمات',
    status: 'وضعیت سیستم',
    backup: 'بکاپ و بازیابی',
    bot: 'تنظیمات بات',
  };

  if (!loggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden" style={{ background: 'radial-gradient(ellipse at 30% 20%, rgba(30,10,60,0.8) 0%, #030712 60%), radial-gradient(ellipse at 70% 80%, rgba(10,20,50,0.7) 0%, transparent 60%)' }} dir="rtl">
        {/* Ambient background blobs */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full opacity-10" style={{ background: 'radial-gradient(circle, rgba(139,92,246,1), transparent)', filter: 'blur(80px)', pointerEvents: 'none' }} />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full opacity-8" style={{ background: 'radial-gradient(circle, rgba(59,130,246,1), transparent)', filter: 'blur(80px)', pointerEvents: 'none' }} />

        <div className="w-full max-w-sm kw-modal-in">
          <div className="text-center mb-8">
            <div className="relative inline-block mb-4">
              <div className="absolute inset-0 rounded-full" style={{ background: 'radial-gradient(circle, rgba(239,68,68,0.3), transparent)', filter: 'blur(20px)', transform: 'scale(1.5)' }} />
              <WolfLogo size={64} className="relative" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-1">پنل مدیریت</h1>
            <p className="text-sm" style={{ color: 'rgba(156,163,175,0.7)' }}>دسترسی محدود — فقط مدیران مجاز</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-3 rounded-2xl p-6" style={{ background: 'rgba(15,23,42,0.8)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <input
              value={username} onChange={e => setUsername(e.target.value)} placeholder="نام کاربری"
              className="w-full px-4 py-3 text-white rounded-xl text-sm kw-glass-input"
              style={{ background: 'rgba(31,41,55,0.6)', border: '1px solid rgba(255,255,255,0.1)' }}
            />
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="رمز عبور"
                className="w-full px-4 py-3 pl-10 text-white rounded-xl text-sm kw-glass-input"
                style={{ background: 'rgba(31,41,55,0.6)', border: '1px solid rgba(255,255,255,0.1)' }}
              />
              <button type="button" onClick={() => setShowPw(!showPw)} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors">
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {error && <p className="text-xs text-red-400 px-1">{error}</p>}
            <button type="submit" disabled={loading} className="w-full py-3 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 kw-btn-press transition-all"
              style={{ background: 'linear-gradient(135deg, #dc2626, #b91c1c)', boxShadow: '0 4px 20px rgba(239,68,68,0.3)' }}>
              {loading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <LogIn size={16} />}
              ورود به پنل
            </button>
          </form>
        </div>
      </div>
    );
  }

  const navItems: { id: AdminTab; label: string; icon: any; color: string; accent: string }[] = [
    { id: 'dashboard', label: 'داشبورد',         icon: BarChart2,  color: '#60a5fa', accent: 'rgba(59,130,246,0.15)' },
    { id: 'users',     label: 'کاربران',          icon: Users,      color: '#34d399', accent: 'rgba(52,211,153,0.15)' },
    { id: 'content',   label: 'مدیریت محتوا',    icon: Newspaper,  color: '#a78bfa', accent: 'rgba(167,139,250,0.15)' },
    { id: 'reports',   label: 'گزارش‌های تخلف',  icon: Flag,       color: '#f87171', accent: 'rgba(248,113,113,0.15)' },
    { id: 'settings',  label: 'تنظیمات',          icon: Settings,   color: '#fbbf24', accent: 'rgba(251,191,36,0.15)' },
    { id: 'status',    label: 'وضعیت سیستم',      icon: Server,     color: '#4ade80', accent: 'rgba(74,222,128,0.15)' },
    { id: 'backup',    label: 'بکاپ',             icon: Download,   color: '#38bdf8', accent: 'rgba(56,189,248,0.15)' },
    { id: 'bot',       label: 'بات',              icon: Bot,        color: '#c084fc', accent: 'rgba(192,132,252,0.15)' },
  ];

  return (
    <div className="min-h-screen flex" style={{ background: 'linear-gradient(135deg, #020817 0%, #030b1a 50%, #020710 100%)' }} dir="rtl">
      {/* Sidebar */}
      <div className="w-16 md:w-64 flex-shrink-0 flex flex-col relative" style={{ background: 'rgba(5,10,25,0.95)', backdropFilter: 'blur(20px)', borderLeft: '1px solid rgba(255,255,255,0.06)' }}>
        {/* Top glow line */}
        <div className="absolute top-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(99,102,241,0.4), transparent)' }} />

        <div className="p-4 flex items-center gap-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', paddingTop: 'max(16px, env(safe-area-inset-top))' }}>
          <div className="relative flex-shrink-0">
            <div className="absolute inset-0 rounded-full" style={{ background: 'rgba(239,68,68,0.2)', filter: 'blur(8px)' }} />
            <WolfLogo size={30} className="relative" />
          </div>
          <div className="hidden md:block">
            <span className="text-sm font-bold text-white">KingWolf</span>
            <p className="text-xs" style={{ color: 'rgba(99,102,241,0.9)' }}>پنل مدیریت</p>
          </div>
        </div>

        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {navItems.map(item => {
            const isActive = tab === item.id;
            return (
              <button
                key={item.id} onClick={() => setTab(item.id)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-right transition-all kw-btn-press"
                style={{
                  background: isActive ? item.accent : 'transparent',
                  color: isActive ? item.color : 'rgba(107,114,128,1)',
                  boxShadow: isActive ? `0 0 12px ${item.accent}` : 'none',
                }}
              >
                <item.icon size={17} className="flex-shrink-0" style={{ color: isActive ? item.color : undefined }} />
                <span className="hidden md:block text-sm font-medium">{item.label}</span>
                {isActive && <div className="hidden md:block mr-auto w-1.5 h-1.5 rounded-full" style={{ background: item.color }} />}
              </button>
            );
          })}
        </nav>

        <div className="p-2" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <button onClick={() => setLoggedIn(false)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors kw-btn-press" style={{ color: 'rgba(107,114,128,1)' }}
            onMouseEnter={e => { e.currentTarget.style.color = '#f87171'; e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(107,114,128,1)'; e.currentTarget.style.background = 'transparent'; }}>
            <LogIn size={17} className="rotate-180 flex-shrink-0" />
            <span className="hidden md:block text-sm font-medium">خروج</span>
          </button>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0 px-6 py-4 flex items-center gap-3" style={{ background: 'rgba(5,10,25,0.8)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingTop: 'max(16px, env(safe-area-inset-top))' }}>
          <div className="flex items-center gap-2 flex-1">
            {(() => { const nav = navItems.find(n => n.id === tab); const Icon = nav?.icon; return Icon ? <Icon size={18} style={{ color: nav?.color }} /> : null; })()}
            <h1 className="text-base font-bold text-white">{tabTitle[tab]}</h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs" style={{ background: 'rgba(74,222,128,0.1)', color: '#4ade80' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              آنلاین
            </div>
            <button
              onClick={() => { loadData(); if (tab === 'content') loadFeedPosts(); if (tab === 'reports') { if (reportsSubTab === 'chat') loadChatReports(); else if (reportsSubTab === 'feed') loadFeedReports(); else loadLoginAttempts(); } }}
              className="p-2 rounded-xl transition-colors kw-btn-press" style={{ color: 'rgba(107,114,128,1)' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'rgba(107,114,128,1)'; e.currentTarget.style.background = 'transparent'; }}
            >
              <RefreshCw size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">

          {/* ── DASHBOARD ── */}
          {tab === 'dashboard' && (
            <div className="space-y-5 kw-tab-in">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 kw-stagger">
                {[
                  { label: 'کل کاربران',      value: liveStats.totalUsers   ?? stats.total,        color: '#60a5fa', bg: 'rgba(59,130,246,0.12)',   Icon: Users },
                  { label: 'کاربران فعال',    value: liveStats.activeUsers  ?? stats.active,        color: '#34d399', bg: 'rgba(52,211,153,0.12)',   Icon: CheckCircle2 },
                  { label: 'آنلاین الان',     value: liveStats.onlineUsers  ?? 0,                   color: '#4ade80', bg: 'rgba(74,222,128,0.12)',   Icon: Activity },
                  { label: 'در انتظار تأیید', value: liveStats.pendingUsers ?? stats.pending,        color: '#fbbf24', bg: 'rgba(251,191,36,0.12)',   Icon: UserPlus },
                  { label: 'مسدود شده',       value: liveStats.bannedUsers  ?? stats.banned,         color: '#f87171', bg: 'rgba(239,68,68,0.12)',    Icon: Ban },
                  { label: 'پست‌های فعال',    value: liveStats.totalPosts   ?? feedPostsCount ?? 0, color: '#a78bfa', bg: 'rgba(167,139,250,0.12)',  Icon: Newspaper },
                  { label: 'کل پیام‌ها',      value: liveStats.totalMessages ?? 0,                  color: '#22d3ee', bg: 'rgba(34,211,238,0.12)',   Icon: MessageSquare },
                  { label: 'گزارش‌های جدید',  value: liveStats.totalReports ?? 0,                   color: '#fb923c', bg: 'rgba(249,115,22,0.12)',   Icon: Flag },
                ].map(s => (
                  <div key={s.label} className="rounded-2xl p-4 kw-stat-pop cursor-default" style={{ background: 'rgba(15,23,42,0.8)', border: `1px solid ${s.color}20`, backdropFilter: 'blur(12px)', transition: 'transform 0.18s ease, box-shadow 0.18s ease' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-3px)'; (e.currentTarget as HTMLElement).style.boxShadow = `0 8px 32px ${s.color}25`; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; (e.currentTarget as HTMLElement).style.boxShadow = 'none'; }}>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-medium" style={{ color: 'rgba(156,163,175,0.8)' }}>{s.label}</p>
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: s.bg }}>
                        <s.Icon size={14} style={{ color: s.color }} />
                      </div>
                    </div>
                    <p className="text-2xl font-bold kw-count-in" style={{ color: s.color }}>{s.value}</p>
                  </div>
                ))}
              </div>

              {/* Live activity bar */}
              <div className="rounded-2xl p-4" style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(12px)' }}>
                <div className="flex items-center gap-2 mb-4">
                  <Activity size={15} className="text-green-400" />
                  <h3 className="text-sm font-semibold text-white">فعالیت زنده</h3>
                  <span className="mr-auto text-xs flex items-center gap-1" style={{ color: '#4ade80' }}>
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                    هر ۱۵ ثانیه
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'نرخ تأیید کاربران', value: stats.total ? Math.round((stats.active / stats.total) * 100) : 0, color: '#34d399' },
                    { label: 'نرخ اشغال', value: liveStats.onlineUsers && stats.active ? Math.min(100, Math.round((liveStats.onlineUsers / stats.active) * 100)) : 0, color: '#60a5fa' },
                  ].map(bar => (
                    <div key={bar.label}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs text-gray-400">{bar.label}</span>
                        <span className="text-xs font-bold" style={{ color: bar.color }}>{bar.value}%</span>
                      </div>
                      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${bar.value}%`, background: `linear-gradient(90deg, ${bar.color}80, ${bar.color})` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(12px)' }}>
                <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <Users size={14} className="text-blue-400" />
                  <h3 className="text-sm font-semibold text-white">کاربران اخیر</h3>
                </div>
                <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                  {users.slice(0, 8).map(u => (
                    <div key={u.id} className="flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors kw-chat-item" onClick={() => setSelectedUser(u)}
                      style={{ transition: 'background 0.15s ease' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                      {u.avatar_url
                        ? <img src={u.avatar_url} className="w-8 h-8 rounded-full object-cover flex-shrink-0" alt="" />
                        : <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold text-white" style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)' }}>{(u.display_name || u.username).charAt(0).toUpperCase()}</div>
                      }
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${u.is_banned ? 'bg-red-500' : u.is_approved ? 'bg-green-500' : 'bg-yellow-500'}`} />
                      <span className="text-sm text-gray-200 flex-1">@{u.username}</span>
                      {(u as any).is_verified && <BadgeCheck size={14} className="text-blue-400" />}
                      <span className="text-xs text-gray-600">{new Date(u.created_at).toLocaleDateString('fa-IR')}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── USERS ── */}
          {tab === 'users' && (
            <div className="space-y-2 kw-tab-in">
              <p className="text-xs mb-3" style={{ color: 'rgba(107,114,128,0.8)' }}>روی هر کاربر کلیک کنید تا اطلاعات کامل ببینید</p>
              {users.map(u => (
                <div
                  key={u.id}
                  onClick={() => setSelectedUser(u)}
                  className="flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all"
                  style={{ background: 'rgba(15,23,42,0.7)', border: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(8px)' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(25,35,65,0.8)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.1)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(15,23,42,0.7)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.06)'; }}
                >
                  {u.avatar_url
                    ? <img src={u.avatar_url} className="w-9 h-9 rounded-full object-cover flex-shrink-0" alt="" />
                    : <div className="w-9 h-9 rounded-full bg-blue-700 flex items-center justify-center flex-shrink-0 text-white text-sm font-bold">{(u.display_name || u.username).charAt(0).toUpperCase()}</div>
                  }
                  <div className="flex-1 min-w-0 text-right">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium text-white truncate">{u.display_name || u.username}</p>
                      {!!(u as any).is_verified && <BadgeCheck size={14} className="text-blue-400 flex-shrink-0" />}
                    </div>
                    <p className="text-xs text-gray-500">@{u.username}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${u.is_banned ? 'bg-red-500/10 text-red-400' : u.is_approved ? 'bg-green-500/10 text-green-400' : 'bg-yellow-500/10 text-yellow-400'}`}>
                      {u.is_banned ? 'مسدود' : u.is_approved ? 'فعال' : 'منتظر'}
                    </span>

                    {/* Blue tick button */}
                    <button
                      onClick={e => { e.stopPropagation(); (u as any).is_verified ? revokeBlueTick(u.id) : grantBlueTick(u.id); }}
                      className={`p-1.5 rounded-lg transition-colors ${(u as any).is_verified ? 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30' : 'bg-gray-700/50 text-gray-500 hover:bg-blue-500/10 hover:text-blue-400'}`}
                      title={(u as any).is_verified ? 'رفع تیک آبی' : 'اعطای تیک آبی'}
                    >
                      {blueTickLoadingId === u.id
                        ? <div className="w-3.5 h-3.5 border border-blue-400 border-t-transparent rounded-full animate-spin" />
                        : <BadgeCheck size={14} />
                      }
                    </button>

                    <button
                      onClick={e => revealPassword(u, e)}
                      className="p-1.5 rounded-lg bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 transition-colors"
                      title={userPasswords[u.id] ? 'پنهان' : 'نمایش رمز'}
                    >
                      {loadingPasswordId === u.id
                        ? <div className="w-3.5 h-3.5 border border-yellow-400 border-t-transparent rounded-full animate-spin" />
                        : userPasswords[u.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                    {!u.is_approved && !u.is_banned && (
                      <button onClick={e => { e.stopPropagation(); approveUser(u.id); }} className="p-1.5 rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20" title="تأیید">
                        <Check size={14} />
                      </button>
                    )}
                    {!u.is_banned && (
                      <button onClick={e => { e.stopPropagation(); banUser(u.id); }} className="p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20" title="مسدود">
                        <Ban size={14} />
                      </button>
                    )}
                    {u.is_banned && (
                      <button onClick={e => { e.stopPropagation(); unbanUser(u.id); }} className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20" title="رفع مسدود">
                        <UserCheck size={14} />
                      </button>
                    )}
                  </div>
                  {userPasswords[u.id] && (
                    <div className="w-full mt-1 col-span-full">
                      <span className="text-xs text-yellow-400 font-mono bg-yellow-500/10 px-2 py-0.5 rounded">🔑 {userPasswords[u.id]}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── CONTENT ── */}
          {tab === 'content' && (
            <div className="space-y-4 kw-tab-in">
              {/* Stats bar */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl p-4 kw-stat-pop" style={{ background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.2)', backdropFilter: 'blur(12px)' }}>
                  <p className="text-xs mb-1" style={{ color: 'rgba(167,139,250,0.7)' }}>کل پست‌های فعال</p>
                  <p className="text-2xl font-bold text-purple-400">{feedPosts.length}</p>
                </div>
                <div className="rounded-2xl p-4 kw-stat-pop" style={{ animationDelay: '60ms', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.2)', backdropFilter: 'blur(12px)' }}>
                  <p className="text-xs mb-1" style={{ color: 'rgba(251,191,36,0.7)' }}>پست‌های سنجاق‌شده</p>
                  <p className="text-2xl font-bold text-yellow-400">{feedPosts.filter(p => p.is_pinned === 1).length}</p>
                </div>
              </div>

              {feedMsg && (
                <div className={`text-xs px-3 py-2 rounded-xl border ${feedMsg.startsWith('❌') ? 'text-red-400 border-red-900/30 bg-red-900/10' : 'text-green-400 border-green-900/30 bg-green-900/10'}`}>
                  {feedMsg}
                </div>
              )}

              <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(12px)' }}>
                <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <div className="flex items-center gap-2">
                    <Newspaper size={15} className="text-purple-400" />
                    <h3 className="text-sm font-semibold text-white">پست‌های فید</h3>
                  </div>
                  <button onClick={loadFeedPosts} disabled={feedLoading} className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1">
                    <RefreshCw size={12} className={feedLoading ? 'animate-spin' : ''} />
                    بارگذاری مجدد
                  </button>
                </div>

                {feedLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="w-6 h-6 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : feedPosts.length === 0 ? (
                  <div className="text-center py-12">
                    <FileText size={32} className="text-gray-700 mx-auto mb-2" />
                    <p className="text-sm text-gray-600">پستی یافت نشد</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-800">
                    {feedPosts.map(post => (
                      <div key={post.id} className="flex items-start gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-xs font-semibold text-blue-400">@{post.authorUsername}</span>
                            {post.authorDisplay && <span className="text-xs text-gray-600">{post.authorDisplay}</span>}
                            {post.is_pinned === 1 && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-400">📌 سنجاق</span>
                            )}
                            <span className="text-xs text-gray-700 mr-auto">
                              {new Date(post.created_at).toLocaleDateString('fa-IR', { year: 'numeric', month: 'short', day: 'numeric' })}
                            </span>
                          </div>
                          <p className="text-sm text-gray-300 leading-relaxed break-words">
                            {post.content.length > 120 ? post.content.slice(0, 120) + '…' : post.content}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
                          <button
                            onClick={() => togglePin(post)}
                            className={`p-1.5 rounded-lg transition-colors ${post.is_pinned === 1 ? 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30' : 'bg-gray-700/40 text-gray-500 hover:bg-yellow-500/10 hover:text-yellow-400'}`}
                            title={post.is_pinned === 1 ? 'رفع سنجاق' : 'سنجاق کردن'}
                          >
                            {post.is_pinned === 1 ? <PinOff size={14} /> : <Pin size={14} />}
                          </button>
                          <button
                            onClick={() => deletePost(post.id)}
                            className="p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                            title="حذف پست"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── SETTINGS ── */}
          {tab === 'settings' && (
            <div className="space-y-4 kw-tab-in">
              <div className="rounded-2xl p-4" style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(12px)' }}>
                <h3 className="text-sm font-semibold text-white mb-4">تنظیمات برنامه</h3>
                <div className="space-y-3">
                  {/* App name */}
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">نام برنامه</label>
                    <input
                      value={appSettings.app_name || 'KingWolf'}
                      onChange={e => setAppSettings(p => ({ ...p, app_name: e.target.value }))}
                      onBlur={e => saveSetting('app_name', e.target.value)}
                      className="w-full px-3 py-2 text-white rounded-xl text-sm kw-glass-input" style={{ background: 'rgba(31,41,55,0.5)', border: '1px solid rgba(255,255,255,0.08)' }}
                    />
                  </div>

                  {/* Welcome message */}
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">پیام خوشامد</label>
                    <input
                      value={appSettings.welcome_message || ''}
                      onChange={e => setAppSettings(p => ({ ...p, welcome_message: e.target.value }))}
                      onBlur={e => saveSetting('welcome_message', e.target.value)}
                      placeholder="به KingWolf خوش آمدید!"
                      className="w-full px-3 py-2 text-white rounded-xl text-sm kw-glass-input" style={{ background: 'rgba(31,41,55,0.5)', border: '1px solid rgba(255,255,255,0.08)' }}
                    />
                  </div>

                  {/* Max post length */}
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">حداکثر طول پست</label>
                    <input
                      type="number"
                      value={appSettings.max_post_length || '280'}
                      onChange={e => setAppSettings(p => ({ ...p, max_post_length: e.target.value }))}
                      onBlur={e => saveSetting('max_post_length', e.target.value)}
                      min={50} max={5000}
                      className="w-full px-3 py-2 text-white rounded-xl text-sm kw-glass-input" style={{ background: 'rgba(31,41,55,0.5)', border: '1px solid rgba(255,255,255,0.08)' }}
                    />
                  </div>

                  {/* Signup toggle */}
                  <div className="flex items-center justify-between py-1">
                    <span className="text-sm text-gray-300">ثبت‌نام فعال</span>
                    <button
                      onClick={() => saveSetting('signup_locked', appSettings.signup_locked === 'true' ? 'false' : 'true')}
                      className={`w-10 h-6 rounded-full transition-all relative ${appSettings.signup_locked === 'true' ? 'bg-gray-700' : 'bg-blue-600'}`}
                    >
                      <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${appSettings.signup_locked === 'true' ? 'left-0.5' : 'left-4'}`} />
                    </button>
                  </div>

                  {/* Require approval toggle */}
                  <div className="flex items-center justify-between py-1">
                    <span className="text-sm text-gray-300">نیاز به تأیید مدیر</span>
                    <button
                      onClick={() => saveSetting('require_admin_approval', appSettings.require_admin_approval === 'true' ? 'false' : 'true')}
                      className={`w-10 h-6 rounded-full transition-all relative ${appSettings.require_admin_approval === 'true' ? 'bg-blue-600' : 'bg-gray-700'}`}
                    >
                      <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${appSettings.require_admin_approval === 'true' ? 'left-4' : 'left-0.5'}`} />
                    </button>
                  </div>

                  {/* Maintenance mode */}
                  <div className="flex items-center justify-between py-1">
                    <div>
                      <span className="text-sm text-gray-300">حالت تعمیر</span>
                      <p className="text-xs text-gray-600 mt-0.5">دسترسی کاربران به برنامه قطع می‌شود</p>
                    </div>
                    <button
                      onClick={() => saveSetting('maintenance_mode', appSettings.maintenance_mode === 'true' ? 'false' : 'true')}
                      className={`w-10 h-6 rounded-full transition-all relative flex-shrink-0 ${appSettings.maintenance_mode === 'true' ? 'bg-red-600' : 'bg-gray-700'}`}
                    >
                      <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${appSettings.maintenance_mode === 'true' ? 'left-4' : 'left-0.5'}`} />
                    </button>
                  </div>

                  {/* Allow media upload */}
                  <div className="flex items-center justify-between py-1">
                    <span className="text-sm text-gray-300">اجازه آپلود رسانه</span>
                    <button
                      onClick={() => saveSetting('allow_media_upload', appSettings.allow_media_upload === 'false' ? 'true' : 'false')}
                      className={`w-10 h-6 rounded-full transition-all relative ${appSettings.allow_media_upload === 'false' ? 'bg-gray-700' : 'bg-blue-600'}`}
                    >
                      <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${appSettings.allow_media_upload === 'false' ? 'left-0.5' : 'left-4'}`} />
                    </button>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl p-4" style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(239,68,68,0.15)', backdropFilter: 'blur(12px)' }}>
                <div className="flex items-center gap-2 mb-4">
                  <Lock size={16} className="text-red-400" />
                  <h3 className="text-sm font-semibold text-white">تغییر رمز مدیر</h3>
                </div>
                <form onSubmit={handleChangePassword} className="space-y-3">
                  <div className="relative">
                    <input
                      type={showNewPw ? 'text' : 'password'} value={newPw} onChange={e => setNewPw(e.target.value)}
                      placeholder="رمز جدید (حداقل ۶ کاراکتر)"
                      className="w-full px-3 py-2.5 pl-10 text-white rounded-xl text-sm kw-glass-input" style={{ background: 'rgba(31,41,55,0.5)', border: '1px solid rgba(255,255,255,0.08)' }}
                    />
                    <button type="button" onClick={() => setShowNewPw(!showNewPw)} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                      {showNewPw ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  <input
                    type={showNewPw ? 'text' : 'password'} value={newPw2} onChange={e => setNewPw2(e.target.value)}
                    placeholder="تکرار رمز جدید"
                    className="w-full px-3 py-2.5 text-white rounded-xl text-sm kw-glass-input" style={{ background: 'rgba(31,41,55,0.5)', border: '1px solid rgba(255,255,255,0.08)' }}
                  />
                  {pwErr && <p className="text-xs text-red-400">{pwErr}</p>}
                  {pwMsg && <p className="text-xs text-green-400">{pwMsg}</p>}
                  <button type="submit" disabled={pwLoading} className="w-full py-2.5 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 kw-btn-press transition-all"
                    style={{ background: 'linear-gradient(135deg, #dc2626, #b91c1c)', boxShadow: '0 4px 16px rgba(239,68,68,0.25)' }}>
                    {pwLoading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Key size={14} />}
                    تغییر رمز
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* ── REPORTS ── */}
          {tab === 'reports' && (
            <div className="space-y-4 kw-tab-in">
              {/* Sub-tabs */}
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => { setReportsSubTab('chat'); if (chatReports.length === 0) loadChatReports(); }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors"
                  style={{ background: reportsSubTab === 'chat' ? 'rgba(239,68,68,0.15)' : '#161b22', color: reportsSubTab === 'chat' ? '#f87171' : '#6b7280' }}>
                  <MessageSquare size={13} />گزارش‌های چت
                </button>
                <button onClick={() => { setReportsSubTab('feed'); if (feedReports.length === 0) loadFeedReports(); }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors"
                  style={{ background: reportsSubTab === 'feed' ? 'rgba(139,92,246,0.15)' : '#161b22', color: reportsSubTab === 'feed' ? '#a78bfa' : '#6b7280' }}>
                  <Flag size={13} />گزارش‌های توییت
                </button>
                <button onClick={() => { setReportsSubTab('login'); if (loginAttempts.length === 0) loadLoginAttempts(); }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors"
                  style={{ background: reportsSubTab === 'login' ? 'rgba(245,158,11,0.15)' : '#161b22', color: reportsSubTab === 'login' ? '#fbbf24' : '#6b7280' }}>
                  <Shield size={13} />تلاش‌های ورود ناموفق
                </button>
              </div>

              {/* Login attempts sub-tab */}
              {reportsSubTab === 'login' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-500">کاربرانی که رمز اشتباه وارد کرده‌اند</p>
                    <div className="flex gap-2">
                      <button onClick={loadLoginAttempts} className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-gray-400" style={{ background: '#161b22' }}>
                        <RefreshCw size={12} />
                      </button>
                      <button onClick={() => clearLoginAttempt(undefined)} className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-red-400" style={{ background: 'rgba(239,68,68,0.1)' }}>
                        پاک کردن همه
                      </button>
                    </div>
                  </div>
                  {loginAttemptsLoading ? (
                    <div className="flex justify-center py-8"><div className="w-5 h-5 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin" /></div>
                  ) : loginAttempts.length === 0 ? (
                    <div className="flex flex-col items-center py-10 gap-2">
                      <CheckCheck size={28} className="text-gray-700" />
                      <p className="text-xs text-gray-500">هیچ تلاش ناموفقی ثبت نشده</p>
                    </div>
                  ) : (
                    loginAttempts.map((entry, i) => (
                      <div key={i} className="rounded-2xl border p-4" style={{ background: '#0d1117', borderColor: entry.isLocked ? 'rgba(239,68,68,0.3)' : '#1f2937' }}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              {entry.isLocked && (
                                <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171' }}>
                                  🔒 قفل‌شده {entry.retryAfterSec}s
                                </span>
                              )}
                              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(245,158,11,0.1)', color: '#fbbf24' }}>
                                {entry.fails} تلاش
                              </span>
                              {entry.locks > 0 && (
                                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171' }}>
                                  {entry.locks}× قفل شد
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-gray-300 font-medium">{entry.email || '—'}</p>
                            <p className="text-xs text-gray-600 font-mono mt-0.5">IP: {entry.ip}</p>
                            {entry.lastFailAt && (
                              <p className="text-xs text-gray-700 mt-0.5">
                                آخرین تلاش: {new Date(entry.lastFailAt).toLocaleString('fa-IR')}
                              </p>
                            )}
                          </div>
                          <button onClick={() => clearLoginAttempt(entry.email)}
                            className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                            style={{ background: '#161b22', color: '#6b7280' }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(34,197,94,0.1)'; e.currentTarget.style.color = '#4ade80'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = '#161b22'; e.currentTarget.style.color = '#6b7280'; }}>
                            رفع قفل
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Chat reports sub-tab */}
              {(reportsSubTab === 'chat' || reportsSubTab === 'feed') && (() => {
                const isFeed = reportsSubTab === 'feed';
                const reps = isFeed ? feedReports : chatReports;
                const loading2 = isFeed ? feedReportsLoading : chatReportsLoading;
                const reload = isFeed ? loadFeedReports : loadChatReports;
                const accentColor = isFeed ? '#a78bfa' : '#f87171';
                const accentBorder = isFeed ? 'border-purple-500' : 'border-red-500';
                return (<>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-400">
                  {isFeed ? 'گزارش‌های توییت و پست‌های فید' : 'گزارش‌های چت، پیام، گروه و کانال'}
                </h2>
                <button onClick={reload} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white transition-colors" style={{ background: '#161b22' }}>
                  <RefreshCw size={13} />بارگذاری مجدد
                </button>
              </div>
              {loading2 ? (
                <div className="flex justify-center py-12">
                  <div className={`w-6 h-6 border-2 border-t-transparent rounded-full animate-spin`} style={{ borderColor: accentColor, borderTopColor: 'transparent' }} />
                </div>
              ) : reps.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <Flag size={36} className="text-gray-700" />
                  <p className="text-sm text-gray-500">هیچ گزارشی در این بخش ثبت نشده است</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {reps.map(r => {
                    const isResolved = resolvedReportIds.has(r.id) || r.status === 'resolved' || r.status === 'dismissed';
                    const targetTypeLabel: Record<string, string> = {
                      post: 'پست', message: 'پیام', user: 'کاربر',
                      conversation: 'مکالمه', group: 'گروه', channel: 'کانال',
                    };
                    const reasonLabel: Record<string, string> = {
                      spam: 'اسپم', harassment: 'آزار و اذیت', misinformation: 'اطلاعات نادرست',
                      violence: 'خشونت', inappropriate: 'محتوای نامناسب', other: 'سایر',
                    };
                    return (
                      <div key={r.id} className={`rounded-2xl border p-4 transition-all ${isResolved ? 'opacity-40' : ''}`}
                        style={{ background: '#0d1117', borderColor: isResolved ? '#1e2939' : '#1f2937' }}>
                        <div className="flex items-start gap-3">
                          <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{ background: isResolved ? '#1e2939' : 'rgba(239,68,68,0.1)' }}>
                            <Flag size={16} style={{ color: isResolved ? '#374151' : '#f87171' }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                                style={{ background: 'rgba(59,130,246,0.1)', color: '#60a5fa' }}>
                                {targetTypeLabel[r.target_type] || r.target_type}
                              </span>
                              <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                                style={{ background: 'rgba(245,158,11,0.1)', color: '#fbbf24' }}>
                                {reasonLabel[r.reason] || r.reason}
                              </span>
                              {isResolved && (
                                <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                                  style={{ background: 'rgba(34,197,94,0.1)', color: '#4ade80' }}>
                                  رسیدگی‌شده
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-400 mb-0.5">
                              <span className="text-gray-300 font-medium">{r.reporter_display_name || r.reporter_username}</span> گزارش داد
                            </p>
                            {r.details && (
                              <p className="text-xs text-gray-500 mt-1 p-2 rounded-lg" style={{ background: '#161b22' }}>
                                {r.details}
                              </p>
                            )}
                            <p className="text-xs text-gray-600 mt-1">
                              شناسه هدف: <span className="text-gray-500 font-mono">{r.target_id}</span>
                            </p>
                            <p className="text-xs text-gray-700 mt-0.5">
                              {new Date(r.created_at).toLocaleString('fa-IR')}
                            </p>
                          </div>
                        </div>
                        {!isResolved && (
                          <div className="flex gap-2 mt-3">
                            <button onClick={() => resolveReport(r.id, 'content_removed')}
                              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-colors"
                              style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}
                              onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.2)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'rgba(239,68,68,0.1)'}>
                              <Trash2 size={12} />حذف محتوا
                            </button>
                            <button onClick={() => resolveReport(r.id, 'user_warned')}
                              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-colors"
                              style={{ background: 'rgba(245,158,11,0.1)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.2)' }}
                              onMouseEnter={e => e.currentTarget.style.background = 'rgba(245,158,11,0.2)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'rgba(245,158,11,0.1)'}>
                              <Ban size={12} />اخطار به کاربر
                            </button>
                            <button onClick={() => dismissReport(r.id)}
                              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-colors"
                              style={{ background: '#161b22', color: '#6b7280', border: '1px solid #1f2937' }}
                              onMouseEnter={e => e.currentTarget.style.background = '#1e2939'}
                              onMouseLeave={e => e.currentTarget.style.background = '#161b22'}>
                              <CheckCheck size={12} />رد گزارش
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              </>);
              })()}
            </div>
          )}

          {/* ── STATUS ── */}
          {tab === 'status' && <StatusTab />}

          {/* ── BACKUP TAB ── */}
          {tab === 'backup' && <BackupTab />}

          {/* ── BOT TAB ── */}
          {tab === 'bot' && <BotTab />}
        </div>
      </div>

      {/* ── USER DETAIL MODAL ── */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)' }} onClick={() => setSelectedUser(null)}>
          <div className="w-full max-w-md rounded-2xl overflow-hidden kw-modal-in" style={{ background: 'rgba(8,15,35,0.97)', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 24px 80px rgba(0,0,0,0.6)' }} onClick={e => e.stopPropagation()} dir="rtl">
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}>
              <h2 className="text-sm font-bold text-white">اطلاعات کاربر</h2>
              <button onClick={() => setSelectedUser(null)} className="text-gray-500 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/5"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              {/* Avatar + name */}
              <div className="flex items-center gap-4">
                {selectedUser.avatar_url
                  ? <img src={selectedUser.avatar_url} className="w-16 h-16 rounded-full object-cover" alt="" />
                  : <div className="w-16 h-16 rounded-full bg-blue-700 flex items-center justify-center text-white text-xl font-bold">{(selectedUser.display_name || selectedUser.username).charAt(0).toUpperCase()}</div>
                }
                <div>
                  <div className="flex items-center gap-1.5">
                    <p className="font-bold text-white">{selectedUser.display_name || selectedUser.username}</p>
                    {!!(selectedUser as any).is_verified && <BadgeCheck size={16} className="text-blue-400" />}
                  </div>
                  <p className="text-sm text-gray-500">@{selectedUser.username}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full mt-1 inline-block ${selectedUser.is_banned ? 'bg-red-500/10 text-red-400' : selectedUser.is_approved ? 'bg-green-500/10 text-green-400' : 'bg-yellow-500/10 text-yellow-400'}`}>
                    {selectedUser.is_banned ? 'مسدود' : selectedUser.is_approved ? 'فعال' : 'در انتظار'}
                  </span>
                </div>
              </div>

              {/* Blue tick control */}
              <div className="rounded-xl p-3 border border-blue-900/30 flex items-center justify-between" style={{ background: '#161b22' }}>
                <div>
                  <p className="text-xs text-gray-400 font-medium">تیک آبی تأیید شده</p>
                  <p className="text-xs text-gray-600 mt-0.5">{(selectedUser as any).is_verified ? 'این کاربر تیک آبی دارد' : 'این کاربر تیک آبی ندارد'}</p>
                </div>
                <button
                  onClick={() => (selectedUser as any).is_verified ? revokeBlueTick(selectedUser.id) : grantBlueTick(selectedUser.id)}
                  disabled={blueTickLoadingId === selectedUser.id}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${(selectedUser as any).is_verified ? 'bg-blue-500/20 text-blue-400 hover:bg-red-500/20 hover:text-red-400' : 'bg-gray-700 text-gray-400 hover:bg-blue-500/20 hover:text-blue-400'}`}
                >
                  {blueTickLoadingId === selectedUser.id
                    ? <div className="w-3.5 h-3.5 border border-current border-t-transparent rounded-full animate-spin" />
                    : <BadgeCheck size={14} />
                  }
                  {(selectedUser as any).is_verified ? 'رفع تیک آبی' : 'اعطای تیک آبی'}
                </button>
              </div>

              {/* Info grid */}
              <div className="space-y-2 text-xs">
                {[
                  { label: 'ایمیل', value: selectedUser.email },
                  { label: 'بیو', value: selectedUser.bio },
                  { label: 'شماره', value: selectedUser.phone },
                  { label: 'تاریخ تولد', value: selectedUser.birthday },
                  { label: 'عضویت', value: new Date(selectedUser.created_at).toLocaleDateString('fa-IR') },
                  { label: 'آخرین بازدید', value: selectedUser.last_seen ? new Date(selectedUser.last_seen).toLocaleString('fa-IR') : '—' },
                ].filter(r => r.value).map(r => (
                  <div key={r.label} className="flex items-start gap-3 py-1.5 px-3 rounded-lg" style={{ background: '#161b22' }}>
                    <span className="text-gray-500 w-20 flex-shrink-0">{r.label}</span>
                    <span className="text-gray-200 break-all">{r.value}</span>
                  </div>
                ))}
              </div>

              {/* Password reveal */}
              <div className="rounded-xl p-3 border border-yellow-900/30" style={{ background: '#161b22' }}>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">رمز عبور</span>
                  <button
                    onClick={e => revealPassword(selectedUser, e)}
                    className="text-xs text-yellow-400 flex items-center gap-1 hover:text-yellow-300"
                  >
                    {loadingPasswordId === selectedUser.id
                      ? <div className="w-3 h-3 border border-yellow-400 border-t-transparent rounded-full animate-spin" />
                      : userPasswords[selectedUser.id] ? <><EyeOff size={12} /> پنهان</> : <><Eye size={12} /> نمایش</>
                    }
                  </button>
                </div>
                {userPasswords[selectedUser.id] && (
                  <p className="font-mono text-yellow-300 mt-2 text-sm">{userPasswords[selectedUser.id]}</p>
                )}
              </div>

              {/* Reset password */}
              {resetPwTarget?.id === selectedUser.id ? (
                <form onSubmit={handleResetPassword} className="space-y-2">
                  <input
                    type="text" value={resetPwValue} onChange={e => setResetPwValue(e.target.value)}
                    placeholder="رمز جدید (حداقل ۶ کاراکتر)"
                    className="w-full px-3 py-2 bg-gray-800 text-white rounded-xl text-xs outline-none border border-gray-700"
                  />
                  {resetPwMsg && <p className={`text-xs ${resetPwMsg.startsWith('✅') ? 'text-green-400' : 'text-red-400'}`}>{resetPwMsg}</p>}
                  <div className="flex gap-2">
                    <button type="submit" className="flex-1 py-2 bg-blue-700 hover:bg-blue-600 text-white rounded-xl text-xs">تغییر رمز</button>
                    <button type="button" onClick={() => setResetPwTarget(null)} className="px-3 py-2 bg-gray-700 text-gray-300 rounded-xl text-xs">لغو</button>
                  </div>
                </form>
              ) : (
                <button onClick={() => { setResetPwTarget(selectedUser); setResetPwValue(''); setResetPwMsg(''); }}
                  className="w-full py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl text-xs flex items-center justify-center gap-2">
                  <Key size={13} /> تغییر رمز این کاربر
                </button>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                {!selectedUser.is_approved && !selectedUser.is_banned && (
                  <button onClick={() => { approveUser(selectedUser.id); setSelectedUser(u => u ? { ...u, is_approved: true } : u); }}
                    className="flex-1 py-2 bg-green-700 hover:bg-green-600 text-white rounded-xl text-xs">تأیید کاربر</button>
                )}
                {!selectedUser.is_banned ? (
                  <button onClick={() => { banUser(selectedUser.id); setSelectedUser(u => u ? { ...u, is_banned: true } : u); }}
                    className="flex-1 py-2 bg-red-800 hover:bg-red-700 text-white rounded-xl text-xs">مسدود کردن</button>
                ) : (
                  <button onClick={() => { unbanUser(selectedUser.id); setSelectedUser(u => u ? { ...u, is_banned: false } : u); }}
                    className="flex-1 py-2 bg-blue-800 hover:bg-blue-700 text-white rounded-xl text-xs">رفع مسدود</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── RESET PASSWORD MODAL (standalone) ── */}
      {resetPwTarget && !selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)' }} onClick={() => setResetPwTarget(null)}>
          <div className="w-80 rounded-2xl p-5 kw-modal-in" style={{ background: 'rgba(8,15,35,0.97)', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 24px 80px rgba(0,0,0,0.6)' }} onClick={e => e.stopPropagation()} dir="rtl">
            <h2 className="text-sm font-bold text-white mb-3">تغییر رمز @{resetPwTarget.username}</h2>
            <form onSubmit={handleResetPassword} className="space-y-2">
              <input type="text" value={resetPwValue} onChange={e => setResetPwValue(e.target.value)} placeholder="رمز جدید"
                className="w-full px-3 py-2.5 bg-gray-800 text-white rounded-xl text-sm outline-none border border-gray-700" />
              {resetPwMsg && <p className={`text-xs ${resetPwMsg.startsWith('✅') ? 'text-green-400' : 'text-red-400'}`}>{resetPwMsg}</p>}
              <div className="flex gap-2">
                <button type="submit" className="flex-1 py-2.5 bg-blue-700 hover:bg-blue-600 text-white rounded-xl text-sm">تغییر</button>
                <button type="button" onClick={() => setResetPwTarget(null)} className="px-4 py-2.5 bg-gray-700 text-gray-300 rounded-xl text-sm">لغو</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusTab() {
  const [metrics, setMetrics] = useState<any>(null);
  const [error, setError] = useState('');
  const [alertVisible, setAlertVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function fetchMetrics() {
    const token = localStorage.getItem('kingwolf_token');
    const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api';
    try {
      const res = await fetch(`${API_BASE}/metrics`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { setError('خطا در دریافت اطلاعات'); return; }
      const data = await res.json();
      setMetrics(data);
      setAlertVisible(!!data.alerts?.critical);
      setError('');
    } catch { setError('سرور در دسترس نیست'); }
  }

  useEffect(() => {
    fetchMetrics();
    timerRef.current = setInterval(fetchMetrics, 3000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const tables = [
    { name: 'users',                label: 'کاربران' },
    { name: 'profiles',             label: 'پروفایل‌ها' },
    { name: 'conversations',        label: 'مکالمات' },
    { name: 'conversation_members', label: 'اعضا' },
    { name: 'messages',             label: 'پیام‌ها' },
    { name: 'feed_posts',           label: 'پست‌ها' },
    { name: 'app_settings',         label: 'تنظیمات' },
    { name: 'admin_access',         label: 'دسترسی ادمین' },
  ];

  const cpuPct = metrics?.cpu?.percent ?? 0;
  const ramPct = metrics?.memory?.percentUsed ?? 0;
  const diskPct = metrics?.disk?.percentUsed ?? 0;
  const cpuCrit = cpuPct > 90;
  const ramCrit = ramPct > 90;
  const diskCrit = diskPct > 90;
  const cpuColor = cpuPct > 90 ? '#ef4444' : cpuPct > 75 ? '#f97316' : cpuPct > 50 ? '#f59e0b' : '#4ade80';
  const ramColor = ramPct > 90 ? '#ef4444' : ramPct > 75 ? '#f97316' : '#a78bfa';
  const diskColor = diskPct > 90 ? '#ef4444' : diskPct > 75 ? '#f97316' : '#38bdf8';

  const MiniRing = ({ pct, color, label }: { pct: number; color: string; label: string }) => (
    <div className="flex items-center gap-3">
      <svg width="56" height="56" viewBox="0 0 56 56" className="flex-shrink-0">
        <circle cx="28" cy="28" r="22" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
        <circle cx="28" cy="28" r="22" fill="none" stroke={color} strokeWidth="5"
          strokeDasharray={`${(pct / 100) * 138.2} 138.2`} strokeLinecap="round"
          transform="rotate(-90 28 28)" style={{ transition: 'stroke-dasharray 0.7s ease' }} />
        <text x="28" y="33" textAnchor="middle" fontSize="11" fontWeight="bold" fill={color}>{pct}%</text>
      </svg>
      <div>
        <p className="text-2xl font-bold" style={{ color }}>{pct}%</p>
        <p className="text-xs text-gray-500">{label}</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-4 kw-tab-in">
      {error && <p className="text-xs text-red-400">{error}</p>}

      {/* 🚨 HIGH USAGE ALERT BANNER */}
      {alertVisible && (
        <div className="rounded-2xl p-4 kw-modal-in flex items-start gap-3" style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.5)', backdropFilter: 'blur(12px)' }}>
          <div className="w-8 h-8 rounded-xl flex-shrink-0 flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.2)' }}>
            <AlertTriangle size={16} className="text-red-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-red-300 mb-1">⚠️ هشدار بحرانی — مصرف بالا</p>
            <div className="flex flex-wrap gap-2">
              {cpuCrit && <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-300">CPU: {cpuPct}% (بحرانی)</span>}
              {ramCrit && <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-300">RAM: {ramPct}% (بحرانی)</span>}
              {diskCrit && <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-300">Disk: {diskPct}% (بحرانی)</span>}
            </div>
            {metrics?.alerts?.recent?.length > 0 && (
              <div className="mt-2 space-y-0.5">
                {metrics.alerts.recent.slice(-3).reverse().map((a: any, i: number) => (
                  <p key={i} className="text-xs text-red-400/70 font-mono">{new Date(a.ts).toLocaleTimeString('fa-IR')} — {a.msg}</p>
                ))}
              </div>
            )}
          </div>
          <button onClick={() => setAlertVisible(false)} className="text-red-400 hover:text-red-200 flex-shrink-0"><X size={14} /></button>
        </div>
      )}

      {/* CPU + RAM + Disk — three rings */}
      <div className="grid grid-cols-3 gap-3">
        {/* CPU Ring */}
        <div className="rounded-2xl p-4 kw-stat-pop" style={{ background: cpuCrit ? 'rgba(239,68,68,0.12)' : 'rgba(15,23,42,0.8)', border: `1px solid ${cpuColor}25`, backdropFilter: 'blur(12px)', transition: 'background 1s ease' }}>
          <div className="flex items-center gap-2 mb-3">
            <Cpu size={14} style={{ color: cpuColor }} />
            <h3 className="text-xs font-semibold text-white">CPU</h3>
            <span className="mr-auto text-xs animate-pulse" style={{ color: '#4ade80' }}>● زنده</span>
          </div>
          <MiniRing pct={cpuPct} color={cpuColor} label={`${metrics?.cpu?.count ?? '—'} هسته`} />
          {metrics?.cpu?.loadAvg && <p className="text-xs text-gray-600 mt-2">بار: {metrics.cpu.loadAvg.map((v: number) => v.toFixed(1)).join(' / ')}</p>}
          {cpuCrit && <p className="text-xs font-bold text-red-400 mt-1 animate-pulse">⚠ بحرانی</p>}
        </div>

        {/* RAM Ring */}
        <div className="rounded-2xl p-4 kw-stat-pop" style={{ animationDelay: '60ms', background: ramCrit ? 'rgba(239,68,68,0.12)' : 'rgba(15,23,42,0.8)', border: `1px solid ${ramColor}25`, backdropFilter: 'blur(12px)', transition: 'background 1s ease' }}>
          <div className="flex items-center gap-2 mb-3">
            <HardDrive size={14} style={{ color: ramColor }} />
            <h3 className="text-xs font-semibold text-white">RAM</h3>
          </div>
          <MiniRing pct={ramPct} color={ramColor} label={metrics ? `${fmtBytes(metrics.memory.used)} / ${fmtBytes(metrics.memory.total)}` : '—'} />
          {metrics?.process && <p className="text-xs text-gray-600 mt-2">Node RSS: {fmtBytes(metrics.process.rss)}</p>}
          {ramCrit && <p className="text-xs font-bold text-red-400 mt-1 animate-pulse">⚠ بحرانی</p>}
        </div>

        {/* Disk Ring */}
        <div className="rounded-2xl p-4 kw-stat-pop" style={{ animationDelay: '120ms', background: diskCrit ? 'rgba(239,68,68,0.12)' : 'rgba(15,23,42,0.8)', border: `1px solid ${diskColor}25`, backdropFilter: 'blur(12px)', transition: 'background 1s ease' }}>
          <div className="flex items-center gap-2 mb-3">
            <Server size={14} style={{ color: diskColor }} />
            <h3 className="text-xs font-semibold text-white">Disk</h3>
          </div>
          <MiniRing pct={diskPct} color={diskColor} label={metrics?.disk ? `${fmtBytes(metrics.disk.used)} / ${fmtBytes(metrics.disk.total)}` : '—'} />
          {metrics?.disk && <p className="text-xs text-gray-600 mt-2">آزاد: {fmtBytes(metrics.disk.free)}</p>}
          {diskCrit && <p className="text-xs font-bold text-red-400 mt-1 animate-pulse">⚠ بحرانی</p>}
        </div>
      </div>

      {/* Uptime */}
      <div className="rounded-2xl p-4" style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(59,130,246,0.15)', backdropFilter: 'blur(12px)' }}>
        <div className="flex items-center gap-2 mb-3">
          <Activity size={15} className="text-blue-400" />
          <h3 className="text-sm font-semibold text-white">زمان کارکرد</h3>
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs">
          {[
            { label: 'سرور (Node.js)', value: metrics ? fmtUptime(metrics.process.uptimeSeconds) : '—', color: '#60a5fa' },
            { label: 'سیستم', value: metrics ? fmtUptime(metrics.system.uptimeSeconds) : '—', color: '#60a5fa' },
            { label: 'پلتفرم', value: metrics ? `${metrics.system.platform} / ${metrics.system.arch}` : '—', color: '#9ca3af' },
          ].map(row => (
            <div key={row.label} className="px-3 py-2.5 rounded-xl" style={{ background: 'rgba(8,12,24,0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <p className="text-gray-500 mb-1">{row.label}</p>
              <p className="font-mono font-medium" style={{ color: row.color }}>{row.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* DB stats */}
      <div className="rounded-2xl p-4" style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(251,191,36,0.15)', backdropFilter: 'blur(12px)' }}>
        <div className="flex items-center gap-2 mb-3">
          <Server size={15} className="text-yellow-400" />
          <h3 className="text-sm font-semibold text-white">آمار پایگاه داده</h3>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {tables.map(t => (
            <div key={t.name} className="flex items-center justify-between py-1.5 px-3 rounded-xl" style={{ background: 'rgba(8,12,24,0.6)', border: '1px solid rgba(255,255,255,0.04)' }}>
              <span className="text-xs text-gray-400">{t.label}</span>
              <span className="text-xs font-bold text-yellow-400">{metrics?.db?.[t.name] ?? '—'}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Admin info */}
      <div className="rounded-2xl p-4" style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(239,68,68,0.12)', backdropFilter: 'blur(12px)' }}>
        <div className="flex items-center gap-2 mb-3">
          <Shield size={15} className="text-red-400" />
          <h3 className="text-sm font-semibold text-white">اطلاعات پیش‌فرض</h3>
        </div>
        <div className="space-y-2 text-xs">
          {[
            { label: 'نام کاربری ادمین', value: 'admin' },
            { label: 'رمز پیش‌فرض ادمین', value: 'admin1234' },
            { label: 'رمز کاربران دمو', value: 'wolf1234' },
          ].map(row => (
            <div key={row.label} className="flex items-center justify-between py-1.5 px-3 rounded-xl" style={{ background: 'rgba(8,12,24,0.6)', border: '1px solid rgba(255,255,255,0.04)' }}>
              <span className="text-gray-500">{row.label}</span>
              <span className="font-mono text-yellow-400">{row.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
