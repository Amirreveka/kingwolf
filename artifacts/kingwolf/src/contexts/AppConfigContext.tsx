import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

export interface AppConfig {
  // Theme
  theme_primary: string;
  theme_accent: string;
  theme_bg: string;
  // Announcement
  announce_enabled: boolean;
  announce_text: string;
  announce_color: string;
  announce_icon: string;
  announce_link: string;
  // Features
  feature_stories: boolean;
  feature_voice_msg: boolean;
  feature_file_share: boolean;
  feature_reactions: boolean;
  feature_groups: boolean;
  feature_feed: boolean;
  feature_calls: boolean;
  feature_trash: boolean;
  // Registration
  reg_open: boolean;
  reg_require_approval: boolean;
  reg_invite_only: boolean;
  reg_closed_msg: string;
  // Limits
  limit_file_mb: number;
  limit_msg_chars: number;
  limit_group_members: number;
  limit_story_sec: number;
  // Branding
  brand_app_name: string;
  brand_tagline_fa: string;
  brand_welcome_fa: string;
  brand_empty_chat_fa: string;
  // Landing page (pass-through)
  [key: string]: any;
}

const defaults: AppConfig = {
  theme_primary: '#a855f7',
  theme_accent: '#06b6d4',
  theme_bg: '#080c18',
  announce_enabled: false,
  announce_text: '',
  announce_color: '#a855f7',
  announce_icon: '📢',
  announce_link: '',
  feature_stories: true,
  feature_voice_msg: true,
  feature_file_share: true,
  feature_reactions: true,
  feature_groups: true,
  feature_feed: true,
  feature_calls: true,
  feature_trash: true,
  reg_open: true,
  reg_require_approval: true,
  reg_invite_only: false,
  reg_closed_msg: 'ثبت‌نام در حال حاضر بسته است.',
  limit_file_mb: 50,
  limit_msg_chars: 4000,
  limit_group_members: 200,
  limit_story_sec: 15,
  brand_app_name: 'KingWolf',
  brand_tagline_fa: 'پیام‌رسان بومی',
  brand_welcome_fa: 'خوش آمدید به KingWolf 👋',
  brand_empty_chat_fa: 'یک مکالمه را انتخاب کنید',
};

const AppConfigContext = createContext<AppConfig>(defaults);

function applyCssVars(config: Partial<AppConfig>) {
  const root = document.documentElement;
  if (config.theme_primary) root.style.setProperty('--accent', config.theme_primary);
  if (config.theme_accent)  root.style.setProperty('--neon-cyan', config.theme_accent);
}

export function AppConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AppConfig>(defaults);

  async function fetchConfig() {
    try {
      const res = await fetch('/api/app-config');
      if (!res.ok) return;
      const data = await res.json();
      setConfig(prev => ({ ...prev, ...data }));
      applyCssVars(data);
    } catch {}
  }

  useEffect(() => {
    fetchConfig();
    const timer = setInterval(fetchConfig, 30000);
    return () => clearInterval(timer);
  }, []);

  return (
    <AppConfigContext.Provider value={config}>
      {children}
    </AppConfigContext.Provider>
  );
}

export function useAppConfig() {
  return useContext(AppConfigContext);
}
