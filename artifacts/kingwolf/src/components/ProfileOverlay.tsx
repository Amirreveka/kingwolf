import { X, MessageCircle, Phone, Video } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useTheme } from '../contexts/ThemeContext';
import { NeonBadge } from './NeonBadge';

interface ProfileOverlayProps {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  bio?: string;
  onClose: () => void;
  onOpenChat?: () => void;
  onCall?: (type: 'voice' | 'video') => void;
}

export function ProfileOverlay({ userId, username, displayName, avatarUrl, bio, onClose, onOpenChat, onCall }: ProfileOverlayProps) {
  const { t, language } = useTheme();

  const content = (
    <div className="fixed inset-0 z-[9998] flex items-end sm:items-center justify-center kw-fade-in"
         style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
         onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-sm rounded-t-3xl sm:rounded-3xl overflow-hidden kw-page-enter"
           style={{
             background: 'linear-gradient(135deg, rgba(17,24,39,0.98), rgba(3,7,18,0.98))',
             border: '1px solid rgba(168,85,247,0.2)',
           }}>
        {/* Header */}
        <div className="relative h-28 overflow-hidden"
             style={{ background: 'linear-gradient(135deg, rgba(168,85,247,0.3), rgba(6,182,212,0.15))' }}>
          <div className="absolute inset-0"
               style={{
                 backgroundImage: 'linear-gradient(rgba(168,85,247,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(168,85,247,.04) 1px,transparent 1px)',
                 backgroundSize: '20px 20px',
               }} />
          <button onClick={onClose}
                  className="absolute top-3 right-3 p-1.5 rounded-full bg-black/30 text-white/70 hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Avatar */}
        <div className="flex flex-col items-center -mt-12 pb-6 px-6">
          <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-[#030712] mb-3 kw-story-ring">
            {avatarUrl ? (
              <img src={avatarUrl} className="w-full h-full object-cover" alt={displayName || username} />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-white"
                   style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)' }}>
                {(displayName || username || '?').charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{displayName || username}</h2>
          <p className="text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>@{username}</p>
          <NeonBadge userId={userId} size="sm" language={language} />
          {bio && <p className="text-sm text-center mt-2 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{bio}</p>}

          {/* Actions */}
          <div className="flex gap-3 mt-5 w-full">
            {onOpenChat && (
              <button onClick={onOpenChat}
                      className="flex-1 flex flex-col items-center gap-1 py-3 rounded-2xl transition-all active:scale-95"
                      style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)', filter: 'drop-shadow(0 0 8px rgba(168,85,247,0.4))' }}>
                <MessageCircle size={20} className="text-white" />
                <span className="text-white text-xs font-medium">{t('پیام', 'Message')}</span>
              </button>
            )}
            {onCall && (
              <>
                <button onClick={() => onCall('voice')}
                        className="flex-1 flex flex-col items-center gap-1 py-3 rounded-2xl transition-all active:scale-95"
                        style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)' }}>
                  <Phone size={20} className="text-green-400" />
                  <span className="text-green-400 text-xs font-medium">{t('تماس', 'Call')}</span>
                </button>
                <button onClick={() => onCall('video')}
                        className="flex-1 flex flex-col items-center gap-1 py-3 rounded-2xl transition-all active:scale-95"
                        style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)' }}>
                  <Video size={20} className="text-blue-400" />
                  <span className="text-blue-400 text-xs font-medium">{t('ویدیو', 'Video')}</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
