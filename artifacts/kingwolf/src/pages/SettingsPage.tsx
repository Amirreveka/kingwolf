import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { User, Camera, Lock, Bell, Shield, Palette, Globe, ChevronLeft, Save, X, Eye, EyeOff, Check, Sun, Moon, LogOut, Smartphone, Info, MessageCircle, Video, ShieldCheck, Users, Move, HardDrive, Trash2, Image, FileVideo, File } from 'lucide-react';
import { THEMES } from '../contexts/ThemeContext';
import type { Theme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import { Profile } from '../types';
import { WolfLogo } from '../components/ui/WolfLogo';
import { Avatar } from '../components/Avatar';

type Section = 'main' | 'profile' | 'appearance' | 'language' | 'notifications' | 'privacy' | 'security' | 'devices' | 'about' | 'storage';

const CROP_SIZE = 290;

function AvatarCropModal({ src, onConfirm, onCancel, fa }: {
  src: string;
  onConfirm: (blob: Blob) => void;
  onCancel: () => void;
  fa: boolean;
}) {
  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null);
  const posRef = useRef({ x: 0, y: 0, scale: 1 });
  const [, rerender] = useState(0);

  function updatePos(next: { x: number; y: number; scale: number }) {
    if (!imgEl) return;
    const iw = imgEl.naturalWidth * next.scale;
    const ih = imgEl.naturalHeight * next.scale;
    posRef.current = {
      x: Math.min(0, Math.max(CROP_SIZE - iw, next.x)),
      y: Math.min(0, Math.max(CROP_SIZE - ih, next.y)),
      scale: next.scale,
    };
    rerender(n => n + 1);
  }

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      setImgEl(img);
      const s = CROP_SIZE / Math.min(img.naturalWidth, img.naturalHeight);
      const x = (CROP_SIZE - img.naturalWidth * s) / 2;
      const y = (CROP_SIZE - img.naturalHeight * s) / 2;
      posRef.current = { x, y, scale: s };
      rerender(n => n + 1);
    };
    img.src = src;
  }, [src]);

  const drag = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null);
  const pinch = useRef<{ dist: number; scale: number } | null>(null);

  function onTouchStart(e: React.TouchEvent) {
    e.preventDefault();
    if (e.touches.length === 1) {
      drag.current = { sx: e.touches[0].clientX, sy: e.touches[0].clientY, px: posRef.current.x, py: posRef.current.y };
    } else if (e.touches.length === 2) {
      const d = Math.hypot(e.touches[1].clientX - e.touches[0].clientX, e.touches[1].clientY - e.touches[0].clientY);
      pinch.current = { dist: d, scale: posRef.current.scale };
      drag.current = null;
    }
  }

  function onTouchMove(e: React.TouchEvent) {
    e.preventDefault();
    if (e.touches.length === 1 && drag.current) {
      updatePos({ x: drag.current.px + e.touches[0].clientX - drag.current.sx, y: drag.current.py + e.touches[0].clientY - drag.current.sy, scale: posRef.current.scale });
    } else if (e.touches.length === 2 && pinch.current) {
      const d = Math.hypot(e.touches[1].clientX - e.touches[0].clientX, e.touches[1].clientY - e.touches[0].clientY);
      const s = Math.max(0.3, Math.min(6, pinch.current.scale * (d / pinch.current.dist)));
      updatePos({ x: posRef.current.x, y: posRef.current.y, scale: s });
    }
  }

  function onTouchEnd() { drag.current = null; pinch.current = null; }

  const mouse = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null);
  function onMouseDown(e: React.MouseEvent) { mouse.current = { sx: e.clientX, sy: e.clientY, px: posRef.current.x, py: posRef.current.y }; }
  function onMouseMove(e: React.MouseEvent) {
    if (!mouse.current) return;
    updatePos({ x: mouse.current.px + e.clientX - mouse.current.sx, y: mouse.current.py + e.clientY - mouse.current.sy, scale: posRef.current.scale });
  }
  function onMouseUp() { mouse.current = null; }
  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    updatePos({ x: posRef.current.x, y: posRef.current.y, scale: Math.max(0.3, Math.min(6, posRef.current.scale - e.deltaY * 0.002)) });
  }

  function confirm() {
    if (!imgEl) return;
    const canvas = document.createElement('canvas');
    canvas.width = CROP_SIZE;
    canvas.height = CROP_SIZE;
    const ctx = canvas.getContext('2d')!;
    const { x, y, scale } = posRef.current;
    ctx.drawImage(imgEl, x, y, imgEl.naturalWidth * scale, imgEl.naturalHeight * scale);
    canvas.toBlob(blob => { if (blob) onConfirm(blob); }, 'image/jpeg', 0.92);
  }

  const { x, y, scale } = posRef.current;

  return createPortal(
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-6 px-4" style={{ background: 'rgba(0,0,0,0.93)', zIndex: 10000 }}>
      <p className="text-white font-bold text-lg">{fa ? 'انتخاب عکس پروفایل' : 'Crop Profile Photo'}</p>
      <div
        style={{ width: CROP_SIZE, height: CROP_SIZE, borderRadius: '50%', overflow: 'hidden', background: '#111', touchAction: 'none', cursor: 'grab', position: 'relative', flexShrink: 0, boxShadow: '0 0 0 3px rgba(255,255,255,0.25)' }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onWheel={onWheel}
      >
        {imgEl && (
          <img
            src={src}
            style={{ position: 'absolute', left: x, top: y, width: imgEl.naturalWidth * scale, height: imgEl.naturalHeight * scale, userSelect: 'none', pointerEvents: 'none', maxWidth: 'none' }}
            alt=""
            draggable={false}
          />
        )}
      </div>
      <p className="text-white/50 text-sm text-center flex items-center gap-2">
        <Move size={14} />{fa ? 'بکش تا جابجا کنی · اسکرول برای زوم' : 'Drag to move · Scroll / pinch to zoom'}
      </p>
      <div className="flex gap-4">
        <button onClick={onCancel} className="px-6 py-2.5 rounded-full text-white text-sm font-medium" style={{ background: 'rgba(255,255,255,0.15)' }}>
          {fa ? 'لغو' : 'Cancel'}
        </button>
        <button onClick={confirm} className="px-6 py-2.5 rounded-full text-white text-sm font-bold" style={{ background: 'var(--accent)' }}>
          {fa ? 'تأیید' : 'Confirm'}
        </button>
      </div>
    </div>,
    document.body
  );
}

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
  const [cropSource, setCropSource] = useState<string | null>(null);
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
  const [notifVibrate, setNotifVibrate] = useState(profile?.settings?.notification_vibrate ?? true);
  const [notifGroups, setNotifGroups] = useState(profile?.settings?.notification_groups ?? true);
  const [notifCalls, setNotifCalls] = useState(profile?.settings?.notification_calls ?? true);
  const [notifShowName, setNotifShowName] = useState(profile?.settings?.notification_show_name ?? true);

  // Privacy state
  const [stealthMode, setStealthMode] = useState(false);

  // Storage quota state
  const [storageInfo, setStorageInfo] = useState<{ quota: number; used: number; percent: number } | null>(null);

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

  useEffect(() => {
    const token = localStorage.getItem('kingwolf_token');
    if (!token) return;
    fetch('/api/profile/stealth', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setStealthMode(!!d?.stealth_mode))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('kingwolf_token');
    fetch('/api/profile/storage', {
      headers: { Authorization: `Bearer ${token}` }
    }).then(r => r.json()).then(d => setStorageInfo(d)).catch(() => {});
  }, []);

  async function toggleStealth(val: boolean) {
    setStealthMode(val);
    const token = localStorage.getItem('kingwolf_token');
    try {
      await fetch('/api/profile/stealth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ enabled: val }),
      });
    } catch {}
  }

  function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    e.target.value = '';
    const reader = new FileReader();
    reader.onload = ev => {
      const dataUrl = ev.target?.result as string;
      if (dataUrl) setCropSource(dataUrl);
    };
    reader.readAsDataURL(file);
  }

  async function handleCropConfirm(blob: Blob) {
    setCropSource(null);
    if (!user) return;
    setUploadingAvatar(true);
    const croppedFile = new File([blob], `avatar-${Date.now()}.jpg`, { type: 'image/jpeg' });
    try {
      const { data: uploadData, error: upErr } = await supabase.storage.from('avatars').upload(`${user.id}/${Date.now()}.jpg`, croppedFile, { upsert: true });
      if (!upErr && uploadData) {
        const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(uploadData.path);
        const avatarUrl = urlData.publicUrl + `?t=${Date.now()}`;
        await supabase.from('profiles').update({ avatar_url: avatarUrl }).eq('id', user.id);
        await refreshProfile();
      } else {
        const fr = new FileReader();
        fr.onload = async ev2 => {
          const dataUrl = ev2.target?.result as string;
          if (dataUrl) {
            await supabase.from('profiles').update({ avatar_url: dataUrl }).eq('id', user.id);
            await refreshProfile();
          }
        };
        fr.readAsDataURL(croppedFile);
      }
    } catch {}
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
    if (!newPw || newPw.length < 6) { setPwError(t('رمز جدید باید حداقل ۶ کاراکتر باشد', 'New password must be at least 6 characters')); return; }
    setPwError(''); setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPw });
    setSaving(false);
    if (error) { setPwError(t('خطا در تغییر رمز عبور', 'Error changing password')); return; }
    setPwSuccess(true);
    setOldPw(''); setNewPw('');
    setTimeout(() => setPwSuccess(false), 2000);
  }

  async function saveNotifications() {
    if (!user) return;
    await supabase.from('profiles').update({
      settings: {
        ...profile?.settings,
        notification_sound: notifSound,
        message_preview: msgPreview,
        notification_vibrate: notifVibrate,
        notification_groups: notifGroups,
        notification_calls: notifCalls,
        notification_show_name: notifShowName,
      },
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
    { id: 'profile' as Section, label: t('ویرایش پروفایل', 'Edit Profile'), icon: User, color: '#3b82f6', grad: 'linear-gradient(135deg,#3b82f6,#6366f1)' },
    { id: 'appearance' as Section, label: t('ظاهر', 'Appearance'), icon: Palette, color: '#a855f7', grad: 'linear-gradient(135deg,#a855f7,#ec4899)' },
    { id: 'language' as Section, label: t('زبان', 'Language'), icon: Globe, color: '#10b981', grad: 'linear-gradient(135deg,#10b981,#06b6d4)' },
    { id: 'notifications' as Section, label: t('اعلان‌ها', 'Notifications'), icon: Bell, color: '#f59e0b', grad: 'linear-gradient(135deg,#f59e0b,#ef4444)' },
    { id: 'privacy' as Section, label: t('حریم خصوصی', 'Privacy'), icon: Shield, color: '#ef4444', grad: 'linear-gradient(135deg,#ef4444,#b91c1c)' },
    { id: 'security' as Section, label: t('امنیت', 'Security'), icon: Lock, color: '#64748b', grad: 'linear-gradient(135deg,#475569,#1e293b)' },
    { id: 'devices' as Section, label: t('دستگاه‌های من', 'My Devices'), icon: Smartphone, color: '#06b6d4', grad: 'linear-gradient(135deg,#06b6d4,#0ea5e9)' },
    { id: 'storage' as Section, label: t('فضای ذخیره‌سازی', 'Storage'), icon: HardDrive, color: '#a78bfa', grad: 'linear-gradient(135deg,#7c3aed,#a78bfa)' },
    { id: 'about' as Section, label: t('درباره ما', 'About Us'), icon: Info, color: '#f59e0b', grad: 'linear-gradient(135deg,#f59e0b,#d97706)' },
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
      {cropSource && (
        <AvatarCropModal
          src={cropSource}
          fa={language === 'fa'}
          onConfirm={handleCropConfirm}
          onCancel={() => setCropSource(null)}
        />
      )}
      {/* Header */}
      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-4 kw-header-accent" style={{ background: 'var(--bg-card)', borderBottom: '1px solid rgba(168,85,247,0.15)' }}>
        {section !== 'main' ? <Back /> : (
          <button onClick={onClose} className="p-1 rounded-xl" style={{ color: 'var(--text-secondary)' }}>
            <X size={20} />
          </button>
        )}
        {section === 'main' && <WolfLogo size={28} glow />}
        <h2 className="font-bold text-base flex-1" style={{ color: 'var(--text-primary)' }}>
          {section === 'main' ? t('تنظیمات', 'Settings') :
           section === 'about' ? t('درباره ما', 'About Us') :
            menuItems.find(m => m.id === section)?.label || ''}
        </h2>
        {section === 'profile' && (
          <button onClick={saveProfile} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium text-white transition-all" style={{ background: 'var(--accent)' }}>
            {saved ? <Check size={14} /> : saving ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save size={14} />}
            <span>{saved ? t('ذخیره شد', 'Saved!') : t('ذخیره', 'Save')}</span>
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto" style={{ paddingBottom: 'calc(72px + env(safe-area-inset-bottom))' }}>
        {/* MAIN */}
        {section === 'main' && (
          <div className="p-4 space-y-3">
            {/* Profile Card */}
            <div className="rounded-2xl p-4 flex items-center gap-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
              <div className="relative">
                <Avatar src={profile?.avatar_url} name={profile?.display_name} username={profile?.username} size={64} />
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
              {[
                { id: 'profile' as Section, icon: User, label: t('ویرایش پروفایل', 'Edit Profile'), sub: t('نام، بیو، عکس', 'Name, bio, photo'), grad: 'linear-gradient(135deg,#7c3aed,#a855f7)', shadow: 'rgba(124,58,237,0.4)' },
                { id: 'appearance' as Section, icon: Palette, label: t('ظاهر', 'Appearance'), sub: t('تم رنگی و نمایش', 'Theme & display'), grad: 'linear-gradient(135deg,#f59e0b,#f97316)', shadow: 'rgba(245,158,11,0.4)' },
                { id: 'language' as Section, icon: Globe, label: t('زبان', 'Language'), sub: t('فارسی / انگلیسی', 'Persian / English'), grad: 'linear-gradient(135deg,#3b82f6,#6366f1)', shadow: 'rgba(59,130,246,0.4)' },
                { id: 'notifications' as Section, icon: Bell, label: t('اعلان‌ها', 'Notifications'), sub: t('صدا، لرزش، پیش‌نمایش', 'Sound, vibration, preview'), grad: 'linear-gradient(135deg,#ef4444,#f97316)', shadow: 'rgba(239,68,68,0.4)' },
                { id: 'privacy' as Section, icon: Shield, label: t('حریم خصوصی', 'Privacy'), sub: t('مشاهده و دسترسی', 'Visibility & access'), grad: 'linear-gradient(135deg,#10b981,#059669)', shadow: 'rgba(16,185,129,0.4)' },
                { id: 'security' as Section, icon: Lock, label: t('امنیت', 'Security'), sub: t('رمز عبور و تأیید هویت', 'Password & authentication'), grad: 'linear-gradient(135deg,#eab308,#ca8a04)', shadow: 'rgba(234,179,8,0.4)' },
                { id: 'devices' as Section, icon: Smartphone, label: t('دستگاه‌های من', 'My Devices'), sub: t('دستگاه‌های فعال', 'Active sessions'), grad: 'linear-gradient(135deg,#06b6d4,#0284c7)', shadow: 'rgba(6,182,212,0.4)' },
                { id: 'storage' as Section, icon: HardDrive, label: t('فضای ذخیره‌سازی', 'Storage'), sub: t('مدیریت فایل‌ها و فضا', 'Manage files & space'), grad: 'linear-gradient(135deg,#7c3aed,#a78bfa)', shadow: 'rgba(124,58,237,0.4)' },
                { id: 'about' as Section, icon: Info, label: t('درباره ما', 'About Us'), sub: t('ویژگی‌ها و نسخه', 'Features & version'), grad: 'linear-gradient(135deg,#ec4899,#db2777)', shadow: 'rgba(236,72,153,0.4)' },
              ].map((item, idx, arr) => (
                <button
                  key={item.id}
                  onClick={() => setSection(item.id)}
                  className="kw-card flex items-center gap-4 w-full px-4 py-3.5 transition-all hover:bg-white/5 active:bg-white/10"
                  style={{ borderBottom: idx < arr.length - 1 ? '1px solid var(--border-color)' : 'none' }}
                >
                  <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0"
                    style={{ background: item.grad, boxShadow: `0 4px 12px ${item.shadow}`, willChange: 'transform' }}>
                    <item.icon size={20} className="text-white" />
                  </div>
                  <div className="flex-1 text-right">
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{item.label}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{item.sub}</p>
                  </div>
                  <ChevronLeft size={16} style={{ color: 'var(--text-muted)' }} />
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
                <Avatar src={profile?.avatar_url} name={profile?.display_name} username={profile?.username} size={96} />
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
                  <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{t('نام نمایشی', 'Display Name')}</label>
                  <input
                    value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full bg-transparent outline-none text-sm py-1"
                    style={{ color: 'var(--text-primary)' }}
                    placeholder={t('نام نمایشی', 'Display Name')}
                  />
                </div>
                <div className="px-4 py-2 border-b" style={{ borderColor: 'var(--border-color)' }}>
                  <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{t('نام کاربری', 'Username')}</label>
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
                  <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{t('بیوگرافی', 'Bio')}</label>
                  <textarea
                    value={bio} onChange={(e) => setBio(e.target.value)}
                    className="w-full bg-transparent outline-none text-sm py-1 resize-none"
                    style={{ color: 'var(--text-primary)' }}
                    placeholder={t('درباره خودت بنویس...', 'Write about yourself...')}
                    rows={3}
                  />
                </div>
                <div className="px-4 py-2 border-b" style={{ borderColor: 'var(--border-color)' }}>
                  <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{t('شماره تلفن', 'Phone Number')}</label>
                  <input
                    value={phone} onChange={(e) => setPhone(e.target.value)}
                    className="w-full bg-transparent outline-none text-sm py-1"
                    style={{ color: 'var(--text-primary)' }}
                    placeholder="09123456789"
                    dir="ltr"
                  />
                </div>
                <div className="px-4 py-2">
                  <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{t('تاریخ تولد', 'Birthday')}</label>
                  <input
                    type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)}
                    className="w-full bg-transparent outline-none text-sm py-1"
                    style={{ color: 'var(--text-primary)' }}
                    dir="ltr"
                  />
                </div>
              </div>

              {storageInfo && (
                <div className="p-4 rounded-xl border" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-secondary, var(--bg-card))' }}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t('فضای ذخیره‌سازی', 'Storage')}</span>
                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {(storageInfo.used / 1024 / 1024).toFixed(1)} MB / {(storageInfo.quota / 1024 / 1024 / 1024).toFixed(1)} GB
                    </span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${Math.min(storageInfo.percent, 100)}%`,
                        background: storageInfo.percent > 80
                          ? 'linear-gradient(90deg, #ef4444, #f97316)'
                          : 'linear-gradient(90deg, #7c3aed, #a855f7, #06b6d4)',
                        filter: 'drop-shadow(0 0 4px rgba(168,85,247,0.5))',
                      }}
                    />
                  </div>
                  <div className="flex justify-between mt-1.5">
                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{storageInfo.percent}% {t('استفاده شده', 'used')}</span>
                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{((storageInfo.quota - storageInfo.used) / 1024 / 1024).toFixed(0)} MB {t('آزاد', 'free')}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* APPEARANCE */}
        {section === 'appearance' && (
          <div className="p-4 space-y-4">
            <div className="rounded-2xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
              <p className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>{t('تم رنگی', 'Color Theme')}</p>
              <div className="grid grid-cols-3 gap-3">
                {THEMES.map(th => (
                  <button
                    key={th.id}
                    onClick={() => setTheme(th.id as Theme)}
                    className="relative flex flex-col items-center gap-2 transition-all"
                    style={{ outline: 'none' }}
                  >
                    {/* Theme preview swatch */}
                    <div
                      className="w-full rounded-2xl overflow-hidden relative"
                      style={{
                        aspectRatio: '1/1',
                        border: theme === th.id ? `2.5px solid ${th.preview[1]}` : '2px solid rgba(255,255,255,0.08)',
                        background: th.preview[0],
                        boxShadow: theme === th.id ? `0 0 12px ${th.preview[1]}55` : 'none',
                        transition: 'border 0.2s, box-shadow 0.2s',
                      }}
                    >
                      {/* Mini chat mockup */}
                      <div className="absolute inset-0 p-2 flex flex-col justify-end gap-1">
                        <div className="flex justify-start">
                          <div className="rounded-xl px-2 py-0.5" style={{ background: th.preview[2], width: '55%', height: 8 }} />
                        </div>
                        <div className="flex justify-end">
                          <div className="rounded-xl px-2 py-0.5" style={{ background: th.preview[1], width: '45%', height: 8 }} />
                        </div>
                        <div className="flex justify-start">
                          <div className="rounded-xl px-2 py-0.5" style={{ background: th.preview[2], width: '65%', height: 8 }} />
                        </div>
                      </div>
                      {theme === th.id && (
                        <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center"
                          style={{ background: th.preview[1] }}>
                          <Check size={10} color="white" />
                        </div>
                      )}
                    </div>
                    <span className="text-[11px] font-medium text-center truncate w-full" style={{ color: 'var(--text-secondary)' }}>
                      {language === 'fa' ? th.labelFa : th.label}
                    </span>
                  </button>
                ))}
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
          <div className="space-y-0">
            {/* Section header */}
            <div className="px-4 pt-5 pb-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg, #ef4444, #f97316)', boxShadow: '0 4px 14px rgba(239,68,68,0.45)' }}>
                <Bell size={18} className="text-white" />
              </div>
              <div>
                <p className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>{t('اعلان‌ها', 'Notifications')}</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('تنظیمات اطلاع‌رسانی', 'Notification preferences')}</p>
              </div>
            </div>

            {/* Global toggles */}
            <div className="mx-4 rounded-2xl overflow-hidden mb-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
              {/* پیش‌نمایش پیام */}
              <div className="flex items-center justify-between py-3 px-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(59,130,246,0.15)' }}>
                    <Eye size={15} className="text-blue-400" />
                  </div>
                  <div>
                    <span className="text-sm text-white">{t('پیش‌نمایش پیام', 'Message Preview')}</span>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('نمایش متن در اعلان', 'Show text in notification')}</p>
                  </div>
                </div>
                <button
                  onClick={() => { setMsgPreview(v => !v); setTimeout(saveNotifications, 100); }}
                  className={`kw-toggle flex-shrink-0 ${msgPreview ? 'on' : ''}`}
                >
                  <span className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-all duration-300"
                    style={{ left: msgPreview ? '26px' : '2px' }} />
                </button>
              </div>
              {/* نام فرستنده */}
              <div className="flex items-center justify-between py-3 px-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(168,85,247,0.15)' }}>
                    <User size={15} className="text-purple-400" />
                  </div>
                  <div>
                    <span className="text-sm text-white">{t('نام فرستنده', 'Sender Name')}</span>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('نمایش نام در صفحه قفل', 'Show name on lock screen')}</p>
                  </div>
                </div>
                <button
                  onClick={() => { setNotifShowName(v => !v); setTimeout(saveNotifications, 100); }}
                  className={`kw-toggle flex-shrink-0 ${notifShowName ? 'on' : ''}`}
                >
                  <span className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-all duration-300"
                    style={{ left: notifShowName ? '26px' : '2px' }} />
                </button>
              </div>
            </div>

            {/* پیام‌های خصوصی */}
            <div className="kw-section-divider mx-4 mb-2"><span>{t('پیام‌های خصوصی', 'Private Messages')}</span></div>
            <div className="mx-4 rounded-2xl overflow-hidden mb-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
              <div className="flex items-center justify-between py-3 px-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(59,130,246,0.15)' }}>
                    <Bell size={15} className="text-blue-400" />
                  </div>
                  <span className="text-sm text-white">{t('اعلان‌ها', 'Notifications')}</span>
                </div>
                <button
                  onClick={() => { setNotifSound(v => !v); setTimeout(saveNotifications, 100); }}
                  className={`kw-toggle flex-shrink-0 ${notifSound ? 'on' : ''}`}
                >
                  <span className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-all duration-300"
                    style={{ left: notifSound ? '26px' : '2px' }} />
                </button>
              </div>
              <div className="flex items-center justify-between py-3 px-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(251,146,60,0.15)' }}>
                    <MessageCircle size={15} className="text-orange-400" />
                  </div>
                  <span className="text-sm text-white">{t('صدا', 'Sound')}</span>
                </div>
                <button
                  onClick={() => { setNotifSound(v => !v); setTimeout(saveNotifications, 100); }}
                  className={`kw-toggle flex-shrink-0 ${notifSound ? 'on' : ''}`}
                >
                  <span className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-all duration-300"
                    style={{ left: notifSound ? '26px' : '2px' }} />
                </button>
              </div>
              <div className="flex items-center justify-between py-3 px-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(52,211,153,0.15)' }}>
                    <Smartphone size={15} className="text-emerald-400" />
                  </div>
                  <span className="text-sm text-white">{t('لرزش', 'Vibration')}</span>
                </div>
                <button
                  onClick={() => { setNotifVibrate(v => !v); setTimeout(saveNotifications, 100); }}
                  className={`kw-toggle flex-shrink-0 ${notifVibrate ? 'on' : ''}`}
                >
                  <span className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-all duration-300"
                    style={{ left: notifVibrate ? '26px' : '2px' }} />
                </button>
              </div>
              <div className="flex items-center justify-between py-3 px-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(96,165,250,0.15)' }}>
                    <Eye size={15} className="text-blue-300" />
                  </div>
                  <span className="text-sm text-white">{t('پیش‌نمایش', 'Preview')}</span>
                </div>
                <button
                  onClick={() => { setMsgPreview(v => !v); setTimeout(saveNotifications, 100); }}
                  className={`kw-toggle flex-shrink-0 ${msgPreview ? 'on' : ''}`}
                >
                  <span className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-all duration-300"
                    style={{ left: msgPreview ? '26px' : '2px' }} />
                </button>
              </div>
            </div>

            {/* گروه‌ها */}
            <div className="kw-section-divider mx-4 mb-2"><span>{t('گروه‌ها', 'Groups')}</span></div>
            <div className="mx-4 rounded-2xl overflow-hidden mb-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
              <div className="flex items-center justify-between py-3 px-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(244,114,182,0.15)' }}>
                    <Bell size={15} className="text-pink-400" />
                  </div>
                  <span className="text-sm text-white">{t('اعلان‌ها', 'Notifications')}</span>
                </div>
                <button
                  onClick={() => { setNotifGroups(v => !v); setTimeout(saveNotifications, 100); }}
                  className={`kw-toggle flex-shrink-0 ${notifGroups ? 'on' : ''}`}
                >
                  <span className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-all duration-300"
                    style={{ left: notifGroups ? '26px' : '2px' }} />
                </button>
              </div>
              <div className="flex items-center justify-between py-3 px-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(251,146,60,0.15)' }}>
                    <MessageCircle size={15} className="text-orange-400" />
                  </div>
                  <span className="text-sm text-white">{t('صدا', 'Sound')}</span>
                </div>
                <button
                  onClick={() => { setNotifGroups(v => !v); setTimeout(saveNotifications, 100); }}
                  className={`kw-toggle flex-shrink-0 ${notifGroups ? 'on' : ''}`}
                >
                  <span className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-all duration-300"
                    style={{ left: notifGroups ? '26px' : '2px' }} />
                </button>
              </div>
              <div className="flex items-center justify-between py-3 px-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(52,211,153,0.15)' }}>
                    <Smartphone size={15} className="text-emerald-400" />
                  </div>
                  <span className="text-sm text-white">{t('لرزش', 'Vibration')}</span>
                </div>
                <button
                  onClick={() => { setNotifVibrate(v => !v); setTimeout(saveNotifications, 100); }}
                  className={`kw-toggle flex-shrink-0 ${notifVibrate ? 'on' : ''}`}
                >
                  <span className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-all duration-300"
                    style={{ left: notifVibrate ? '26px' : '2px' }} />
                </button>
              </div>
              <div className="flex items-center justify-between py-3 px-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(96,165,250,0.15)' }}>
                    <Eye size={15} className="text-blue-300" />
                  </div>
                  <span className="text-sm text-white">{t('پیش‌نمایش', 'Preview')}</span>
                </div>
                <button
                  onClick={() => { setMsgPreview(v => !v); setTimeout(saveNotifications, 100); }}
                  className={`kw-toggle flex-shrink-0 ${msgPreview ? 'on' : ''}`}
                >
                  <span className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-all duration-300"
                    style={{ left: msgPreview ? '26px' : '2px' }} />
                </button>
              </div>
            </div>

            {/* کانال‌ها */}
            <div className="kw-section-divider mx-4 mb-2"><span>{t('کانال‌ها', 'Channels')}</span></div>
            <div className="mx-4 rounded-2xl overflow-hidden mb-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
              <div className="flex items-center justify-between py-3 px-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(167,139,250,0.15)' }}>
                    <Bell size={15} className="text-violet-400" />
                  </div>
                  <span className="text-sm text-white">{t('اعلان‌ها', 'Notifications')}</span>
                </div>
                <button
                  onClick={() => { setNotifGroups(v => !v); setTimeout(saveNotifications, 100); }}
                  className={`kw-toggle flex-shrink-0 ${notifGroups ? 'on' : ''}`}
                >
                  <span className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-all duration-300"
                    style={{ left: notifGroups ? '26px' : '2px' }} />
                </button>
              </div>
              <div className="flex items-center justify-between py-3 px-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(251,146,60,0.15)' }}>
                    <MessageCircle size={15} className="text-orange-400" />
                  </div>
                  <span className="text-sm text-white">{t('صدا', 'Sound')}</span>
                </div>
                <button
                  onClick={() => { setNotifSound(v => !v); setTimeout(saveNotifications, 100); }}
                  className={`kw-toggle flex-shrink-0 ${notifSound ? 'on' : ''}`}
                >
                  <span className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-all duration-300"
                    style={{ left: notifSound ? '26px' : '2px' }} />
                </button>
              </div>
              <div className="flex items-center justify-between py-3 px-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(96,165,250,0.15)' }}>
                    <Eye size={15} className="text-blue-300" />
                  </div>
                  <span className="text-sm text-white">{t('پیش‌نمایش', 'Preview')}</span>
                </div>
                <button
                  onClick={() => { setMsgPreview(v => !v); setTimeout(saveNotifications, 100); }}
                  className={`kw-toggle flex-shrink-0 ${msgPreview ? 'on' : ''}`}
                >
                  <span className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-all duration-300"
                    style={{ left: msgPreview ? '26px' : '2px' }} />
                </button>
              </div>
            </div>

            {/* تماس‌ها */}
            <div className="kw-section-divider mx-4 mb-2"><span>{t('تماس‌ها', 'Calls')}</span></div>
            <div className="mx-4 rounded-2xl overflow-hidden mb-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
              <div className="flex items-center justify-between py-3 px-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(52,211,153,0.15)' }}>
                    <Bell size={15} className="text-emerald-400" />
                  </div>
                  <span className="text-sm text-white">{t('اعلان تماس ورودی', 'Incoming Call Alerts')}</span>
                </div>
                <button
                  onClick={() => { setNotifCalls(v => !v); setTimeout(saveNotifications, 100); }}
                  className={`kw-toggle flex-shrink-0 ${notifCalls ? 'on' : ''}`}
                >
                  <span className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-all duration-300"
                    style={{ left: notifCalls ? '26px' : '2px' }} />
                </button>
              </div>
              <div className="flex items-center justify-between py-3 px-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(251,146,60,0.15)' }}>
                    <MessageCircle size={15} className="text-orange-400" />
                  </div>
                  <span className="text-sm text-white">{t('صدا', 'Sound')}</span>
                </div>
                <button
                  onClick={() => { setNotifSound(v => !v); setTimeout(saveNotifications, 100); }}
                  className={`kw-toggle flex-shrink-0 ${notifSound ? 'on' : ''}`}
                >
                  <span className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-all duration-300"
                    style={{ left: notifSound ? '26px' : '2px' }} />
                </button>
              </div>
              <div className="flex items-center justify-between py-3 px-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(52,211,153,0.15)' }}>
                    <Smartphone size={15} className="text-emerald-400" />
                  </div>
                  <span className="text-sm text-white">{t('لرزش', 'Vibration')}</span>
                </div>
                <button
                  onClick={() => { setNotifVibrate(v => !v); setTimeout(saveNotifications, 100); }}
                  className={`kw-toggle flex-shrink-0 ${notifVibrate ? 'on' : ''}`}
                >
                  <span className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-all duration-300"
                    style={{ left: notifVibrate ? '26px' : '2px' }} />
                </button>
              </div>
            </div>

            {/* Push notification activation card */}
            <div className="mx-4 mb-4">
              <PushNotifCard t={t} />
            </div>
          </div>
        )}

        {/* SECURITY */}
        {section === 'security' && (
          <div className="p-4 space-y-3">
            <div className="rounded-2xl overflow-hidden p-4 space-y-3" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{t('تغییر رمز عبور', 'Change Password')}</p>
              <div className="relative">
                <input
                  type={showOld ? 'text' : 'password'} value={oldPw} onChange={(e) => setOldPw(e.target.value)}
                  placeholder={t('رمز عبور فعلی', 'Current password')}
                  className="kw-input w-full pr-4 pl-10 py-3 rounded-xl text-sm outline-none"
                  style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-input)' }}
                />
                <button type="button" onClick={() => setShowOld(!showOld)} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }}>
                  {showOld ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <div className="relative">
                <input
                  type={showNew ? 'text' : 'password'} value={newPw} onChange={(e) => setNewPw(e.target.value)}
                  placeholder={t('رمز عبور جدید (حداقل ۶ کاراکتر)', 'New password (min 6 characters)')}
                  className="kw-input w-full pr-4 pl-10 py-3 rounded-xl text-sm outline-none"
                  style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-input)' }}
                />
                <button type="button" onClick={() => setShowNew(!showNew)} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }}>
                  {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {pwError && <p className="text-xs text-red-400">{pwError}</p>}
              {pwSuccess && <p className="text-xs text-green-400">{t('رمز عبور با موفقیت تغییر کرد', 'Password changed successfully')} ✓</p>}
              <button
                onClick={changePassword}
                disabled={saving}
                className="kw-btn-primary w-full py-3 rounded-xl text-sm font-medium text-white transition-all"
              >
                {saving ? t('در حال ذخیره...', 'Saving...') : t('تغییر رمز عبور', 'Change Password')}
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

            {/* Stealth Mode toggle */}
            <div
              className="rounded-2xl overflow-hidden"
              style={{
                background: 'var(--bg-card)',
                border: stealthMode ? '1px solid rgba(168,85,247,0.4)' : '1px solid var(--border-color)',
                boxShadow: stealthMode ? '0 0 14px rgba(168,85,247,0.18)' : 'none',
                filter: stealthMode ? 'drop-shadow(0 0 12px rgba(168,85,247,0.15))' : undefined,
                transition: 'box-shadow 0.3s, border-color 0.3s, filter 0.3s',
              }}
            >
              <div className="flex items-center justify-between py-3.5 px-4">
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{
                      background: stealthMode ? 'rgba(168,85,247,0.2)' : 'rgba(100,116,139,0.15)',
                      transition: 'background 0.3s',
                    }}
                  >
                    <span style={{ fontSize: 18 }}>👻</span>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-white">{t('حالت مخفی', 'Stealth Mode')}</span>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {t('پنهان کردن وضعیت آنلاین و خواندن پیام‌ها', 'Hide online status & read receipts')}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => toggleStealth(!stealthMode)}
                  className={`kw-toggle flex-shrink-0 ${stealthMode ? 'on' : ''}`}
                >
                  <span
                    className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-all duration-300"
                    style={{ left: stealthMode ? '26px' : '2px' }}
                  />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STORAGE */}
        {section === 'storage' && <StorageSection t={t} apiBase={(import.meta.env.VITE_API_BASE as string) || '/api'} />}

        {/* ABOUT */}
        {section === 'about' && (
          <div className="kw-tab-in">
            {/* Hero */}
            <div className="relative overflow-hidden px-6 py-10 text-center" style={{ background: 'linear-gradient(135deg, #0d0033, #1a0066, #000d1a)' }}>
              <div className="absolute inset-0 opacity-20" style={{ background: 'radial-gradient(circle at 30% 50%, #7c3aed 0%, transparent 50%), radial-gradient(circle at 70% 50%, #2563eb 0%, transparent 50%)' }} />
              <div className="relative">
                <WolfLogo size={64} className="mx-auto mb-4" />
                <h1 className="text-2xl font-bold text-white mb-2">KingWolf Messenger</h1>
                <p className="text-sm text-purple-300">{t('نسل جدید پیام‌رسان', 'Next-gen messenger')}</p>
              </div>
            </div>
            {/* Feature cards */}
            <div className="p-4 space-y-3">
              {([
                { icon: Shield, title: t('رمزنگاری سرتاسری', 'End-to-End Encryption'), desc: t('تمام پیام‌ها با پروتکل E2E رمزنگاری می‌شوند', 'All messages encrypted with E2E protocol'), color: '#4ade80', bg: 'rgba(74,222,128,0.1)' },
                { icon: Video, title: t('تماس تصویری HD', 'HD Video Calls'), desc: t('تماس تصویری با کیفیت بالا با WebRTC', 'High-quality video calls via WebRTC'), color: '#60a5fa', bg: 'rgba(96,165,250,0.1)' },
                { icon: Users, title: t('گروه‌های بزرگ', 'Large Groups'), desc: t('ایجاد گروه تا ۱۰۰۰ عضو', 'Create groups up to 1000 members'), color: '#f472b6', bg: 'rgba(244,114,182,0.1)' },
                { icon: Bell, title: t('اعلان‌های فوری', 'Instant Notifications'), desc: t('اطلاع‌رسانی لحظه‌ای روی صفحه قفل', 'Real-time alerts on lock screen'), color: '#fb923c', bg: 'rgba(251,146,60,0.1)' },
                { icon: Palette, title: t('۹ تم رنگی', '9 Color Themes'), desc: t('شخصی‌سازی کامل ظاهر برنامه', 'Fully customise the app appearance'), color: '#a78bfa', bg: 'rgba(167,139,250,0.1)' },
                { icon: Smartphone, title: t('نصب روی موبایل', 'Install on Mobile'), desc: t('به عنوان اپ نیتیو نصب کنید', 'Install as a native app'), color: '#34d399', bg: 'rgba(52,211,153,0.1)' },
              ] as { icon: React.ElementType; title: string; desc: string; color: string; bg: string }[]).map(f => (
                <div key={f.title} className="flex items-center gap-4 p-4 rounded-2xl" style={{ background: f.bg, border: `1px solid ${f.color}25` }}>
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: `${f.color}20` }}>
                    <f.icon size={22} style={{ color: f.color }} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">{f.title}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'rgba(156,163,175,0.8)' }}>{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            {/* Creator card */}
            <div className="mx-4 mb-3 p-4 rounded-2xl flex items-center gap-3" style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.2)' }}>
              <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg,#7c3aed,#a855f7)' }}>
                <span style={{ fontSize: 18 }}>👑</span>
              </div>
              <div>
                <p className="text-sm font-bold text-white">awir.rk</p>
                <p className="text-xs" style={{ color: 'rgba(167,139,250,0.8)' }}>{t('سازنده و طراح KingWolf', 'Creator & Designer of KingWolf')}</p>
              </div>
            </div>
            {/* Version footer */}
            <div className="p-6 text-center space-y-1">
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('نسخه ۱.۰.۰ · KingWolf Messenger', 'Version 1.0.0 · KingWolf Messenger')}</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>{t('ساخته‌شده با ❤️ برای کاربران ایرانی', 'Made with ❤️ for Iranian users')}</p>
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

// ── Push Notification Card ────────────────────────────────────────────────────
function PushNotifCard({ t }: { t: (fa: string, en: string) => string }) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'granted' | 'denied'>(() => {
    if (!('Notification' in window)) return 'denied';
    if (Notification.permission === 'granted') return 'granted';
    if (Notification.permission === 'denied') return 'denied';
    return 'idle';
  });

  async function enable() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setStatus('denied');
      return;
    }
    setStatus('loading');
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { setStatus('denied'); return; }
      const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api';
      const reg = await navigator.serviceWorker.ready;
      const keyRes = await fetch(`${API_BASE}/push/vapid-key`);
      if (!keyRes.ok) { setStatus('denied'); return; }
      const { publicKey } = await keyRes.json();
      if (!publicKey) { setStatus('denied'); return; }
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
      const token = localStorage.getItem('kingwolf_token');
      await fetch(`${API_BASE}/push/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ endpoint: sub.endpoint, keys: { p256dh: arrayBufferToBase64(sub.getKey('p256dh')!), auth: arrayBufferToBase64(sub.getKey('auth')!) } }),
      });
      setStatus('granted');
    } catch { setStatus('denied'); }
  }

  function urlBase64ToUint8Array(b64: string) {
    const padding = '='.repeat((4 - b64.length % 4) % 4);
    const base64 = (b64 + padding).replace(/-/g, '+').replace(/_/g, '/');
    return Uint8Array.from([...atob(base64)].map(c => c.charCodeAt(0)));
  }
  function arrayBufferToBase64(buf: ArrayBuffer) {
    return btoa(String.fromCharCode(...new Uint8Array(buf)));
  }

  if (status === 'granted') {
    return (
      <div className="rounded-2xl p-4 flex items-center gap-3" style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.2)' }}>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(52,211,153,0.15)' }}>
          <Bell size={16} className="text-emerald-400" />
        </div>
        <p className="text-sm text-emerald-400 font-medium">{t('اعلان‌های Push فعال است ✓', 'Push notifications enabled ✓')}</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl p-4 space-y-3" style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.2)' }}>
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(124,58,237,0.15)' }}>
          <Bell size={16} className="text-purple-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white">{t('اعلان‌های Push', 'Push Notifications')}</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {status === 'denied'
              ? t('مرورگر اجازه نداد — از تنظیمات مرورگر فعال کنید', 'Browser denied — enable from browser settings')
              : t('برای دریافت پیام حتی وقتی اپ بسته است', 'Receive messages even when the app is closed')}
          </p>
        </div>
      </div>
      {status !== 'denied' && (
        <button
          onClick={enable}
          disabled={status === 'loading'}
          className="w-full py-2.5 rounded-xl text-sm font-bold text-white transition-all"
          style={{ background: 'linear-gradient(135deg,#7c3aed,#a855f7)' }}
        >
          {status === 'loading'
            ? <div className="flex items-center justify-center gap-2"><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />{t('در حال فعال‌سازی...', 'Activating...')}</div>
            : t('فعال‌سازی اعلان‌های Push', 'Enable Push Notifications')}
        </button>
      )}
    </div>
  );
}

// ── Storage Section ──────────────────────────────────────────────────────────
function StorageSection({ t, apiBase }: { t: (fa: string, en: string) => string; apiBase: string }) {
  const [storageInfo, setStorageInfo] = useState<{ quota: number; used: number; percent: number } | null>(null);
  const [files, setFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  function fmtBytes(b: number) {
    if (b >= 1073741824) return (b / 1073741824).toFixed(2) + ' GB';
    if (b >= 1048576) return (b / 1048576).toFixed(1) + ' MB';
    if (b >= 1024) return (b / 1024).toFixed(0) + ' KB';
    return b + ' B';
  }

  async function load() {
    setLoading(true);
    const token = localStorage.getItem('kingwolf_token');
    try {
      const [sRes, fRes] = await Promise.all([
        fetch(`${apiBase}/profile/storage`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${apiBase}/profile/files`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (sRes.ok) setStorageInfo(await sRes.json());
      if (fRes.ok) setFiles(await fRes.json());
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function deleteFile(msgId: string) {
    setDeleting(msgId);
    const token = localStorage.getItem('kingwolf_token');
    await fetch(`${apiBase}/profile/files/${msgId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    setFiles(p => p.filter(f => f.id !== msgId));
    await load();
    setDeleting(null);
  }

  const images = files.filter(f => f.file_type?.startsWith('image/'));
  const videos = files.filter(f => f.file_type?.startsWith('video/'));
  const others = files.filter(f => !f.file_type?.startsWith('image/') && !f.file_type?.startsWith('video/'));

  const categories = [
    { label: t('تصاویر', 'Images'), items: images, Icon: Image, color: '#60a5fa' },
    { label: t('ویدیو‌ها', 'Videos'), items: videos, Icon: FileVideo, color: '#f472b6' },
    { label: t('فایل‌های دیگر', 'Other files'), items: others, Icon: File, color: '#fb923c' },
  ];

  return (
    <div className="kw-tab-in p-4 space-y-4">
      {/* Usage bar card */}
      <div className="rounded-2xl p-5" style={{ background: 'rgba(8,15,35,0.6)', border: '1px solid rgba(124,58,237,0.2)', backdropFilter: 'blur(16px)' }}>
        <div className="flex items-center gap-2 mb-4">
          <HardDrive size={16} className="text-purple-400" />
          <h3 className="font-bold text-sm text-white">{t('فضای ذخیره‌سازی', 'Storage')}</h3>
        </div>
        {loading ? (
          <div className="flex justify-center py-4"><div className="w-5 h-5 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" /></div>
        ) : storageInfo ? (
          <>
            <div className="flex justify-between text-xs mb-2">
              <span style={{ color: 'rgba(167,139,250,0.9)' }}>{fmtBytes(storageInfo.used)} {t('مصرف شده', 'used')}</span>
              <span style={{ color: 'rgba(156,163,175,0.7)' }}>{fmtBytes(storageInfo.quota)} {t('کل', 'total')}</span>
            </div>
            <div className="h-3 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <div className="h-full rounded-full transition-all duration-700"
                style={{ width: `${Math.min(100, storageInfo.percent)}%`, background: storageInfo.percent > 85 ? 'linear-gradient(90deg,#ef4444,#f87171)' : 'linear-gradient(90deg,#7c3aed,#a78bfa)' }} />
            </div>
            <div className="grid grid-cols-3 gap-2 mt-4">
              {categories.map(cat => {
                const catBytes = cat.items.reduce((s, f) => s + (f.file_size || 0), 0);
                return (
                  <div key={cat.label} className="rounded-xl p-2.5 text-center" style={{ background: `${cat.color}10`, border: `1px solid ${cat.color}20` }}>
                    <cat.Icon size={14} style={{ color: cat.color, margin: '0 auto 4px' }} />
                    <p className="text-[10px] font-semibold" style={{ color: cat.color }}>{cat.label}</p>
                    <p className="text-[10px]" style={{ color: 'rgba(156,163,175,0.7)' }}>{fmtBytes(catBytes)}</p>
                    <p className="text-[10px]" style={{ color: 'rgba(156,163,175,0.5)' }}>{cat.items.length} {t('فایل', 'files')}</p>
                  </div>
                );
              })}
            </div>
          </>
        ) : null}
      </div>

      {/* File list by category */}
      {categories.map(cat => cat.items.length > 0 && (
        <div key={cat.label} className="rounded-2xl overflow-hidden" style={{ background: 'rgba(8,15,35,0.5)', border: `1px solid ${cat.color}18`, backdropFilter: 'blur(16px)' }}>
          <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <cat.Icon size={13} style={{ color: cat.color }} />
            <span className="text-xs font-semibold text-white">{cat.label}</span>
            <span className="text-[10px] mr-1" style={{ color: 'rgba(156,163,175,0.5)' }}>({cat.items.length})</span>
          </div>
          <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
            {cat.items.map(f => (
              <div key={f.id} className="flex items-center gap-3 px-4 py-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${cat.color}15` }}>
                  <cat.Icon size={14} style={{ color: cat.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-300 truncate">{f.file_name || t('فایل ناشناس', 'Unknown file')}</p>
                  <p className="text-[10px]" style={{ color: 'rgba(156,163,175,0.5)' }}>{fmtBytes(f.file_size || 0)} · {new Date(f.created_at).toLocaleDateString('fa-IR')}</p>
                </div>
                <button
                  onClick={() => deleteFile(f.id)}
                  disabled={deleting === f.id}
                  className="flex-shrink-0 p-1.5 rounded-lg transition-colors"
                  style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.2)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.1)'}
                >
                  {deleting === f.id ? <div className="w-3 h-3 border border-red-400 border-t-transparent rounded-full animate-spin" /> : <Trash2 size={12} />}
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}

      {!loading && files.length === 0 && (
        <div className="text-center py-10">
          <HardDrive size={32} className="mx-auto mb-2 text-gray-600" />
          <p className="text-xs text-gray-500">{t('هیچ فایلی آپلود نشده', 'No files uploaded yet')}</p>
        </div>
      )}
    </div>
  );
}
