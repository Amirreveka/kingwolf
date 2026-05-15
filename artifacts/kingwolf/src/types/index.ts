export interface Profile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string;
  bio: string;
  phone: string;
  email: string;
  birthday: string;
  is_approved: boolean;
  is_active: boolean;
  is_banned: boolean;
  is_admin: boolean;
  is_verified?: number;
  ban_reason: string;
  last_seen: string;
  online_status: string;
  settings: UserSettings;
  created_at: string;
  updated_at: string;
}

export interface UserSettings {
  theme: 'dark' | 'light';
  language: 'fa' | 'en';
  notification_sound: boolean;
  message_preview: boolean;
}

export interface Conversation {
  id: string;
  type: 'direct' | 'group' | 'channel' | 'saved';
  name: string;
  description: string;
  avatar_url: string;
  created_by: string;
  is_active: boolean;
  last_message_at: string;
  last_message_preview: string;
  member_count: number;
  created_at: string;
  is_verified?: number;
  other_user?: Profile;
  unread_count?: number;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  type: 'text' | 'image' | 'video' | 'audio' | 'voice' | 'file' | 'sticker' | 'system';
  media_url: string;
  media_thumbnail_url: string;
  media_size: number;
  media_duration: number;
  reply_to_id: string | null;
  forwarded_from_id: string | null;
  is_edited: boolean;
  is_deleted: boolean;
  is_pinned: boolean;
  reactions_count: Record<string, number>;
  created_at: string;
  updated_at: string;
  sender?: Profile;
  reply_to?: Message;
}

export interface FeedPost {
  id: string;
  author_id: string;
  content: string;
  media_urls: string[];
  media_types: string[];
  reply_to_id: string | null;
  repost_of_id: string | null;
  is_deleted: boolean;
  is_pinned: boolean;
  likes_count: number;
  reposts_count: number;
  comments_count: number;
  bookmarks_count: number;
  views_count: number;
  hashtags: string[];
  mentions: string[];
  visibility: 'public' | 'followers' | 'private';
  created_at: string;
  updated_at: string;
  author?: Profile;
  liked_by_me?: boolean;
  reposted_by_me?: boolean;
  bookmarked_by_me?: boolean;
}

export interface FeedComment {
  id: string;
  post_id: string;
  author_id: string;
  content: string;
  parent_comment_id: string | null;
  likes_count: number;
  is_deleted: boolean;
  created_at: string;
  author?: Profile;
}

export interface AdminUser {
  id: string;
  user_id: string;
  username: string;
  display_name: string;
  role: string;
  is_active: boolean;
  last_login: string;
  created_at: string;
}

export interface AppSettings {
  app_name: string;
  app_logo_type: string;
  app_logo_url: string;
  theme_default: string;
  registration_enabled: string;
  require_admin_approval: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
}
