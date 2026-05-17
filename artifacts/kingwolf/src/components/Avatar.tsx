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

  // Fallback: site logo (/icon-192.png), with WolfLogo as final fallback
  return (
    <div
      className={`rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 ${className}`}
      style={{ width: size, height: size, background: '#1e3a5f', ...style }}
    >
      <img
        src="/icon-192.png"
        alt={name || username || ''}
        className="w-full h-full object-cover"
        onError={e => {
          const el = e.currentTarget;
          el.style.display = 'none';
          const parent = el.parentElement;
          if (parent) {
            const fallback = document.createElement('div');
            fallback.style.cssText = 'width:100%;height:100%;display:flex;align-items:center;justify-content:center;';
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('width', String(Math.round(size * 0.72)));
            svg.setAttribute('height', String(Math.round(size * 0.72)));
            svg.setAttribute('viewBox', '0 0 24 24');
            svg.setAttribute('fill', 'white');
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', 'M12 2L4 7v10l8 5 8-5V7L12 2z');
            svg.appendChild(path);
            fallback.appendChild(svg);
            parent.appendChild(fallback);
          }
        }}
      />
    </div>
  );
}
