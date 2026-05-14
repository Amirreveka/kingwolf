/**
 * Avatar component
 * - If avatar_url exists, shows the image
 * - Otherwise shows a gradient circle with the user's initial(s)
 * - Gradient color is deterministic from the username so each user has a consistent color
 */

const GRADIENTS = [
  ['#667eea', '#764ba2'],
  ['#f093fb', '#f5576c'],
  ['#4facfe', '#00f2fe'],
  ['#43e97b', '#38f9d7'],
  ['#fa709a', '#fee140'],
  ['#30cfd0', '#330867'],
  ['#a8edea', '#fed6e3'],
  ['#ff9a9e', '#fecfef'],
  ['#fbc2eb', '#a6c1ee'],
  ['#fdcb6e', '#e17055'],
  ['#6c5ce7', '#a29bfe'],
  ['#00b894', '#00cec9'],
  ['#fd79a8', '#fdcb6e'],
  ['#0984e3', '#74b9ff'],
  ['#e84393', '#fd79a8'],
  ['#2d3436', '#636e72'],
];

function hashName(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function getInitials(name: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.charAt(0).toUpperCase();
}

interface AvatarProps {
  src?: string | null;
  name?: string | null;
  username?: string | null;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function Avatar({ src, name, username, size = 40, className = '', style = {} }: AvatarProps) {
  const display = (name || username || '?').trim();
  const seed = (username || name || '').toLowerCase();
  const idx = hashName(seed) % GRADIENTS.length;
  const [c1, c2] = GRADIENTS[idx];
  const initials = getInitials(display);
  const fontSize = Math.round(size * 0.42);

  // If we have a real avatar URL, render the image
  if (src && src !== '' && !src.includes('null')) {
    return (
      <div
        className={`rounded-full overflow-hidden flex-shrink-0 ${className}`}
        style={{ width: size, height: size, ...style }}
      >
        <img
          src={src}
          alt={display}
          className="w-full h-full object-cover"
          onError={(e) => {
            // Hide broken image; CSS background still shows gradient
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      </div>
    );
  }

  // Fallback: gradient circle with initials
  return (
    <div
      className={`rounded-full flex items-center justify-center flex-shrink-0 select-none ${className}`}
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, ${c1}, ${c2})`,
        color: 'white',
        fontWeight: 700,
        fontSize,
        textShadow: '0 1px 2px rgba(0,0,0,0.2)',
        ...style,
      }}
    >
      {initials}
    </div>
  );
}
