-- KingWolf MariaDB Production Schema
-- Migration from SQLite: run this on your MariaDB server
-- Current runtime uses SQLite (node-sqlite3-wasm) — schema is 100% compatible

CREATE DATABASE IF NOT EXISTS kingwolf CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE kingwolf;

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(36) PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  raw_password TEXT DEFAULT '',
  google_id VARCHAR(255) DEFAULT '',
  auth_provider VARCHAR(20) DEFAULT 'local',
  current_session_id VARCHAR(255) DEFAULT '',
  created_at DATETIME DEFAULT NOW()
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS profiles (
  id VARCHAR(36) PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(255),
  display_name VARCHAR(100) DEFAULT '',
  avatar_url TEXT DEFAULT '',
  bio TEXT DEFAULT '',
  phone VARCHAR(20) DEFAULT '',
  birthday VARCHAR(20) DEFAULT '',
  role VARCHAR(20) DEFAULT 'user',
  is_approved TINYINT(1) DEFAULT 1,
  is_active TINYINT(1) DEFAULT 1,
  is_banned TINYINT(1) DEFAULT 0,
  is_admin TINYINT(1) DEFAULT 0,
  is_verified TINYINT(1) DEFAULT 0,
  is_shadowbanned TINYINT(1) DEFAULT 0,
  stealth_mode TINYINT(1) DEFAULT 0,
  badge_level VARCHAR(50) DEFAULT 'wolf_pup',
  storage_quota_bytes BIGINT DEFAULT 2147483648,
  storage_used_bytes BIGINT DEFAULT 0,
  ban_reason TEXT DEFAULT '',
  last_seen DATETIME,
  online_status VARCHAR(20) DEFAULT 'offline',
  settings JSON DEFAULT ('{}'),
  created_at DATETIME DEFAULT NOW(),
  updated_at DATETIME DEFAULT NOW(),
  FOREIGN KEY (id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS landing_cms (
  `key` VARCHAR(100) PRIMARY KEY,
  value TEXT DEFAULT '',
  type VARCHAR(20) DEFAULT 'text',
  label VARCHAR(100) DEFAULT '',
  label_fa VARCHAR(100) DEFAULT '',
  updated_at DATETIME DEFAULT NOW()
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS app_settings (
  `key` VARCHAR(100) PRIMARY KEY,
  value TEXT
) ENGINE=InnoDB;

-- (All other tables follow the same pattern as SQLite schema)
-- See db.js for full schema — all types are compatible with MariaDB
