import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { WolfLogo } from './ui/WolfLogo';

interface AvatarProps {
  src?: string | null;
  name?: string | null;
  username?: string | null;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  viewable?: boolean;
}

export function Avatar({ src, name, username, size = 40, className = '', style = {}, viewable = false }: AvatarProps) {
  const [imgError, setImgError] = useState(false);
  const [showViewer, setShowViewer] = useState(false);

  const hasValidSrc = src && src !== '' && !src.includes('null') && !imgError;

  if (hasValidSrc) {
    return (
      <>
        <div
          className={`rounded-full overflow-hidden flex-shrink-0 ${viewable ? 'cursor-pointer' : ''} ${className}`}
          style={{ width: size, height: size, background: 'var(--bg-secondary)', ...style }}
          onClick={viewable ? () => setShowViewer(true) : undefined}
        >
          <img
            src={src!}
            alt={name || username || ''}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        </div>
        {showViewer && createPortal(
          <div
            className="fixed inset-0 flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.92)', zIndex: 9999 }}
            onClick={() => setShowViewer(false)}
          >
            <button
              onClick={e => { e.stopPropagation(); setShowViewer(false); }}
              className="absolute p-2.5 rounded-full"
              style={{ top: 'max(16px, env(safe-area-inset-top))', right: 16, background: 'rgba(255,255,255,0.15)' }}
            >
              <X size={20} color="white" />
            </button>
            <img
              src={src!}
              alt={name || username || ''}
              style={{ maxWidth: '92vw', maxHeight: '86vh', borderRadius: 12, objectFit: 'contain' }}
              onClick={e => e.stopPropagation()}
            />
            {(name || username) && (
              <p className="absolute bottom-8 text-white font-semibold text-sm"
                style={{ textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
                {name || username}
              </p>
            )}
          </div>,
          document.body
        )}
      </>
    );
  }

  // Fallback: WolfLogo (app logo)
  return (
    <div
      className={`rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 ${className}`}
      style={{ width: size, height: size, background: 'linear-gradient(135deg,#1e0038,#2d0055)', ...style }}
    >
      <WolfLogo size={Math.round(size * 0.82)} glow={false} />
    </div>
  );
}
