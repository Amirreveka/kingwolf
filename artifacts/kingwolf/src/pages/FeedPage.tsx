import { useState, useEffect } from 'react';
import { Heart, MessageCircle, Share2, Bookmark, Repeat2, MoreHorizontal, Search, TrendingUp, Users, Hash, Flame, Send, X, Image } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { FeedPost } from '../types';
import { useTheme } from '../contexts/ThemeContext';

const DEMO_POSTS: FeedPost[] = [
  { id: 'demo-1', author_id: 'demo', content: '🚀 KingWolf Messenger به زودی با قابلیت‌های جدید و هیجان‌انگیز راه‌اندازی می‌شود! منتظر آپدیت‌های آتی باشید.', media_urls: [], media_types: [], reply_to_id: null, repost_of_id: null, is_deleted: false, is_pinned: true, likes_count: 248, reposts_count: 67, comments_count: 34, bookmarks_count: 89, views_count: 4120, hashtags: ['KingWolf', 'خبر'], mentions: [], visibility: 'public', created_at: new Date(Date.now() - 3600000).toISOString(), updated_at: new Date().toISOString(), author: { id: 'demo', username: 'kingwolf', display_name: 'KingWolf Official', avatar_url: '', bio: '', phone: '', email: '', birthday: '', is_approved: true, is_active: true, is_banned: false, is_admin: false, ban_reason: '', last_seen: '', online_status: 'online', settings: { theme: 'dark', language: 'fa', notification_sound: true, message_preview: true }, created_at: '', updated_at: '' } },
  { id: 'demo-2', author_id: 'demo', content: '💡 آیا می‌دانستید که پیام‌رسان‌های امن می‌توانند حریم خصوصی شما را بهتر از رسانه‌های اجتماعی معمولی حفظ کنند؟ امروز KingWolf را امتحان کنید! #امنیت #حریم_خصوصی', media_urls: [], media_types: [], reply_to_id: null, repost_of_id: null, is_deleted: false, is_pinned: false, likes_count: 182, reposts_count: 43, comments_count: 28, bookmarks_count: 56, views_count: 2890, hashtags: ['امنیت', 'حریم_خصوصی'], mentions: [], visibility: 'public', created_at: new Date(Date.now() - 7200000).toISOString(), updated_at: new Date().toISOString(), author: { id: 'demo', username: 'techblog', display_name: 'وبلاگ تکنولوژی', avatar_url: '', bio: '', phone: '', email: '', birthday: '', is_approved: true, is_active: true, is_banned: false, is_admin: false, ban_reason: '', last_seen: '', online_status: 'offline', settings: { theme: 'dark', language: 'fa', notification_sound: true, message_preview: true }, created_at: '', updated_at: '' } },
  { id: 'demo-3', author_id: 'demo', content: 'امروز اولین روز استفاده از KingWolf بود. واقعاً سرعت ارسال پیام خیلی خوبه! 👏', media_urls: [], media_types: [], reply_to_id: null, repost_of_id: null, is_deleted: false, is_pinned: false, likes_count: 95, reposts_count: 12, comments_count: 18, bookmarks_count: 22, views_count: 1450, hashtags: [], mentions: [], visibility: 'public', created_at: new Date(Date.now() - 10800000).toISOString(), updated_at: new Date().toISOString(), author: { id: 'demo3', username: 'sara_m', display_name: 'سارا محمدی', avatar_url: '', bio: '', phone: '', email: '', birthday: '', is_approved: true, is_active: true, is_banned: false, is_admin: false, ban_reason: '', last_seen: '', online_status: 'online', settings: { theme: 'dark', language: 'fa', notification_sound: true, message_preview: true }, created_at: '', updated_at: '' } },
  { id: 'demo-4', author_id: 'demo', content: '🌐 اینترنت آزاد حق همه است. پیام‌رسان‌های امن مثل KingWolf یکی از ابزارهای مهم برای ارتباطات آزاد هستند. #آزادی_بیان', media_urls: [], media_types: [], reply_to_id: null, repost_of_id: null, is_deleted: false, is_pinned: false, likes_count: 320, reposts_count: 98, comments_count: 67, bookmarks_count: 134, views_count: 5600, hashtags: ['آزادی_بیان'], mentions: [], visibility: 'public', created_at: new Date(Date.now() - 14400000).toISOString(), updated_at: new Date().toISOString(), author: { id: 'demo4', username: 'freedom_press', display_name: 'آزادی مطبوعات', avatar_url: '', bio: '', phone: '', email: '', birthday: '', is_approved: true, is_active: true, is_banned: false, is_admin: false, ban_reason: '', last_seen: '', online_status: 'offline', settings: { theme: 'dark', language: 'fa', notification_sound: true, message_preview: true }, created_at: '', updated_at: '' } },
  { id: 'demo-5', author_id: 'demo', content: 'نسخه جدید اپلیکیشن KingWolf با رابط کاربری بهبود یافته و قابلیت‌های جدید منتشر شد. دانلود کنید! 📱✨ #آپدیت #اپ', media_urls: [], media_types: [], reply_to_id: null, repost_of_id: null, is_deleted: false, is_pinned: false, likes_count: 456, reposts_count: 123, comments_count: 89, bookmarks_count: 201, views_count: 8900, hashtags: ['آپدیت', 'اپ'], mentions: [], visibility: 'public', created_at: new Date(Date.now() - 86400000).toISOString(), updated_at: new Date().toISOString(), author: { id: 'demo', username: 'kingwolf', display_name: 'KingWolf Official', avatar_url: '', bio: '', phone: '', email: '', birthday: '', is_approved: true, is_active: true, is_banned: false, is_admin: false, ban_reason: '', last_seen: '', online_status: 'online', settings: { theme: 'dark', language: 'fa', notification_sound: true, message_preview: true }, created_at: '', updated_at: '' } },
  { id: 'demo-6', author_id: 'demo', content: 'ایمنی آنلاین مهم‌تر از هر چیزی است. همیشه از پیام‌رسان‌های رمزنگاری شده استفاده کنید 🔐', media_urls: [], media_types: [], reply_to_id: null, repost_of_id: null, is_deleted: false, is_pinned: false, likes_count: 211, reposts_count: 55, comments_count: 33, bookmarks_count: 78, views_count: 3400, hashtags: [], mentions: [], visibility: 'public', created_at: new Date(Date.now() - 172800000).toISOString(), updated_at: new Date().toISOString(), author: { id: 'demo5', username: 'cyber_sec', display_name: 'امنیت سایبری', avatar_url: '', bio: '', phone: '', email: '', birthday: '', is_approved: true, is_active: true, is_banned: false, is_admin: false, ban_reason: '', last_seen: '', online_status: 'offline', settings: { theme: 'dark', language: 'fa', notification_sound: true, message_preview: true }, created_at: '', updated_at: '' } },
  { id: 'demo-7', author_id: 'demo7', content: 'خوشحالم که KingWolf فارسی هم داره! بالاخره یه پیام‌رسان با فونت درست 😍', media_urls: [], media_types: [], reply_to_id: null, repost_of_id: null, is_deleted: false, is_pinned: false, likes_count: 178, reposts_count: 34, comments_count: 45, bookmarks_count: 67, views_count: 2100, hashtags: [], mentions: [], visibility: 'public', created_at: new Date(Date.now() - 259200000).toISOString(), updated_at: new Date().toISOString(), author: { id: 'demo7', username: 'ali_dev', display_name: 'علی توسعه‌دهنده', avatar_url: '', bio: '', phone: '', email: '', birthday: '', is_approved: true, is_active: true, is_banned: false, is_admin: false, ban_reason: '', last_seen: '', online_status: 'online', settings: { theme: 'dark', language: 'fa', notification_sound: true, message_preview: true }, created_at: '', updated_at: '' } },
  { id: 'demo-8', author_id: 'demo8', content: '📊 آمار: بیش از ۸۰٪ کاربران ترجیح می‌دهند از پیام‌رسان‌هایی استفاده کنند که داده‌هایشان را رمزنگاری می‌کنند. #آمار #تکنولوژی', media_urls: [], media_types: [], reply_to_id: null, repost_of_id: null, is_deleted: false, is_pinned: false, likes_count: 289, reposts_count: 76, comments_count: 42, bookmarks_count: 95, views_count: 4780, hashtags: ['آمار', 'تکنولوژی'], mentions: [], visibility: 'public', created_at: new Date(Date.now() - 345600000).toISOString(), updated_at: new Date().toISOString(), author: { id: 'demo8', username: 'stats_ir', display_name: 'آمار ایران', avatar_url: '', bio: '', phone: '', email: '', birthday: '', is_approved: true, is_active: true, is_banned: false, is_admin: false, ban_reason: '', last_seen: '', online_status: 'offline', settings: { theme: 'dark', language: 'fa', notification_sound: true, message_preview: true }, created_at: '', updated_at: '' } },
  { id: 'demo-9', author_id: 'demo9', content: 'گروه‌های KingWolf خیلی بهتر از گروه‌های واتساپه! مدیریت اعضا راحت‌تره 💪', media_urls: [], media_types: [], reply_to_id: null, repost_of_id: null, is_deleted: false, is_pinned: false, likes_count: 134, reposts_count: 28, comments_count: 19, bookmarks_count: 45, views_count: 1890, hashtags: [], mentions: [], visibility: 'public', created_at: new Date(Date.now() - 432000000).toISOString(), updated_at: new Date().toISOString(), author: { id: 'demo9', username: 'maryam_k', display_name: 'مریم کریمی', avatar_url: '', bio: '', phone: '', email: '', birthday: '', is_approved: true, is_active: true, is_banned: false, is_admin: false, ban_reason: '', last_seen: '', online_status: 'online', settings: { theme: 'dark', language: 'fa', notification_sound: true, message_preview: true }, created_at: '', updated_at: '' } },
  { id: 'demo-10', author_id: 'demo10', content: '🔔 یادآوری: پسوردهای قوی بسازید! از ترکیب حروف بزرگ، کوچک، اعداد و نمادها استفاده کنید. #امنیت_دیجیتال', media_urls: [], media_types: [], reply_to_id: null, repost_of_id: null, is_deleted: false, is_pinned: false, likes_count: 392, reposts_count: 145, comments_count: 67, bookmarks_count: 178, views_count: 6700, hashtags: ['امنیت_دیجیتال'], mentions: [], visibility: 'public', created_at: new Date(Date.now() - 518400000).toISOString(), updated_at: new Date().toISOString(), author: { id: 'demo', username: 'kingwolf', display_name: 'KingWolf Official', avatar_url: '', bio: '', phone: '', email: '', birthday: '', is_approved: true, is_active: true, is_banned: false, is_admin: false, ban_reason: '', last_seen: '', online_status: 'online', settings: { theme: 'dark', language: 'fa', notification_sound: true, message_preview: true }, created_at: '', updated_at: '' } },
  { id: 'demo-11', author_id: 'demo11', content: 'کانال‌های KingWolf برای کسب‌وکار خیلی مفیده. می‌تونی پیام‌های رسمی بفرستی بدون اینکه اعضا بتونن اسپم بزنن 👍', media_urls: [], media_types: [], reply_to_id: null, repost_of_id: null, is_deleted: false, is_pinned: false, likes_count: 167, reposts_count: 41, comments_count: 23, bookmarks_count: 56, views_count: 2340, hashtags: [], mentions: [], visibility: 'public', created_at: new Date(Date.now() - 604800000).toISOString(), updated_at: new Date().toISOString(), author: { id: 'demo11', username: 'business_tips', display_name: 'نکات کسب‌وکار', avatar_url: '', bio: '', phone: '', email: '', birthday: '', is_approved: true, is_active: true, is_banned: false, is_admin: false, ban_reason: '', last_seen: '', online_status: 'offline', settings: { theme: 'dark', language: 'fa', notification_sound: true, message_preview: true }, created_at: '', updated_at: '' } },
  { id: 'demo-12', author_id: 'demo12', content: 'صبح بخیر KingWolf! امیدوارم امروز هم روز خوبی داشته باشید ☀️', media_urls: [], media_types: [], reply_to_id: null, repost_of_id: null, is_deleted: false, is_pinned: false, likes_count: 89, reposts_count: 14, comments_count: 31, bookmarks_count: 12, views_count: 1200, hashtags: [], mentions: [], visibility: 'public', created_at: new Date(Date.now() - 691200000).toISOString(), updated_at: new Date().toISOString(), author: { id: 'demo12', username: 'reza_a', display_name: 'رضا احمدی', avatar_url: '', bio: '', phone: '', email: '', birthday: '', is_approved: true, is_active: true, is_banned: false, is_admin: false, ban_reason: '', last_seen: '', online_status: 'online', settings: { theme: 'dark', language: 'fa', notification_sound: true, message_preview: true }, created_at: '', updated_at: '' } },
  { id: 'demo-13', author_id: 'demo13', content: '📱 بهترین پیام‌رسان‌های امن ۱۴۰۴: ۱. KingWolf ۲. Signal ۳. Telegram #مقایسه #پیام‌رسان', media_urls: [], media_types: [], reply_to_id: null, repost_of_id: null, is_deleted: false, is_pinned: false, likes_count: 445, reposts_count: 189, comments_count: 112, bookmarks_count: 234, views_count: 9800, hashtags: ['مقایسه', 'پیام_رسان'], mentions: [], visibility: 'public', created_at: new Date(Date.now() - 777600000).toISOString(), updated_at: new Date().toISOString(), author: { id: 'demo13', username: 'tech_review', display_name: 'نقد تکنولوژی', avatar_url: '', bio: '', phone: '', email: '', birthday: '', is_approved: true, is_active: true, is_banned: false, is_admin: false, ban_reason: '', last_seen: '', online_status: 'offline', settings: { theme: 'dark', language: 'fa', notification_sound: true, message_preview: true }, created_at: '', updated_at: '' } },
  { id: 'demo-14', author_id: 'demo14', content: 'هوش مصنوعی وارد دنیای پیام‌رسان‌ها شده! KingWolf هم به زودی ربات‌های هوشمند اضافه می‌کند 🤖 #هوش_مصنوعی', media_urls: [], media_types: [], reply_to_id: null, repost_of_id: null, is_deleted: false, is_pinned: false, likes_count: 378, reposts_count: 134, comments_count: 89, bookmarks_count: 167, views_count: 7200, hashtags: ['هوش_مصنوعی'], mentions: [], visibility: 'public', created_at: new Date(Date.now() - 864000000).toISOString(), updated_at: new Date().toISOString(), author: { id: 'demo14', username: 'ai_news', display_name: 'اخبار هوش مصنوعی', avatar_url: '', bio: '', phone: '', email: '', birthday: '', is_approved: true, is_active: true, is_banned: false, is_admin: false, ban_reason: '', last_seen: '', online_status: 'online', settings: { theme: 'dark', language: 'fa', notification_sound: true, message_preview: true }, created_at: '', updated_at: '' } },
  { id: 'demo-15', author_id: 'demo15', content: 'قابلیت جدید KingWolf: اکنون می‌توانید پیام‌های خود را ذخیره کنید! مثل یه دفترچه دیجیتال 📒', media_urls: [], media_types: [], reply_to_id: null, repost_of_id: null, is_deleted: false, is_pinned: false, likes_count: 256, reposts_count: 78, comments_count: 56, bookmarks_count: 123, views_count: 4500, hashtags: [], mentions: [], visibility: 'public', created_at: new Date(Date.now() - 950400000).toISOString(), updated_at: new Date().toISOString(), author: { id: 'demo', username: 'kingwolf', display_name: 'KingWolf Official', avatar_url: '', bio: '', phone: '', email: '', birthday: '', is_approved: true, is_active: true, is_banned: false, is_admin: false, ban_reason: '', last_seen: '', online_status: 'online', settings: { theme: 'dark', language: 'fa', notification_sound: true, message_preview: true }, created_at: '', updated_at: '' } },
  { id: 'demo-16', author_id: 'demo16', content: 'شرکت‌های فناوری باید بیشتر به حریم خصوصی کاربران توجه کنند. کاربران حق دارند بدانند داده‌هایشان کجا می‌رود! 🔒', media_urls: [], media_types: [], reply_to_id: null, repost_of_id: null, is_deleted: false, is_pinned: false, likes_count: 534, reposts_count: 212, comments_count: 145, bookmarks_count: 289, views_count: 11200, hashtags: [], mentions: [], visibility: 'public', created_at: new Date(Date.now() - 1036800000).toISOString(), updated_at: new Date().toISOString(), author: { id: 'demo16', username: 'privacy_advocate', display_name: 'مدافع حریم خصوصی', avatar_url: '', bio: '', phone: '', email: '', birthday: '', is_approved: true, is_active: true, is_banned: false, is_admin: false, ban_reason: '', last_seen: '', online_status: 'offline', settings: { theme: 'dark', language: 'fa', notification_sound: true, message_preview: true }, created_at: '', updated_at: '' } },
  { id: 'demo-17', author_id: 'demo17', content: 'آموزش: چطور یک گروه مناسب در KingWolf بسازید؟ ۱. یک نام مناسب انتخاب کنید ۲. اعضا را دعوت کنید ۳. قوانین گروه را تعیین کنید', media_urls: [], media_types: [], reply_to_id: null, repost_of_id: null, is_deleted: false, is_pinned: false, likes_count: 198, reposts_count: 67, comments_count: 34, bookmarks_count: 89, views_count: 3200, hashtags: [], mentions: [], visibility: 'public', created_at: new Date(Date.now() - 1123200000).toISOString(), updated_at: new Date().toISOString(), author: { id: 'demo17', username: 'tutorial_hub', display_name: 'آموزشگاه', avatar_url: '', bio: '', phone: '', email: '', birthday: '', is_approved: true, is_active: true, is_banned: false, is_admin: false, ban_reason: '', last_seen: '', online_status: 'online', settings: { theme: 'dark', language: 'fa', notification_sound: true, message_preview: true }, created_at: '', updated_at: '' } },
  { id: 'demo-18', author_id: 'demo18', content: 'سرعت اینترنت مهم‌ترین عامل برای استفاده از پیام‌رسان‌هاست. KingWolf حتی با اینترنت ضعیف هم خوب کار می‌کند! 📶', media_urls: [], media_types: [], reply_to_id: null, repost_of_id: null, is_deleted: false, is_pinned: false, likes_count: 143, reposts_count: 39, comments_count: 21, bookmarks_count: 56, views_count: 2100, hashtags: [], mentions: [], visibility: 'public', created_at: new Date(Date.now() - 1209600000).toISOString(), updated_at: new Date().toISOString(), author: { id: 'demo18', username: 'net_speed', display_name: 'سرعت نت', avatar_url: '', bio: '', phone: '', email: '', birthday: '', is_approved: true, is_active: true, is_banned: false, is_admin: false, ban_reason: '', last_seen: '', online_status: 'offline', settings: { theme: 'dark', language: 'fa', notification_sound: true, message_preview: true }, created_at: '', updated_at: '' } },
  { id: 'demo-19', author_id: 'demo19', content: '🎉 KingWolf از مرز ۱۰۰۰ کاربر گذشت! ممنون از همه شما که به ما اعتماد کردید ❤️ #میلستون #رشد', media_urls: [], media_types: [], reply_to_id: null, repost_of_id: null, is_deleted: false, is_pinned: false, likes_count: 789, reposts_count: 345, comments_count: 234, bookmarks_count: 456, views_count: 15600, hashtags: ['میلستون', 'رشد'], mentions: [], visibility: 'public', created_at: new Date(Date.now() - 1296000000).toISOString(), updated_at: new Date().toISOString(), author: { id: 'demo', username: 'kingwolf', display_name: 'KingWolf Official', avatar_url: '', bio: '', phone: '', email: '', birthday: '', is_approved: true, is_active: true, is_banned: false, is_admin: false, ban_reason: '', last_seen: '', online_status: 'online', settings: { theme: 'dark', language: 'fa', notification_sound: true, message_preview: true }, created_at: '', updated_at: '' } },
  { id: 'demo-20', author_id: 'demo20', content: 'نظر شما درباره KingWolf چیه؟ ما همیشه به دنبال بهبود تجربه کاربری هستیم. پیشنهادات خود را در نظرات بنویسید 🙏', media_urls: [], media_types: [], reply_to_id: null, repost_of_id: null, is_deleted: false, is_pinned: false, likes_count: 312, reposts_count: 89, comments_count: 178, bookmarks_count: 134, views_count: 5400, hashtags: [], mentions: [], visibility: 'public', created_at: new Date(Date.now() - 1382400000).toISOString(), updated_at: new Date().toISOString(), author: { id: 'demo', username: 'kingwolf', display_name: 'KingWolf Official', avatar_url: '', bio: '', phone: '', email: '', birthday: '', is_approved: true, is_active: true, is_banned: false, is_admin: false, ban_reason: '', last_seen: '', online_status: 'online', settings: { theme: 'dark', language: 'fa', notification_sound: true, message_preview: true }, created_at: '', updated_at: '' } },
];

const TRENDING_TAGS = [
  { tag: 'KingWolf', count: 2847 },
  { tag: 'امنیت_سایبری', count: 1923 },
  { tag: 'هوش_مصنوعی', count: 1456 },
  { tag: 'حریم_خصوصی', count: 1123 },
  { tag: 'تکنولوژی', count: 987 },
  { tag: 'پیام_رسان', count: 756 },
];

type FeedTab = 'feed' | 'explore';

export function FeedPage() {
  const { user, profile } = useAuth();
  const { language } = useTheme();
  const [tab, setTab] = useState<FeedTab>('feed');
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [bookmarkedPosts, setBookmarkedPosts] = useState<Set<string>>(new Set());
  const [newPostText, setNewPostText] = useState('');
  const [posting, setPosting] = useState(false);
  const [exploreSearch, setExploreSearch] = useState('');

  // Load real posts and the current user's likes/bookmarks from DB
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from('feed_posts')
          .select('*')
          .eq('is_deleted', 0)
          .order('created_at', { ascending: false })
          .limit(50);
        if (data && Array.isArray(data)) {
          // hydrate author info
          const authorIds = Array.from(new Set(data.map((p: any) => p.author_id)));
          let authorsById: Record<string, any> = {};
          if (authorIds.length) {
            const { data: authors } = await supabase.from('profiles').select('*').in('id', authorIds);
            (authors as any[] || []).forEach((a) => { authorsById[a.id] = a; });
          }
          const hydrated = data.map((p: any) => ({
            ...p,
            hashtags: typeof p.hashtags === 'string' ? JSON.parse(p.hashtags || '[]') : (p.hashtags || []),
            mentions: typeof p.mentions === 'string' ? JSON.parse(p.mentions || '[]') : (p.mentions || []),
            media_urls: typeof p.media_urls === 'string' ? JSON.parse(p.media_urls || '[]') : (p.media_urls || []),
            media_types: typeof p.media_types === 'string' ? JSON.parse(p.media_types || '[]') : (p.media_types || []),
            author: authorsById[p.author_id] || { id: p.author_id, username: 'unknown', display_name: 'Unknown' },
          }));
          setPosts(hydrated as any);
        }
        if (user) {
          const { data: myLikes } = await supabase.from('likes').select('post_id').eq('user_id', user.id);
          if (myLikes) setLikedPosts(new Set((myLikes as any[]).map((l) => l.post_id)));
          const { data: myBm } = await supabase.from('bookmarks').select('post_id').eq('user_id', user.id);
          if (myBm) setBookmarkedPosts(new Set((myBm as any[]).map((b) => b.post_id)));
        }
      } catch (e) { /* ignore */ }
    })();
  }, [user]);

  function formatTime(iso: string) {
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    if (diff < 60000) return 'همین الان';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} دقیقه پیش`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} ساعت پیش`;
    return `${Math.floor(diff / 86400000)} روز پیش`;
  }

  function formatCount(n: number) {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toString();
  }

  async function toggleLike(postId: string) {
    if (!user) return;
    const isLiked = likedPosts.has(postId);
    // Optimistic UI
    setLikedPosts((prev) => {
      const next = new Set(prev);
      if (isLiked) next.delete(postId); else next.add(postId);
      return next;
    });
    setPosts((p) => p.map((post) =>
      post.id === postId
        ? { ...post, likes_count: Math.max(0, post.likes_count + (isLiked ? -1 : 1)) }
        : post
    ));
    try {
      if (isLiked) {
        await supabase.from('likes').delete().eq('user_id', user.id).eq('post_id', postId);
        await supabase.from('feed_posts').update({ likes_count: posts.find(p => p.id === postId)!.likes_count - 1 }).eq('id', postId);
      } else {
        await supabase.from('likes').insert({ user_id: user.id, post_id: postId });
        await supabase.from('feed_posts').update({ likes_count: posts.find(p => p.id === postId)!.likes_count + 1 }).eq('id', postId);
      }
    } catch (e) { /* ignore */ }
  }

  async function toggleBookmark(postId: string) {
    if (!user) return;
    const isBm = bookmarkedPosts.has(postId);
    setBookmarkedPosts((prev) => {
      const next = new Set(prev);
      if (isBm) next.delete(postId); else next.add(postId);
      return next;
    });
    try {
      if (isBm) {
        await supabase.from('bookmarks').delete().eq('user_id', user.id).eq('post_id', postId);
      } else {
        await supabase.from('bookmarks').insert({ user_id: user.id, post_id: postId });
      }
    } catch (e) { /* ignore */ }
  }

  async function handlePost() {
    if (!newPostText.trim() || !user) return;
    setPosting(true);
    const content = newPostText.trim();
    // Extract hashtags
    const hashtags = Array.from(new Set((content.match(/#([\u0600-\u06FFA-Za-z0-9_]+)/g) || []).map(h => h.slice(1))));
    try {
      const { data } = await supabase.from('feed_posts').insert({
        author_id: user.id,
        content,
        visibility: 'public',
        hashtags: JSON.stringify(hashtags),
        mentions: '[]',
        media_urls: '[]',
        media_types: '[]',
      }).select().single();
      const inserted: any = data;
      if (inserted) {
        const newPost: any = {
          ...inserted,
          hashtags,
          mentions: [],
          media_urls: [],
          media_types: [],
          author: profile || undefined,
        };
        setPosts((prev) => [newPost, ...prev]);
      }
      // Update hashtag stats
      for (const tag of hashtags) {
        try {
          await supabase.from('hashtag_stats').upsert({ tag, use_count: 1, last_used_at: new Date().toISOString() }, { onConflict: 'tag' });
        } catch {}
      }
    } catch {}
    setNewPostText('');
    setPosting(false);
  }

  function PostCard({ post }: { post: FeedPost }) {
    const liked = likedPosts.has(post.id);
    const bookmarked = bookmarkedPosts.has(post.id);
    const initials = (post.author?.display_name || post.author?.username || '?').charAt(0).toUpperCase();

    return (
      <div className="rounded-2xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        {/* Author */}
        <div className="flex items-start gap-3 mb-3">
          <div className="w-10 h-10 rounded-full flex-shrink-0 overflow-hidden">
            {post.author?.avatar_url ? (
              <img src={post.author.avatar_url} className="w-full h-full object-cover" alt="" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white font-bold text-sm" style={{ background: `hsl(${(initials.charCodeAt(0) * 15) % 360}, 60%, 50%)` }}>
                {initials}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0 text-right">
            <div className="flex items-center gap-2 justify-end">
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{formatTime(post.created_at)}</span>
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{post.author?.display_name || post.author?.username}</p>
            </div>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>@{post.author?.username}</p>
          </div>
          {!!post.is_pinned && (
            <span className="text-xs px-1.5 py-0.5 rounded-md bg-yellow-500/10 text-yellow-400 flex-shrink-0">📌</span>
          )}
        </div>

        {/* Content */}
        <p className="text-sm leading-relaxed mb-3 text-right" style={{ color: 'var(--text-primary)' }}>{post.content}</p>

        {/* Hashtags */}
        {post.hashtags && post.hashtags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3 justify-end">
            {post.hashtags.map((tag) => (
              <span key={tag} className="text-xs text-blue-400">#{tag}</span>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-2" style={{ borderTop: '1px solid var(--border-color)' }}>
          <button onClick={() => toggleBookmark(post.id)} className={`flex items-center gap-1 text-xs transition-colors ${bookmarked ? 'text-blue-400' : ''}`} style={{ color: bookmarked ? '#60a5fa' : 'var(--text-muted)' }}>
            <Bookmark size={14} fill={bookmarked ? 'currentColor' : 'none'} />
          </button>
          <div className="flex items-center gap-3">
            <button className="flex items-center gap-1.5 text-xs transition-colors" style={{ color: 'var(--text-muted)' }}>
              <Repeat2 size={14} />
              <span>{formatCount(post.reposts_count)}</span>
            </button>
            <button className="flex items-center gap-1.5 text-xs transition-colors" style={{ color: 'var(--text-muted)' }}>
              <MessageCircle size={14} />
              <span>{formatCount(post.comments_count)}</span>
            </button>
            <button onClick={() => toggleLike(post.id)} className="flex items-center gap-1.5 text-xs transition-colors" style={{ color: liked ? '#f43f5e' : 'var(--text-muted)' }}>
              <Heart size={14} fill={liked ? 'currentColor' : 'none'} />
              <span>{formatCount(post.likes_count)}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const filteredPosts = exploreSearch
    ? posts.filter((p) => p.content.includes(exploreSearch) || p.hashtags?.some((h) => h.includes(exploreSearch)))
    : posts;

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-primary)' }} dir={language === 'fa' ? 'rtl' : 'ltr'}>
      {/* Header + Tabs */}
      <div className="flex-shrink-0 px-4 pt-4 pb-2" style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border-color)' }}>
        <h2 className="font-bold text-base mb-3" style={{ color: 'var(--text-primary)' }}>فید</h2>
        <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--bg-input)' }}>
          {[
            { id: 'feed' as FeedTab, label: 'خانه', icon: Flame },
            { id: 'explore' as FeedTab, label: 'جستجو', icon: Search },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex-1 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5 transition-all"
              style={{ background: tab === t.id ? 'var(--accent)' : 'transparent', color: tab === t.id ? 'white' : 'var(--text-muted)' }}
            >
              <t.icon size={14} />
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === 'feed' && (
          <div className="p-3 space-y-3">
            {/* Compose */}
            <div className="rounded-2xl p-3" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
              <div className="flex gap-3">
                <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0 text-white text-sm font-bold">
                  {(profile?.display_name || profile?.username || '?').charAt(0).toUpperCase()}
                </div>
                <div className="flex-1">
                  <textarea
                    value={newPostText} onChange={(e) => setNewPostText(e.target.value)}
                    placeholder="چه خبره؟ ..."
                    rows={2}
                    className="w-full bg-transparent outline-none text-sm resize-none text-right"
                    style={{ color: 'var(--text-primary)' }}
                  />
                  <div className="flex items-center justify-between mt-2">
                    <button
                      onClick={handlePost}
                      disabled={!newPostText.trim() || posting}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-white transition-all"
                      style={{ background: newPostText.trim() ? 'var(--accent)' : 'var(--bg-input)', color: newPostText.trim() ? 'white' : 'var(--text-muted)' }}
                    >
                      {posting ? <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" /> : <Send size={12} />}
                      ارسال
                    </button>
                    <button style={{ color: 'var(--text-muted)' }}><Image size={16} /></button>
                  </div>
                </div>
              </div>
            </div>

            {/* Posts */}
            {posts.map((post) => <PostCard key={post.id} post={post} />)}
          </div>
        )}

        {tab === 'explore' && (
          <div className="p-3 space-y-4">
            {/* Search */}
            <div className="relative">
              <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
              <input
                value={exploreSearch} onChange={(e) => setExploreSearch(e.target.value)}
                placeholder="جستجوی پست‌ها، هشتگ‌ها..."
                className="w-full pr-9 pl-4 py-3 rounded-xl text-sm outline-none"
                style={{ background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}
              />
            </div>

            {exploreSearch ? (
              <div className="space-y-3">
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>نتایج برای: "{exploreSearch}"</p>
                {filteredPosts.length === 0 ? (
                  <div className="text-center py-8">
                    <Search size={32} className="mx-auto mb-2 opacity-30" style={{ color: 'var(--text-muted)' }} />
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>نتیجه‌ای یافت نشد</p>
                  </div>
                ) : filteredPosts.map((p) => <PostCard key={p.id} post={p} />)}
              </div>
            ) : (
              <>
                {/* Trending */}
                <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                  <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <TrendingUp size={16} className="text-blue-400" />
                    <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>ترند‌های امروز</span>
                  </div>
                  {TRENDING_TAGS.map((tag, idx) => (
                    <button
                      key={tag.tag}
                      onClick={() => setExploreSearch(tag.tag)}
                      className="w-full flex items-center justify-between px-4 py-3 transition-colors hover:bg-white/5 text-right"
                      style={{ borderBottom: idx < TRENDING_TAGS.length - 1 ? '1px solid var(--border-color)' : 'none' }}
                    >
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{formatCount(tag.count)} پست</span>
                      <div className="text-right">
                        <p className="text-sm font-medium text-blue-400">#{tag.tag}</p>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>ترند در KingWolf</p>
                      </div>
                    </button>
                  ))}
                </div>

                {/* Suggested accounts */}
                <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                  <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <Users size={16} className="text-purple-400" />
                    <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>حساب‌های پیشنهادی</span>
                  </div>
                  {['KingWolf Official', 'وبلاگ تکنولوژی', 'امنیت سایبری', 'اخبار هوش مصنوعی'].map((name, idx) => (
                    <div key={name} className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: idx < 3 ? '1px solid var(--border-color)' : 'none' }}>
                      <button className="text-xs px-3 py-1 rounded-full text-white transition-colors flex-shrink-0" style={{ background: 'var(--accent)' }}>دنبال کن</button>
                      <div className="flex-1 min-w-0 text-right">
                        <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{name}</p>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>پیشنهادی برای شما</p>
                      </div>
                      <div className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-white text-sm font-bold" style={{ background: `hsl(${(name.charCodeAt(0) * 30) % 360}, 60%, 50%)` }}>
                        {name.charAt(0)}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
