import { useState, useEffect, memo } from 'react';
import { Trash2, RotateCcw, AlertTriangle, RefreshCw } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api';

async function apiFetch(path: string, opts: RequestInit = {}) {
  const token = localStorage.getItem('kingwolf_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  try { return await res.json(); } catch { return {}; }
}

interface TrashedMessage {
  id: string;
  content: string;
  sender_username?: string;
  deleted_at?: string;
  conversation_name?: string;
  type?: string;
}

export const TrashPage = memo(function TrashPage() {
  const { t } = useTheme();
  const [items, setItems] = useState<TrashedMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  async function load() {
    setLoading(true);
    setErrorMsg('');
    try {
      const data = await apiFetch('/trash');
      setItems(Array.isArray(data) ? data : (data.data ?? data.items ?? []));
    } catch {
      setErrorMsg(t('خطا در دریافت سطل زباله', 'Failed to load trash'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function restore(id: string) {
    setRestoringId(id);
    try {
      await apiFetch(`/trash/${id}/restore`, { method: 'POST' });
      setItems(prev => prev.filter(i => i.id !== id));
    } catch {
      alert(t('بازیابی ناموفق بود', 'Restore failed'));
    } finally {
      setRestoringId(null);
    }
  }

  function formatDate(iso?: string) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-5 py-4"
        style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border-color)' }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(239,68,68,0.12)' }}>
            <Trash2 size={18} className="text-red-400" />
          </div>
          <div>
            <h2 className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>
              {t('سطل زباله', 'Trash')}
            </h2>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {t('پیام‌های حذف‌شده ۳۰ روز نگهداری می‌شوند', 'Deleted messages kept for 30 days')}
            </p>
          </div>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="p-2 rounded-xl transition-colors"
          style={{ color: 'var(--text-secondary)', background: 'var(--bg-input)' }}
          title={t('بارگذاری مجدد', 'Reload')}
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* 30-day warning */}
      <div className="mx-4 mt-3 flex items-center gap-2 px-3 py-2.5 rounded-xl"
        style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
        <AlertTriangle size={14} className="text-amber-400 flex-shrink-0" />
        <p className="text-xs" style={{ color: '#fbbf24' }}>
          {t('پیام‌های حذف‌شده پس از ۳۰ روز به صورت دائمی پاک می‌شوند', 'Messages are permanently deleted after 30 days')}
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {loading && (
          <div className="flex justify-center py-12">
            <div className="w-7 h-7 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && errorMsg && (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
            <Trash2 size={40} style={{ color: 'var(--text-muted)', opacity: 0.3 }} />
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{errorMsg}</p>
            <button onClick={load} className="kw-btn-primary px-4 py-2 rounded-xl text-sm">
              {t('تلاش مجدد', 'Retry')}
            </button>
          </div>
        )}

        {!loading && !errorMsg && items.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(239,68,68,0.08)' }}>
              <Trash2 size={32} style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
            </div>
            <p className="font-semibold" style={{ color: 'var(--text-secondary)' }}>
              {t('سطل زباله خالی است', 'Trash is empty')}
            </p>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {t('پیام‌های حذف‌شده اینجا نمایش داده می‌شوند', 'Deleted messages appear here')}
            </p>
          </div>
        )}

        {!loading && items.map(item => (
          <div
            key={item.id}
            className="kw-card rounded-2xl p-4 flex items-start gap-3"
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
            }}
          >
            {/* Icon */}
            <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
              style={{ background: 'rgba(239,68,68,0.08)' }}>
              <Trash2 size={14} className="text-red-400" />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              {item.sender_username && (
                <p className="text-xs font-semibold mb-0.5" style={{ color: '#93c5fd' }}>
                  @{item.sender_username}
                </p>
              )}
              {item.conversation_name && (
                <p className="text-xs mb-0.5" style={{ color: 'var(--text-muted)' }}>
                  {item.conversation_name}
                </p>
              )}
              <p className="text-sm line-clamp-2 break-words" style={{ color: 'var(--text-secondary)' }}>
                {item.content || `[${item.type || 'media'}]`}
              </p>
              {item.deleted_at && (
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                  {t('حذف شده: ', 'Deleted: ')}{formatDate(item.deleted_at)}
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-1.5 flex-shrink-0">
              <button
                onClick={() => restore(item.id)}
                disabled={restoringId === item.id}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all active:scale-95"
                style={{ background: 'rgba(74,222,128,0.12)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.2)' }}
              >
                {restoringId === item.id
                  ? <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  : <RotateCcw size={11} />}
                {t('بازیابی', 'Restore')}
              </button>
              <button
                onClick={() => {
                  if (window.confirm(t('پاک دائمی؟ (۳۰ روز پس از حذف خودکار پاک می‌شود)', 'Permanently delete? (auto-deletes after 30 days anyway)'))) {
                    setItems(prev => prev.filter(i => i.id !== item.id));
                  }
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all active:scale-95"
                style={{ background: 'rgba(239,68,68,0.08)', color: '#f87171', border: '1px solid rgba(239,68,68,0.15)' }}
              >
                <Trash2 size={11} />
                {t('پاک دائمی', 'Delete')}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});
