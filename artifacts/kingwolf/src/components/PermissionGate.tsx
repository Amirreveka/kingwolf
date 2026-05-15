import { useState, useEffect } from 'react';
import { Bell, Mic, Camera, CheckCircle, ArrowLeft } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

const STORAGE_KEY = 'kw_permissions_done';

type PermState = 'idle' | 'requesting' | 'granted' | 'denied';

interface PermItem {
  id: 'notifications' | 'microphone' | 'camera';
  icon: React.ReactNode;
  label: string;
  labelEn: string;
  desc: string;
  descEn: string;
  color: string;
  state: PermState;
}

async function requestNotifications(): Promise<PermState> {
  if (!('Notification' in window)) return 'denied';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  const result = await Notification.requestPermission();
  return result === 'granted' ? 'granted' : 'denied';
}

async function requestMicrophone(): Promise<PermState> {
  if (!navigator.mediaDevices?.getUserMedia) return 'denied';
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(t => t.stop());
    return 'granted';
  } catch {
    return 'denied';
  }
}

async function requestCamera(): Promise<PermState> {
  if (!navigator.mediaDevices?.getUserMedia) return 'denied';
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    stream.getTracks().forEach(t => t.stop());
    return 'granted';
  } catch {
    return 'denied';
  }
}

export function needsPermissionGate(): boolean {
  return !localStorage.getItem(STORAGE_KEY);
}

export function markPermissionsDone() {
  localStorage.setItem(STORAGE_KEY, '1');
}

interface Props {
  onDone: () => void;
}

export function PermissionGate({ onDone }: Props) {
  const { language } = useTheme();
  const fa = language === 'fa';

  const [perms, setPerms] = useState<PermItem[]>([
    {
      id: 'notifications',
      icon: <Bell size={24} />,
      label: 'اعلانات',
      labelEn: 'Notifications',
      desc: 'دریافت اعلان برای پیام‌های جدید حتی وقتی اپ باز نیست',
      descEn: 'Get notified for new messages even when the app is in background',
      color: '#3b82f6',
      state: 'idle',
    },
    {
      id: 'microphone',
      icon: <Mic size={24} />,
      label: 'میکروفن',
      labelEn: 'Microphone',
      desc: 'ارسال پیام صوتی و تماس‌های صوتی',
      descEn: 'Send voice messages and make voice calls',
      color: '#10b981',
      state: 'idle',
    },
    {
      id: 'camera',
      icon: <Camera size={24} />,
      label: 'دوربین',
      labelEn: 'Camera',
      desc: 'تماس‌های تصویری با دوستان',
      descEn: 'Video calls with friends',
      color: '#8b5cf6',
      state: 'idle',
    },
  ]);

  const [allDone, setAllDone] = useState(false);
  const [requesting, setRequesting] = useState(false);

  // Pre-fill already-granted permissions
  useEffect(() => {
    const checks: Partial<Record<PermItem['id'], PermState>> = {};
    if ('Notification' in window) {
      checks.notifications = Notification.permission === 'granted' ? 'granted'
        : Notification.permission === 'denied' ? 'denied' : 'idle';
    }
    setPerms(prev => prev.map(p => checks[p.id] !== undefined ? { ...p, state: checks[p.id]! } : p));
  }, []);

  function setState(id: PermItem['id'], state: PermState) {
    setPerms(prev => prev.map(p => p.id === id ? { ...p, state } : p));
  }

  async function requestOne(id: PermItem['id']) {
    setState(id, 'requesting');
    let result: PermState;
    if (id === 'notifications') result = await requestNotifications();
    else if (id === 'microphone') result = await requestMicrophone();
    else result = await requestCamera();
    setState(id, result);
  }

  async function requestAll() {
    setRequesting(true);
    await requestOne('notifications');
    await requestOne('microphone');
    await requestOne('camera');
    setRequesting(false);
    setAllDone(true);
  }

  function handleDone() {
    markPermissionsDone();
    onDone();
  }

  const allResolved = perms.every(p => p.state === 'granted' || p.state === 'denied');

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center p-6"
      style={{ background: 'var(--bg-primary)' }}
      dir={fa ? 'rtl' : 'ltr'}
    >
      {/* Header */}
      <div className="mb-5 text-center max-w-xs">
        <h2 className="text-base font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
          {fa ? 'دسترسی‌های مورد نیاز' : 'Required Permissions'}
        </h2>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {fa
            ? 'برای استفاده از تماس و پیام صوتی، دسترسی‌های زیر را بدهید'
            : 'Allow these permissions to use calls and voice messages'}
        </p>
      </div>

      {/* Permission cards */}
      <div className="w-full max-w-sm space-y-3 mb-6">
        {perms.map(p => (
          <div
            key={p.id}
            className="flex items-center gap-4 p-4 rounded-2xl border"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}
          >
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: `${p.color}20`, color: p.color }}
            >
              {p.icon}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                {fa ? p.label : p.labelEn}
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {fa ? p.desc : p.descEn}
              </p>
            </div>
            <div className="flex-shrink-0">
              {p.state === 'granted' ? (
                <CheckCircle size={22} style={{ color: '#4ade80' }} />
              ) : p.state === 'denied' ? (
                <span className="text-xs px-2 py-1 rounded-lg" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171' }}>
                  {fa ? 'رد شد' : 'Denied'}
                </span>
              ) : p.state === 'requesting' ? (
                <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: p.color, borderTopColor: 'transparent' }} />
              ) : (
                <button
                  onClick={() => requestOne(p.id)}
                  className="text-xs font-semibold px-3 py-1.5 rounded-xl transition-colors"
                  style={{ background: `${p.color}20`, color: p.color }}
                >
                  {fa ? 'اجازه' : 'Allow'}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="w-full max-w-sm space-y-2">
        {!allResolved && (
          <button
            onClick={requestAll}
            disabled={requesting}
            className="w-full py-3.5 rounded-2xl text-sm font-bold text-white transition-all flex items-center justify-center gap-2"
            style={{ background: 'var(--accent)' }}
          >
            {requesting && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            {fa ? 'اجازه دادن به همه' : 'Allow All'}
          </button>
        )}
        <button
          onClick={handleDone}
          className="w-full py-3.5 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 transition-colors"
          style={{
            background: allResolved ? 'var(--accent)' : 'var(--bg-input)',
            color: allResolved ? 'white' : 'var(--text-secondary)',
          }}
        >
          {allResolved
            ? (fa ? '✓ ورود به KingWolf' : '✓ Enter KingWolf')
            : (fa ? 'رد کردن و ادامه' : 'Skip for now')}
          {!allResolved && <ArrowLeft size={15} style={{ transform: fa ? 'rotate(180deg)' : 'none' }} />}
        </button>
      </div>

      {perms.some(p => p.state === 'denied') && (
        <div className="w-full max-w-sm mt-3 p-3 rounded-xl text-xs text-center" style={{ background: 'rgba(239,68,68,0.08)', color: '#f87171' }}>
          {fa
            ? 'برای فعال کردن دسترسی‌های رد‌شده: تنظیمات Chrome ← تنظیمات سایت ← این آدرس ← مجوزها'
            : 'To enable blocked permissions: Chrome Settings → Site Settings → this URL → Permissions'}
        </div>
      )}

      <p className="text-xs mt-3 text-center max-w-xs" style={{ color: 'var(--text-muted)' }}>
        {fa
          ? 'می‌توانید این دسترسی‌ها را بعداً از تنظیمات مرورگر تغییر دهید'
          : 'You can change these permissions later in browser settings'}
      </p>
    </div>
  );
}
