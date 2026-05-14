import { useState, useEffect, useRef } from 'react';
import { Users, Settings, BarChart2, Shield, LogIn, Check, Ban, Eye, EyeOff, RefreshCw, UserCheck, Database, Lock, Key, CheckCircle2, Server, HardDrive, Cpu, X, BadgeCheck, Activity, ChevronDown } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { WolfLogo } from '../components/ui/WolfLogo';
import { Profile } from '../types';

type AdminTab = 'dashboard' | 'users' | 'settings' | 'database' | 'status';

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

  const [fakeUsersLoading, setFakeUsersLoading] = useState(false);
  const [fakeUsersMsg, setFakeUsersMsg] = useState('');
  const [testDataLoading, setTestDataLoading] = useState(false);
  const [testDataMsg, setTestDataMsg] = useState('');

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

  const FAKE_FEMALES = [
    { username: 'ayda_r',    display: 'آیدا رضایی',    bio: 'طراح گرافیک و عکاس',       phone: '09121000001', birthday: '1998-03-15' },
    { username: 'nilufar_m', display: 'نیلوفر موسوی',  bio: 'دانشجوی معماری',           phone: '09121000002', birthday: '2000-07-22' },
    { username: 'parisa_a',  display: 'پریسا احمدی',   bio: 'مشاور بازاریابی دیجیتال', phone: '09121000003', birthday: '1997-11-05' },
    { username: 'mahsa_k',   display: 'مهسا کریمی',    bio: 'نویسنده و مترجم',          phone: '09121000004', birthday: '1995-01-30' },
    { username: 'sara_t',    display: 'سارا تهرانی',   bio: 'دکترای روانشناسی',         phone: '09121000005', birthday: '1993-09-12' },
    { username: 'zahra_n',   display: 'زهرا نوری',     bio: 'پزشک عمومی',               phone: '09121000006', birthday: '1990-05-20' },
    { username: 'maryam_h',  display: 'مریم حسینی',    bio: 'معلم ریاضی',               phone: '09121000007', birthday: '1992-12-08' },
    { username: 'sheyda_s',  display: 'شیدا صادقی',    bio: 'مدیر محصول',               phone: '09121000008', birthday: '1996-04-17' },
    { username: 'leila_j',   display: 'لیلا جعفری',    bio: 'هنرمند و مجسمه‌ساز',      phone: '09121000009', birthday: '1994-08-25' },
    { username: 'fateme_a',  display: 'فاطمه اکبری',   bio: 'کارشناس حقوق',             phone: '09121000010', birthday: '1999-02-14' },
  ];

  async function createFakeUsers() {
    setFakeUsersLoading(true); setFakeUsersMsg('');
    let created = 0, skipped = 0;
    for (const u of FAKE_FEMALES) {
      const email = `${u.username}@kingwolf.internal`;
      const { data, error } = await supabase.auth.signUp({ email, password: 'wolf1234' });
      if (error) { skipped++; continue; }
      if (data.user) {
        await supabase.from('profiles').upsert({
          id: data.user.id, username: u.username, display_name: u.display,
          bio: u.bio, phone: u.phone, birthday: u.birthday, email, is_approved: true,
        });
        created++;
      } else { skipped++; }
    }
    setFakeUsersMsg(`✅ ${created} کاربر ساخته شد${skipped > 0 ? ` (${skipped} تکراری/خطا)` : ''} — پسورد: wolf1234`);
    setFakeUsersLoading(false);
    await loadData();
  }

  async function createTestGroupAndChannel() {
    setTestDataLoading(true); setTestDataMsg('');
    try {
      const { data: session } = await supabase.auth.getSession();
      const myId = session?.session?.user?.id;
      if (!myId) { setTestDataMsg('❌ ابتدا وارد شوید'); setTestDataLoading(false); return; }
      const usernames = FAKE_FEMALES.map(u => u.username);
      const { data: fakeProfiles } = await supabase.from('profiles').select('id,username').in('username', usernames);
      const memberIds = (fakeProfiles || []).map((p: any) => p.id);
      const { data: grp } = await supabase.from('conversations')
        .insert({ type: 'group', name: 'گروه تست KingWolf 🐺', description: 'گروه آزمایشی', created_by: myId })
        .select('id').single();
      if (grp) {
        await supabase.from('conversation_members').insert([
          { conversation_id: grp.id, user_id: myId, role: 'admin' },
          ...memberIds.map((uid: string) => ({ conversation_id: grp.id, user_id: uid, role: 'member' }))
        ]);
        await supabase.from('messages').insert({ conversation_id: grp.id, sender_id: myId, content: 'خوش آمدید! 👋', type: 'text' });
      }
      const { data: ch } = await supabase.from('conversations')
        .insert({ type: 'channel', name: 'کانال KingWolf 📢', description: 'کانال رسمی', created_by: myId })
        .select('id').single();
      if (ch) {
        await supabase.from('conversation_members').insert([
          { conversation_id: ch.id, user_id: myId, role: 'admin' },
          ...memberIds.map((uid: string) => ({ conversation_id: ch.id, user_id: uid, role: 'member' }))
        ]);
        await supabase.from('messages').insert({ conversation_id: ch.id, sender_id: myId, content: '📢 کانال راه‌اندازی شد!', type: 'text' });
      }
      setTestDataMsg(`✅ گروه و کانال با ${memberIds.length} عضو ساخته شد`);
    } catch (err: any) { setTestDataMsg('❌ خطا: ' + err.message); }
    setTestDataLoading(false);
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

  if (!loggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#030712' }} dir="rtl">
        <div className="w-full max-w-sm">
          <div className="text-center mb-6">
            <WolfLogo size={56} className="mx-auto mb-3" />
            <div className="flex items-center justify-center gap-2">
              <Shield size={16} className="text-red-400" />
              <h1 className="text-xl font-bold text-white">پنل مدیریت</h1>
            </div>
            <p className="text-sm text-gray-500 mt-1">دسترسی محدود — مدیران مجاز</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-3 bg-gray-900 rounded-2xl p-6 border border-gray-800">
            <input
              value={username} onChange={e => setUsername(e.target.value)} placeholder="نام کاربری"
              className="w-full px-4 py-3 bg-gray-800 text-white rounded-xl text-sm outline-none border border-gray-700"
            />
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="رمز عبور"
                className="w-full px-4 py-3 pl-10 bg-gray-800 text-white rounded-xl text-sm outline-none border border-gray-700"
              />
              <button type="button" onClick={() => setShowPw(!showPw)} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <button type="submit" disabled={loading} className="w-full py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2">
              {loading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <LogIn size={16} />}
              ورود به پنل
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex" style={{ background: '#030712' }} dir="rtl">
      {/* Sidebar */}
      <div className="w-16 md:w-56 flex-shrink-0 flex flex-col border-r border-gray-800" style={{ background: '#0a0f1a' }}>
        <div className="p-4 border-b border-gray-800 flex items-center gap-2">
          <WolfLogo size={28} />
          <span className="hidden md:block text-sm font-bold text-white">پنل مدیر</span>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {([
            { id: 'dashboard', label: 'داشبورد', icon: BarChart2 },
            { id: 'users', label: 'کاربران', icon: Users },
            { id: 'settings', label: 'تنظیمات', icon: Settings },
            { id: 'database', label: 'پایگاه داده', icon: Database },
            { id: 'status', label: 'وضعیت سیستم', icon: Server },
          ] as { id: AdminTab; label: string; icon: any }[]).map(item => (
            <button
              key={item.id} onClick={() => setTab(item.id)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-right transition-colors"
              style={{ background: tab === item.id ? 'rgba(239,68,68,0.1)' : 'transparent', color: tab === item.id ? '#f87171' : '#6b7280' }}
            >
              <item.icon size={18} />
              <span className="hidden md:block text-sm">{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="p-2 border-t border-gray-800">
          <button onClick={() => setLoggedIn(false)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-gray-600 hover:text-red-400 transition-colors">
            <LogIn size={18} className="rotate-180" />
            <span className="hidden md:block text-sm">خروج</span>
          </button>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-shrink-0 px-6 py-4 border-b border-gray-800 flex items-center gap-3" style={{ background: '#0a0f1a', paddingTop: 'max(16px, env(safe-area-inset-top))' }}>
          <h1 className="text-base font-bold text-white flex-1">
            {tab === 'dashboard' ? 'داشبورد' : tab === 'users' ? 'مدیریت کاربران' : tab === 'settings' ? 'تنظیمات' : tab === 'database' ? 'پایگاه داده' : 'وضعیت سیستم'}
          </h1>
          <button onClick={loadData} className="p-2 rounded-xl text-gray-500 hover:text-gray-300">
            <RefreshCw size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">

          {/* DASHBOARD */}
          {tab === 'dashboard' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'کل کاربران', value: stats.total, color: '#3b82f6' },
                  { label: 'در انتظار تأیید', value: stats.pending, color: '#f59e0b' },
                  { label: 'کاربران فعال', value: stats.active, color: '#10b981' },
                  { label: 'مسدود شده', value: stats.banned, color: '#ef4444' },
                ].map(s => (
                  <div key={s.label} className="rounded-2xl p-4 border border-gray-800" style={{ background: '#111827' }}>
                    <p className="text-xs text-gray-500 mb-2">{s.label}</p>
                    <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
                  </div>
                ))}
              </div>
              <div className="rounded-2xl p-4 border border-gray-800" style={{ background: '#111827' }}>
                <h3 className="text-sm font-semibold text-white mb-3">کاربران اخیر</h3>
                <div className="space-y-2">
                  {users.slice(0, 8).map(u => (
                    <div key={u.id} className="flex items-center gap-3 py-1.5 cursor-pointer hover:opacity-80" onClick={() => setSelectedUser(u)}>
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${u.is_banned ? 'bg-red-500' : u.is_approved ? 'bg-green-500' : 'bg-yellow-500'}`} />
                      <span className="text-sm text-gray-300 flex-1">@{u.username}</span>
                      {u.is_admin && <BadgeCheck size={14} className="text-blue-400" />}
                      <span className="text-xs text-gray-600">{new Date(u.created_at).toLocaleDateString('fa-IR')}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* USERS */}
          {tab === 'users' && (
            <div className="space-y-2">
              <p className="text-xs text-gray-600 mb-3">روی هر کاربر کلیک کنید تا اطلاعات کامل ببینید</p>
              {users.map(u => (
                <div
                  key={u.id}
                  onClick={() => setSelectedUser(u)}
                  className="flex items-center gap-3 p-3 rounded-xl border border-gray-800 cursor-pointer hover:border-gray-600 transition-colors"
                  style={{ background: '#111827' }}
                >
                  {u.avatar_url
                    ? <img src={u.avatar_url} className="w-9 h-9 rounded-full object-cover flex-shrink-0" alt="" />
                    : <div className="w-9 h-9 rounded-full bg-blue-700 flex items-center justify-center flex-shrink-0 text-white text-sm font-bold">{(u.display_name || u.username).charAt(0).toUpperCase()}</div>
                  }
                  <div className="flex-1 min-w-0 text-right">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium text-white truncate">{u.display_name || u.username}</p>
                      {u.is_admin && <BadgeCheck size={14} className="text-blue-400 flex-shrink-0" title="ادمین" />}
                    </div>
                    <p className="text-xs text-gray-500">@{u.username}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${u.is_banned ? 'bg-red-500/10 text-red-400' : u.is_approved ? 'bg-green-500/10 text-green-400' : 'bg-yellow-500/10 text-yellow-400'}`}>
                      {u.is_banned ? 'مسدود' : u.is_approved ? 'فعال' : 'منتظر'}
                    </span>
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

          {/* SETTINGS */}
          {tab === 'settings' && (
            <div className="space-y-4">
              <div className="rounded-2xl p-4 border border-gray-800" style={{ background: '#111827' }}>
                <h3 className="text-sm font-semibold text-white mb-4">تنظیمات برنامه</h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">نام برنامه</label>
                    <input
                      value={appSettings.app_name || 'KingWolf'}
                      onChange={e => setAppSettings(p => ({ ...p, app_name: e.target.value }))}
                      onBlur={e => saveSetting('app_name', e.target.value)}
                      className="w-full px-3 py-2 bg-gray-800 text-white rounded-xl text-sm outline-none border border-gray-700"
                    />
                  </div>

                  {/* Signup toggle — uses signup_locked (true=disabled) */}
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
                </div>
              </div>

              <div className="rounded-2xl p-4 border border-gray-800" style={{ background: '#111827' }}>
                <div className="flex items-center gap-2 mb-4">
                  <Lock size={16} className="text-red-400" />
                  <h3 className="text-sm font-semibold text-white">تغییر رمز مدیر</h3>
                </div>
                <form onSubmit={handleChangePassword} className="space-y-3">
                  <div className="relative">
                    <input
                      type={showNewPw ? 'text' : 'password'} value={newPw} onChange={e => setNewPw(e.target.value)}
                      placeholder="رمز جدید (حداقل ۶ کاراکتر)"
                      className="w-full px-3 py-2.5 pl-10 bg-gray-800 text-white rounded-xl text-sm outline-none border border-gray-700"
                    />
                    <button type="button" onClick={() => setShowNewPw(!showNewPw)} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                      {showNewPw ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  <input
                    type={showNewPw ? 'text' : 'password'} value={newPw2} onChange={e => setNewPw2(e.target.value)}
                    placeholder="تکرار رمز جدید"
                    className="w-full px-3 py-2.5 bg-gray-800 text-white rounded-xl text-sm outline-none border border-gray-700"
                  />
                  {pwErr && <p className="text-xs text-red-400">{pwErr}</p>}
                  {pwMsg && <p className="text-xs text-green-400">{pwMsg}</p>}
                  <button type="submit" disabled={pwLoading} className="w-full py-2.5 bg-red-700 hover:bg-red-600 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2">
                    {pwLoading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Key size={14} />}
                    تغییر رمز
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* DATABASE */}
          {tab === 'database' && (
            <div className="space-y-4">
              <div className="rounded-2xl p-4 border border-gray-800" style={{ background: '#111827' }}>
                <h3 className="text-sm font-semibold text-white mb-1">ساخت کاربران نمونه</h3>
                <p className="text-xs text-gray-500 mb-3">پسورد همه: <span className="text-yellow-400 font-mono">wolf1234</span></p>
                <div className="space-y-1 mb-3">
                  {FAKE_FEMALES.map(u => (
                    <div key={u.username} className="flex items-center gap-2 text-xs text-gray-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 flex-shrink-0" />
                      <span className="font-bold text-gray-300">@{u.username}</span>
                      <span className="text-gray-600">— {u.display}</span>
                    </div>
                  ))}
                </div>
                <button onClick={createFakeUsers} disabled={fakeUsersLoading}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2"
                  style={{ background: fakeUsersLoading ? '#374151' : '#4f46e5' }}>
                  {fakeUsersLoading ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> در حال ساخت...</> : '👤 ساخت کاربران نمونه'}
                </button>
                {fakeUsersMsg && <p className="text-xs text-green-400 mt-2">{fakeUsersMsg}</p>}
              </div>
              <div className="rounded-2xl p-4 border border-gray-800" style={{ background: '#111827' }}>
                <h3 className="text-sm font-semibold text-white mb-1">ساخت گروه و کانال تست</h3>
                <button onClick={createTestGroupAndChannel} disabled={testDataLoading}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 mt-3"
                  style={{ background: testDataLoading ? '#374151' : '#0ea5e9' }}>
                  {testDataLoading ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> در حال ساخت...</> : '🏗️ ساخت گروه و کانال'}
                </button>
                {testDataMsg && <p className="text-xs text-green-400 mt-2">{testDataMsg}</p>}
              </div>
            </div>
          )}

          {/* STATUS */}
          {tab === 'status' && <StatusTab />}
        </div>
      </div>

      {/* USER DETAIL MODAL */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }} onClick={() => setSelectedUser(null)}>
          <div className="w-full max-w-md rounded-2xl border border-gray-700 overflow-hidden" style={{ background: '#0d1117' }} onClick={e => e.stopPropagation()} dir="rtl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
              <h2 className="text-sm font-bold text-white">اطلاعات کاربر</h2>
              <button onClick={() => setSelectedUser(null)} className="text-gray-500 hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              {/* Avatar + name */}
              <div className="flex items-center gap-4">
                {selectedUser.avatar_url
                  ? <img src={selectedUser.avatar_url} className="w-16 h-16 rounded-full object-cover" alt="" />
                  : <div className="w-16 h-16 rounded-full bg-blue-700 flex items-center justify-center text-white text-xl font-bold">{(selectedUser.display_name || selectedUser.username).charAt(0).toUpperCase()}</div>
                }
                <div>
                  <div className="flex items-center gap-1.5">
                    <p className="font-bold text-white">{selectedUser.display_name || selectedUser.username}</p>
                    {selectedUser.is_admin && <BadgeCheck size={16} className="text-blue-400" />}
                  </div>
                  <p className="text-sm text-gray-500">@{selectedUser.username}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full mt-1 inline-block ${selectedUser.is_banned ? 'bg-red-500/10 text-red-400' : selectedUser.is_approved ? 'bg-green-500/10 text-green-400' : 'bg-yellow-500/10 text-yellow-400'}`}>
                    {selectedUser.is_banned ? 'مسدود' : selectedUser.is_approved ? 'فعال' : 'در انتظار'}
                  </span>
                </div>
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

      {/* RESET PASSWORD MODAL (standalone) */}
      {resetPwTarget && !selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }} onClick={() => setResetPwTarget(null)}>
          <div className="w-80 rounded-2xl border border-gray-700 p-5" style={{ background: '#0d1117' }} onClick={e => e.stopPropagation()} dir="rtl">
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
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function fetchMetrics() {
    const token = localStorage.getItem('kingwolf_token');
    const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api';
    try {
      const res = await fetch(`${API_BASE}/metrics`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { setError('خطا در دریافت اطلاعات'); return; }
      const data = await res.json();
      setMetrics(data);
      setError('');
    } catch { setError('سرور در دسترس نیست'); }
  }

  useEffect(() => {
    fetchMetrics();
    timerRef.current = setInterval(fetchMetrics, 3000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const tables = [
    { name: 'users', label: 'کاربران' },
    { name: 'profiles', label: 'پروفایل‌ها' },
    { name: 'conversations', label: 'مکالمات' },
    { name: 'conversation_members', label: 'اعضا' },
    { name: 'messages', label: 'پیام‌ها' },
    { name: 'feed_posts', label: 'پست‌ها' },
    { name: 'app_settings', label: 'تنظیمات' },
    { name: 'admin_access', label: 'دسترسی ادمین' },
  ];

  return (
    <div className="space-y-4">
      {error && <p className="text-xs text-red-400">{error}</p>}

      {/* CPU */}
      <div className="rounded-2xl p-4 border border-gray-800" style={{ background: '#111827' }}>
        <div className="flex items-center gap-2 mb-3">
          <Cpu size={15} className="text-green-400" />
          <h3 className="text-sm font-semibold text-white">پردازنده (CPU)</h3>
          <span className="mr-auto text-xs text-gray-600 animate-pulse">● زنده</span>
        </div>
        <div className="flex items-end gap-3 mb-2">
          <span className="text-3xl font-bold text-green-400">{metrics?.cpu?.percent ?? '—'}%</span>
          <span className="text-xs text-gray-500 mb-1">{metrics?.cpu?.count} هسته</span>
        </div>
        <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${metrics?.cpu?.percent ?? 0}%`, background: (metrics?.cpu?.percent ?? 0) > 80 ? '#ef4444' : (metrics?.cpu?.percent ?? 0) > 50 ? '#f59e0b' : '#4ade80' }} />
        </div>
        {metrics?.cpu?.loadAvg && (
          <p className="text-xs text-gray-600 mt-2">بار: {metrics.cpu.loadAvg.map((v: number) => v.toFixed(2)).join(' / ')}</p>
        )}
      </div>

      {/* Memory */}
      <div className="rounded-2xl p-4 border border-gray-800" style={{ background: '#111827' }}>
        <div className="flex items-center gap-2 mb-3">
          <HardDrive size={15} className="text-purple-400" />
          <h3 className="text-sm font-semibold text-white">حافظه (RAM)</h3>
        </div>
        <div className="flex items-end gap-3 mb-2">
          <span className="text-3xl font-bold text-purple-400">{metrics?.memory?.percentUsed ?? '—'}%</span>
          <span className="text-xs text-gray-500 mb-1">
            {metrics ? `${fmtBytes(metrics.memory.used)} / ${fmtBytes(metrics.memory.total)}` : '—'}
          </span>
        </div>
        <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${metrics?.memory?.percentUsed ?? 0}%`, background: (metrics?.memory?.percentUsed ?? 0) > 80 ? '#ef4444' : '#a78bfa' }} />
        </div>
        {metrics?.process && (
          <p className="text-xs text-gray-600 mt-2">فرآیند Node: {fmtBytes(metrics.process.rss)} RSS</p>
        )}
      </div>

      {/* Uptime */}
      <div className="rounded-2xl p-4 border border-gray-800" style={{ background: '#111827' }}>
        <div className="flex items-center gap-2 mb-3">
          <Activity size={15} className="text-blue-400" />
          <h3 className="text-sm font-semibold text-white">زمان کارکرد</h3>
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="px-3 py-2 rounded-lg" style={{ background: '#0d1117' }}>
            <p className="text-gray-500 mb-0.5">سرور (Node.js)</p>
            <p className="text-blue-300 font-mono">{metrics ? fmtUptime(metrics.process.uptimeSeconds) : '—'}</p>
          </div>
          <div className="px-3 py-2 rounded-lg" style={{ background: '#0d1117' }}>
            <p className="text-gray-500 mb-0.5">سیستم</p>
            <p className="text-blue-300 font-mono">{metrics ? fmtUptime(metrics.system.uptimeSeconds) : '—'}</p>
          </div>
          <div className="px-3 py-2 rounded-lg" style={{ background: '#0d1117' }}>
            <p className="text-gray-500 mb-0.5">پلتفرم</p>
            <p className="text-gray-300">{metrics?.system?.platform ?? '—'} / {metrics?.system?.arch ?? '—'}</p>
          </div>
        </div>
      </div>

      {/* DB stats */}
      <div className="rounded-2xl p-4 border border-gray-800" style={{ background: '#111827' }}>
        <div className="flex items-center gap-2 mb-3">
          <Server size={15} className="text-yellow-400" />
          <h3 className="text-sm font-semibold text-white">آمار پایگاه داده</h3>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {tables.map(t => (
            <div key={t.name} className="flex items-center justify-between py-1.5 px-3 rounded-lg" style={{ background: '#0d1117' }}>
              <span className="text-xs text-gray-400">{t.label}</span>
              <span className="text-xs font-bold text-yellow-400">{metrics?.db?.[t.name] ?? '—'}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Admin info */}
      <div className="rounded-2xl p-4 border border-gray-800" style={{ background: '#111827' }}>
        <div className="flex items-center gap-2 mb-3">
          <Shield size={15} className="text-red-400" />
          <h3 className="text-sm font-semibold text-white">اطلاعات پیش‌فرض</h3>
        </div>
        <div className="space-y-2 text-xs">
          <div className="flex items-center justify-between py-1.5 px-3 rounded-lg" style={{ background: '#0d1117' }}>
            <span className="text-gray-500">نام کاربری ادمین</span>
            <span className="font-mono text-yellow-400">admin</span>
          </div>
          <div className="flex items-center justify-between py-1.5 px-3 rounded-lg" style={{ background: '#0d1117' }}>
            <span className="text-gray-500">رمز پیش‌فرض ادمین</span>
            <span className="font-mono text-yellow-400">admin1234</span>
          </div>
          <div className="flex items-center justify-between py-1.5 px-3 rounded-lg" style={{ background: '#0d1117' }}>
            <span className="text-gray-500">رمز کاربران دمو</span>
            <span className="font-mono text-yellow-400">wolf1234</span>
          </div>
        </div>
      </div>
    </div>
  );
}
