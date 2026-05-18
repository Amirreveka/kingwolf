import { useId } from 'react';
import { useTheme } from '../../contexts/ThemeContext';

interface WolfLogoProps {
  size?: number;
  glow?: boolean;
  className?: string;
  animated?: boolean;
}

export function WolfLogo({ size = 32, glow = true, className = '', animated = false }: WolfLogoProps) {
  const uid = useId().replace(/:/g, '');
  return (
    <div
      className={`inline-flex items-center justify-center flex-shrink-0 ${animated ? 'kw-float' : ''} ${className}`}
      style={{
        width: size,
        height: size,
        filter: glow ? `drop-shadow(0 0 ${Math.round(size * 0.12)}px rgba(168,85,247,0.65))` : undefined,
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 112"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id={`bg-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#1e0038" />
            <stop offset="100%" stopColor="#3b0066" />
          </linearGradient>
          <linearGradient id={`wg-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#c084fc" />
            <stop offset="100%" stopColor="#818cf8" />
          </linearGradient>
          <linearGradient id={`cg-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fde68a" />
            <stop offset="100%" stopColor="#f59e0b" />
          </linearGradient>
        </defs>

        {/* Background rounded rect — starts below crown, fills the rest */}
        <rect x="0" y="14" width="100" height="98" rx="22" fill={`url(#bg-${uid})`} />

        {/* Crown — fully above background, no CSS clipping */}
        <polygon points="50,3 43,19 34,11 39,27 50,22 61,27 66,11 57,19" fill={`url(#cg-${uid})`} />
        <circle cx="50" cy="3"  r="4"   fill="#fbbf24" />
        <circle cx="34" cy="11" r="2.8" fill="#fbbf24" />
        <circle cx="66" cy="11" r="2.8" fill="#fbbf24" />

        {/* Ears */}
        <polygon points="22,54 10,22 38,44" fill={`url(#wg-${uid})`} />
        <polygon points="78,54 90,22 62,44" fill={`url(#wg-${uid})`} />
        <polygon points="24,52 16,30 36,46" fill="#a78bfa" opacity="0.45" />
        <polygon points="76,52 84,30 64,46" fill="#a78bfa" opacity="0.45" />

        {/* Head */}
        <ellipse cx="50" cy="68" rx="36" ry="32" fill={`url(#wg-${uid})`} />

        {/* Snout */}
        <ellipse cx="50" cy="82" rx="16" ry="11" fill="#4c1d95" />
        <ellipse cx="50" cy="76" rx="6"  ry="4.5" fill="#0F172A" />

        {/* Eyes */}
        <ellipse cx="36" cy="61" rx="6"   ry="7.5" fill="#0F172A" />
        <ellipse cx="64" cy="61" rx="6"   ry="7.5" fill="#0F172A" />
        <circle  cx="38" cy="59" r="2.5"           fill="#06b6d4" opacity="0.95" />
        <circle  cx="66" cy="59" r="2.5"           fill="#06b6d4" opacity="0.95" />

        {/* Smile */}
        <path d="M44 87 Q50 93 56 87" stroke="#0F172A" strokeWidth="1.8" fill="none" strokeLinecap="round" />
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
