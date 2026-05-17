import { useEffect, useState } from 'react';

function getToken() { try { return localStorage.getItem('kingwolf_token'); } catch { return null; } }
async function apiGet(path: string) {
  const token = getToken();
  const res = await fetch(`/api${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  try { return await res.json(); } catch { return {}; }
}

const BADGE_CONFIG: Record<string, { emoji: string; color: string; glow: string; label: string; labelFa: string }> = {
  'alpha_wolf':   { emoji: '🐺', color: '#f59e0b', glow: '#f59e0b80', label: 'Alpha Wolf',   labelFa: 'گرگ آلفا' },
  'howl_master':  { emoji: '🌕', color: '#a855f7', glow: '#a855f780', label: 'Howl Master',  labelFa: 'استاد هاول' },
  'night_rider':  { emoji: '🌙', color: '#06b6d4', glow: '#06b6d480', label: 'Night Rider',  labelFa: 'شبگرد' },
  'pack_leader':  { emoji: '👑', color: '#ef4444', glow: '#ef444480', label: 'Pack Leader',  labelFa: 'سرگله' },
  'verified':     { emoji: '✓',  color: '#3b82f6', glow: '#3b82f680', label: 'Verified',     labelFa: 'تأیید شده' },
};

const LEVEL_CONFIG: Record<string, { color: string; glow: string }> = {
  'Wolf Pup':    { color: '#6b7280', glow: '#6b728040' },
  'Young Wolf':  { color: '#10b981', glow: '#10b98140' },
  'Wild Wolf':   { color: '#3b82f6', glow: '#3b82f640' },
  'Night Rider': { color: '#06b6d4', glow: '#06b6d440' },
  'Pack Leader': { color: '#a855f7', glow: '#a855f740' },
  'Alpha Wolf':  { color: '#f59e0b', glow: '#f59e0b60' },
};

interface BadgeData {
  badges: { badge: string; awarded_at: string }[];
  level: string;
  levelFa: string;
  score: number;
}

export function NeonBadge({ userId, size = 'sm', language = 'fa' }: { userId: string; size?: 'xs' | 'sm' | 'md'; language?: string }) {
  const [data, setData] = useState<BadgeData | null>(null);

  useEffect(() => {
    if (!userId) return;
    apiGet(`/badges/${userId}`).then(d => {
      if (d.level) setData(d);
    });
  }, [userId]);

  if (!data) return null;

  const levelCfg = LEVEL_CONFIG[data.level] || LEVEL_CONFIG['Wolf Pup'];
  const sizeClass = size === 'xs' ? 'text-[10px] px-1 py-0.5' : size === 'sm' ? 'text-xs px-1.5 py-0.5' : 'text-sm px-2 py-1';

  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full font-bold ${sizeClass}`}
      style={{
        background: `${levelCfg.color}20`,
        color: levelCfg.color,
        border: `1px solid ${levelCfg.color}50`,
        boxShadow: `0 0 8px ${levelCfg.glow}`,
      }}
    >
      🐺 {language === 'fa' ? data.levelFa : data.level}
    </span>
  );
}

export function BadgeList({ userId, language = 'fa' }: { userId: string; language?: string }) {
  const [data, setData] = useState<BadgeData | null>(null);

  useEffect(() => {
    if (!userId) return;
    apiGet(`/badges/${userId}`).then(d => {
      if (d.level) setData(d);
    });
  }, [userId]);

  if (!data || data.badges.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1">
      {data.badges.map(b => {
        const cfg = BADGE_CONFIG[b.badge];
        if (!cfg) return null;
        return (
          <span
            key={b.badge}
            title={language === 'fa' ? cfg.labelFa : cfg.label}
            className="inline-flex items-center gap-0.5 rounded-full text-xs px-1.5 py-0.5 font-bold"
            style={{
              background: `${cfg.color}20`,
              color: cfg.color,
              border: `1px solid ${cfg.color}50`,
              boxShadow: `0 0 8px ${cfg.glow}`,
            }}
          >
            {cfg.emoji} {language === 'fa' ? cfg.labelFa : cfg.label}
          </span>
        );
      })}
    </div>
  );
}
