import { useState } from 'react';
import { WolfLogo } from './ui/WolfLogo';

interface AvatarProps {
  src?: string | null;
  name?: string | null;
  username?: string | null;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function Avatar({ src, name, username, size = 40, className = '', style = {} }: AvatarProps) {
  const [imgError, setImgError] = useState(false);

  const hasValidSrc = src && src !== '' && !src.includes('null') && !imgError;

  if (hasValidSrc) {
    return (
      <div
        className={`rounded-full overflow-hidden flex-shrink-0 ${className}`}
        style={{ width: size, height: size, background: 'var(--bg-secondary)', ...style }}
      >
        <img
          src={src!}
          alt={name || username || ''}
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
        />
      </div>
    );
  }

  // Fallback: KingWolf logo
  return (
    <div
      className={`rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 ${className}`}
      style={{ width: size, height: size, background: '#1e3a5f', ...style }}
    >
      <WolfLogo size={Math.round(size * 0.72)} />
    </div>
  );
}
