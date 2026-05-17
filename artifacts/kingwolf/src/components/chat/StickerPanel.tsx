import { memo, useState } from 'react';
import { useTheme } from '../../contexts/ThemeContext';

export type StickerCategory = {
  id: string;
  label: string;
  labelFa: string;
  icon: string;
  stickers: { id: string; emoji: string; label: string }[];
};

export const STICKER_CATEGORIES: StickerCategory[] = [
  {
    id: 'happy',
    label: 'Happy',
    labelFa: 'شاد',
    icon: '😊',
    stickers: [
      { id: 'happy_grin',    emoji: '😁', label: 'grin' },
      { id: 'happy_beam',    emoji: '😄', label: 'beam' },
      { id: 'happy_star',    emoji: '🤩', label: 'starstruck' },
      { id: 'happy_party',   emoji: '🥳', label: 'party' },
      { id: 'happy_wink',    emoji: '😉', label: 'wink' },
      { id: 'happy_cool',    emoji: '😎', label: 'cool' },
      { id: 'happy_love',    emoji: '🥰', label: 'smiling hearts' },
      { id: 'happy_blush',   emoji: '😊', label: 'blush' },
      { id: 'happy_laugh',   emoji: '🤣', label: 'laugh' },
    ],
  },
  {
    id: 'sad',
    label: 'Sad',
    labelFa: 'غمگین',
    icon: '😢',
    stickers: [
      { id: 'sad_cry',      emoji: '😢', label: 'cry' },
      { id: 'sad_sob',      emoji: '😭', label: 'sob' },
      { id: 'sad_pensive',  emoji: '😔', label: 'pensive' },
      { id: 'sad_worried',  emoji: '😟', label: 'worried' },
      { id: 'sad_broken',   emoji: '💔', label: 'broken heart' },
      { id: 'sad_frown',    emoji: '🙁', label: 'frown' },
      { id: 'sad_tired',    emoji: '😩', label: 'tired' },
      { id: 'sad_anguish',  emoji: '😧', label: 'anguish' },
      { id: 'sad_plead',    emoji: '🥺', label: 'plead' },
    ],
  },
  {
    id: 'laugh',
    label: 'Funny',
    labelFa: 'خنده',
    icon: '😂',
    stickers: [
      { id: 'laugh_rofl',   emoji: '🤣', label: 'rofl' },
      { id: 'laugh_joy',    emoji: '😂', label: 'joy' },
      { id: 'laugh_silly',  emoji: '🤪', label: 'silly' },
      { id: 'laugh_tongue', emoji: '😛', label: 'tongue' },
      { id: 'laugh_clown',  emoji: '🤡', label: 'clown' },
      { id: 'laugh_nerd',   emoji: '🤓', label: 'nerd' },
      { id: 'laugh_woozy',  emoji: '🥴', label: 'woozy' },
      { id: 'laugh_money',  emoji: '🤑', label: 'money' },
      { id: 'laugh_explode',emoji: '🤯', label: 'explode' },
    ],
  },
  {
    id: 'love',
    label: 'Love',
    labelFa: 'عشق',
    icon: '❤️',
    stickers: [
      { id: 'love_heart',   emoji: '❤️',  label: 'heart' },
      { id: 'love_kiss',    emoji: '😘',  label: 'kiss' },
      { id: 'love_smiling', emoji: '🥰',  label: 'smiling' },
      { id: 'love_sparkle', emoji: '✨',  label: 'sparkle' },
      { id: 'love_fire',    emoji: '❤️‍🔥', label: 'fire heart' },
      { id: 'love_bow',     emoji: '💘',  label: 'cupid' },
      { id: 'love_grow',    emoji: '💗',  label: 'growing' },
      { id: 'love_100',     emoji: '💯',  label: '100' },
      { id: 'love_rose',    emoji: '🌹',  label: 'rose' },
    ],
  },
  {
    id: 'wolf',
    label: 'Wolf',
    labelFa: 'گرگ',
    icon: '🐺',
    stickers: [
      { id: 'wolf_howl',    emoji: '🐺', label: 'howl' },
      { id: 'wolf_paw',     emoji: '🐾', label: 'paw' },
      { id: 'wolf_moon',    emoji: '🌕', label: 'full moon' },
      { id: 'wolf_night',   emoji: '🌙', label: 'night' },
      { id: 'wolf_crown',   emoji: '👑', label: 'crown' },
      { id: 'wolf_king',    emoji: '🤴', label: 'king' },
      { id: 'wolf_sword',   emoji: '⚔️', label: 'swords' },
      { id: 'wolf_star',    emoji: '⭐', label: 'star' },
      { id: 'wolf_fire',    emoji: '🔥', label: 'fire' },
    ],
  },
];

export function stickerTextToEmoji(text: string): string | null {
  const match = text.match(/^\[sticker:(\w+)\]$/);
  if (!match) return null;
  const id = match[1];
  for (const cat of STICKER_CATEGORIES) {
    const s = cat.stickers.find(s => s.id === id);
    if (s) return s.emoji;
  }
  return null;
}

interface StickerPanelProps {
  onSelect: (text: string) => void;
}

export const StickerPanel = memo(function StickerPanel({ onSelect }: StickerPanelProps) {
  const { language } = useTheme();
  const fa = language === 'fa';
  const [activeCat, setActiveCat] = useState(STICKER_CATEGORIES[0].id);

  const cat = STICKER_CATEGORIES.find(c => c.id === activeCat) ?? STICKER_CATEGORIES[0];

  return (
    <div
      className="flex flex-col rounded-2xl overflow-hidden shadow-2xl"
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        width: 280,
        maxHeight: 300,
      }}
      onClick={e => e.stopPropagation()}
    >
      {/* Category tabs */}
      <div className="flex border-b overflow-x-auto flex-shrink-0 scrollbar-none" style={{ borderColor: 'var(--border-color)' }}>
        {STICKER_CATEGORIES.map(c => (
          <button
            key={c.id}
            onClick={() => setActiveCat(c.id)}
            className="flex-shrink-0 flex flex-col items-center px-3 py-2 transition-colors"
            style={{
              borderBottom: activeCat === c.id ? '2px solid var(--accent)' : '2px solid transparent',
              opacity: activeCat === c.id ? 1 : 0.55,
            }}
            title={fa ? c.labelFa : c.label}
          >
            <span className="text-lg">{c.icon}</span>
            <span className="text-[9px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{fa ? c.labelFa : c.label}</span>
          </button>
        ))}
      </div>

      {/* Sticker grid */}
      <div className="flex-1 overflow-y-auto p-2 grid grid-cols-5 gap-1">
        {cat.stickers.map(s => (
          <button
            key={s.id}
            onClick={() => onSelect(`[sticker:${s.id}]`)}
            className="w-12 h-12 rounded-xl flex items-center justify-center text-3xl transition-all hover:scale-110 active:scale-95"
            style={{ background: 'transparent' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(168,85,247,0.12)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            title={s.label}
          >
            {s.emoji}
          </button>
        ))}
      </div>
    </div>
  );
});
