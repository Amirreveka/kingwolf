import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

type Theme = 'dark' | 'light' | 'amoled' | 'ocean' | 'sunset' | 'forest' | 'purple' | 'golden' | 'rose';
type Language = 'fa' | 'en';

export const THEMES: { id: Theme; label: string; labelFa: string; preview: string[] }[] = [
  { id: 'dark',   labelFa: 'تاریک',        label: 'Dark',         preview: ['#030712','#2563eb','#1f2937'] },
  { id: 'light',  labelFa: 'روشن',         label: 'Light',        preview: ['#f8fafc','#2563eb','#e2e8f0'] },
  { id: 'amoled', labelFa: 'آمولد',        label: 'AMOLED',       preview: ['#000000','#0088cc','#1a1a1a'] },
  { id: 'ocean',  labelFa: 'اقیانوس',     label: 'Ocean',        preview: ['#020c1b','#64ffda','#112240'] },
  { id: 'sunset', labelFa: 'غروب',         label: 'Sunset',       preview: ['#1a0a00','#ff6b2b','#2d1800'] },
  { id: 'forest', labelFa: 'جنگل',         label: 'Forest',       preview: ['#020d08','#10b981','#064e3b'] },
  { id: 'purple', labelFa: 'شب بنفش',      label: 'Purple Night', preview: ['#0d0016','#a855f7','#1e0033'] },
  { id: 'golden', labelFa: 'طلایی',        label: 'Golden',       preview: ['#120c00','#f59e0b','#1c1400'] },
  { id: 'rose',   labelFa: 'رز',           label: 'Rose',         preview: ['#0f0008','#f43f5e','#1e0014'] },
];

// Comprehensive Persian→English dictionary. t() falls back to this when only fa is passed.
const AUTO_EN: Record<string, string> = {
  "پیام‌ها": "Messages",
  "پیام‌رسان امن و سریع": "Secure & fast messenger",
  "فید": "Feed",
  "تنظیمات": "Settings",
  "شخصی": "Direct",
  "گروه‌ها": "Groups",
  "کانال‌ها": "Channels",
  "گروه": "Group",
  "کانال": "Channel",
  "کاربر": "User",
  "کاربران": "Users",
  "پیام‌های ذخیره‌شده": "Saved Messages",
  "ذخیره پیام‌ها برای خودت": "Save messages for yourself",
  "پیام‌های شخصی شما": "Your personal messages",
  "یادداشت بنویسید...": "Write a note...",
  "هنوز مکالمه‌ای ندارید": "No conversations yet",
  "شروع مکالمه": "Start a chat",
  "شروع مکالمه...": "Starting chat...",
  "+ شروع مکالمه": "+ Start a chat",
  "+ ساخت گروه": "+ Create group",
  "+ ساخت کانال": "+ Create channel",
  "عضو گروهی نیستید": "You're not in any group",
  "کانالی ندارید": "No channels",
  "جستجو...": "Search...",
  "جستجو": "Search",
  "جستجوی پست‌ها، هشتگ‌ها...": "Search posts, hashtags...",
  "جستجوی کاربر...": "Search user...",
  "جستجو برای افزودن عضو...": "Search to add member...",
  "ورود": "Sign in",
  "ثبت‌نام": "Sign up",
  "خروج": "Sign out",
  "خروج از حساب": "Sign out",
  "نام کاربری": "Username",
  "رمز عبور": "Password",
  "رمز عبور (حداقل ۶ کاراکتر)": "Password (min 6 characters)",
  "نام کاربری (حداقل ۳ کاراکتر)": "Username (min 3 characters)",
  "تکرار رمز عبور جدید": "Repeat new password",
  "رمز عبور جدید (حداقل ۶ کاراکتر)": "New password (min 6 characters)",
  "رمز عبور فعلی": "Current password",
  "رمز جدید": "New password",
  "تغییر رمز عبور": "Change password",
  "تغییر به فارسی": "Switch to Persian",
  "در حال ورود...": "Signing in...",
  "در حال ثبت‌نام...": "Signing up...",
  "در حال ذخیره...": "Saving...",
  "در حال تایپ...": "typing...",
  "لطفاً همه فیلدها را پر کنید": "Please fill all fields",
  "نام کاربری یا رمز عبور اشتباه است": "Wrong username or password",
  "این نام کاربری قبلاً ثبت شده است": "This username is already taken",
  "رمز عبور باید حداقل ۶ کاراکتر باشد": "Password must be at least 6 characters",
  "نام کاربری باید حداقل ۳ کاراکتر باشد": "Username must be at least 3 characters",
  "رمز جدید باید حداقل ۶ کاراکتر باشد": "New password must be at least 6 characters",
  "رمزهای جدید یکسان نیستند": "New passwords don't match",
  "رمز عبور با موفقیت تغییر کرد ✅": "Password changed successfully ✅",
  "خطا در تغییر رمز عبور": "Failed to change password",
  "خطا در تغییر رمز: ": "Failed to change password: ",
  "حساب ایجاد شد!": "Account created!",
  "حساب شما توسط مدیر مسدود شده است.": "Your account has been blocked by an admin.",
  "حساب شما در انتظار تأیید است": "Your account is pending approval",
  "حساب مدیر غیرفعال است": "Admin account is inactive",
  "مدیر باید ثبت‌نام شما را تأیید کند": "An admin must approve your signup",
  "مدیر یافت نشد": "Admin not found",
  "شما دسترسی مدیریتی ندارید": "You don't have admin access",
  "بازگشت به ورود": "Back to sign in",
  "ویرایش پروفایل": "Edit profile",
  "ظاهر": "Appearance",
  "زبان": "Language",
  "اعلان‌ها": "Notifications",
  "حریم خصوصی": "Privacy",
  "امنیت": "Security",
  "تم رنگی": "Theme",
  "روشن": "Light",
  "تیره": "Dark",
  "تاریک": "Dark",
  "فارسی": "Persian",
  "انگلیسی": "English",
  "ذخیره": "Save",
  "ذخیره شد": "Saved",
  "لغو": "Cancel",
  "حذف": "Delete",
  "تأیید": "Confirm",
  "نام نمایشی": "Display name",
  "بیوگرافی": "Bio",
  "شماره تلفن": "Phone",
  "تاریخ تولد": "Birthday",
  "درباره خودت بنویس...": "Tell us about yourself...",
  "صدا هنگام دریافت پیام": "Sound on new message",
  "صدای اعلان": "Notification sound",
  "نمایش محتوای پیام در اعلان": "Show preview in notifications",
  "پیش‌نمایش پیام": "Message preview",
  "پیام جدید": "New message",
  "پیام بنویسید...": "Type a message...",
  "ارسال": "Send",
  "تایپ کنید...": "Type...",
  "آنلاین": "Online",
  "آفلاین": "Offline",
  "همین الان": "just now",
  "عضو": "member",
  "عضو دارد": "members",
  "تماس صوتی": "Voice call",
  "تماس تصویری": "Video call",
  "گزارش": "Report",
  "مسدود کردن": "Block",
  "مسدود کردن کاربر": "Block user",
  "مسدود": "Blocked",
  "مسدود شده": "Blocked",
  "رفع مسدود": "Unblock",
  "تخلف از قوانین": "Rule violation",
  "نام گروه": "Group name",
  "نام کانال": "Channel name",
  "توضیحات گروه (اختیاری)": "Group description (optional)",
  "توضیحات کانال (اختیاری)": "Channel description (optional)",
  "پنل مدیریت": "Admin Panel",
  "مدیریت کاربران": "Manage users",
  "نام کاربری مدیر": "Admin username",
  "داشبورد": "Dashboard",
  "آمار": "Stats",
  "کل کاربران": "Total users",
  "کاربران فعال": "Active users",
  "فعال": "Active",
  "منتظر": "Pending",
  "در انتظار تأیید": "Pending approval",
  "منتظر تأیید": "Pending approval",
  "تأیید ثبت‌نام": "Approve signup",
  "ثبت‌نام فعال": "Signup enabled",
  "ثبت‌نام در حال حاضر غیرفعال است": "Signup is currently disabled",
  "نیاز به تأیید مدیر": "Requires admin approval",
  "تنظیمات برنامه": "App settings",
  "خانه": "Home",
  "چه خبره؟ ...": "What's happening?...",
  "راه‌اندازی DB": "DB setup",
  "راه‌اندازی پایگاه داده": "Database setup",
  "پایگاه داده": "Database",
  "آپدیت": "Update",
  "اپ": "App",
  "KingWolf Messenger": "KingWolf Messenger",
  "ایمیل": "Email",
  "نام کاربری، ایمیل یا تلفن": "Username, email, or phone",
  "شماره تلفن (مثلاً ۰۹۱۲۳۴۵۶۷۸۹)": "Phone number (e.g. 09123456789)",
  "یا": "or",
  "ورود با گوگل": "Sign in with Google",
  "ایمیل و شماره تلفن الزامی است": "Email and phone are required",
  "برای فعال‌سازی ورود با گوگل، Client ID را در تنظیمات سرور وارد کنید": "To enable Google sign-in, configure Google Client ID in server settings",
  "ورود با گوگل ناموفق بود": "Google sign-in failed",
  "این ایمیل قبلاً ثبت شده است": "This email is already registered",
};

export type { Theme };

interface ThemeContextType {
  theme: Theme;
  language: Language;
  setTheme: (t: Theme) => void;
  setLanguage: (l: Language) => void;
  t: (fa: string, en?: string) => string;
  dir: 'rtl' | 'ltr';
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'dark',
  language: 'fa',
  setTheme: () => {},
  setLanguage: () => {},
  t: (fa) => fa,
  dir: 'rtl',
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    return (localStorage.getItem('kw_theme') as Theme) || 'dark';
  });
  const [language, setLanguageState] = useState<Language>(() => {
    return (localStorage.getItem('kw_language') as Language) || 'fa';
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('dark', 'light', 'amoled', 'ocean', 'sunset', 'forest', 'purple', 'golden', 'rose');
    root.classList.add(theme);
    localStorage.setItem('kw_theme', theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.dir = language === 'fa' ? 'rtl' : 'ltr';
    document.documentElement.lang = language;
    localStorage.setItem('kw_language', language);
  }, [language]);

  function setTheme(t: Theme) { setThemeState(t); }
  function setLanguage(l: Language) { setLanguageState(l); }

  function t(fa: string, en?: string): string {
    if (language === 'fa') return fa;
    if (en !== undefined) return en;
    return AUTO_EN[fa] ?? fa;
  }

  const dir: 'rtl' | 'ltr' = language === 'fa' ? 'rtl' : 'ltr';

  return (
    <ThemeContext.Provider value={{ theme, language, setTheme, setLanguage, t, dir }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() { return useContext(ThemeContext); }
