import { memo } from 'react';
import { useTheme } from '../contexts/ThemeContext';

interface PremiumBadgeProps {
  is_premium: boolean;
  premium_expires_at?: string;
}

export const PremiumBadge = memo(function PremiumBadge({ is_premium, premium_expires_at }: PremiumBadgeProps) {
  const { t } = useTheme();

  if (!is_premium) return null;

  // Check if expired
  if (premium_expires_at) {
    const expires = new Date(premium_expires_at);
    if (expires < new Date()) return null;
  }

  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold select-none"
      style={{
        background: 'linear-gradient(135deg, rgba(245,158,11,0.2), rgba(251,191,36,0.15))',
        color: '#f59e0b',
        border: '1px solid rgba(245,158,11,0.4)',
        boxShadow: '0 0 8px rgba(245,158,11,0.2)',
      }}
      title={premium_expires_at ? `${t('انقضا', 'Expires')}: ${new Date(premium_expires_at).toLocaleDateString()}` : undefined}
    >
      <span style={{ fontSize: '11px' }}>⭐</span>
      <span>{t('ولف پریمیوم', 'Wolf Premium')}</span>
    </span>
  );
});
