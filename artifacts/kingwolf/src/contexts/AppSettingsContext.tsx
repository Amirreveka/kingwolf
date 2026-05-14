import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { AppSettings } from '../types';

interface AppSettingsContextType {
  settings: AppSettings;
  loading: boolean;
  refresh: () => Promise<void>;
}

const defaults: AppSettings = {
  app_name: 'KingWolf',
  app_logo_type: 'wolf',
  app_logo_url: '',
  theme_default: 'dark',
  registration_enabled: 'true',
  require_admin_approval: 'true',
};

const AppSettingsContext = createContext<AppSettingsContextType>({
  settings: defaults,
  loading: true,
  refresh: async () => {},
});

export function AppSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(defaults);
  const [loading, setLoading] = useState(true);

  async function fetchSettings() {
    try {
      const { data } = await supabase.from('app_settings').select('key, value');
      if (data) {
        const mapped = data.reduce((acc, row) => ({ ...acc, [row.key]: row.value }), {} as AppSettings);
        setSettings({ ...defaults, ...mapped });
      }
    } catch {
      // Use defaults if fetch fails
    }
    setLoading(false);
  }

  useEffect(() => { fetchSettings(); }, []);

  return (
    <AppSettingsContext.Provider value={{ settings, loading, refresh: fetchSettings }}>
      {children}
    </AppSettingsContext.Provider>
  );
}

export function useAppSettings() {
  return useContext(AppSettingsContext);
}
