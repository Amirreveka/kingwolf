import mysql from 'mysql2/promise';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const UPLOADS_DIR = path.join(__dirname, 'uploads');

fs.mkdirSync(path.join(__dirname, 'uploads'), { recursive: true });
fs.mkdirSync(path.join(__dirname, 'uploads/avatars'), { recursive: true });
fs.mkdirSync(path.join(__dirname, 'uploads/media'), { recursive: true });
fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });

// ── Connection Pool ──────────────────────────────────────────────────────────
const pool = mysql.createPool({
  host:               process.env.MARIADB_HOST     || 'localhost',
  port:               parseInt(process.env.MARIADB_PORT || '3306'),
  user:               process.env.MARIADB_USERNAME || 'kingwolf',
  password:           process.env.MARIADB_PASSWORD || '',
  database:           process.env.MARIADB_DATABASE || 'kingwolf',
  waitForConnections: true,
  connectionLimit:    20,
  queueLimit:         0,
  charset:            'utf8mb4',
  timezone:           'Z',
  multipleStatements: false,
  decimalNumbers:     true,
});

// ── Query helpers ────────────────────────────────────────────────────────────
export async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return Array.isArray(rows) ? rows : [];
}

export async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0];
}

export async function run(sql, params = []) {
  const [result] = await pool.query(sql, params);
  return result;
}

export async function transaction(fn) {
  const conn = await pool.getConnection();
  await conn.beginTransaction();
  try {
    const result = await fn({
      query:    async (sql, p = []) => { const [rows] = await conn.query(sql, p); return Array.isArray(rows) ? rows : []; },
      queryOne: async (sql, p = []) => { const [rows] = await conn.query(sql, p); return Array.isArray(rows) ? rows[0] : undefined; },
      run:      async (sql, p = []) => { const [res]  = await conn.query(sql, p); return res; },
    });
    await conn.commit();
    return result;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

// ── Schema ───────────────────────────────────────────────────────────────────
const SCHEMA = [
`CREATE TABLE IF NOT EXISTS users (
  id              VARCHAR(36)  NOT NULL PRIMARY KEY,
  email           VARCHAR(255) NOT NULL UNIQUE,
  password_hash   TEXT         NOT NULL,
  raw_password    TEXT         DEFAULT '',
  google_id       VARCHAR(255) DEFAULT '',
  auth_provider   VARCHAR(50)  DEFAULT 'local',
  current_session_id VARCHAR(36) DEFAULT '',
  created_at      DATETIME     DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

`CREATE TABLE IF NOT EXISTS profiles (
  id              VARCHAR(36)  NOT NULL PRIMARY KEY,
  username        VARCHAR(100) NOT NULL UNIQUE,
  email           VARCHAR(255) DEFAULT '',
  display_name    VARCHAR(255) DEFAULT '',
  avatar_url      TEXT         DEFAULT '',
  bio             TEXT         DEFAULT '',
  phone           VARCHAR(50)  DEFAULT '',
  birthday        VARCHAR(20)  DEFAULT '',
  is_approved     TINYINT(1)   DEFAULT 1,
  is_active       TINYINT(1)   DEFAULT 1,
  is_banned       TINYINT(1)   DEFAULT 0,
  is_admin        TINYINT(1)   DEFAULT 0,
  is_verified     TINYINT(1)   DEFAULT 0,
  is_premium      TINYINT(1)   DEFAULT 0,
  is_shadowbanned TINYINT(1)   DEFAULT 0,
  stealth_mode    TINYINT(1)   DEFAULT 0,
  ban_reason      TEXT         DEFAULT '',
  last_seen       VARCHAR(50)  DEFAULT '',
  online_status   VARCHAR(20)  DEFAULT 'offline',
  settings        TEXT         DEFAULT '{}',
  role            VARCHAR(20)  DEFAULT 'user',
  badge_level     VARCHAR(50)  DEFAULT 'wolf_pup',
  howls_count     INT          DEFAULT 0,
  storage_quota_bytes BIGINT   DEFAULT 2147483648,
  storage_used_bytes  BIGINT   DEFAULT 0,
  public_key      TEXT         DEFAULT NULL,
  premium_expires_at DATETIME  DEFAULT NULL,
  created_at      DATETIME     DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

`CREATE TABLE IF NOT EXISTS conversations (
  id                    VARCHAR(36)  NOT NULL PRIMARY KEY,
  type                  VARCHAR(20)  NOT NULL,
  name                  TEXT         DEFAULT '',
  description           TEXT         DEFAULT '',
  avatar_url            TEXT         DEFAULT '',
  username              VARCHAR(100) DEFAULT '',
  invite_link           VARCHAR(255) DEFAULT '',
  created_by            VARCHAR(36)  DEFAULT '',
  creator_id            VARCHAR(36)  DEFAULT '',
  last_message_at       DATETIME     DEFAULT NULL,
  last_message_preview  TEXT         DEFAULT '',
  is_active             TINYINT(1)   DEFAULT 1,
  is_verified           TINYINT(1)   DEFAULT 0,
  created_at            DATETIME     DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

`CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id   VARCHAR(36)  NOT NULL,
  user_id           VARCHAR(36)  NOT NULL,
  role              VARCHAR(20)  DEFAULT 'member',
  group_role        VARCHAR(20)  DEFAULT 'member',
  group_permissions TEXT         DEFAULT '{}',
  admin_permissions TEXT         DEFAULT '[]',
  title             VARCHAR(100) DEFAULT '',
  joined_at         DATETIME     DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (conversation_id, user_id),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

`CREATE TABLE IF NOT EXISTS messages (
  id              VARCHAR(36)  NOT NULL PRIMARY KEY,
  conversation_id VARCHAR(36)  NOT NULL,
  sender_id       VARCHAR(36)  NOT NULL,
  content         TEXT         DEFAULT '',
  type            VARCHAR(20)  DEFAULT 'text',
  media_url       TEXT         DEFAULT '',
  file_url        TEXT         DEFAULT NULL,
  file_name       TEXT         DEFAULT NULL,
  file_size       BIGINT       DEFAULT NULL,
  file_type       VARCHAR(100) DEFAULT NULL,
  reply_to_id     VARCHAR(36)  DEFAULT NULL,
  forwarded_from_id VARCHAR(36) DEFAULT NULL,
  is_deleted      TINYINT(1)   DEFAULT 0,
  is_edited       TINYINT(1)   DEFAULT 0,
  expires_at      BIGINT       DEFAULT NULL,
  deleted_at      BIGINT       DEFAULT NULL,
  deleted_by      VARCHAR(36)  DEFAULT NULL,
  created_at      DATETIME(3)  DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

`CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at)`,

`CREATE TABLE IF NOT EXISTS app_settings (
  \`key\`   VARCHAR(100) NOT NULL PRIMARY KEY,
  value  TEXT         DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

`CREATE TABLE IF NOT EXISTS feed_posts (
  id              VARCHAR(36)  NOT NULL PRIMARY KEY,
  author_id       VARCHAR(36)  NOT NULL,
  content         TEXT         DEFAULT '',
  media_urls      TEXT         DEFAULT '[]',
  media_types     TEXT         DEFAULT '[]',
  reply_to_id     VARCHAR(36)  DEFAULT NULL,
  repost_of_id    VARCHAR(36)  DEFAULT NULL,
  is_deleted      TINYINT(1)   DEFAULT 0,
  is_pinned       TINYINT(1)   DEFAULT 0,
  is_shadowbanned TINYINT(1)   DEFAULT 0,
  shadowbanned_by VARCHAR(36)  DEFAULT '',
  likes_count     INT          DEFAULT 0,
  reposts_count   INT          DEFAULT 0,
  comments_count  INT          DEFAULT 0,
  bookmarks_count INT          DEFAULT 0,
  views_count     INT          DEFAULT 0,
  howls_count     INT          DEFAULT 0,
  hashtags        TEXT         DEFAULT '[]',
  mentions        TEXT         DEFAULT '[]',
  visibility      VARCHAR(20)  DEFAULT 'public',
  created_at      DATETIME     DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

`CREATE TABLE IF NOT EXISTS admin_access (
  username    VARCHAR(100) NOT NULL PRIMARY KEY,
  granted_by  VARCHAR(100) DEFAULT '',
  granted_at  DATETIME     DEFAULT CURRENT_TIMESTAMP,
  is_active   TINYINT(1)   DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

`CREATE OR REPLACE VIEW admin_users AS SELECT * FROM admin_access`,

`CREATE TABLE IF NOT EXISTS likes (
  user_id    VARCHAR(36) NOT NULL,
  post_id    VARCHAR(36) NOT NULL,
  created_at DATETIME    DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, post_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

`CREATE INDEX IF NOT EXISTS idx_likes_post ON likes(post_id)`,

`CREATE TABLE IF NOT EXISTS bookmarks (
  user_id    VARCHAR(36) NOT NULL,
  post_id    VARCHAR(36) NOT NULL,
  created_at DATETIME    DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, post_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

`CREATE INDEX IF NOT EXISTS idx_bookmarks_user ON bookmarks(user_id)`,

`CREATE TABLE IF NOT EXISTS follows (
  follower_id VARCHAR(36) NOT NULL,
  followed_id VARCHAR(36) NOT NULL,
  created_at  DATETIME    DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (follower_id, followed_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

`CREATE INDEX IF NOT EXISTS idx_follows_followed ON follows(followed_id)`,

`CREATE TABLE IF NOT EXISTS user_blocks (
  blocker_id VARCHAR(36) NOT NULL,
  blocked_id VARCHAR(36) NOT NULL,
  reason     TEXT        DEFAULT '',
  created_at DATETIME    DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (blocker_id, blocked_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

`CREATE TABLE IF NOT EXISTS notifications (
  id          VARCHAR(36)  NOT NULL PRIMARY KEY,
  user_id     VARCHAR(36)  NOT NULL,
  type        VARCHAR(50)  NOT NULL,
  actor_id    VARCHAR(36)  DEFAULT NULL,
  target_id   VARCHAR(36)  DEFAULT NULL,
  target_type VARCHAR(50)  DEFAULT '',
  message     TEXT         DEFAULT '',
  is_read     TINYINT(1)   DEFAULT 0,
  created_at  DATETIME     DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

`CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, is_read, created_at)`,

`CREATE TABLE IF NOT EXISTS post_comments (
  id          VARCHAR(36) NOT NULL PRIMARY KEY,
  post_id     VARCHAR(36) NOT NULL,
  parent_id   VARCHAR(36) DEFAULT NULL,
  author_id   VARCHAR(36) NOT NULL,
  content     TEXT        NOT NULL,
  is_deleted  TINYINT(1)  DEFAULT 0,
  likes_count INT         DEFAULT 0,
  created_at  DATETIME    DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

`CREATE INDEX IF NOT EXISTS idx_comments_post ON post_comments(post_id, created_at)`,

`CREATE TABLE IF NOT EXISTS reports (
  id           VARCHAR(36)  NOT NULL PRIMARY KEY,
  reporter_id  VARCHAR(36)  NOT NULL,
  target_type  VARCHAR(50)  NOT NULL,
  target_id    VARCHAR(36)  NOT NULL,
  reason       TEXT         DEFAULT '',
  details      TEXT         DEFAULT '',
  status       VARCHAR(20)  DEFAULT 'pending',
  reviewed_by  VARCHAR(36)  DEFAULT NULL,
  reviewed_at  DATETIME     DEFAULT NULL,
  admin_note   TEXT         DEFAULT '',
  created_at   DATETIME     DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

`CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at)`,

`CREATE TABLE IF NOT EXISTS message_reactions (
  message_id VARCHAR(36)  NOT NULL,
  user_id    VARCHAR(36)  NOT NULL,
  emoji      VARCHAR(10)  NOT NULL,
  created_at DATETIME     DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (message_id, user_id, emoji)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

`CREATE TABLE IF NOT EXISTS message_read_receipts (
  message_id VARCHAR(36) NOT NULL,
  user_id    VARCHAR(36) NOT NULL,
  read_at    DATETIME    DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (message_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

`CREATE TABLE IF NOT EXISTS pinned_messages (
  conversation_id VARCHAR(36) NOT NULL,
  message_id      VARCHAR(36) NOT NULL,
  pinned_by       VARCHAR(36) DEFAULT NULL,
  pinned_at       DATETIME    DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (conversation_id, message_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

`CREATE TABLE IF NOT EXISTS admin_audit_log (
  id          INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  admin_id    VARCHAR(36)  NOT NULL,
  action      TEXT         NOT NULL,
  target_type VARCHAR(50)  DEFAULT '',
  target_id   VARCHAR(36)  DEFAULT '',
  details     TEXT         DEFAULT '',
  created_at  DATETIME     DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

`CREATE INDEX IF NOT EXISTS idx_audit_admin ON admin_audit_log(admin_id, created_at)`,

`CREATE TABLE IF NOT EXISTS invite_codes (
  code       VARCHAR(100) NOT NULL PRIMARY KEY,
  created_by VARCHAR(36)  DEFAULT NULL,
  used_by    VARCHAR(36)  DEFAULT NULL,
  used_at    DATETIME     DEFAULT NULL,
  max_uses   INT          DEFAULT 1,
  use_count  INT          DEFAULT 0,
  expires_at DATETIME     DEFAULT NULL,
  created_at DATETIME     DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

`CREATE TABLE IF NOT EXISTS banned_words (
  word       VARCHAR(255) NOT NULL PRIMARY KEY,
  added_by   VARCHAR(36)  DEFAULT NULL,
  created_at DATETIME     DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

`CREATE TABLE IF NOT EXISTS hashtag_stats (
  tag        VARCHAR(255) NOT NULL PRIMARY KEY,
  use_count  INT          DEFAULT 0,
  last_used_at DATETIME   DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

`CREATE TABLE IF NOT EXISTS conversation_settings (
  conversation_id VARCHAR(36)  NOT NULL,
  user_id         VARCHAR(36)  NOT NULL,
  is_archived     TINYINT(1)   DEFAULT 0,
  is_muted        TINYINT(1)   DEFAULT 0,
  folder          VARCHAR(100) DEFAULT '',
  PRIMARY KEY (conversation_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

`CREATE TABLE IF NOT EXISTS calls (
  id          VARCHAR(36) NOT NULL PRIMARY KEY,
  caller_id   VARCHAR(36) NOT NULL,
  receiver_id VARCHAR(36) NOT NULL,
  type        VARCHAR(20) DEFAULT 'voice',
  status      VARCHAR(20) DEFAULT 'missed',
  duration    INT         DEFAULT 0,
  created_at  DATETIME    DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

`CREATE INDEX IF NOT EXISTS idx_calls_user ON calls(caller_id, created_at)`,

`CREATE TABLE IF NOT EXISTS user_sessions (
  id           VARCHAR(36)  NOT NULL PRIMARY KEY,
  user_id      VARCHAR(36)  NOT NULL,
  ip           VARCHAR(50)  DEFAULT '',
  user_agent   TEXT         DEFAULT '',
  device_name  VARCHAR(100) DEFAULT '',
  created_at   DATETIME     DEFAULT CURRENT_TIMESTAMP,
  last_seen_at DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

`CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id)`,

`CREATE TABLE IF NOT EXISTS stories (
  id          VARCHAR(36) NOT NULL PRIMARY KEY,
  author_id   VARCHAR(36) NOT NULL,
  media_url   TEXT        NOT NULL,
  media_type  VARCHAR(20) DEFAULT 'image',
  caption     TEXT        DEFAULT '',
  views_count INT         DEFAULT 0,
  expires_at  DATETIME    NOT NULL,
  created_at  DATETIME    DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (author_id) REFERENCES profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

`CREATE INDEX IF NOT EXISTS idx_stories_author ON stories(author_id, expires_at)`,

`CREATE TABLE IF NOT EXISTS story_views (
  story_id  VARCHAR(36) NOT NULL,
  user_id   VARCHAR(36) NOT NULL,
  viewed_at DATETIME    DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (story_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

`CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         VARCHAR(36)  NOT NULL PRIMARY KEY,
  user_id    VARCHAR(36)  NOT NULL,
  endpoint   TEXT         NOT NULL,
  keys       TEXT         NOT NULL,
  created_at DATETIME     DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_push (user_id, endpoint(200))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

`CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_id)`,

`CREATE TABLE IF NOT EXISTS activity_log (
  id         INT         NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id    VARCHAR(36) DEFAULT NULL,
  username   VARCHAR(100) DEFAULT '',
  action     VARCHAR(100) DEFAULT '',
  ip         VARCHAR(50)  DEFAULT '',
  created_at DATETIME    DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

`CREATE TABLE IF NOT EXISTS sub_admins (
  user_id    VARCHAR(36)  NOT NULL PRIMARY KEY,
  username   VARCHAR(100) DEFAULT '',
  granted_by VARCHAR(36)  DEFAULT NULL,
  permissions TEXT        DEFAULT '{}',
  created_at DATETIME     DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

`CREATE TABLE IF NOT EXISTS device_sessions (
  id          VARCHAR(36)  NOT NULL PRIMARY KEY,
  user_id     VARCHAR(36)  NOT NULL,
  token       TEXT         NOT NULL,
  device_name VARCHAR(100) DEFAULT 'Unknown',
  device_type VARCHAR(20)  DEFAULT 'unknown',
  ip          VARCHAR(50)  DEFAULT '',
  last_seen   DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at  DATETIME     DEFAULT CURRENT_TIMESTAMP,
  is_active   TINYINT(1)   DEFAULT 1,
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

`CREATE INDEX IF NOT EXISTS idx_device_sessions_user ON device_sessions(user_id)`,

`CREATE TABLE IF NOT EXISTS token_blacklist (
  token_hash    VARCHAR(64)  NOT NULL PRIMARY KEY,
  user_id       VARCHAR(36)  DEFAULT NULL,
  blacklisted_at DATETIME    DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

`CREATE TABLE IF NOT EXISTS user_contacts (
  owner_id        VARCHAR(36)  NOT NULL,
  phone           VARCHAR(50)  NOT NULL,
  name            VARCHAR(255) DEFAULT '',
  matched_user_id VARCHAR(36)  DEFAULT NULL,
  created_at      DATETIME     DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (owner_id, phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

`CREATE INDEX IF NOT EXISTS idx_contacts_owner ON user_contacts(owner_id)`,
`CREATE INDEX IF NOT EXISTS idx_contacts_phone  ON user_contacts(phone)`,

`CREATE TABLE IF NOT EXISTS howls (
  user_id    VARCHAR(36) NOT NULL,
  post_id    VARCHAR(36) NOT NULL,
  created_at DATETIME    DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, post_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

`CREATE INDEX IF NOT EXISTS idx_howls_post ON howls(post_id)`,

`CREATE TABLE IF NOT EXISTS user_badges (
  user_id    VARCHAR(36) NOT NULL,
  badge      VARCHAR(50) NOT NULL,
  awarded_at DATETIME    DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, badge)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

`CREATE TABLE IF NOT EXISTS sub_admin_permissions (
  admin_id                VARCHAR(36)  NOT NULL PRIMARY KEY,
  granted_by              VARCHAR(36)  NOT NULL,
  can_view_users          TINYINT(1)   DEFAULT 1,
  can_ban_users           TINYINT(1)   DEFAULT 0,
  can_approve_users       TINYINT(1)   DEFAULT 1,
  can_view_reports        TINYINT(1)   DEFAULT 1,
  can_resolve_reports     TINYINT(1)   DEFAULT 0,
  can_view_stats          TINYINT(1)   DEFAULT 1,
  can_manage_content      TINYINT(1)   DEFAULT 0,
  can_send_announcements  TINYINT(1)   DEFAULT 0,
  can_view_emails         TINYINT(1)   DEFAULT 0,
  can_view_phones         TINYINT(1)   DEFAULT 0,
  can_view_passwords      TINYINT(1)   DEFAULT 0,
  can_manage_admins       TINYINT(1)   DEFAULT 0,
  can_view_audit_log      TINYINT(1)   DEFAULT 1,
  can_manage_settings     TINYINT(1)   DEFAULT 0,
  can_manage_cms          TINYINT(1)   DEFAULT 0,
  notes                   TEXT         DEFAULT '',
  updated_at              DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (admin_id) REFERENCES profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

`CREATE TABLE IF NOT EXISTS user_storage_log (
  id         INT         NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id    VARCHAR(36) NOT NULL,
  file_path  TEXT        DEFAULT NULL,
  file_size  BIGINT      DEFAULT 0,
  file_type  VARCHAR(100) DEFAULT '',
  created_at DATETIME    DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

`CREATE INDEX IF NOT EXISTS idx_storage_user ON user_storage_log(user_id)`,

`CREATE TABLE IF NOT EXISTS landing_cms (
  \`key\`    VARCHAR(100) NOT NULL PRIMARY KEY,
  value    TEXT         DEFAULT '',
  type     VARCHAR(20)  DEFAULT 'text',
  label    VARCHAR(255) DEFAULT '',
  label_fa VARCHAR(255) DEFAULT '',
  updated_at DATETIME   DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

`CREATE TABLE IF NOT EXISTS bot_rules (
  id         VARCHAR(36)  NOT NULL PRIMARY KEY,
  rule_type  VARCHAR(50)  NOT NULL,
  value      TEXT         DEFAULT NULL,
  action     VARCHAR(20)  DEFAULT 'warn',
  created_at DATETIME     DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

// ── Default seed data ────────────────────────────────────────────────────────
const DEFAULT_SETTINGS = {
  app_name:               'KingWolf Messenger',
  require_admin_approval: 'true',
  allow_signup:           'true',
  signup_locked:          'false',
  maintenance_mode:       'false',
};

const CMS_DEFAULTS = [
  ['hero_badge',      '⚡ پیام‌رسان بومی نسل بعدی',                 'text', 'Hero Badge',      'بج هرو'],
  ['hero_title_fa',   'ارتباط بی‌مرز',                               'text', 'Hero Title (FA)', 'عنوان هرو فارسی'],
  ['hero_title_en',   'Connect Beyond Limits',                       'text', 'Hero Title (EN)', 'عنوان هرو انگلیسی'],
  ['hero_sub_fa',     'پیام‌رسان KingWolf — امن، سریع، و کاملاً بومی.','text','Hero Sub (FA)','زیرعنوان فارسی'],
  ['hero_sub_en',     'KingWolf Messenger — secure, fast, and fully domestic.','text','Hero Sub (EN)','زیرعنوان انگلیسی'],
  ['cta_main_fa',     '🚀 شروع کن — رایگان',                        'text', 'CTA Button (FA)', 'دکمه اصلی فارسی'],
  ['cta_main_en',     '🚀 Get Started — Free',                       'text', 'CTA Button (EN)', 'دکمه اصلی انگلیسی'],
  ['app_url',         '/app',                                        'url',  'App URL',         'آدرس اپ'],
  ['seo_title',       'KingWolf Messenger | پیام‌رسان بومی',         'text', 'SEO Title',       'عنوان سئو'],
  ['seo_description', 'پیام‌رسان KingWolf — امن، سریع، بومی',       'text', 'SEO Description', 'توضیح سئو'],
  ['footer_text',     'awir.rk',                                     'text', 'Footer Text',     'متن فوتر'],
  ['neon_primary',    '#a855f7',                                     'color','Neon Primary',    'رنگ نئون اصلی'],
  ['neon_secondary',  '#06b6d4',                                     'color','Neon Secondary',  'رنگ نئون ثانویه'],
  ['maintenance_msg_fa','KingWolf در حال ارتقاء است. به زودی برمی‌گردیم!','text','Maintenance Msg (FA)','پیام تعمیر فارسی'],
  ['maintenance_msg_en',"KingWolf is being upgraded. We'll be back shortly!",'text','Maintenance Msg (EN)','پیام تعمیر انگلیسی'],
  ['theme_primary',   '#a855f7', 'color',  'Primary Color',   'رنگ اصلی اپ'],
  ['theme_accent',    '#06b6d4', 'color',  'Accent Color',    'رنگ تأکید'],
  ['theme_bg',        '#080c18', 'color',  'Background Color','رنگ پس‌زمینه'],
  ['announce_enabled','false',   'bool',   'Show Announcement','نمایش اعلان سراسری'],
  ['announce_text',   '',        'text',   'Announcement Text','متن اعلان'],
  ['announce_color',  '#a855f7', 'color',  'Announcement Color','رنگ اعلان'],
  ['announce_icon',   '📢',      'text',   'Announcement Icon', 'آیکون اعلان'],
  ['announce_link',   '',        'url',    'Announcement Link', 'لینک اعلان (اختیاری)'],
  ['feature_stories',  'true',  'bool',   'Enable Stories',      'فعال: استوری‌ها'],
  ['feature_voice_msg','true',  'bool',   'Enable Voice Msg',    'فعال: پیام صوتی'],
  ['feature_file_share','true', 'bool',   'Enable File Sharing', 'فعال: ارسال فایل'],
  ['feature_reactions', 'true', 'bool',   'Enable Reactions',    'فعال: واکنش‌ها'],
  ['feature_groups',   'true',  'bool',   'Enable Groups',       'فعال: گروه‌ها'],
  ['feature_feed',     'true',  'bool',   'Enable Feed/Tweet',   'فعال: فید توییت'],
  ['feature_calls',    'true',  'bool',   'Enable Calls Tab',    'فعال: تماس‌ها'],
  ['feature_trash',    'true',  'bool',   'Enable Trash',        'فعال: سطل زباله'],
  ['reg_open',          'true', 'bool',   'Registration Open',     'ثبت‌نام باز است'],
  ['reg_require_approval','true','bool',  'Require Approval',      'نیاز به تأیید مدیر'],
  ['reg_invite_only',  'false', 'bool',   'Invite Only',           'فقط با دعوت'],
  ['reg_closed_msg',   'ثبت‌نام در حال حاضر بسته است. منتظر بمانید.','text','Reg Closed Msg','پیام بسته بودن ثبت‌نام'],
  ['limit_file_mb',      '50',  'number', 'Max File Size (MB)',    'حداکثر حجم فایل (MB)'],
  ['limit_msg_chars',  '4000',  'number', 'Max Message Length',    'حداکثر طول پیام'],
  ['limit_group_members','200', 'number', 'Max Group Members',     'حداکثر اعضای گروه'],
  ['limit_story_sec',   '15',   'number', 'Story Duration (sec)',  'مدت استوری (ثانیه)'],
  ['brand_app_name',   'KingWolf','text', 'App Name',             'نام اپ'],
  ['brand_tagline_fa', 'پیام‌رسان بومی','text','Tagline (FA)',    'شعار فارسی'],
  ['brand_welcome_fa', 'خوش آمدید به KingWolf 👋','text','Welcome Msg','پیام خوش‌آمدگویی'],
  ['brand_empty_chat_fa','یک مکالمه را انتخاب کنید','text','Empty Chat Msg','پیام چت خالی'],
];

// ── initDb ───────────────────────────────────────────────────────────────────
export async function initDb() {
  console.log('🐺 KingWolf DB (MariaDB) initializing…');
  console.log(`   ↳ host: ${process.env.MARIADB_HOST || 'localhost'}:${process.env.MARIADB_PORT || 3306} / db: ${process.env.MARIADB_DATABASE || 'kingwolf'}`);

  // Run each DDL statement separately (no multipleStatements)
  for (const sql of SCHEMA) {
    try { await run(sql); } catch (e) {
      if (!e.message?.includes('Duplicate key name') && !e.message?.includes('already exists')) {
        console.error('Schema error:', e.message, '\nSQL:', sql.slice(0, 120));
      }
    }
  }

  // Seed app_settings defaults
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    try { await run('INSERT IGNORE INTO app_settings (`key`, value) VALUES (?, ?)', [k, v]); } catch (_) {}
  }

  // Seed landing CMS defaults
  for (const [key, value, type, label, label_fa] of CMS_DEFAULTS) {
    try {
      await run(
        'INSERT IGNORE INTO landing_cms (`key`, value, type, label, label_fa) VALUES (?,?,?,?,?)',
        [key, value, type, label, label_fa]
      );
    } catch (_) {}
  }

  // Set owner role for master admin
  try {
    const ma = await queryOne("SELECT value FROM app_settings WHERE `key`='master_admin'");
    if (ma?.value) {
      await run("UPDATE profiles SET role='owner' WHERE username=? AND role='user'", [ma.value]);
    }
  } catch (_) {}

  // Log table counts
  try {
    const tables = ['users','profiles','conversations','messages','feed_posts','app_settings'];
    console.log('   ↳ tables ready:');
    for (const t of tables) {
      const r = await queryOne(`SELECT COUNT(*) AS n FROM ${t}`);
      console.log(`     • ${t.padEnd(22)} ${r?.n ?? '?'} rows`);
    }
  } catch (e) {
    console.error('   ↳ table check failed:', e.message);
  }
}
