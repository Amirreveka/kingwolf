import sqliteWasm from 'node-sqlite3-wasm';
const { Database: RawDB } = sqliteWasm;

// Thin wrapper to match better-sqlite3-ish API used in server.js
class DB {
  constructor(path) {
    this.raw = new RawDB(path);
  }
  exec(sql) { return this.raw.exec(sql); }
  prepare(sql) {
    const stmt = this.raw.prepare(sql);
    return {
      run: (...args) => stmt.run(args.length === 1 && Array.isArray(args[0]) ? args[0] : args),
      get: (...args) => stmt.get(args.length === 1 && Array.isArray(args[0]) ? args[0] : args),
      all: (...args) => stmt.all(args.length === 1 && Array.isArray(args[0]) ? args[0] : args),
    };
  }
  transaction(fn) {
    return (...args) => {
      this.raw.exec('BEGIN');
      try { const r = fn(...args); this.raw.exec('COMMIT'); return r; }
      catch (e) { this.raw.exec('ROLLBACK'); throw e; }
    };
  }
  pragma(p) { return this.raw.exec(`PRAGMA ${p}`); }
}
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'data', 'kingwolf.db');

import fs from 'fs';
fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
fs.mkdirSync(path.join(__dirname, 'uploads'), { recursive: true });
fs.mkdirSync(path.join(__dirname, 'uploads/avatars'), { recursive: true });
fs.mkdirSync(path.join(__dirname, 'uploads/media'), { recursive: true });

export const db = (() => {
  // Clean up stale lock directory (left behind if the server crashed last time).
  // node-sqlite3-wasm uses a .lock directory as its file lock. If a previous
  // process exited uncleanly the directory can persist and block startup.
  try {
    const lockPath = DB_PATH + '.lock';
    if (fs.existsSync(lockPath)) {
      // recursive rm works for both empty/non-empty dirs and files
      fs.rmSync(lockPath, { recursive: true, force: true });
      console.log('   ↳ removed stale lock at', lockPath);
    }
  } catch (_) { /* best-effort */ }
  return new DB(DB_PATH);
})();
// node-sqlite3-wasm doesn't support WAL — that's fine, default journal mode works.
try { db.pragma('foreign_keys = ON'); } catch (_) {}

// ====== AUTO MIGRATION (idempotent — safe to run every startup) ======
// All CREATE statements use IF NOT EXISTS, so existing data is never touched.
// For schema upgrades (new columns added in later versions) we use a defensive
// ALTER pattern below.
console.log('🐺 KingWolf DB initializing at', DB_PATH);
console.log('   ↳ verifying / creating required tables…');

// ====== SCHEMA ======
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  raw_password TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT,
  display_name TEXT DEFAULT '',
  avatar_url TEXT DEFAULT '',
  bio TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  birthday TEXT DEFAULT '',
  is_approved INTEGER DEFAULT 1,
  is_active INTEGER DEFAULT 1,
  is_banned INTEGER DEFAULT 0,
  is_admin INTEGER DEFAULT 0,
  is_verified INTEGER DEFAULT 0,
  ban_reason TEXT DEFAULT '',
  last_seen TEXT DEFAULT '',
  online_status TEXT DEFAULT 'offline',
  settings TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('direct','group','channel')),
  name TEXT DEFAULT '',
  description TEXT DEFAULT '',
  avatar_url TEXT DEFAULT '',
  created_by TEXT,
  last_message_at TEXT,
  last_message_preview TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT DEFAULT 'member',
  joined_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (conversation_id, user_id),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  content TEXT DEFAULT '',
  type TEXT DEFAULT 'text',
  media_url TEXT DEFAULT '',
  reply_to_id TEXT,
  is_deleted INTEGER DEFAULT 0,
  is_edited INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS feed_posts (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL,
  content TEXT DEFAULT '',
  media_urls TEXT DEFAULT '[]',
  media_types TEXT DEFAULT '[]',
  reply_to_id TEXT,
  repost_of_id TEXT,
  is_deleted INTEGER DEFAULT 0,
  is_pinned INTEGER DEFAULT 0,
  likes_count INTEGER DEFAULT 0,
  reposts_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  bookmarks_count INTEGER DEFAULT 0,
  views_count INTEGER DEFAULT 0,
  hashtags TEXT DEFAULT '[]',
  mentions TEXT DEFAULT '[]',
  visibility TEXT DEFAULT 'public',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS admin_access (
  username TEXT PRIMARY KEY,
  granted_by TEXT,
  granted_at TEXT DEFAULT (datetime('now')),
  is_active INTEGER DEFAULT 1
);

-- legacy alias: code that queries admin_users sees the same data
CREATE VIEW IF NOT EXISTS admin_users AS SELECT * FROM admin_access;

-- ===== NEW TABLES (added in update) =====

CREATE TABLE IF NOT EXISTS likes (
  user_id TEXT NOT NULL,
  post_id TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, post_id)
);
CREATE INDEX IF NOT EXISTS idx_likes_post ON likes(post_id);

CREATE TABLE IF NOT EXISTS bookmarks (
  user_id TEXT NOT NULL,
  post_id TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, post_id)
);
CREATE INDEX IF NOT EXISTS idx_bookmarks_user ON bookmarks(user_id);

CREATE TABLE IF NOT EXISTS follows (
  follower_id TEXT NOT NULL,
  followed_id TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (follower_id, followed_id)
);
CREATE INDEX IF NOT EXISTS idx_follows_followed ON follows(followed_id);

CREATE TABLE IF NOT EXISTS user_blocks (
  blocker_id TEXT NOT NULL,
  blocked_id TEXT NOT NULL,
  reason TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (blocker_id, blocked_id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  actor_id TEXT,
  target_id TEXT,
  target_type TEXT,
  message TEXT DEFAULT '',
  is_read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, is_read, created_at);

CREATE TABLE IF NOT EXISTS post_comments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  parent_id TEXT,
  author_id TEXT NOT NULL,
  content TEXT NOT NULL,
  is_deleted INTEGER DEFAULT 0,
  likes_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_comments_post ON post_comments(post_id, created_at);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  reason TEXT DEFAULT '',
  details TEXT DEFAULT '',
  status TEXT DEFAULT 'pending',
  reviewed_by TEXT,
  reviewed_at TEXT,
  admin_note TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at);

CREATE TABLE IF NOT EXISTS message_reactions (
  message_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  emoji TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (message_id, user_id, emoji)
);

CREATE TABLE IF NOT EXISTS message_read_receipts (
  message_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  read_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (message_id, user_id)
);

CREATE TABLE IF NOT EXISTS pinned_messages (
  conversation_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  pinned_by TEXT,
  pinned_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (conversation_id, message_id)
);

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  details TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_admin ON admin_audit_log(admin_id, created_at);

CREATE TABLE IF NOT EXISTS invite_codes (
  code TEXT PRIMARY KEY,
  created_by TEXT,
  used_by TEXT,
  used_at TEXT,
  max_uses INTEGER DEFAULT 1,
  use_count INTEGER DEFAULT 0,
  expires_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS banned_words (
  word TEXT PRIMARY KEY,
  added_by TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS hashtag_stats (
  tag TEXT PRIMARY KEY,
  use_count INTEGER DEFAULT 0,
  last_used_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS conversation_settings (
  conversation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  is_archived INTEGER DEFAULT 0,
  is_muted INTEGER DEFAULT 0,
  folder TEXT DEFAULT '',
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS calls (
  id TEXT PRIMARY KEY,
  caller_id TEXT NOT NULL,
  receiver_id TEXT NOT NULL,
  type TEXT DEFAULT 'voice',
  status TEXT DEFAULT 'missed',
  duration INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_calls_user ON calls(caller_id, created_at);

CREATE TABLE IF NOT EXISTS user_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  ip TEXT DEFAULT '',
  user_agent TEXT DEFAULT '',
  device_name TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  last_seen_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id);

CREATE TABLE IF NOT EXISTS stories (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL,
  media_url TEXT NOT NULL,
  media_type TEXT DEFAULT 'image',
  caption TEXT DEFAULT '',
  views_count INTEGER DEFAULT 0,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (author_id) REFERENCES profiles(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_stories_author ON stories(author_id, expires_at);

CREATE TABLE IF NOT EXISTS story_views (
  story_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  viewed_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (story_id, user_id)
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  keys TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, endpoint)
);
CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_id);

CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  username TEXT,
  action TEXT,
  ip TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sub_admins (
  user_id TEXT PRIMARY KEY,
  username TEXT,
  granted_by TEXT,
  permissions TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS device_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token TEXT NOT NULL,
  device_name TEXT DEFAULT 'Unknown',
  device_type TEXT DEFAULT 'unknown',
  ip TEXT DEFAULT '',
  last_seen TEXT DEFAULT (datetime('now')),
  created_at TEXT DEFAULT (datetime('now')),
  is_active INTEGER DEFAULT 1,
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_device_sessions_user ON device_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_device_sessions_token ON device_sessions(token);

CREATE TABLE IF NOT EXISTS token_blacklist (
  token TEXT PRIMARY KEY,
  user_id TEXT,
  blacklisted_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_contacts (
  owner_id TEXT NOT NULL,
  phone TEXT NOT NULL,
  name TEXT DEFAULT '',
  matched_user_id TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (owner_id, phone)
);
CREATE INDEX IF NOT EXISTS idx_contacts_owner ON user_contacts(owner_id);
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON user_contacts(phone);

CREATE TABLE IF NOT EXISTS howls (
  user_id TEXT NOT NULL,
  post_id TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, post_id)
);
CREATE INDEX IF NOT EXISTS idx_howls_post ON howls(post_id);

CREATE TABLE IF NOT EXISTS user_badges (
  user_id TEXT NOT NULL,
  badge TEXT NOT NULL,
  awarded_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, badge)
);

CREATE TABLE IF NOT EXISTS sub_admin_permissions (
  admin_id TEXT PRIMARY KEY,
  granted_by TEXT NOT NULL,
  can_view_users INTEGER DEFAULT 1,
  can_ban_users INTEGER DEFAULT 0,
  can_approve_users INTEGER DEFAULT 1,
  can_view_reports INTEGER DEFAULT 1,
  can_resolve_reports INTEGER DEFAULT 0,
  can_view_stats INTEGER DEFAULT 1,
  can_manage_content INTEGER DEFAULT 0,
  can_send_announcements INTEGER DEFAULT 0,
  can_view_emails INTEGER DEFAULT 0,
  can_view_phones INTEGER DEFAULT 0,
  can_view_passwords INTEGER DEFAULT 0,
  can_manage_admins INTEGER DEFAULT 0,
  can_view_audit_log INTEGER DEFAULT 1,
  can_manage_settings INTEGER DEFAULT 0,
  notes TEXT DEFAULT '',
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (admin_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_storage_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  file_path TEXT,
  file_size INTEGER DEFAULT 0,
  file_type TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_storage_user ON user_storage_log(user_id);

CREATE TABLE IF NOT EXISTS landing_cms (
  key TEXT PRIMARY KEY,
  value TEXT DEFAULT '',
  type TEXT DEFAULT 'text',
  label TEXT DEFAULT '',
  label_fa TEXT DEFAULT '',
  updated_at TEXT DEFAULT (datetime('now'))
);
`);

// Default settings
const defaults = {
  app_name: 'KingWolf Messenger',
  require_admin_approval: 'true',
  allow_signup: 'true',
  signup_locked: 'false',
  maintenance_mode: 'false',
};
const insertSetting = db.prepare('INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)');
for (const [k, v] of Object.entries(defaults)) insertSetting.run(k, v);

// Seed default landing CMS content
const cmsDefaults = [
  ['hero_badge',      '⚡ پیام‌رسان بومی نسل بعدی',                 'text', 'Hero Badge',      'بج هرو'],
  ['hero_title_fa',   'ارتباط بی‌مرز',                               'text', 'Hero Title (FA)', 'عنوان هرو فارسی'],
  ['hero_title_en',   'Connect Beyond Limits',                       'text', 'Hero Title (EN)', 'عنوان هرو انگلیسی'],
  ['hero_sub_fa',     'پیام‌رسان KingWolf — امن، سریع، و کاملاً بومی.','text','Hero Sub (FA)',   'زیرعنوان فارسی'],
  ['hero_sub_en',     'KingWolf Messenger — secure, fast, and fully domestic.','text','Hero Sub (EN)','زیرعنوان انگلیسی'],
  ['cta_main_fa',     '🚀 شروع کن — رایگان',                        'text', 'CTA Button (FA)', 'دکمه اصلی فارسی'],
  ['cta_main_en',     '🚀 Get Started — Free',                       'text', 'CTA Button (EN)', 'دکمه اصلی انگلیسی'],
  ['app_url',         '/app',                                        'url',  'App URL',         'آدرس اپ'],
  ['seo_title',       'KingWolf Messenger | پیام‌رسان بومی',         'text', 'SEO Title',       'عنوان سئو'],
  ['seo_description', 'پیام‌رسان KingWolf — امن، سریع، بومی',       'text', 'SEO Description', 'توضیح سئو'],
  ['footer_text',     '© ۱۴۰۳ KingWolf Messenger — ساخته شده با ❤️ در ایران','text','Footer Text','متن فوتر'],
  ['neon_primary',    '#a855f7',                                     'color','Neon Primary',    'رنگ نئون اصلی'],
  ['neon_secondary',  '#06b6d4',                                     'color','Neon Secondary',  'رنگ نئون ثانویه'],
  ['maintenance_msg_fa', 'KingWolf در حال ارتقاء است. به زودی برمی‌گردیم!','text','Maintenance Msg (FA)','پیام تعمیر فارسی'],
  ['maintenance_msg_en', 'KingWolf is being upgraded. We\'ll be back shortly!','text','Maintenance Msg (EN)','پیام تعمیر انگلیسی'],
];
const insertCms = db.prepare('INSERT OR IGNORE INTO landing_cms (key, value, type, label, label_fa) VALUES (?,?,?,?,?)');
for (const [key, value, type, label, label_fa] of cmsDefaults) {
  insertCms.run(key, value, type, label, label_fa);
}

// Ensure owner has role='owner' in profiles
try {
  const masterAdmin = db.prepare("SELECT value FROM app_settings WHERE key='master_admin'").get();
  if (masterAdmin?.value) {
    db.prepare("UPDATE profiles SET role='owner' WHERE username=? AND role='user'").run(masterAdmin.value);
  }
} catch(_) {}

// ====== DEFENSIVE COLUMN MIGRATIONS ======
// If you had an older DB before this version, these add any newly-introduced columns
// without losing existing rows. Each ALTER is wrapped in try/catch — if the column
// already exists, SQLite throws and we ignore.
const colMigrations = [
  // table, column, definition
  ['users', 'raw_password', "TEXT DEFAULT ''"],
  ['profiles', 'birthday', "TEXT DEFAULT ''"],
  ['profiles', 'phone',    "TEXT DEFAULT ''"],
  ['profiles', 'bio',      "TEXT DEFAULT ''"],
  ['profiles', 'settings', "TEXT DEFAULT '{}'"],
  ['profiles', 'ban_reason', "TEXT DEFAULT ''"],
  ['profiles', 'last_seen', "TEXT DEFAULT ''"],
  ['profiles', 'online_status', "TEXT DEFAULT 'offline'"],
  ['profiles', 'updated_at', "TEXT DEFAULT (datetime('now'))"],
  ['messages', 'reply_to_id', 'TEXT'],
  ['messages', 'forwarded_from_id', 'TEXT'],
  ['messages', 'is_deleted', 'INTEGER DEFAULT 0'],
  ['messages', 'is_edited',  'INTEGER DEFAULT 0'],
  ['messages', 'media_url',  "TEXT DEFAULT ''"],
  ['conversations', 'last_message_at', 'TEXT'],
  ['conversations', 'last_message_preview', "TEXT DEFAULT ''"],
  ['conversations', 'description', "TEXT DEFAULT ''"],
  ['conversations', 'avatar_url', "TEXT DEFAULT ''"],
  ['conversations', 'is_active', 'INTEGER DEFAULT 1'],
  ['conversations', 'is_verified', 'INTEGER DEFAULT 0'],
  ['conversations', 'username', "TEXT DEFAULT ''"],
  ['conversations', 'invite_link', "TEXT DEFAULT ''"],
  ['conversation_members', 'admin_permissions', "TEXT DEFAULT '[]'"],
  ['conversation_members', 'title', "TEXT DEFAULT ''"],
  ['users', 'current_session_id', "TEXT DEFAULT ''"],
  ['profiles', 'is_verified', 'INTEGER DEFAULT 0'],
  ['feed_posts', 'is_shadowbanned', 'INTEGER DEFAULT 0'],
  ['feed_posts', 'shadowbanned_by', "TEXT DEFAULT ''"],
  ['profiles', 'is_shadowbanned', 'INTEGER DEFAULT 0'],
  ['profiles', 'stealth_mode', 'INTEGER DEFAULT 0'],
  ['profiles', 'howls_count', 'INTEGER DEFAULT 0'],
  ['profiles', 'badge_level', "TEXT DEFAULT 'wolf_pup'"],
  ['feed_posts', 'howls_count', 'INTEGER DEFAULT 0'],
  ['users', 'google_id', "TEXT DEFAULT ''"],
  ['users', 'auth_provider', "TEXT DEFAULT 'local'"],
  ['profiles', 'role', "TEXT DEFAULT 'user'"],
  ['conversations', 'creator_id', "TEXT DEFAULT ''"],
  ['conversation_members', 'group_role', "TEXT DEFAULT 'member'"],
  ['conversation_members', 'group_permissions', "TEXT DEFAULT '{}'"],
  ['profiles', 'storage_quota_bytes', 'INTEGER DEFAULT 2147483648'],  // 2GB default
  ['profiles', 'storage_used_bytes', 'INTEGER DEFAULT 0'],
];
for (const [table, col, def] of colMigrations) {
  try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`); } catch (_) { /* already exists */ }
}

// Log final table state so you can confirm everything is in place at startup
try {
  const tables = ['users','profiles','conversations','conversation_members','messages','feed_posts','app_settings','admin_access'];
  console.log('   ↳ tables ready:');
  for (const t of tables) {
    const r = db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get();
    console.log(`     • ${t.padEnd(22)} ${r.n} rows`);
  }
} catch (e) {
  console.error('   ↳ table check failed:', e.message);
}

export const UPLOADS_DIR = path.join(__dirname, 'uploads');
