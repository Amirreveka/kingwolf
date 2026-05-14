interface WolfLogoProps {
  size?: number;
  className?: string;
}

export function WolfLogo({ size = 40, className = '' }: WolfLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="wolfGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3B82F6" />
          <stop offset="100%" stopColor="#1D4ED8" />
        </linearGradient>
      </defs>
      <polygon points="20,45 10,15 35,35" fill="url(#wolfGrad)" />
      <polygon points="80,45 90,15 65,35" fill="url(#wolfGrad)" />
      <polygon points="22,42 16,22 33,36" fill="#93C5FD" opacity="0.5" />
      <polygon points="78,42 84,22 67,36" fill="#93C5FD" opacity="0.5" />
      <ellipse cx="50" cy="55" rx="35" ry="30" fill="url(#wolfGrad)" />
      <ellipse cx="50" cy="68" rx="16" ry="10" fill="#1E40AF" />
      <ellipse cx="50" cy="63" rx="6" ry="4" fill="#0F172A" />
      <ellipse cx="37" cy="50" rx="5" ry="6" fill="#0F172A" />
      <ellipse cx="63" cy="50" rx="5" ry="6" fill="#0F172A" />
      <circle cx="39" cy="48" r="2" fill="white" opacity="0.8" />
      <circle cx="65" cy="48" r="2" fill="white" opacity="0.8" />
      <path d="M44 72 Q50 77 56 72" stroke="#0F172A" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <polygon points="50,8 44,22 38,16 42,28 50,24 58,28 62,16 56,22" fill="#F59E0B" />
      <circle cx="50" cy="8" r="3" fill="#F59E0B" />
      <circle cx="38" cy="16" r="2" fill="#F59E0B" />
      <circle cx="62" cy="16" r="2" fill="#F59E0B" />
    </svg>
  );
}
