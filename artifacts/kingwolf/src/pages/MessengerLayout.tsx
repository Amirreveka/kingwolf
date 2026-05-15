import { useState } from 'react';
import { MessageSquare, Settings, LogOut, Sun, Moon, Phone } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useConversations } from '../hooks/useConversations';
import { useIsMobile } from '../hooks/use-mobile';
import { ChatList } from '../components/chat/ChatList';
import { ChatWindow } from '../components/chat/ChatWindow';
import { FeedPage } from './FeedPage';
import { SettingsPage } from './SettingsPage';
import { Conversation } from '../types';
import { supabase } from '../lib/supabase';
import { WolfLogo } from '../components/ui/WolfLogo';
import { CallsPage } from './CallsPage';

type Page = 'messages' | 'calls' | 'feed' | 'settings';

// Old Twitter bird SVG
function TwitterBird({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z" />
    </svg>
  );
}

export function MessengerLayout() {
  const { profile, signOut } = useAuth();
  const { user } = useAuth();
  const { theme, language, setTheme, setLanguage } = useTheme();
  const isMobile = useIsMobile();
  const { conversations, loading, refresh, createDirectConversation, createGroup, createChannel, getSavedMessagesConversation, setActiveConversation } = useConversations();
  const [page, setPage] = useState<Page>('messages');
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [showChatOnMobile, setShowChatOnMobile] = useState(false);

  const selectedConv = conversations.find((c) => c.id === selectedConvId) ?? null;

  async function handleSelectConversation(id: string) {
    if (id.startsWith('direct:')) {
      const targetUserId = id.replace('direct:', '');
      const convId = await createDirectConversation(targetUserId);
      if (convId) {
        setSelectedConvId(convId);
        setActiveConversation(convId);
        setShowChatOnMobile(true);
        setPage('messages');
      }
      return;
    }
    setSelectedConvId(id);
    setActiveConversation(id);
    setShowChatOnMobile(true);
    setPage('messages');
  }

  async function handleSavedMessages() {
    const convId = await getSavedMessagesConversation();
    if (convId) {
      setSelectedConvId(convId);
      setShowChatOnMobile(true);
      setPage('messages');
      await refresh();
    }
  }

  async function handleCreateGroup(name: string, desc: string, members: string[]) {
    const convId = await createGroup(name, desc, members);
    if (convId) { setSelectedConvId(convId); setShowChatOnMobile(true); }
  }

  async function handleCreateChannel(name: string, desc: string) {
    const convId = await createChannel(name, desc);
    if (convId) { setSelectedConvId(convId); setShowChatOnMobile(true); }
  }

  const fa = language === 'fa';

  const navItems = [
    { id: 'messages' as Page, label: fa ? 'پیام‌ها' : 'Messages', icon: MessageSquare },
    { id: 'calls'   as Page, label: fa ? 'تماس‌ها' : 'Calls',    icon: Phone },
    { id: 'feed'    as Page, label: fa ? 'توییت'    : 'Tweet',    icon: null /* uses TwitterBird */ },
    { id: 'settings'as Page, label: fa ? 'تنظیمات'  : 'Settings', icon: Settings },
  ];

  // Bottom nav height: 56px + safe-area; add as paddingBottom to content so input isn't hidden
  const mobileNavHeight = 'calc(56px + env(safe-area-inset-bottom))';

  return (
    <div
      className="flex overflow-hidden"
      style={{ background: 'var(--bg-primary)', height: '100dvh', paddingTop: 'env(safe-area-inset-top)', boxSizing: 'border-box' }}
      dir={fa ? 'rtl' : 'ltr'}
    >
      {/* ── Desktop sidebar ─────────────────────────────── */}
      <div
        className="hidden md:flex flex-col w-16 flex-shrink-0 py-3 items-center gap-2"
        style={{ background: 'var(--bg-card)', borderLeft: '1px solid var(--border-color)' }}
      >
        <div className="mb-2">
          <WolfLogo size={32} />
        </div>

        <div className="flex-1 flex flex-col gap-1 w-full px-2">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setPage(item.id)}
              className="w-full h-10 rounded-xl flex items-center justify-center transition-all group relative"
              style={{
                background: page === item.id ? 'var(--accent)' : 'transparent',
                color: page === item.id ? 'white' : 'var(--text-secondary)',
              }}
              title={item.label}
            >
              {item.icon ? <item.icon size={18} /> : <TwitterBird size={18} />}
              <span
                className="absolute right-full mr-2 text-xs whitespace-nowrap px-2 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                style={{ background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}
              >
                {item.label}
              </span>
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-1 w-full px-2 mb-2">
          <button
            onClick={() => setLanguage(fa ? 'en' : 'fa')}
            className="w-full h-9 rounded-xl flex items-center justify-center transition-colors text-xs font-bold"
            style={{ background: 'var(--bg-input)', color: 'var(--text-secondary)' }}
            title={fa ? 'Switch to English' : 'تغییر به فارسی'}
          >
            {fa ? 'EN' : 'FA'}
          </button>

          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="w-full h-9 rounded-xl flex items-center justify-center transition-colors"
            style={{ background: 'var(--bg-input)', color: 'var(--text-secondary)' }}
            title={theme === 'dark' ? (fa ? 'روشن' : 'Light') : (fa ? 'تاریک' : 'Dark')}
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>

          <button
            onClick={() => setPage('settings')}
            className="w-full h-10 rounded-xl flex items-center justify-center transition-colors overflow-hidden mt-1"
            title={profile?.display_name || profile?.username}
          >
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} className="w-8 h-8 rounded-full object-cover" alt="" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
                <span className="text-white text-xs font-bold">
                  {(profile?.display_name || profile?.username || '?').charAt(0).toUpperCase()}
                </span>
              </div>
            )}
          </button>
        </div>
      </div>

      {/* ── Chat list panel (messages page only) ────────── */}
      {page === 'messages' && (
        <div
          className={`flex-shrink-0 w-full md:w-80 ${showChatOnMobile ? 'hidden md:flex' : 'flex'} flex-col`}
          style={{
            borderColor: 'var(--border-color)',
            borderLeft: '1px solid var(--border-color)',
            // On mobile, leave room for bottom nav
            paddingBottom: isMobile ? mobileNavHeight : undefined,
          }}
        >
          <ChatList
            conversations={conversations}
            selectedId={selectedConvId}
            onSelect={handleSelectConversation}
            onCreateGroup={handleCreateGroup}
            onCreateChannel={handleCreateChannel}
            onSavedMessages={handleSavedMessages}
          />
        </div>
      )}

      {/* ── Main content area ────────────────────────────── */}
      <div
        className={`flex-1 flex flex-col min-w-0 overflow-hidden ${
          page === 'messages' && !showChatOnMobile ? 'hidden md:flex' : 'flex'
        }`}
        style={{
          // CRITICAL: push content up so bottom nav doesn't cover input
          paddingBottom: isMobile ? mobileNavHeight : 'env(safe-area-inset-bottom)',
        }}
      >
        {/* Mobile header for non-messages pages */}
        {page !== 'messages' && page !== 'calls' && page !== 'settings' && (
          <div
            className="flex-shrink-0 flex items-center gap-3 px-4 py-3 md:hidden"
            style={{
              background: 'var(--bg-card)',
              borderBottom: '1px solid var(--border-color)',
              paddingTop: 'max(12px, env(safe-area-inset-top))',
            }}
          >
            <WolfLogo size={24} />
            <h1 className="font-bold flex-1" style={{ color: 'var(--text-primary)' }}>
              {page === 'feed'
                ? (fa ? 'توییت' : 'Tweet')
                : (fa ? 'تنظیمات' : 'Settings')}
            </h1>
            {/* Language + theme quick toggles in header */}
            <button
              onClick={() => setLanguage(fa ? 'en' : 'fa')}
              className="text-xs font-bold px-2 py-1 rounded-lg"
              style={{ background: 'var(--bg-input)', color: 'var(--text-secondary)' }}
            >
              {fa ? 'EN' : 'FA'}
            </button>
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: 'var(--bg-input)', color: 'var(--text-secondary)' }}
            >
              {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
            </button>
          </div>
        )}

        {page === 'messages' ? (
          <ChatWindow
            conversation={selectedConv}
            conversations={conversations}
            onBack={() => { setShowChatOnMobile(false); setSelectedConvId(null); setActiveConversation(null); }}
            onSelectConv={handleSelectConversation}
          />
        ) : page === 'calls' ? (
          <CallsPage />
        ) : page === 'feed' ? (
          <FeedPage />
        ) : (
          <SettingsPage onClose={() => setPage('messages')} />
        )}
      </div>

      {/* ── Mobile bottom navigation ─────────────────────── */}
      <div
        className="fixed bottom-0 inset-x-0 md:hidden z-40 flex"
        style={{
          background: 'var(--bg-card)',
          borderTop: '1px solid var(--border-color)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          // Subtle shadow upward
          boxShadow: '0 -2px 12px rgba(0,0,0,0.15)',
        }}
      >
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => {
              setPage(item.id);
              if (item.id !== 'messages') setShowChatOnMobile(false);
            }}
            className="flex-1 py-2 flex flex-col items-center gap-0.5 transition-colors"
            style={{
              color: page === item.id ? 'var(--accent)' : 'var(--text-muted)',
              touchAction: 'manipulation',
              minHeight: 44,
            }}
          >
            {item.icon ? (
              <item.icon size={page === item.id ? 22 : 20} />
            ) : (
              <TwitterBird size={page === item.id ? 22 : 20} />
            )}
            <span className="text-[10px] font-medium">{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
