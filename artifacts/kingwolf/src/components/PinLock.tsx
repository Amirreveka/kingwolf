import { useState, useEffect, useCallback, memo } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { WolfLogo } from './ui/WolfLogo';
import { Delete } from 'lucide-react';

const PIN_KEY = 'kw_pin';

type PinMode = 'locked' | 'unlocked' | 'setup' | 'setup-confirm';

interface PinLockProps {
  children: React.ReactNode;
}

export const PinLock = memo(function PinLock({ children }: PinLockProps) {
  const { t } = useTheme();
  const [mode, setMode] = useState<PinMode>(() => {
    const pin = localStorage.getItem(PIN_KEY);
    return pin ? 'locked' : 'unlocked';
  });
  const [input, setInput] = useState('');
  const [firstPin, setFirstPin] = useState('');
  const [shake, setShake] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');

  const storedPin = localStorage.getItem(PIN_KEY);

  const triggerShake = useCallback(() => {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  }, []);

  const handleDigit = useCallback((d: string) => {
    setInput(prev => {
      if (prev.length >= 4) return prev;
      const next = prev + d;
      if (next.length === 4) {
        // Auto-submit after short delay
        setTimeout(() => handleSubmit(next), 100);
      }
      return next;
    });
    setErrorMsg('');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, firstPin, attempts, storedPin]);

  const handleBackspace = useCallback(() => {
    setInput(prev => prev.slice(0, -1));
    setErrorMsg('');
  }, []);

  function handleSubmit(pin: string) {
    if (mode === 'locked') {
      if (pin === storedPin) {
        setInput('');
        setMode('unlocked');
        setAttempts(0);
      } else {
        triggerShake();
        setInput('');
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        setErrorMsg(t(`کد اشتباه است (${newAttempts})`, `Wrong PIN (${newAttempts})`));
      }
    } else if (mode === 'setup') {
      setFirstPin(pin);
      setInput('');
      setMode('setup-confirm');
    } else if (mode === 'setup-confirm') {
      if (pin === firstPin) {
        localStorage.setItem(PIN_KEY, pin);
        setInput('');
        setMode('unlocked');
        setFirstPin('');
      } else {
        triggerShake();
        setInput('');
        setFirstPin('');
        setMode('setup');
        setErrorMsg(t('کدها یکسان نبودند، دوباره تنظیم کنید', 'PINs did not match, try again'));
      }
    }
  }

  if (mode === 'unlocked') return <>{children}</>;

  const dots = [0, 1, 2, 3];
  const numpad = ['1','2','3','4','5','6','7','8','9','','0','⌫'];

  const title = mode === 'locked'
    ? t('کد PIN را وارد کنید', 'Enter your PIN')
    : mode === 'setup'
    ? t('کد PIN جدید را وارد کنید', 'Enter new PIN')
    : t('کد PIN را تکرار کنید', 'Confirm PIN');

  return (
    <div
      className="fixed inset-0 z-[99999] flex flex-col items-center justify-center kw-cyber-bg"
      style={{ background: 'linear-gradient(135deg, #030712 0%, #0d1117 100%)' }}
    >
      {/* Grid overlay */}
      <div className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: 'linear-gradient(rgba(168,85,247,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(168,85,247,.04) 1px,transparent 1px)',
          backgroundSize: '32px 32px',
        }} />

      <div className="relative flex flex-col items-center gap-8 w-full max-w-xs px-6">
        {/* Logo */}
        <div className="flex flex-col items-center gap-2">
          <WolfLogo size={52} glow />
          <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>KingWolf</h1>
        </div>

        {/* Title */}
        <p className="text-sm text-center" style={{ color: 'var(--text-secondary)' }}>{title}</p>

        {/* PIN dots */}
        <div className={`flex gap-4 ${shake ? 'animate-[shake_.5s_ease-in-out]' : ''}`}
          style={{ animation: shake ? 'kw-shake 0.5s ease-in-out' : undefined }}>
          {dots.map(i => (
            <div key={i}
              className="w-4 h-4 rounded-full border-2 transition-all duration-150"
              style={{
                borderColor: 'rgba(168,85,247,0.6)',
                background: i < input.length ? '#a855f7' : 'transparent',
                transform: i < input.length ? 'scale(1.15)' : 'scale(1)',
                boxShadow: i < input.length ? '0 0 8px rgba(168,85,247,0.6)' : 'none',
              }}
            />
          ))}
        </div>

        {/* Error */}
        {errorMsg && (
          <p className="text-xs text-red-400 text-center -mt-4">{errorMsg}</p>
        )}

        {/* Numpad */}
        <div className="grid grid-cols-3 gap-3 w-full">
          {numpad.map((key, idx) => {
            if (key === '') return <div key={idx} />;
            if (key === '⌫') return (
              <button
                key={idx}
                onClick={handleBackspace}
                className="h-14 rounded-2xl flex items-center justify-center text-xl font-medium transition-all active:scale-95"
                style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}
              >
                <Delete size={20} />
              </button>
            );
            return (
              <button
                key={idx}
                onClick={() => handleDigit(key)}
                className="h-14 rounded-2xl flex items-center justify-center text-xl font-bold transition-all active:scale-95"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  color: 'var(--text-primary)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(168,85,247,0.15)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
              >
                {key}
              </button>
            );
          })}
        </div>

        {/* Forgot / Setup new */}
        {mode === 'locked' && (
          <button
            onClick={() => {
              if (window.confirm(t('کد PIN فراموش کردید؟ برای ریست کردن باید مجددا وارد شوید.', 'Forgot PIN? You must sign out to reset.'))) {
                localStorage.removeItem(PIN_KEY);
                localStorage.removeItem('kingwolf_token');
                window.location.reload();
              }
            }}
            className="text-xs"
            style={{ color: 'var(--text-muted)' }}
          >
            {t('فراموش کردم', 'Forgot PIN')}
          </button>
        )}
      </div>

      <style>{`
        @keyframes kw-shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-5px); }
          80% { transform: translateX(5px); }
        }
      `}</style>
    </div>
  );
});

// Hook to open PIN setup from Settings
export function usePinSetup() {
  function startSetup() {
    // Remove existing pin and trigger setup on next render - handled by PinLock
    localStorage.removeItem(PIN_KEY);
    // Dispatch custom event
    window.dispatchEvent(new CustomEvent('kw-pin-setup'));
  }
  function removePin() {
    localStorage.removeItem(PIN_KEY);
  }
  function hasPin() {
    return !!localStorage.getItem(PIN_KEY);
  }
  return { startSetup, removePin, hasPin };
}
