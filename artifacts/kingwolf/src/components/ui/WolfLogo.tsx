import { useTheme } from '../../contexts/ThemeContext';

interface WolfLogoProps {
  size?: number;
  glow?: boolean;
  className?: string;
  animated?: boolean;
}

export function WolfLogo({ size = 32, glow = true, className = '', animated = false }: WolfLogoProps) {
  return (
    <div
      className={`inline-flex items-center justify-center rounded-xl ${animated ? 'kw-float' : ''} ${className}`}
      style={{
        width: size,
        height: size,
        background: 'linear-gradient(135deg, #1e0038, #3b0066)',
        filter: glow ? 'drop-shadow(0 0 8px rgba(168,85,247,0.6))' : undefined,
        flexShrink: 0,
      }}
    >
      <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="wolfGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#c084fc" />
            <stop offset="100%" stopColor="#818cf8" />
          </linearGradient>
        </defs>
        <polygon points="20,45 10,15 35,35" fill="url(#wolfGrad)" />
        <polygon points="80,45 90,15 65,35" fill="url(#wolfGrad)" />
        <polygon points="22,42 16,22 33,36" fill="#a78bfa" opacity="0.5" />
        <polygon points="78,42 84,22 67,36" fill="#a78bfa" opacity="0.5" />
        <ellipse cx="50" cy="55" rx="35" ry="30" fill="url(#wolfGrad)" />
        <ellipse cx="50" cy="68" rx="16" ry="10" fill="#4c1d95" />
        <ellipse cx="50" cy="63" rx="6" ry="4" fill="#0F172A" />
        <ellipse cx="37" cy="50" rx="5" ry="6" fill="#0F172A" />
        <ellipse cx="63" cy="50" rx="5" ry="6" fill="#0F172A" />
        <circle cx="39" cy="48" r="2" fill="#06b6d4" opacity="0.9" />
        <circle cx="65" cy="48" r="2" fill="#06b6d4" opacity="0.9" />
        <path d="M44 72 Q50 77 56 72" stroke="#0F172A" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        <polygon points="50,8 44,22 38,16 42,28 50,24 58,28 62,16 56,22" fill="#F59E0B" />
        <circle cx="50" cy="8" r="3" fill="#F59E0B" />
        <circle cx="38" cy="16" r="2" fill="#F59E0B" />
        <circle cx="62" cy="16" r="2" fill="#F59E0B" />
      </svg>
    </div>
  );
}

export function KingWolfBrand({ size = 'md', showName = true }: { size?: 'sm' | 'md' | 'lg'; showName?: boolean }) {
  const { t } = useTheme();
  const s = size === 'sm' ? 28 : size === 'lg' ? 48 : 36;
  const textSize = size === 'sm' ? 'text-sm' : size === 'lg' ? 'text-xl' : 'text-base';
  return (
    <div className="flex items-center gap-2">
      <WolfLogo size={s} glow animated={false} />
      {showName && (
        <span className={`font-black ${textSize} kw-brand-text`}>
          KingWolf
        </span>
      )}
    </div>
  );
}
