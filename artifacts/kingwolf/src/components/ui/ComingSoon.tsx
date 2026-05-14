import { X, Rocket } from 'lucide-react';

interface ComingSoonProps {
  feature: string;
  onClose: () => void;
}

export function ComingSoon({ feature, onClose }: ComingSoonProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="rounded-2xl p-6 max-w-xs w-full shadow-2xl animate-slideUp" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <div className="text-center">
          <div className="w-14 h-14 bg-blue-600/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Rocket size={28} className="text-blue-400" />
          </div>
          <h3 className="font-bold text-lg mb-1" style={{ color: 'var(--text-primary)' }}>{feature}</h3>
          <p className="text-sm mb-5" style={{ color: 'var(--text-secondary)' }}>این قابلیت به زودی اضافه می‌شود</p>
          <button
            onClick={onClose}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white py-2.5 rounded-xl text-sm font-medium transition-colors"
          >
            باشه
          </button>
        </div>
      </div>
    </div>
  );
}
