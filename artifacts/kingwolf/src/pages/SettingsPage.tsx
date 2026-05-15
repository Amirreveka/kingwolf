import { useState, useRef, useEffect } from 'react';
import { User, Camera, Lock, Bell, Shield, Palette, Globe, ChevronLeft, Save, X, Eye, EyeOff, Check, Sun, Moon, LogOut, Smartphone } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import { Profile } from '../types';

type Section = 'main' | 'profile' | 'appearance' | 'language' | 'notifications' | 'privacy' | 'security' | 'devices';

interface SettingsPageProps {
  onClose: () => void;
}

export function SettingsPage({ onClose }: SettingsPageProps) {
  const { user, profile, refreshProfile, signOut } = useAuth();
  const { theme, language, setTheme, setLanguage, t } = useTheme();
  const [section, setSection] = useState<Section>('main');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Profile form state
  const [displayName, setDisplayName] = useState(profile?.display_name || '');
  const [username, setUsername] = useState(profile?.username || '');
  const [bio, setBio] = useState(profile?.bio || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [birthday, setBirthday] = useState((profile as any)?.birthday || '');

  // Security form state
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);

  // Notification state
  const [notifSound, setNotifSound] = useState(profile?.settings?.notification_sound ?? true);
  const [msgPreview, setMsgPreview] = useState(profile?.settings?.message_preview ?? true);

  // Devices state
  const [sessionInfo, setSessionInfo] = useState<{ ip: string; device_name: string; user_agent: string; created_at: string | null } | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name || '');
      setUsername(profile.username || '');
      setBio(profile.bio || '');
      setPhone(profile.phone || '');
      setBirthday((profile as any).birthday || '');
    }
  }, [profile]);

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    // reset so same file can be re-selected
    e.target.value = '';
    setUploadingAvatar(true);
    try {
      const { data: uploadData, error: upErr } = await supabase.storage.from('avatars').upload('', file, { upsert: true });
      if (!upErr && uploadData) {
        const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(uploadData.path);
        const avatarUrl = urlData.publicUrl + `?t=${Date.now()}`;
        await supabase.from('profiles').update({ avatar_url: avatarUrl }).eq('id', user.id);
        await refreshProfile();
      } else {
        // Fallback: convert to base64 data URL
        const reader = new FileReader();
        reader.onload = async (ev) => {
          const dataUrl = ev.target?.result as string;
          if (dataUrl) {
            await supabase.from('profiles').update({ avatar_url: dataUrl }).eq('id', user.id);
            await refreshProfile();
          }
        };
        reader.readAsDataURL(file);
      }
    } catch (err) {
      console.error('Avatar upload failed', err);
    }
    setUploadingAvatar(false);
  }

  async function saveProfile() {
    if (!user) return;
    setSaving(true);
    const updates: any = {
      display_name: displayName.trim(),
      bio: bio.trim(),
      phone: phone.trim(),
      birthday,
      updated_at: new Date().toISOString(),
    };
    const newUname = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (newUname && newUname !== profile?.username && newUname.length >= 3) {
      updates.username = newUname;
    }
    await supabase.from('profiles').update(updates).eq('id', user.id);
    await refreshProfile();
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function changePassword() {
    if (!newPw || newPw.length < 6) { setPwError('رمز جدید باید حداقل ۶ کاراکتر باشد'); return; }
    setPwError(''); setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPw });
    setSaving(false);
    if (error) { setPwError('خطا در تغییر رمز عبور'); return; }
    setPwSuccess(true);
    setOldPw(''); setNewPw('');
    setTimeout(() => setPwSuccess(false), 2000);
  }

  async function saveNotifications() {
    if (!user) return;
    await supabase.from('profiles').update({
      settings: { ...profile?.settings, notification_sound: notifSound, message_preview: msgPreview },
    }).eq('id', user.id);
    await refreshProfile();
  }

  useEffect(() => {
    if (section === 'devices' && !sessionInfo && !sessionLoading) loadSessionInfo();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);

  async function loadSessionInfo() {
    setSessionLoading(true);
    const token = localStorage.getItem('kingwolf_token');
    if (!token) { setSessionLoading(false); return; }
    try {
      const res = await fetch('/api/auth/session-info', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setSessionInfo(await res.json());
    } catch {}
    setSessionLoading(false);
  }

  const menuItems = [
    { id: 'profile' as Section, label: t('ویرایش پروفایل', 'Edit Profile'), icon: User, color: '#3b82f6' },
    { id: 'appearance' as Section, label: t('ظاهر', 'Appearance'), icon: Palette, color: '#8b5cf6' },
    { id: 'language' as Section, label: t('زبان', 'Language'), icon: Globe, color: '#10b981' },
    { id: 'notifications' as Section, label: t('اعلان‌ها', 'Notifications'), icon: Bell, color: '#f59e0b' },
    { id: 'privacy' as Section, label: t('حریم خصوصی', 'Privacy'), icon: Shield, color: '#ef4444' },
    { id: 'security' as Section, label: t('امنیت', 'Security'), icon: Lock, color: '#64748b' },
    { id: 'devices' as Section, label: t('دستگاه‌های من', 'My Devices'), icon: Smartphone, color: '#06b6d4' },
  ];

  function Back() {
    return (
      <button onClick={() => setSection('main')} className="p-2 rounded-xl transition-colors" style={{ color: 'var(--text-secondary)' }}>
        <ChevronLeft size={20} />
      </button>
    );
  }

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-primary)' }} dir={language === 'fa' ? 'rtl' : 'ltr'}>
      {/* Hidden file input — always mounted so fileInputRef works in any section */}
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
      {/* Header */}
      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-4" style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border-color)' }}>
        {section !== 'main' ? <Back /> : (
          <button onClick={onClose} className="p-1 rounded-xl" style={{ color: 'var(--text-secondary)' }}>
            <X size={20} />
          </button>
        )}
        <h2 className="font-bold text-base flex-1" style={{ color: 'var(--text-primary)' }}>
          {section === 'main' ? t('تنظیمات', 'Settings') :
            menuItems.find(m => m.id === section)?.label || ''}
        </h2>
        {section === 'profile' && (
          <button onClick={saveProfile} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium text-white transition-all" style={{ background: 'var(--accent)' }}>
            {saved ? <Check size={14} /> : saving ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save size={14} />}
            <span>{saved ? t('ذخیره شد', 'Saved!') : t('ذخیره', 'Save')}</span>
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* MAIN */}
        {section === 'main' && (
          <div className="p-4 space-y-3">
            {/* Profile Card */}
            <div className="rounded-2xl p-4 flex items-center gap-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
              <div className="relative">
                <div className="w-16 h-16 rounded-full overflow-hidden flex-shrink-0">
                  {profile?.avatar_url ? (
                    <img src={profile.avatar_url} className="w-full h-full object-cover" alt="" />
                  ) : (
                    <div className="w-full h-full bg-blue-600 flex items-center justify-center">
                      <span className="text-white text-2xl font-bold">{(profile?.display_name || profile?.username || '?').charAt(0).toUpperCase()}</span>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute -bottom-1 -right-1 w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center border-2"
                  style={{ borderColor: 'var(--bg-card)' }}
                >
                  {uploadingAvatar ? <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" /> : <Camera size={12} className="text-white" />}
                </button>
              </div>
              <div className="flex-1 min-w-0 text-right">
                <p className="font-bold text-base truncate" style={{ color: 'var(--text-primary)' }}>{profile?.display_name || profile?.username}</p>
                <p className="text-sm truncate" style={{ color: 'var(--text-secondary)' }}>@{profile?.username}</p>
                {profile?.bio && <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>{profile.bio}</p>}
              </div>
            </div>

            {/* Settings Menu */}
            <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
              {menuItems.map((item, idx) => (
                <button
                  key={item.id}
                  onClick={() => setSection(item.id)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-right transition-colors hover:bg-white/5"
                  style={{ borderBottom: idx < menuItems.length - 1 ? '1px solid var(--border-color)' : 'none' }}
                >
                  <ChevronLeft size={16} style={{ color: 'var(--text-muted)' }} />
                  <span className="flex-1 text-sm" style={{ color: 'var(--text-primary)' }}>{item.label}</span>
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${item.color}20` }}>
                    <item.icon size={16} style={{ color: item.color }} />
                  </div>
                </button>
              ))}
            </div>

            {/* Sign Out */}
            <button
              onClick={signOut}
              className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-right transition-colors"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}
            >
              <span className="flex-1 text-sm text-red-400">{t('خروج از حساب', 'Sign Out')}</span>
              <LogOut size={16} className="text-red-400" />
            </button>
          </div>
        )}

        {/* PROFILE */}
        {section === 'profile' && (
          <div className="p-4 space-y-4">
            {/* Avatar */}
            <div className="flex justify-center">
              <div className="relative">
                <div className="w-24 h-24 rounded-full overflow-hidden">
                  {profile?.avatar_url ? (
                    <img src={profile.avatar_url} className="w-full h-full object-cover" alt="" />
                  ) : (
                    <div className="w-full h-full bg-blue-600 flex items-center justify-center">
                      <span className="text-white text-3xl font-bold">{(profile?.display_name || profile?.username || '?').charAt(0).toUpperCase()}</span>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute bottom-0 right-0 w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center border-2 shadow-lg"
                  style={{ borderColor: 'var(--bg-primary)' }}
                >
                  {uploadingAvatar ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Camera size={14} className="text-white" />}
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                <div className="px-4 py-2 border-b" style={{ borderColor: 'var(--border-color)' }}>
                  <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>نام نمایشی</label>
                  <input
                    value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full bg-transparent outline-none text-sm py-1"
                    style={{ color: 'var(--text-primary)' }}
                    placeholder="نام نمایشی"
                  />
                </div>
                <div className="px-4 py-2 border-b" style={{ borderColor: 'var(--border-color)' }}>
                  <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>نام کاربری</label>
                  <input
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    className="w-full bg-transparent outline-none text-sm py-1"
                    style={{ color: 'var(--text-primary)' }}
                    placeholder="username"
                    dir="ltr"
                  />
                </div>
                <div className="px-4 py-2 border-b" style={{ borderColor: 'var(--border-color)' }}>
                  <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>بیوگرافی</label>
                  <textarea
                    value={bio} onChange={(e) => setBio(e.target.value)}
                    className="w-full bg-transparent outline-none text-sm py-1 resize-none"
                    style={{ color: 'var(--text-primary)' }}
                    placeholder="درباره خودت بنویس..."
                    rows={3}
                  />
                </div>
                <div className="px-4 py-2 border-b" style={{ borderColor: 'var(--border-color)' }}>
                  <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>شماره تلفن</label>
                  <input
                    value={phone} onChange={(e) => setPhone(e.target.value)}
                    className="w-full bg-transparent outline-none text-sm py-1"
                    style={{ color: 'var(--text-primary)' }}
                    placeholder="۰۹۱۲۳۴۵۶۷۸۹"
                    dir="ltr"
                  />
                </div>
                <div className="px-4 py-2">
                  <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>تاریخ تولد</label>
                  <input
                    type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)}
                    className="w-full bg-transparent outline-none text-sm py-1"
                    style={{ color: 'var(--text-primary)' }}
                    dir="ltr"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* APPEARANCE */}
        {section === 'appearance' && (
          <div className="p-4 space-y-4">
            <div className="rounded-2xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
              <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>تم رنگی</p>
              <div className="grid grid-cols-2 gap-3">
                {/* Dark */}
                <button
                  onClick={() => setTheme('dark')}
                  className="relative rounded-2xl overflow-hidden border-2 transition-all"
                  style={{ borderColor: theme === 'dark' ? 'var(--accent)' : 'var(--border-color)', aspectRatio: '3/2' }}
                >
                  <div className="w-full h-full p-2 flex flex-col gap-1" style={{ background: '#030712' }}>
                    <div className="flex gap-1">
                      <div className="w-4 h-2 rounded" style={{ background: '#1f2937' }} />
                      <div className="flex-1 h-2 rounded" style={{ background: '#374151' }} />
                    </div>
                    <div className="flex-1 flex items-end gap-1">
                      <div className="h-4 w-16 rounded-lg" style={{ background: '#2563eb' }} />
                    </div>
                    <div className="flex gap-1 items-end justify-end">
                      <div className="h-4 w-12 rounded-lg" style={{ background: '#1f2937' }} />
                    </div>
                  </div>
                  {theme === 'dark' && (
                    <div className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center">
                      <Check size={10} className="text-white" />
                    </div>
                  )}
                  <div className="absolute bottom-0 inset-x-0 p-1 text-center">
                    <span className="text-xs font-medium" style={{ color: '#9ca3af' }}>
                      <Moon size={10} className="inline-block ml-1" />
                      تاریک
                    </span>
                  </div>
                </button>

                {/* Light */}
                <button
                  onClick={() => setTheme('light')}
                  className="relative rounded-2xl overflow-hidden border-2 transition-all"
                  style={{ borderColor: theme === 'light' ? 'var(--accent)' : 'var(--border-color)', aspectRatio: '3/2' }}
                >
                  <div className="w-full h-full p-2 flex flex-col gap-1" style={{ background: '#f8fafc' }}>
                    <div className="flex gap-1">
                      <div className="w-4 h-2 rounded" style={{ background: '#e2e8f0' }} />
                      <div className="flex-1 h-2 rounded" style={{ background: '#cbd5e1' }} />
                    </div>
                    <div className="flex-1 flex items-end gap-1">
                      <div className="h-4 w-16 rounded-lg" style={{ background: '#2563eb' }} />
                    </div>
                    <div className="flex gap-1 items-end justify-end">
                      <div className="h-4 w-12 rounded-lg" style={{ background: '#e2e8f0' }} />
                    </div>
                  </div>
                  {theme === 'light' && (
                    <div className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center">
                      <Check size={10} className="text-white" />
                    </div>
                  )}
                  <div className="absolute bottom-0 inset-x-0 p-1 text-center">
                    <span className="text-xs font-medium" style={{ color: '#64748b' }}>
                      <Sun size={10} className="inline-block ml-1" />
                      روشن
                    </span>
                  </div>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* LANGUAGE */}
        {section === 'language' && (
          <div className="p-4 space-y-3">
            <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
              {[
                { code: 'fa' as const, label: 'فارسی', sublabel: 'Persian', flag: '🇮🇷' },
                { code: 'en' as const, label: 'English', sublabel: 'انگلیسی', flag: '🇬🇧' },
              ].map((lang, idx) => (
                <button
                  key={lang.code}
                  onClick={() => setLanguage(lang.code)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-right transition-colors hover:bg-white/5"
                  style={{ borderBottom: idx === 0 ? '1px solid var(--border-color)' : 'none' }}
                >
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${language === lang.code ? 'border-blue-500 bg-blue-500' : ''}`} style={{ borderColor: language === lang.code ? '#3b82f6' : 'var(--border-color)' }}>
                    {language === lang.code && <Check size={10} className="text-white" />}
                  </div>
                  <span className="text-2xl">{lang.flag}</span>
                  <div className="flex-1 text-right">
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{lang.label}</p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{lang.sublabel}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* NOTIFICATIONS */}
        {section === 'notifications' && (
          <div className="p-4 space-y-3">
            <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
              {[
                { label: 'صدای اعلان', sublabel: 'صدا هنگام دریافت پیام', value: notifSound, onChange: setNotifSound },
                { label: 'پیش‌نمایش پیام', sublabel: 'نمایش محتوای پیام در اعلان', value: msgPreview, onChange: setMsgPreview },
              ].map((item, idx) => (
                <div key={idx} className="flex items-center gap-3 px-4 py-3.5" style={{ borderBottom: idx < 1 ? '1px solid var(--border-color)' : 'none' }}>
                  <button
                    onClick={() => { item.onChange(!item.value); setTimeout(saveNotifications, 100); }}
                    className="w-12 h-6 rounded-full transition-all flex-shrink-0 relative"
                    style={{ background: item.value ? 'var(--accent)' : 'var(--bg-input)' }}
                  >
                    <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${item.value ? 'left-6' : 'left-0.5'}`} />
                  </button>
                  <div className="flex-1 text-right">
                    <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{item.label}</p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{item.sublabel}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SECURITY */}
        {section === 'security' && (
          <div className="p-4 space-y-3">
            <div className="rounded-2xl overflow-hidden p-4 space-y-3" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>تغییر رمز عبور</p>
              <div className="relative">
                <input
                  type={showOld ? 'text' : 'password'} value={oldPw} onChange={(e) => setOldPw(e.target.value)}
                  placeholder="رمز عبور فعلی"
                  className="w-full pr-4 pl-10 py-3 rounded-xl text-sm outline-none"
                  style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-input)' }}
                />
                <button type="button" onClick={() => setShowOld(!showOld)} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }}>
                  {showOld ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <div className="relative">
                <input
                  type={showNew ? 'text' : 'password'} value={newPw} onChange={(e) => setNewPw(e.target.value)}
                  placeholder="رمز عبور جدید (حداقل ۶ کاراکتر)"
                  className="w-full pr-4 pl-10 py-3 rounded-xl text-sm outline-none"
                  style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-input)' }}
                />
                <button type="button" onClick={() => setShowNew(!showNew)} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }}>
                  {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {pwError && <p className="text-xs text-red-400">{pwError}</p>}
              {pwSuccess && <p className="text-xs text-green-400">رمز عبور با موفقیت تغییر کرد ✓</p>}
              <button
                onClick={changePassword}
                disabled={saving}
                className="w-full py-3 rounded-xl text-sm font-medium text-white transition-all"
                style={{ background: 'var(--accent)' }}
              >
                {saving ? 'در حال ذخیره...' : 'تغییر رمز عبور'}
              </button>
            </div>
          </div>
        )}

        {/* PRIVACY */}
        {section === 'privacy' && (
          <div className="p-4 space-y-3">
            <div className="rounded-2xl p-4 text-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
              <Shield size={32} className="mx-auto mb-3 text-blue-400" />
              <p className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{t('حریم خصوصی شما محافظت می‌شود', 'Your privacy is protected')}</p>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t('اطلاعات شما کاملاً رمزنگاری شده و در اختیار هیچ شخص ثالثی قرار نمی‌گیرد.', 'Your data is fully encrypted and never shared with third parties.')}</p>
            </div>
          </div>
        )}

        {/* DEVICES */}
        {section === 'devices' && (
          <div className="p-4 space-y-3">
            {!sessionInfo && !sessionLoading && (
              <button
                onClick={loadSessionInfo}
                className="w-full py-3 rounded-xl text-sm font-medium text-white"
                style={{ background: 'var(--accent)' }}
              >
                {t('نمایش اطلاعات دستگاه', 'Show Device Info')}
              </button>
            )}
            {sessionLoading && (
              <div className="flex justify-center py-8">
                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            {sessionInfo && (
              <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(6,182,212,0.12)' }}>
                    <Smartphone size={20} className="text-cyan-400" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{sessionInfo.device_name}</p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('دستگاه فعلی', 'Current device')} ✓</p>
                  </div>
                  <div className="ms-auto w-2 h-2 rounded-full bg-green-400" />
                </div>
                <div className="px-4 py-3 space-y-2.5">
                  <div className="flex justify-between text-sm">
                    <span style={{ color: 'var(--text-secondary)' }}>IP</span>
                    <span className="font-mono text-xs" style={{ color: 'var(--text-primary)' }}>{sessionInfo.ip}</span>
                  </div>
                  {sessionInfo.created_at && (
                    <div className="flex justify-between text-sm">
                      <span style={{ color: 'var(--text-secondary)' }}>{t('ورود', 'Signed in')}</span>
                      <span className="text-xs" style={{ color: 'var(--text-primary)' }}>{new Date(sessionInfo.created_at).toLocaleDateString(language === 'fa' ? 'fa-IR' : 'en-GB', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  )}
                  <div className="pt-1 text-xs break-all" style={{ color: 'var(--text-muted)' }}>{sessionInfo.user_agent}</div>
                </div>
              </div>
            )}
            <div className="rounded-2xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {t('هر بار که با دستگاه جدیدی وارد شوید، دستگاه قبلی به صورت خودکار از حساب خارج می‌شود.', 'Logging in from a new device automatically signs out the previous one.')}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
