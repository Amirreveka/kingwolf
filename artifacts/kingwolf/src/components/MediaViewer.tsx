import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, ZoomIn, ZoomOut, RotateCw, Download } from 'lucide-react';

interface MediaViewerProps {
  src: string;
  type?: 'image' | 'video';
  caption?: string;
  onClose: () => void;
}

export function MediaViewer({ src, type = 'image', caption, onClose }: MediaViewerProps) {
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const dragStart = useRef({ mx: 0, my: 0, px: 0, py: 0 });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === '+' || e.key === '=') setScale(s => Math.min(s + 0.25, 5));
      if (e.key === '-') setScale(s => Math.max(s - 0.25, 0.25));
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);

  const node = (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center kw-fade-in"
      style={{ background: 'rgba(0,0,0,0.96)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Top controls */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3 z-10"
           style={{ background: 'linear-gradient(to bottom,rgba(0,0,0,.7),transparent)' }}>
        <div className="flex items-center gap-2">
          <button onClick={() => setScale(s => Math.min(s + 0.25, 5))}
                  className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors">
            <ZoomIn size={18} className="text-white" />
          </button>
          <button onClick={() => setScale(s => Math.max(s - 0.25, 0.25))}
                  className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors">
            <ZoomOut size={18} className="text-white" />
          </button>
          <button onClick={() => setRotation(r => r + 90)}
                  className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors">
            <RotateCw size={18} className="text-white" />
          </button>
          <button onClick={() => { setScale(1); setRotation(0); setPos({ x: 0, y: 0 }); }}
                  className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white/70 text-xs transition-colors">
            Reset
          </button>
        </div>
        <div className="flex items-center gap-2">
          <a href={src} download target="_blank" rel="noopener"
             className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors">
            <Download size={18} className="text-white" />
          </a>
          <button onClick={onClose}
                  className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-all hover:rotate-90 duration-200">
            <X size={18} className="text-white" />
          </button>
        </div>
      </div>

      {/* Media */}
      <div
        className="select-none"
        style={{
          transform: `translate(${pos.x}px,${pos.y}px) scale(${scale}) rotate(${rotation}deg)`,
          transition: isDragging ? 'none' : 'transform 0.18s cubic-bezier(0.4,0,0.2,1)',
          cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default',
          willChange: 'transform',
          maxWidth: '90vw',
          maxHeight: '82vh',
        }}
        onPointerDown={e => {
          if (scale <= 1) return;
          setIsDragging(true);
          dragStart.current = { mx: e.clientX, my: e.clientY, px: pos.x, py: pos.y };
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={e => {
          if (!isDragging) return;
          setPos({
            x: dragStart.current.px + e.clientX - dragStart.current.mx,
            y: dragStart.current.py + e.clientY - dragStart.current.my,
          });
        }}
        onPointerUp={() => setIsDragging(false)}
        onWheel={e => { e.preventDefault(); setScale(s => Math.max(0.25, Math.min(5, s - e.deltaY * 0.002))); }}
      >
        {type === 'video' ? (
          <video src={src} controls autoPlay playsInline
                 className="rounded-lg max-w-[90vw] max-h-[82vh]"
                 style={{ filter: 'drop-shadow(0 8px 40px rgba(0,0,0,0.9))' }} />
        ) : (
          <img src={src} alt={caption || ''}
               className="rounded-lg max-w-[90vw] max-h-[82vh] object-contain"
               style={{ filter: 'drop-shadow(0 8px 40px rgba(0,0,0,0.9))' }}
               draggable={false} />
        )}
      </div>

      {/* Caption */}
      {caption && (
        <div className="absolute bottom-0 left-0 right-0 px-6 py-4 text-center"
             style={{ background: 'linear-gradient(to top,rgba(0,0,0,.7),transparent)' }}>
          <p className="text-white/80 text-sm" style={{ textShadow: '0 1px 4px rgba(0,0,0,.8)' }}>{caption}</p>
        </div>
      )}
    </div>
  );

  return createPortal(node, document.body);
}
