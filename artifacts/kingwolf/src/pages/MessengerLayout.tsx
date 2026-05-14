import { useState, useRef } from 'react';
import { MessageSquare, Newspaper, Settings, LogOut, Sun, Moon, Globe, Menu, X, User, ChevronLeft, Phone } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useConversations } from '../hooks/useConversations';
import { ChatList } from '../components/chat/ChatList';
import { ChatWindow } from '../components/chat/ChatWindow';
import { FeedPage } from './FeedPage';
import { SettingsPage } from './SettingsPage';
import { Conversation } from '../types';
import { supabase } from '../lib/supabase';
import { WolfLogo } from '../components/ui/WolfLogo';
import { CallsPage } from './CallsPage';

type Page = 'messages' | 'calls' | 'feed' | 'settings';

export function MessengerLayout() {
  const { profile, signOut } = useAuth();
  const { user } = useAuth();
  const { theme, language, setTheme, setLanguage } = useTheme();
  const { conversations, loading, refresh, createDirectConversation, createGroup, createChannel, getSavedMessagesConversation } = useConversations();
  const [page, setPage] = useState<Page>('messages');
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [showSidebar, setShowSidebar] = useState(false);
  const [showChatOnMobile, setShowChatOnMobile] = useState(false);

  const selectedConv = conversations.find((c) => c.id === selectedConvId) ?? null;

  async function handleSelectConversation(id: string) {
    // If it starts with "direct:" it needs to be created first
    if (id.startsWith('direct:')) {
      const targetUserId = id.replace('direct:', '');
      const convId = await createDirectConversation(targetUserId);
      if (convId) {
        setSelectedConvId(convId);
        setShowChatOnMobile(true);
        setPage('messages');
      }
      return;
    }
    setSelectedConvId(id);
    setShowChatOnMobile(true);
    setPage('messages');
  }

  async function handleSavedMessages() {
    const convId = await getSavedMessagesConversation();
    if (convId) {
      // Create a virtual saved-messages conversation if not in list
      setSelectedConvId(convId);
      setShowChatOnMobile(true);
      setPage('messages');
      await refresh();
    }
  }

  async function handleCreateGroup(name: string, desc: string, members: string[]) {
    const convId = await createGroup(name, desc, members);
    if (convId) {
      setSelectedConvId(convId);
      setShowChatOnMobile(true);
    }
  }

  async function handleCreateChannel(name: string, desc: string) {
    const convId = await createChannel(name, desc);
    if (convId) {
      setSelectedConvId(convId);
      setShowChatOnMobile(true);
    }
  }

  const navItems = [
    { id: 'messages' as Page, label: language === 'fa' ? 'پیام‌ها' : 'Messages', icon: MessageSquare },
    { id: 'calls' as Page, label: language === 'fa' ? 'تماس‌ها' : 'Calls', icon: Phone },
    { id: 'feed' as Page, label: language === 'fa' ? 'فید' : 'Feed', icon: Newspaper },
    { id: 'settings' as Page, label: language === 'fa' ? 'تنظیمات' : 'Settings', icon: Settings },
  ];

  return (
    <div className="flex overflow-hidden" style={{ background: 'var(--bg-primary)', height: '100dvh' }} dir={language === 'fa' ? 'rtl' : 'ltr'}>
      {/* Main Sidebar (desktop) */}
      <div className="hidden md:flex flex-col w-16 flex-shrink-0 py-3 items-center gap-2" style={{ background: 'var(--bg-card)', borderLeft: '1px solid var(--border-color)' }}>
        {/* Logo */}
        <div className="mb-2">
          <WolfLogo size={32} />
        </div>

        {/* Nav */}
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
              <item.icon size={18} />
              <span className="absolute right-full mr-2 text-xs whitespace-nowrap px-2 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" style={{ background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}>
                {item.label}
              </span>
            </button>
          ))}
        </div>

        {/* Bottom controls */}
        <div className="flex flex-col gap-1 w-full px-2 mb-2">
          {/* Language toggle */}
          <button
            onClick={() => setLanguage(language === 'fa' ? 'en' : 'fa')}
            className="w-full h-9 rounded-xl flex items-center justify-center transition-colors text-xs font-bold"
            style={{ background: 'var(--bg-input)', color: 'var(--text-secondary)' }}
            title={language === 'fa' ? 'Switch to English' : 'تغییر به فارسی'}
          >
            {language === 'fa' ? 'EN' : 'FA'}
          </button>

          {/* Theme toggle */}
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="w-full h-9 rounded-xl flex items-center justify-center transition-colors"
            style={{ background: 'var(--bg-input)', color: 'var(--text-secondary)' }}
            title={theme === 'dark' ? 'روشن' : 'تاریک'}
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>

          {/* Avatar / profile */}
          <button
            onClick={() => setPage('settings')}
            className="w-full h-10 rounded-xl flex items-center justify-center transition-colors overflow-hidden mt-1"
            title={profile?.display_name || profile?.username}
          >
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} className="w-8 h-8 rounded-full object-cover" alt="" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
                <span className="text-white text-xs font-bold">{(profile?.display_name || profile?.username || '?').charAt(0).toUpperCase()}</span>
              </div>
            )}
          </button>
        </div>
      </div>

      {/* Chat Panel (only on messages page) */}
      {page === 'messages' && (
        <div className={`
          flex-shrink-0 w-full md:w-80
          ${showChatOnMobile ? 'hidden md:flex' : 'flex'}
          flex-col
          border-l border-gray-800
        `} style={{ borderColor: 'var(--border-color)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
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

      {/* Main Content Area */}
      <div className={`
        flex-1 flex flex-col min-w-0 overflow-hidden
        ${page === 'messages' && !showChatOnMobile ? 'hidden md:flex' : 'flex'}
      `} style={{ paddingBottom: page !== 'messages' ? 'env(safe-area-inset-bottom)' : undefined }}>
        {/* Mobile header for non-messages pages */}
        {page !== 'messages' && page !== 'calls' && (
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
              {page === 'feed' ? (language === 'fa' ? 'فید' : 'Feed') : (language === 'fa' ? 'تنظیمات' : 'Settings')}
            </h1>
          </div>
        )}

        {page === 'messages' ? (
          <ChatWindow
            conversation={selectedConv}
            conversations={conversations}
            onBack={() => { setShowChatOnMobile(false); setSelectedConvId(null); }}
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

      {/* Mobile Bottom Navigation */}
      <div
        className="fixed bottom-0 inset-x-0 md:hidden z-40 flex"
        style={{
          background: 'var(--bg-card)',
          borderTop: '1px solid var(--border-color)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => { setPage(item.id); if (item.id !== 'messages') setShowChatOnMobile(false); }}
            className="flex-1 py-3 flex flex-col items-center gap-1 transition-colors"
            style={{ color: page === item.id ? 'var(--accent)' : 'var(--text-muted)' }}
          >
            <item.icon size={20} />
            <span className="text-xs">{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
