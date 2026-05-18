import express from 'express';
import os from 'os';
import https from 'https';
import http from 'http';

// Crash visibility
process.on('uncaughtException', (e) => console.error('[UNCAUGHT]', e));
process.on('unhandledRejection', (e) => console.error('[UNHANDLED REJECTION]', e));

import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import { WebSocketServer } from 'ws';
import { nanoid } from 'nanoid';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Simple .env loader (no package needed)
try {
  const envPath = new URL('./.env', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (key && !process.env[key]) process.env[key] = val;
    }
  }
} catch (_) {}

import { db, UPLOADS_DIR } from './db.js';
import webpush from 'web-push';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;
const HTTPS_PORT = process.env.HTTPS_PORT || 3443;
function getMasterAdmin() {
  try {
    const row = db.prepare("SELECT value FROM app_settings WHERE key='master_admin'").get();
    if (row?.value) return row.value;
  } catch {}
  return process.env.FOUNDER_ROOT_USERNAME || process.env.KW_ADMIN_USER || 'admin';
}
function isFounder(req) {
  const masterAdmin = getMasterAdmin();
  const stealthOwner = process.env.STEALTH_OWNER_USERNAME || '';
  return req.profile.username === masterAdmin || (stealthOwner && req.profile.username === stealthOwner);
}
function getFounderAccounts() {
  return [getMasterAdmin(), process.env.STEALTH_OWNER_USERNAME || ''].filter(Boolean);
}

const JWT_SECRET = process.env.JWT_SECRET || (() => {
  const secretFile = path.join(__dirname, 'data', '.jwt-secret');
  if (fs.existsSync(secretFile)) return fs.readFileSync(secretFile, 'utf8').trim();
  const s = nanoid(48);
  fs.writeFileSync(secretFile, s);
  return s;
})();

// ── S3 Hot-plug Storage ───────────────────────────────────────────────────
const S3_ENDPOINT   = process.env.S3_ENDPOINT   || '';
const S3_BUCKET     = process.env.S3_BUCKET_NAME || '';
const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY  || '';
const S3_SECRET_KEY = process.env.S3_SECRET_KEY  || '';
const USE_S3 = !!(S3_ENDPOINT && S3_BUCKET && S3_ACCESS_KEY && S3_SECRET_KEY);

if (USE_S3) {
  console.log('☁️  S3 storage mode: active →', S3_ENDPOINT);
} else {
  console.log('💾 Local storage mode: active (max 10GB)');
}

// S3 upload helper (used when USE_S3 is true)
async function uploadToS3(localPath, s3Key) {
  if (!USE_S3) return null;
  try {
    const fileData = fs.readFileSync(localPath);
    const url = `${S3_ENDPOINT}/${S3_BUCKET}/${s3Key}`;
    // Use fetch for S3-compatible PUT (works with Arvan/Liara S3)
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/octet-stream',
        'x-amz-acl': 'public-read',
        'Authorization': `Basic ${Buffer.from(`${S3_ACCESS_KEY}:${S3_SECRET_KEY}`).toString('base64')}`,
      },
      body: fileData,
    });
    if (res.ok) return url;
  } catch(e) { console.error('S3 upload error:', e.message); }
  return null;
}

// ===== VAPID (Web Push) Setup =====
const vapidFile = path.join(__dirname, 'data', '.vapid.json');
let VAPID_KEYS = null;
try {
  if (fs.existsSync(vapidFile)) {
    VAPID_KEYS = JSON.parse(fs.readFileSync(vapidFile, 'utf8'));
  } else {
    VAPID_KEYS = webpush.generateVAPIDKeys();
    fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
    fs.writeFileSync(vapidFile, JSON.stringify(VAPID_KEYS));
    console.log('✅ VAPID keys generated');
  }
  webpush.setVapidDetails('mailto:admin@kingwolf.internal', VAPID_KEYS.publicKey, VAPID_KEYS.privateKey);
} catch (e) { console.error('VAPID setup failed:', e.message); }

async function sendPushToUser(userId, payload) {
  if (!VAPID_KEYS) return;
  try {
    const subs = db.prepare('SELECT * FROM push_subscriptions WHERE user_id=?').all(userId);
    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: JSON.parse(sub.keys) },
          JSON.stringify(payload),
          { TTL: 60 }
        );
      } catch (e) {
        if (e.statusCode === 410 || e.statusCode === 404) {
          db.prepare('DELETE FROM push_subscriptions WHERE id=?').run(sub.id);
        }
      }
    }
  } catch {}
}

// ===== Admin Rate Limiting =====
const adminAttempts = new Map();
function adminRlCheck(req) {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').toString().split(',')[0].trim();
  const now = Date.now();
  const rec = adminAttempts.get(ip);
  if (!rec) return { allowed: true };
  if (rec.lockedUntil && now < rec.lockedUntil) return { allowed: false, retryAfter: Math.ceil((rec.lockedUntil - now) / 1000) };
  if (rec.lastFailAt && now - rec.lastFailAt > 10 * 60 * 1000) { adminAttempts.delete(ip); }
  return { allowed: true };
}
function adminRlFail(req) {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').toString().split(',')[0].trim();
  const now = Date.now();
  const rec = adminAttempts.get(ip) || { fails: 0, locks: 0 };
  rec.fails = (rec.fails || 0) + 1;
  rec.lastFailAt = now;
  if (rec.fails % 5 === 0) {
    rec.locks = (rec.locks || 0) + 1;
    rec.lockedUntil = now + 30000 * Math.pow(2, rec.locks - 1);
  }
  adminAttempts.set(ip, rec);
}
function adminRlSuccess(req) {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').toString().split(',')[0].trim();
  adminAttempts.delete(ip);
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '500mb' }));

// Strip /api prefix so routes defined as /auth/... work when called via /api/auth/...
app.use((req, _res, next) => {
  if (req.url.startsWith('/api/')) req.url = req.url.slice(4);
  else if (req.url === '/api') req.url = '/';
  next();
});

app.use('/uploads', express.static(UPLOADS_DIR));

// Serve built frontend from kingwolf/dist/public
const FRONTEND_DIST = path.join(__dirname, '..', 'kingwolf', 'dist', 'public');
if (fs.existsSync(FRONTEND_DIST)) {
  app.use(express.static(FRONTEND_DIST));
}

// ===== Auth helpers =====
function makeToken(userId, sessionId) {
  return jwt.sign({ sub: userId, sid: sessionId }, JWT_SECRET, { expiresIn: '30d' });
}
function authMiddleware(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'unauthorized' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.sub;
    req.sessionId = payload.sid || null;
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
    if (!user) return res.status(401).json({ error: 'user not found' });
    // Single-device enforcement: reject tokens whose session_id doesn't match current
    if (req.sessionId && user.current_session_id && user.current_session_id !== req.sessionId) {
      return res.status(401).json({ error: 'session_expired' });
    }
    // Token blacklist check (for force-logout)
    const blacklisted = db.prepare('SELECT 1 FROM token_blacklist WHERE token = ?').get(token);
    if (blacklisted) return res.status(401).json({ error: 'session_terminated' });
    const profile = db.prepare('SELECT * FROM profiles WHERE id = ?').get(req.userId);
    if (!profile) return res.status(401).json({ error: 'user not found' });
    req.profile = profile;
    req._rawToken = token;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'invalid token' });
  }
}

function getClientIp(req) {
  return (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').toString().split(',')[0].trim();
}
function parseDeviceName(ua) {
  if (!ua) return 'Unknown device';
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) {
    const m = ua.match(/Android [^;]+; ([^)]+)\)/);
    return m ? m[1].trim() : 'Android';
  }
  if (/Windows NT/.test(ua)) return 'Windows PC';
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Linux/.test(ua)) return 'Linux PC';
  return 'Browser';
}
function adminOnly(req, res, next) {
  if (!req.profile || !req.profile.is_admin) return res.status(403).json({ error: 'admin only' });
  next();
}

// ===== AUTH =====
app.post('/auth/signup', async (req, res) => {
  const { username, password, email, phone, display_name } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'نام کاربری و رمز عبور الزامی است' });
  if (password.length < 6) return res.status(400).json({ error: 'رمز عبور باید حداقل ۶ کاراکتر باشد' });

  const cleanUser = username.toLowerCase().trim().replace(/[^a-z0-9_]/g, '');
  if (cleanUser.length < 3) return res.status(400).json({ error: 'نام کاربری باید حداقل ۳ کاراکتر داشته باشد' });

  const lockRow = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('signup_locked');
  if (lockRow && lockRow.value === 'true') {
    return res.status(403).json({ error: 'signup is currently disabled' });
  }

  // Email is optional — generate a placeholder if not provided
  const effectiveEmail = (email && email.trim()) ? email.trim().toLowerCase() : `${cleanUser}@no-reply.kw`;
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(effectiveEmail);
  if (existing) return res.status(409).json({ error: 'این ایمیل قبلاً ثبت شده است' });

  // Also check username uniqueness upfront
  const existingUsername = db.prepare('SELECT id FROM profiles WHERE username = ?').get(cleanUser);
  if (existingUsername) return res.status(409).json({ error: 'این نام کاربری قبلاً گرفته شده است' });

  const id = nanoid();
  const hash = await bcrypt.hash(password, 10);
  const usernameDefault = cleanUser;
  // Make sure it's unique across both profiles and conversations
  let finalUsername = usernameDefault;
  let n = 0;
  while (
    db.prepare('SELECT id FROM profiles WHERE username = ?').get(finalUsername) ||
    db.prepare('SELECT id FROM conversations WHERE username = ? AND username != ?').get(finalUsername, '')
  ) {
    n++;
    finalUsername = `${usernameDefault}${n}`;
  }
  // Rebind so rest of code uses consistent variable name
  const resolvedUsername = finalUsername;

  const approvalRow = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('require_admin_approval');
  const isApproved = !(approvalRow && approvalRow.value === 'true');

  const tx = db.transaction(() => {
    db.prepare('INSERT INTO users (id, email, password_hash, raw_password) VALUES (?, ?, ?, ?)').run(id, effectiveEmail, hash, password);
    const normalizedPhone = phone ? phone.trim().replace(/\D/g, '') : '';
    db.prepare(`
      INSERT INTO profiles (id, username, email, display_name, avatar_url, is_approved, phone)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, resolvedUsername, effectiveEmail, display_name || resolvedUsername, '/icon-192.png', isApproved ? 1 : 0, normalizedPhone);

    // Notify contacts who have this phone number
    try {
      if (normalizedPhone) {
        db.prepare('UPDATE user_contacts SET matched_user_id = ? WHERE phone = ?').run(id, normalizedPhone);
      }
    } catch (_) {}

    // Auto-join the default KingWolf group + channel if they exist
    const defaults = db.prepare(`SELECT id FROM conversations WHERE type IN ('group','channel') AND name = 'KingWolf'`).all();
    for (const conv of defaults) {
      try {
        db.prepare('INSERT OR IGNORE INTO conversation_members (conversation_id, user_id) VALUES (?, ?)').run(conv.id, id);
      } catch (_) {}
    }
  });
  tx();

  // Notify existing users who have the same email domain (same org) about the new member
  try {
    const allUserIds = db.prepare("SELECT id FROM profiles WHERE id != ? AND is_active = 1 AND is_approved = 1 LIMIT 500").all(id);
    for (const u of allUserIds) {
      db.prepare('INSERT INTO notifications (id, user_id, type, actor_id, target_id, target_type, message) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(nanoid(), u.id, 'join', id, id, 'profile', `${resolvedUsername} joined KingWolf`);
    }
  } catch (_) {}

  // Auto-issue token so subsequent client calls (profile upsert) work without a second round-trip.
  const sessionId = nanoid();
  const ip = getClientIp(req);
  const ua = req.headers['user-agent'] || '';
  db.prepare('UPDATE users SET current_session_id = ? WHERE id = ?').run(sessionId, id);
  db.prepare(`INSERT INTO user_sessions (id, user_id, ip, user_agent, device_name) VALUES (?, ?, ?, ?, ?)`)
    .run(sessionId, id, ip, ua, parseDeviceName(ua));
  const token = makeToken(id, sessionId);
  try { db.prepare("INSERT INTO activity_log (user_id, username, action, ip) VALUES (?,?,?,?)").run(id, resolvedUsername, 'signup', req.ip || ''); } catch {}
  return res.json({ user: { id, email }, access_token: token });
});

// ===== Login rate-limit (escalating lockout per IP+email) =====
// 5 wrong attempts → lock 30s, next 5 → 60s, next → 120s, doubling.
const loginAttempts = new Map(); // key = ip|email → { fails, locks, lockedUntil }
const RL_WINDOW_RESET_MS = 10 * 60 * 1000; // attempt counter resets after 10 min of no failures
function rlKey(req, email) {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').toString().split(',')[0].trim();
  return `${ip}|${(email || '').toLowerCase()}`;
}
function rlCheck(req, email) {
  const k = rlKey(req, email);
  const now = Date.now();
  const rec = loginAttempts.get(k);
  if (!rec) return { allowed: true };
  if (rec.lockedUntil && now < rec.lockedUntil) {
    return { allowed: false, retryAfter: Math.ceil((rec.lockedUntil - now) / 1000) };
  }
  // Reset counter if last failure was long ago
  if (rec.lastFailAt && now - rec.lastFailAt > RL_WINDOW_RESET_MS) {
    loginAttempts.delete(k);
  }
  return { allowed: true };
}
function rlRecordFail(req, email) {
  const k = rlKey(req, email);
  const now = Date.now();
  const rec = loginAttempts.get(k) || { fails: 0, locks: 0, lockedUntil: 0, lastFailAt: 0 };
  rec.fails += 1;
  rec.lastFailAt = now;
  if (rec.fails >= 5) {
    rec.locks += 1;
    // 30s * 2^(locks-1): 30, 60, 120, 240, 480 …
    const seconds = 30 * Math.pow(2, rec.locks - 1);
    rec.lockedUntil = now + seconds * 1000;
    rec.fails = 0; // reset window
  }
  loginAttempts.set(k, rec);
}
function rlRecordSuccess(req, email) {
  loginAttempts.delete(rlKey(req, email));
}

app.post('/auth/signin', async (req, res) => {
  const { password } = req.body || {};
  const identifier = (req.body.username || req.body.email || req.body.phone || '').trim();
  if (!identifier || !password) return res.status(400).json({ error: 'email and password required' });

  // Rate limit
  const rl = rlCheck(req, identifier);
  if (!rl.allowed) {
    return res.status(429).json({ error: 'rate_limited', retryAfter: rl.retryAfter, message: `بیش از حد تلاش — ${rl.retryAfter} ثانیه دیگر دوباره امتحان کنید` });
  }

  // Try to find user by username (case-insensitive), email, or phone
  let profile = db.prepare('SELECT * FROM profiles WHERE LOWER(username) = LOWER(?)').get(identifier);
  if (!profile) profile = db.prepare('SELECT * FROM profiles WHERE LOWER(email) = LOWER(?)').get(identifier);
  if (!profile) profile = db.prepare('SELECT * FROM profiles WHERE phone = ?').get(identifier.replace(/\D/g, ''));
  const user = profile ? db.prepare('SELECT * FROM users WHERE id = ?').get(profile.id) : null;
  if (!user) { rlRecordFail(req, identifier); return res.status(401).json({ error: 'invalid credentials' }); }
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) { rlRecordFail(req, identifier); return res.status(401).json({ error: 'invalid credentials' }); }

  if (profile && profile.is_banned) return res.status(403).json({ error: 'banned' });
  if (profile && !profile.is_admin && !profile.is_approved) {
    return res.status(403).json({ error: 'pending_approval' });
  }

  rlRecordSuccess(req, identifier);
  const sessionId = nanoid();
  const ip = getClientIp(req);
  const ua = req.headers['user-agent'] || '';
  const deviceName = parseDeviceName(ua);
  db.prepare('UPDATE users SET current_session_id = ? WHERE id = ?').run(sessionId, user.id);
  db.prepare(`INSERT INTO user_sessions (id, user_id, ip, user_agent, device_name) VALUES (?, ?, ?, ?, ?)`)
    .run(sessionId, user.id, ip, ua, deviceName);
  const token = makeToken(user.id, sessionId);
  // Save device session for force-logout support
  try {
    db.prepare(`INSERT OR REPLACE INTO device_sessions (id, user_id, token, device_name, device_type, ip, last_seen, is_active) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), 1)`)
      .run(sessionId, user.id, token, deviceName, /iPhone|iPad|Android/i.test(ua) ? 'mobile' : 'desktop', ip);
  } catch {}
  try { db.prepare("INSERT INTO activity_log (user_id, username, action, ip) VALUES (?,?,?,?)").run(user.id, profile.username, 'login', req.ip || ''); } catch {}
  return res.json({
    access_token: token,
    user: { id: user.id, email: user.email },
  });
});

app.post('/auth/signout', authMiddleware, (req, res) => {
  // Blacklist token so it can't be reused
  try {
    if (req._rawToken) {
      db.prepare('INSERT OR IGNORE INTO token_blacklist (token, user_id) VALUES (?, ?)').run(req._rawToken, req.userId);
      db.prepare('UPDATE device_sessions SET is_active = 0 WHERE token = ?').run(req._rawToken);
    }
  } catch {}
  return res.json({ ok: true });
});

app.get('/auth/session', authMiddleware, (req, res) => {
  return res.json({
    user: { id: req.userId, email: req.profile.email },
    profile: profileToClient(req.profile),
  });
});

app.get('/auth/session-info', authMiddleware, (req, res) => {
  const session = req.sessionId
    ? db.prepare('SELECT * FROM user_sessions WHERE id = ?').get(req.sessionId)
    : null;
  return res.json({
    session_id: req.sessionId || null,
    ip: session?.ip || getClientIp(req),
    device_name: session?.device_name || parseDeviceName(req.headers['user-agent'] || ''),
    user_agent: session?.user_agent || (req.headers['user-agent'] || ''),
    created_at: session?.created_at || null,
    last_seen_at: session?.last_seen_at || null,
  });
});

app.post('/auth/update', authMiddleware, async (req, res) => {
  const { password } = req.body || {};
  if (password) {
    if (password.length < 6) return res.status(400).json({ error: 'password too short' });
    const hash = await bcrypt.hash(password, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.userId);
  }
  return res.json({ ok: true });
});

// ===== Helper: convert row =====
function profileToClient(p) {
  if (!p) return null;
  return {
    ...p,
    avatar_url: p.avatar_url || '/icon-192.png',
    is_approved: !!p.is_approved,
    is_active: !!p.is_active,
    is_banned: !!p.is_banned,
    is_admin: !!p.is_admin,
    is_premium: !!p.is_premium,
    settings: tryParse(p.settings, {}),
  };
}
function tryParse(s, fallback) {
  try { return JSON.parse(s); } catch { return fallback; }
}

// ===== Generic table CRUD (mimics supabase.from) =====
// We expose POST /db/:table/select  POST /db/:table/insert  POST /db/:table/update  POST /db/:table/delete  POST /db/:table/upsert

const ALLOWED_TABLES = new Set([
  'profiles', 'conversations', 'conversation_members', 'messages',
  'app_settings', 'feed_posts', 'admin_access', 'admin_users',
  // new tables added in this update
  'likes', 'bookmarks', 'follows', 'user_blocks', 'notifications',
  'post_comments', 'reports', 'message_reactions', 'message_read_receipts',
  'pinned_messages', 'admin_audit_log', 'invite_codes', 'banned_words',
  'hashtag_stats', 'conversation_settings', 'calls',
]);

function buildWhere(filters, tableAlias) {
  // filters: [{ col, op, val }]
  if (!filters || !filters.length) return { sql: '', params: [] };
  const prefix = tableAlias ? `${tableAlias}.` : '';
  const parts = [];
  const params = [];
  for (const f of filters) {
    const c = prefix + f.col.replace(/[^a-zA-Z0-9_]/g, '');
    switch (f.op) {
      case 'eq': parts.push(`${c} = ?`); params.push(f.val); break;
      case 'neq': parts.push(`${c} != ?`); params.push(f.val); break;
      case 'gt': parts.push(`${c} > ?`); params.push(f.val); break;
      case 'lt': parts.push(`${c} < ?`); params.push(f.val); break;
      case 'gte': parts.push(`${c} >= ?`); params.push(f.val); break;
      case 'lte': parts.push(`${c} <= ?`); params.push(f.val); break;
      case 'in':
        if (Array.isArray(f.val) && f.val.length) {
          parts.push(`${c} IN (${f.val.map(() => '?').join(',')})`);
          params.push(...f.val);
        } else {
          parts.push('0=1');
        }
        break;
      case 'like': parts.push(`${c} LIKE ?`); params.push(f.val); break;
      case 'ilike': parts.push(`${c} LIKE ?`); params.push(f.val); break;
      case 'is':
        if (f.val === null) parts.push(`${c} IS NULL`);
        else parts.push(`${c} = ?`), params.push(f.val);
        break;
      default: break;
    }
  }
  return { sql: parts.length ? 'WHERE ' + parts.join(' AND ') : '', params };
}

app.post('/db/:table/select', (req, res, next) => {
  // app_settings and admin_users (alias of admin_access) are readable without auth (needed pre-login)
  if (req.params.table === 'app_settings' || req.params.table === 'admin_users') return doSelect(req, res);
  return authMiddleware(req, res, () => doSelect(req, res));
});

function doSelect(req, res) {
  const { table } = req.params;
  if (!ALLOWED_TABLES.has(table)) return res.status(400).json({ error: 'unknown table' });
  const { filters = [], order, limit, single } = req.body || {};

  // Special handling for messages: join profiles to populate sender object
  if (table === 'messages') {
    const w = buildWhere(filters, 'm');
    let sql = `SELECT m.*,
      p.id AS _s_id, p.username AS _s_username, p.display_name AS _s_display_name,
      p.avatar_url AS _s_avatar_url, p.bio AS _s_bio, p.is_admin AS _s_is_admin
      FROM messages m LEFT JOIN profiles p ON p.id = m.sender_id ${w.sql}`;
    if (order) {
      const c = order.col.replace(/[^a-zA-Z0-9_]/g, '');
      const dir = order.ascending ? 'ASC' : 'DESC';
      sql += ` ORDER BY m.${c} ${dir}`;
    }
    if (limit) sql += ` LIMIT ${Number(limit)}`;
    const rows = db.prepare(sql).all(...w.params);
    const out = rows.map(r => {
      const { _s_id, _s_username, _s_display_name, _s_avatar_url, _s_bio, _s_is_admin, ...msg } = r;
      return { ...msg, sender: _s_id ? { id: _s_id, username: _s_username, display_name: _s_display_name, avatar_url: _s_avatar_url || null, bio: _s_bio, is_admin: _s_is_admin } : null };
    });
    if (single) return res.json({ data: out[0] || null });
    return res.json({ data: out });
  }

  const w = buildWhere(filters);
  let sql = `SELECT * FROM ${table} ${w.sql}`;
  if (order) {
    const c = order.col.replace(/[^a-zA-Z0-9_]/g, '');
    const dir = order.ascending ? 'ASC' : 'DESC';
    sql += ` ORDER BY ${c} ${dir}`;
  }
  if (limit) sql += ` LIMIT ${Number(limit)}`;
  const rows = db.prepare(sql).all(...w.params);
  let out = rows;
  if (table === 'profiles') out = rows.map(profileToClient);
  if (single) return res.json({ data: out[0] || null });
  return res.json({ data: out });
}

app.post('/db/:table/insert', authMiddleware, (req, res) => {
  const { table } = req.params;
  if (!ALLOWED_TABLES.has(table)) return res.status(400).json({ error: 'unknown table' });
  const rows = Array.isArray(req.body.rows) ? req.body.rows : [req.body.row];
  const returnRep = req.body.return !== false;

  // Ensure id
  const inserted = [];
  const insertOne = (r) => {
    if (!r.id && (table === 'conversations' || table === 'messages' || table === 'feed_posts' ||
        table === 'notifications' || table === 'post_comments' || table === 'reports')) {
      r.id = nanoid();
    }
    // Stringify json fields
    if (table === 'profiles' && r.settings && typeof r.settings === 'object') {
      r.settings = JSON.stringify(r.settings);
    }
    if (table === 'feed_posts') {
      for (const k of ['media_urls','media_types','hashtags','mentions']) {
        if (r[k] && typeof r[k] !== 'string') r[k] = JSON.stringify(r[k]);
      }
    }
    const cols = Object.keys(r);
    const sql = `INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`;
    try {
      db.prepare(sql).run(...cols.map((c) => r[c]));
      if (returnRep) {
        const got = db.prepare(`SELECT * FROM ${table} WHERE rowid = last_insert_rowid()`).get();
        inserted.push(table === 'profiles' ? profileToClient(got) : got);
      }
    } catch (e) {
      throw e;
    }
  };
  try {
    db.transaction(() => rows.forEach(insertOne))();
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  // Broadcast realtime for relevant tables
  if (table === 'messages') {
    inserted.forEach((m) => {
      broadcast({ event: 'INSERT', table, new: m });
      // Push notification to offline members of conversation
      if (m.conversation_id && m.sender_id) {
        try {
          const members = db.prepare('SELECT user_id FROM conversation_members WHERE conversation_id=?').all(m.conversation_id);
          const senderProfile = db.prepare('SELECT display_name, username FROM profiles WHERE id=?').get(m.sender_id);
          const senderName = senderProfile?.display_name || senderProfile?.username || 'Someone';
          for (const mem of members) {
            if (mem.user_id === m.sender_id) continue;
            const isOnline = userSockets.has(mem.user_id);
            if (!isOnline) {
              sendPushToUser(mem.user_id, { title: senderName, body: m.content?.slice(0, 80) || '📎 media', tag: `msg-${m.conversation_id}`, url: '/' });
            }
          }
        } catch (_) {}
      }
    });
  } else if (table === 'conversations' || table === 'conversation_members' || table === 'feed_posts') {
    inserted.forEach((m) => broadcast({ event: 'INSERT', table, new: m }));
  }
  return res.json({ data: returnRep ? inserted : null });
});

app.post('/db/:table/update', authMiddleware, (req, res) => {
  const { table } = req.params;
  if (!ALLOWED_TABLES.has(table)) return res.status(400).json({ error: 'unknown table' });
  const { filters = [], values } = req.body || {};
  if (!values || !Object.keys(values).length) return res.status(400).json({ error: 'no values' });
  const w = buildWhere(filters);

  // Stringify json fields
  const v = { ...values };
  if (table === 'profiles' && v.settings && typeof v.settings === 'object') v.settings = JSON.stringify(v.settings);
  if (table === 'feed_posts') {
    for (const k of ['media_urls','media_types','hashtags','mentions']) {
      if (v[k] && typeof v[k] !== 'string') v[k] = JSON.stringify(v[k]);
    }
  }

  const setCols = Object.keys(v).map((c) => `${c.replace(/[^a-zA-Z0-9_]/g, '')} = ?`).join(',');
  const sql = `UPDATE ${table} SET ${setCols} ${w.sql}`;
  try {
    db.prepare(sql).run(...Object.values(v), ...w.params);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  // Re-select to return
  const rows = db.prepare(`SELECT * FROM ${table} ${w.sql}`).all(...w.params);
  const out = table === 'profiles' ? rows.map(profileToClient) : rows;
  out.forEach((r) => broadcast({ event: 'UPDATE', table, new: r }));
  return res.json({ data: out });
});

app.post('/db/:table/delete', authMiddleware, (req, res) => {
  const { table } = req.params;
  if (!ALLOWED_TABLES.has(table)) return res.status(400).json({ error: 'unknown table' });
  const { filters = [] } = req.body || {};
  const w = buildWhere(filters);
  const rows = db.prepare(`SELECT * FROM ${table} ${w.sql}`).all(...w.params);
  db.prepare(`DELETE FROM ${table} ${w.sql}`).run(...w.params);
  rows.forEach((r) => broadcast({ event: 'DELETE', table, old: r }));
  return res.json({ data: rows });
});

app.post('/db/:table/upsert', authMiddleware, (req, res) => {
  const { table } = req.params;
  if (!ALLOWED_TABLES.has(table)) return res.status(400).json({ error: 'unknown table' });
  const rows = Array.isArray(req.body.rows) ? req.body.rows : [req.body.row];
  const conflictKey = req.body.onConflict || 'id';
  const out = [];
  const tx = db.transaction(() => {
    for (const r of rows) {
      // Stringify json fields
      if (table === 'profiles' && r.settings && typeof r.settings === 'object') r.settings = JSON.stringify(r.settings);
      const cols = Object.keys(r);
      const sql = `
        INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(()=>'?').join(',')})
        ON CONFLICT(${conflictKey}) DO UPDATE SET ${cols.filter(c=>c!==conflictKey).map(c=>`${c}=excluded.${c}`).join(',')}
      `;
      db.prepare(sql).run(...cols.map((c) => r[c]));
      const got = db.prepare(`SELECT * FROM ${table} WHERE ${conflictKey} = ?`).get(r[conflictKey]);
      out.push(table === 'profiles' ? profileToClient(got) : got);
    }
  });
  try { tx(); } catch (e) { return res.status(400).json({ error: e.message }); }
  out.forEach((r) => broadcast({ event: 'UPSERT', table, new: r }));
  return res.json({ data: out });
});

// ===== Storage (file upload) =====
// Use in-memory storage so we can post-process images (compress) before writing to disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB max
});

// Lazy import sharp; if missing (e.g. native build issue), fall back to raw write.
let _sharp = null;
async function getSharp() {
  if (_sharp !== null) return _sharp;
  try { _sharp = (await import('sharp')).default; } catch (e) { _sharp = false; }
  return _sharp;
}

app.post('/storage/:bucket/upload', authMiddleware, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no file' });
  const bucket = req.params.bucket;
  const dir = path.join(UPLOADS_DIR, bucket);
  fs.mkdirSync(dir, { recursive: true });

  const mime = (req.file.mimetype || '').toLowerCase();
  const isImage = mime.startsWith('image/') && !mime.includes('svg') && !mime.includes('gif');
  let outBuf = req.file.buffer;
  let outExt = (path.extname(req.file.originalname) || '').toLowerCase();

  if (isImage) {
    try {
      const sharp = await getSharp();
      if (sharp) {
        // Resize only if needed; quality kept at 92 so visual loss is imperceptible.
        const isPng = mime.includes('png');
        let pipeline = sharp(req.file.buffer, { failOn: 'none' })
          .rotate() // honor EXIF orientation
          .resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true });
        if (isPng) {
          outBuf = await pipeline.png({ quality: 95, compressionLevel: 6 }).toBuffer();
          outExt = '.png';
        } else {
          outBuf = await pipeline.jpeg({ quality: 92, mozjpeg: true }).toBuffer();
          outExt = '.jpg';
        }
      }
    } catch (e) {
      // Fall back to original buffer if compression fails
      console.error('image compress failed:', e.message);
    }
  }

  const filename = nanoid() + outExt;
  const filepath = path.join(dir, filename);
  fs.writeFileSync(filepath, outBuf);

  const publicUrl = `/uploads/${bucket}/${filename}`;
  return res.json({ path: filename, publicUrl });
});

// ===== Find or create a DM conversation =====
app.post('/conversations', authMiddleware, (req, res) => {
  const { type, participant_id } = req.body || {};
  if (type !== 'direct' || !participant_id) return res.status(400).json({ error: 'type=direct and participant_id required' });
  // Find existing DM between the two users
  const existing = db.prepare(`
    SELECT c.id FROM conversations c
    JOIN conversation_members m1 ON m1.conversation_id = c.id AND m1.user_id = ?
    JOIN conversation_members m2 ON m2.conversation_id = c.id AND m2.user_id = ?
    WHERE c.type = 'direct'
    LIMIT 1
  `).get(req.userId, participant_id);
  if (existing) return res.json({ id: existing.id });
  // Create new DM
  const convId = nanoid();
  db.prepare(`INSERT INTO conversations (id, type, created_by) VALUES (?, 'direct', ?)`).run(convId, req.userId);
  db.prepare(`INSERT OR IGNORE INTO conversation_members (conversation_id, user_id, role) VALUES (?, ?, 'member')`).run(convId, req.userId);
  db.prepare(`INSERT OR IGNORE INTO conversation_members (conversation_id, user_id, role) VALUES (?, ?, 'member')`).run(convId, participant_id);
  broadcast({ event: 'INSERT', table: 'conversations', new: { id: convId, type: 'direct', created_by: req.userId } });
  return res.json({ id: convId });
});

// ===== Send message to a conversation =====
app.post('/conversations/:id/messages', authMiddleware, (req, res) => {
  const { content, type: msgType = 'text', reply_to_id } = req.body || {};
  if (!content) return res.status(400).json({ error: 'content required' });
  const conv = db.prepare('SELECT id FROM conversations WHERE id = ?').get(req.params.id);
  if (!conv) return res.status(404).json({ error: 'conversation not found' });
  const isMember = db.prepare('SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!isMember) return res.status(403).json({ error: 'not a member' });
  const msgId = nanoid();
  db.prepare('INSERT INTO messages (id, conversation_id, sender_id, content, type, reply_to_id) VALUES (?, ?, ?, ?, ?, ?)').run(msgId, req.params.id, req.userId, content, msgType, reply_to_id || null);
  db.prepare("UPDATE conversations SET last_message_at = datetime('now'), last_message_preview = ? WHERE id = ?").run(content.slice(0, 100), req.params.id);
  const msg = db.prepare(`SELECT m.*, p.id AS _s_id, p.username AS _s_username, p.display_name AS _s_display_name, p.avatar_url AS _s_avatar_url FROM messages m JOIN profiles p ON p.id = m.sender_id WHERE m.id = ?`).get(msgId);
  if (msg) broadcast({ event: 'INSERT', table: 'messages', new: msg });
  return res.json({ ok: true, id: msgId });
});

// ===== Get messages for a conversation (with ephemeral + trash filters) =====
app.get('/conversations/:id/messages', authMiddleware, (req, res) => {
  const conv = db.prepare('SELECT id FROM conversations WHERE id = ?').get(req.params.id);
  if (!conv) return res.status(404).json({ error: 'conversation not found' });
  const isMember = db.prepare('SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!isMember && !req.profile.is_admin) return res.status(403).json({ error: 'not a member' });

  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const before = req.query.before || null; // cursor: created_at of last fetched msg
  const params = [req.params.id];
  let cursorClause = '';
  if (before) { cursorClause = 'AND m.created_at < ?'; params.push(before); }

  const rows = db.prepare(`
    SELECT m.*,
      p.id AS _s_id, p.username AS _s_username, p.display_name AS _s_display_name,
      p.avatar_url AS _s_avatar_url, p.is_admin AS _s_is_admin
    FROM messages m
    LEFT JOIN profiles p ON p.id = m.sender_id
    WHERE m.conversation_id = ?
      AND m.deleted_at IS NULL
      AND (m.expires_at IS NULL OR m.expires_at > unixepoch())
      ${cursorClause}
    ORDER BY m.created_at DESC
    LIMIT ${limit}
  `).all(...params);

  const out = rows.map(r => {
    const { _s_id, _s_username, _s_display_name, _s_avatar_url, _s_is_admin, ...msg } = r;
    return { ...msg, sender: _s_id ? { id: _s_id, username: _s_username, display_name: _s_display_name, avatar_url: _s_avatar_url || null, is_admin: _s_is_admin } : null };
  });
  return res.json({ data: out });
});

// ===== Conversation Member Management =====
app.get('/conversations/:id/members', authMiddleware, (req, res) => {
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(req.params.id);
  if (!conv) return res.status(404).json({ error: 'not found' });
  const myRole = db.prepare('SELECT role FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(req.params.id, req.userId);
  const isMgr = myRole?.role === 'owner' || myRole?.role === 'admin' || conv.created_by === req.userId || req.profile.is_admin;
  // For channels: only admins/owners see the full member list; others see only count
  if (conv.type === 'channel' && !isMgr) {
    const count = db.prepare('SELECT COUNT(*) as n FROM conversation_members WHERE conversation_id = ?').get(req.params.id)?.n || 0;
    return res.json({ data: null, members: null, member_count: count, restricted: true });
  }
  const members = db.prepare(`
    SELECT p.*, cm.role, cm.joined_at, cm.admin_permissions, cm.title
    FROM conversation_members cm
    JOIN profiles p ON p.id = cm.user_id
    WHERE cm.conversation_id = ?
    ORDER BY CASE cm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, cm.joined_at ASC
  `).all(req.params.id);
  const count = members.length;
  return res.json({ data: members.map((m) => ({ ...profileToClient(m), role: m.role, joined_at: m.joined_at, admin_permissions: tryParse(m.admin_permissions, []), title: m.title })), member_count: count, count });
});

// Set conversation username (@id for groups/channels)
app.post('/conversations/:id/username', authMiddleware, (req, res) => {
  const { username } = req.body || {};
  if (!username) return res.status(400).json({ error: 'username required' });
  const clean = username.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
  if (clean.length < 3) return res.status(400).json({ error: 'username too short (min 3 chars)' });
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(req.params.id);
  if (!conv) return res.status(404).json({ error: 'not found' });
  const myRole = db.prepare('SELECT role FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(req.params.id, req.userId);
  const isMgr = myRole?.role === 'owner' || conv.created_by === req.userId || req.profile.is_admin;
  if (!isMgr) return res.status(403).json({ error: 'owner only' });
  const existing = db.prepare(`SELECT id FROM conversations WHERE username = ? AND id != ?`).get(clean, req.params.id);
  if (existing) return res.status(409).json({ error: 'username already taken' });
  const existingUser = db.prepare(`SELECT id FROM profiles WHERE username = ?`).get(clean);
  if (existingUser) return res.status(409).json({ error: 'این نام کاربری توسط یک کاربر استفاده شده است' });
  db.prepare('UPDATE conversations SET username = ? WHERE id = ?').run(clean, req.params.id);
  return res.json({ ok: true, username: clean });
});

// Find conversation by @username
app.get('/conversations/by-username/:username', authMiddleware, (req, res) => {
  const clean = req.params.username.replace(/^@/, '').toLowerCase();
  const conv = db.prepare('SELECT * FROM conversations WHERE username = ?').get(clean);
  if (!conv) return res.status(404).json({ error: 'not found' });
  const isMember = db.prepare('SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(conv.id, req.userId);
  const memberCount = db.prepare('SELECT COUNT(*) as n FROM conversation_members WHERE conversation_id = ?').get(conv.id)?.n || 0;
  return res.json({ data: { ...conv, member_count: memberCount, is_member: !!isMember } });
});

// Promote member to admin
app.post('/conversations/:id/promote', authMiddleware, (req, res) => {
  const { user_id, permissions = [], title = '' } = req.body || {};
  if (!user_id) return res.status(400).json({ error: 'user_id required' });
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(req.params.id);
  if (!conv) return res.status(404).json({ error: 'not found' });
  const myRole = db.prepare('SELECT role FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(req.params.id, req.userId);
  const canPromote = myRole?.role === 'owner' || conv.created_by === req.userId || req.profile.is_admin;
  if (!canPromote) return res.status(403).json({ error: 'owner only' });
  db.prepare('UPDATE conversation_members SET role = ?, admin_permissions = ?, title = ? WHERE conversation_id = ? AND user_id = ?')
    .run('admin', JSON.stringify(permissions), title, req.params.id, user_id);
  return res.json({ ok: true });
});

// Demote admin to member
app.post('/conversations/:id/demote', authMiddleware, (req, res) => {
  const { user_id } = req.body || {};
  if (!user_id) return res.status(400).json({ error: 'user_id required' });
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(req.params.id);
  if (!conv) return res.status(404).json({ error: 'not found' });
  // Protect creator from being demoted
  if ((conv.creator_id && conv.creator_id === user_id) || conv.created_by === user_id) {
    return res.status(403).json({ error: 'نقش سازنده قابل تغییر نیست' });
  }
  const myRole = db.prepare('SELECT role FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(req.params.id, req.userId);
  const canDemote = myRole?.role === 'owner' || conv.created_by === req.userId || req.profile.is_admin;
  if (!canDemote) return res.status(403).json({ error: 'owner only' });
  const targetRole = db.prepare('SELECT role FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(req.params.id, user_id);
  if (targetRole?.role === 'owner') return res.status(400).json({ error: 'cannot demote owner' });
  db.prepare('UPDATE conversation_members SET role = ?, admin_permissions = ?, title = ? WHERE conversation_id = ? AND user_id = ?')
    .run('member', '[]', '', req.params.id, user_id);
  return res.json({ ok: true });
});

app.post('/conversations/:id/members', authMiddleware, (req, res) => {
  const { user_id, role = 'member' } = req.body || {};
  if (!user_id) return res.status(400).json({ error: 'user_id required' });
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(req.params.id);
  if (!conv) return res.status(404).json({ error: 'conversation not found' });
  const membership = db.prepare('SELECT role FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(req.params.id, req.userId);
  const isConvAdmin = membership?.role === 'admin' || conv.created_by === req.userId || req.profile.is_admin;
  if (!isConvAdmin) return res.status(403).json({ error: 'not authorized' });
  db.prepare('INSERT OR IGNORE INTO conversation_members (conversation_id, user_id, role) VALUES (?, ?, ?)').run(req.params.id, user_id, role);
  broadcast({ event: 'UPDATE', table: 'conversation_members', new: { conversation_id: req.params.id, user_id } });
  return res.json({ ok: true });
});

app.delete('/conversations/:id/members/:userId', authMiddleware, (req, res) => {
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(req.params.id);
  if (!conv) return res.status(404).json({ error: 'conversation not found' });
  // Protect creator from being kicked/banned
  if ((conv.creator_id && conv.creator_id === req.params.userId) || conv.created_by === req.params.userId) {
    return res.status(403).json({ error: 'سازنده گروه را نمی‌توان حذف کرد' });
  }
  const membership = db.prepare('SELECT role FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(req.params.id, req.userId);
  const isConvAdmin = membership?.role === 'admin' || conv.created_by === req.userId || req.profile.is_admin;
  if (!isConvAdmin && req.params.userId !== req.userId) return res.status(403).json({ error: 'not authorized' });
  db.prepare('DELETE FROM conversation_members WHERE conversation_id = ? AND user_id = ?').run(req.params.id, req.params.userId);
  broadcast({ event: 'DELETE', table: 'conversation_members', old: { conversation_id: req.params.id, user_id: req.params.userId } });
  return res.json({ ok: true });
});

// ===== Admin: online/offline users =====
app.get('/admin/online-users', authMiddleware, adminOnly, (req, res) => {
  try {
    const users = db.prepare(`
      SELECT id, username, display_name, avatar_url, online_status, last_seen, is_admin
      FROM profiles WHERE is_approved=1 AND is_active=1
      ORDER BY (online_status='online') DESC, last_seen DESC
      LIMIT 300
    `).all();
    res.json({ data: users });
  } catch { res.json({ data: [] }); }
});

// ===== Admin real-time stats =====
app.get('/admin/stats', authMiddleware, adminOnly, (req, res) => {
  const totalUsers    = db.prepare('SELECT COUNT(*) AS n FROM profiles').get().n;
  const activeUsers   = db.prepare("SELECT COUNT(*) AS n FROM profiles WHERE is_approved = 1 AND is_banned = 0").get().n;
  const pendingUsers  = db.prepare("SELECT COUNT(*) AS n FROM profiles WHERE is_approved = 0").get().n;
  const bannedUsers   = db.prepare("SELECT COUNT(*) AS n FROM profiles WHERE is_banned = 1").get().n;
  const totalMessages = db.prepare("SELECT COUNT(*) AS n FROM messages WHERE is_deleted = 0").get().n;
  const totalPosts    = db.prepare("SELECT COUNT(*) AS n FROM feed_posts WHERE is_deleted = 0").get().n;
  const totalConvs    = db.prepare("SELECT COUNT(*) AS n FROM conversations").get().n;
  const totalReports  = db.prepare("SELECT COUNT(*) AS n FROM reports WHERE status = 'pending'").get().n;
  // Online users = profiles with online_status='online' updated in last 5 min
  const onlineUsers   = db.prepare("SELECT COUNT(*) AS n FROM profiles WHERE online_status = 'online'").get().n;
  const totalAdmins   = db.prepare("SELECT COUNT(*) AS n FROM profiles WHERE is_admin = 1").get().n;
  const totalFiles    = (() => {
    try {
      const mediaDir = require('path').join(__dirname, 'uploads', 'media');
      const fs = require('fs');
      if (fs.existsSync(mediaDir)) return fs.readdirSync(mediaDir).length;
    } catch (_) {}
    return 0;
  })();
  return res.json({
    totalUsers, activeUsers, pendingUsers, bannedUsers,
    totalMessages, totalPosts, totalConvs, totalReports,
    onlineUsers, totalAdmins, totalFiles,
  });
});

// ===== Admin endpoint: check if username has admin access =====
app.get('/admin/access/:username', (req, res) => {
  const row = db.prepare('SELECT * FROM admin_access WHERE username = ? AND is_active = 1').get(req.params.username);
  return res.json({ allowed: !!row });
});

// Create user manually (admin)
app.post('/admin/users/create', authMiddleware, adminOnly, async (req, res) => {
  const masterAdmin = getMasterAdmin();
  const isOwner = req.profile.username === masterAdmin;
  if (!isOwner) {
    const myPerms = db.prepare('SELECT * FROM sub_admin_permissions WHERE admin_id=?').get(req.profile.id);
    if (!myPerms?.can_approve_users) return res.status(403).json({ error: 'دسترسی لازم است' });
  }
  const rawUsername = (req.body.username || '').toString().toLowerCase().trim().replace(/[^a-z0-9_]/g, '');
  const { password, display_name, phone } = req.body || {};
  const username = rawUsername;
  if (!username || !password) return res.status(400).json({ error: 'نام کاربری و رمز الزامی است' });
  if (!/^[a-z0-9_]{3,32}$/.test(username)) return res.status(400).json({ error: 'نام کاربری فقط حروف کوچک، اعداد و _ مجاز است (۳ تا ۳۲ کاراکتر)' });
  if (password.length < 6) return res.status(400).json({ error: 'رمز باید حداقل ۶ کاراکتر باشد' });
  const exists = db.prepare('SELECT 1 FROM profiles WHERE LOWER(username)=?').get(username);
  if (exists) return res.status(409).json({ error: 'این نام کاربری قبلاً ثبت شده' });
  try {
    const id = nanoid();
    const hash = await bcrypt.hash(password, 10);
    const email = `${username}@kingwolf.internal`;
    db.transaction(() => {
      db.prepare('INSERT INTO users (id, email, password_hash, raw_password) VALUES (?, ?, ?, ?)').run(id, email, hash, password);
      db.prepare('INSERT INTO profiles (id, username, email, display_name, phone, avatar_url, is_approved, is_active, is_admin) VALUES (?, ?, ?, ?, ?, ?, 1, 1, 0)').run(id, username, email, display_name || username, phone || null, '/icon-192.png');
    })();
    broadcast({ event: 'INSERT', table: 'profiles', new: { id, username, display_name: display_name || username, is_approved: 1 } });
    return res.json({ ok: true, id, username, password });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// Grant admin access (only existing admin can)
app.post('/admin/grant', authMiddleware, adminOnly, (req, res) => {
  const { username } = req.body || {};
  if (!username) return res.status(400).json({ error: 'username required' });
  db.prepare('INSERT OR REPLACE INTO admin_access (username, granted_by, is_active) VALUES (?, ?, 1)').run(username, req.profile.username);
  db.prepare('UPDATE profiles SET is_admin = 1 WHERE username = ?').run(username);
  return res.json({ ok: true });
});

app.post('/admin/revoke', authMiddleware, adminOnly, (req, res) => {
  const { username } = req.body || {};
  if (!username) return res.status(400).json({ error: 'username required' });
  if (username === req.profile.username) return res.status(400).json({ error: 'cannot revoke yourself' });
  db.prepare('UPDATE admin_access SET is_active = 0 WHERE username = ?').run(username);
  db.prepare('UPDATE profiles SET is_admin = 0 WHERE username = ?').run(username);
  return res.json({ ok: true });
});

// Grant / revoke blue verified tick for a user
app.post('/admin/verify/:userId', authMiddleware, adminOnly, (req, res) => {
  const user = db.prepare('SELECT * FROM profiles WHERE id = ?').get(req.params.userId);
  if (!user) return res.status(404).json({ error: 'user not found' });
  db.prepare('UPDATE profiles SET is_verified = 1 WHERE id = ?').run(req.params.userId);
  broadcast({ event: 'UPDATE', table: 'profiles', new: { id: req.params.userId, is_verified: 1 } });
  return res.json({ ok: true });
});

app.post('/admin/unverify/:userId', authMiddleware, adminOnly, (req, res) => {
  const user = db.prepare('SELECT * FROM profiles WHERE id = ?').get(req.params.userId);
  if (!user) return res.status(404).json({ error: 'user not found' });
  db.prepare('UPDATE profiles SET is_verified = 0 WHERE id = ?').run(req.params.userId);
  broadcast({ event: 'UPDATE', table: 'profiles', new: { id: req.params.userId, is_verified: 0 } });
  return res.json({ ok: true });
});

app.get('/admin/list', authMiddleware, adminOnly, (req, res) => {
  const rows = db.prepare(`
    SELECT a.username, a.granted_by, a.granted_at, a.is_active, p.display_name
    FROM admin_access a LEFT JOIN profiles p ON p.username = a.username
    ORDER BY a.granted_at DESC
  `).all();
  return res.json({ data: rows });
});

// ===== Admin: create new admin user =====
app.post('/admin/create-admin', authMiddleware, adminOnly, async (req, res) => {
  const rl = adminRlCheck(req);
  if (!rl.allowed) return res.status(429).json({ error: `Too many attempts. Retry in ${rl.retryAfter}s`, retryAfter: rl.retryAfter });
  const { username, password } = req.body || {};
  if (!username || !password || password.length < 6) return res.status(400).json({ error: 'username and password (min 6 chars) required' });
  const existing = db.prepare('SELECT 1 FROM profiles WHERE username = ?').get(username);
  if (existing) {
    // User exists — grant admin access
    db.prepare('UPDATE profiles SET is_admin = 1 WHERE username = ?').run(username);
    db.prepare('INSERT OR REPLACE INTO admin_access (username, granted_by, is_active) VALUES (?, ?, 1)').run(username, req.profile.username);
    return res.json({ ok: true, message: 'admin access granted to existing user' });
  }
  // Create new user with admin
  const id = nanoid();
  const hash = await bcrypt.hash(password, 10);
  const tx = db.transaction(() => {
    db.prepare('INSERT INTO users (id, email, password_hash, raw_password) VALUES (?, ?, ?, ?)').run(id, `${username}@kingwolf.internal`, hash, password);
    db.prepare('INSERT INTO profiles (id, username, display_name, is_approved, is_admin) VALUES (?, ?, ?, 1, 1)').run(id, username, username);
    db.prepare('INSERT OR REPLACE INTO admin_access (username, granted_by, is_active) VALUES (?, ?, 1)').run(username, req.profile.username);
  });
  tx();
  return res.json({ ok: true, message: 'new admin user created' });
});

// ===== Admin: backup (export ALL tables + uploaded files as base64) =====
app.get('/admin/backup', authMiddleware, adminOnly, async (req, res) => {
  try {
    const tables = [
      'app_settings','users','profiles','admin_access','sub_admins',
      'conversations','conversation_members','conversation_settings',
      'messages','message_reactions','message_read_receipts','pinned_messages',
      'feed_posts','likes','bookmarks','follows','post_comments',
      'stories','story_views','calls','notifications','user_blocks','reports',
      'invite_codes','banned_words','hashtag_stats',
      'user_sessions','device_sessions','push_subscriptions',
      'activity_log','admin_audit_log','token_blacklist'
    ];
    const tableData = {};
    for (const t of tables) {
      try { tableData[t] = db.prepare(`SELECT * FROM ${t}`).all(); } catch { tableData[t] = []; }
    }
    // Collect uploaded files (avatars + media), base64-encode those <= 10MB
    const files = {};
    function scanDir(dir) {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { scanDir(full); continue; }
        try {
          const stat = fs.statSync(full);
          if (stat.size <= 10 * 1024 * 1024) {
            const rel = path.relative(UPLOADS_DIR, full).replace(/\\/g, '/');
            files[rel] = fs.readFileSync(full).toString('base64');
          }
        } catch { /* skip unreadable files */ }
      }
    }
    scanDir(UPLOADS_DIR);
    const backup = { version: 3, timestamp: new Date().toISOString(), tables: tableData, files };
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="kingwolf-backup-${Date.now()}.json"`);
    return res.json(backup);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// ===== Admin: restore backup (v2 or v3) =====
app.post('/admin/restore', authMiddleware, adminOnly, (req, res) => {
  const backup = req.body || {};
  // Support old format (v2: backup.data.*) and new format (v3: backup.tables.*)
  let tables = backup.tables || {};
  if (backup.data && !backup.tables) {
    tables = {
      profiles: backup.data.users || [],
      conversations: backup.data.conversations || [],
      conversation_members: backup.data.members || [],
      messages: backup.data.messages || [],
      feed_posts: backup.data.feedPosts || [],
    };
  }
  try {
    const insertOrder = [
      'app_settings','users','profiles','admin_access','sub_admins',
      'conversations','conversation_members','conversation_settings',
      'messages','message_reactions','message_read_receipts','pinned_messages',
      'feed_posts','likes','bookmarks','follows','post_comments',
      'stories','story_views','calls','notifications','user_blocks','reports',
      'invite_codes','banned_words','hashtag_stats',
      'user_sessions','device_sessions','push_subscriptions',
      'activity_log','admin_audit_log','token_blacklist'
    ];
    let totalAdded = 0;
    const tx = db.transaction(() => {
      for (const tableName of insertOrder) {
        const rows = tables[tableName];
        if (!rows || rows.length === 0) continue;
        for (const row of rows) {
          const cols = Object.keys(row);
          if (cols.length === 0) continue;
          const placeholders = cols.map(() => '?').join(', ');
          const colList = cols.join(', ');
          try {
            db.prepare(`INSERT OR IGNORE INTO ${tableName} (${colList}) VALUES (${placeholders})`).run(cols.map(c => row[c]));
            totalAdded++;
          } catch { /* skip rows that fail FK or other constraints */ }
        }
      }
    });
    tx();
    // Restore uploaded files from base64
    let filesRestored = 0;
    if (backup.files && typeof backup.files === 'object') {
      for (const [rel, b64] of Object.entries(backup.files)) {
        try {
          const dest = path.join(UPLOADS_DIR, rel);
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.writeFileSync(dest, Buffer.from(b64, 'base64'));
          filesRestored++;
        } catch { /* skip unrestorable files */ }
      }
    }
    return res.json({ ok: true, rowsAdded: totalAdded, filesRestored });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// ===== Admin: reset all data (keep admin account) =====
app.post('/admin/reset-data', authMiddleware, adminOnly, (req, res) => {
  const { confirm } = req.body || {};
  if (confirm !== 'DELETE_ALL') return res.status(400).json({ error: 'send confirm: DELETE_ALL' });
  try {
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM messages').run();
      db.prepare('DELETE FROM conversation_members WHERE user_id != ?').run(req.userId);
      db.prepare('DELETE FROM conversations WHERE created_by != ?').run(req.userId);
      db.prepare('DELETE FROM feed_posts').run();
      db.prepare("DELETE FROM profiles WHERE id != ? AND is_admin = 0").run(req.userId);
      db.prepare("DELETE FROM users WHERE id != ? AND id NOT IN (SELECT id FROM profiles WHERE is_admin = 1)").run(req.userId);
    });
    tx();
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// ===== Admin: bot settings =====
app.get('/admin/bot-settings', authMiddleware, adminOnly, (req, res) => {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = 'bot_settings'").get();
  return res.json({ data: row ? JSON.parse(row.value) : null });
});
app.post('/admin/bot-settings', authMiddleware, adminOnly, (req, res) => {
  const settings = req.body || {};
  db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('bot_settings', ?)").run(JSON.stringify(settings));
  return res.json({ ok: true });
});

// ===== Message edit =====
app.put('/messages/:id', authMiddleware, async (req, res) => {
  const { content } = req.body || {};
  if (!content?.trim()) return res.status(400).json({ error: 'content required' });
  const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(req.params.id);
  if (!msg) return res.status(404).json({ error: 'not found' });
  if (msg.sender_id !== req.userId && !req.profile.is_admin) return res.status(403).json({ error: 'forbidden' });
  db.prepare("UPDATE messages SET content = ?, is_edited = 1, updated_at = datetime('now') WHERE id = ?").run(content.trim(), req.params.id);
  return res.json({ ok: true });
});

// ===== Message Reactions =====
app.get('/messages/reactions', authMiddleware, (req, res) => {
  const { conversation_id } = req.query;
  if (!conversation_id) return res.status(400).json({ error: 'conversation_id required' });
  try {
    const rows = db.prepare(`
      SELECT mr.message_id, mr.emoji, mr.user_id
      FROM message_reactions mr
      JOIN messages m ON m.id = mr.message_id
      WHERE m.conversation_id = ?
    `).all(conversation_id);
    return res.json({ data: rows });
  } catch (e) {
    return res.json({ data: [] });
  }
});

app.post('/messages/:id/react', authMiddleware, (req, res) => {
  const { emoji } = req.body || {};
  if (!emoji) return res.status(400).json({ error: 'emoji required' });
  try {
    const existing = db.prepare('SELECT 1 FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?')
      .get(req.params.id, req.userId, emoji);
    if (existing) {
      db.prepare('DELETE FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?')
        .run(req.params.id, req.userId, emoji);
      return res.json({ ok: true, action: 'removed' });
    } else {
      db.prepare("INSERT OR IGNORE INTO message_reactions (message_id, user_id, emoji, created_at) VALUES (?, ?, ?, datetime('now'))")
        .run(req.params.id, req.userId, emoji);
      return res.json({ ok: true, action: 'added' });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// ===== Message forward =====
app.post('/messages/forward', authMiddleware, async (req, res) => {
  const { messageId, targetConversationId } = req.body || {};
  const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId);
  if (!msg) return res.status(404).json({ error: 'not found' });
  const isMember = db.prepare('SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(targetConversationId, req.userId);
  if (!isMember) return res.status(403).json({ error: 'not a member' });
  const { nanoid: nid } = await import('nanoid');
  const newId = nid();
  db.prepare('INSERT INTO messages (id, conversation_id, sender_id, content, type, forwarded_from_id) VALUES (?, ?, ?, ?, ?, ?)').run(newId, targetConversationId, req.userId, msg.content, msg.type, msg.id);
  db.prepare("UPDATE conversations SET last_message_at = datetime('now'), last_message_preview = ? WHERE id = ?").run(msg.content.slice(0,100), targetConversationId);
  return res.json({ ok: true });
});

// Send location as a message
app.post('/messages/location', authMiddleware, (req, res) => {
  const { conversation_id, lat, lng, label } = req.body || {};
  if (!conversation_id || lat == null || lng == null) return res.status(400).json({ error: 'conversation_id, lat, lng required' });
  const member = db.prepare('SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(conversation_id, req.userId);
  if (!member && !req.profile.is_admin) return res.status(403).json({ error: 'not a member' });
  const msgId = nanoid();
  const content = JSON.stringify({ lat, lng, label: label || '' });
  db.prepare('INSERT INTO messages (id, conversation_id, sender_id, content, type) VALUES (?, ?, ?, ?, ?)')
    .run(msgId, conversation_id, req.userId, content, 'location');
  db.prepare("UPDATE conversations SET last_message_at = datetime('now'), last_message_preview = ? WHERE id = ?")
    .run('📍 موقعیت مکانی', conversation_id);
  const flatMsg = db.prepare(`
    SELECT m.*, p.id AS _s_id, p.username AS _s_username, p.display_name AS _s_display_name, p.avatar_url AS _s_avatar_url
    FROM messages m LEFT JOIN profiles p ON p.id = m.sender_id WHERE m.id = ?
  `).get(msgId);
  const { _s_id, _s_username, _s_display_name, _s_avatar_url, ...msgFields } = flatMsg || {};
  const newMsg = { ...msgFields, sender: _s_id ? { id: _s_id, username: _s_username, display_name: _s_display_name, avatar_url: _s_avatar_url || null } : null };
  broadcast({ event: 'INSERT', table: 'messages', new: newMsg });
  return res.json({ ok: true, message: newMsg });
});

// Mark messages as read in a conversation
app.post('/messages/read', authMiddleware, (req, res) => {
  const { conversation_id } = req.body || {};
  if (!conversation_id) return res.status(400).json({ error: 'conversation_id required' });
  // Check membership
  const member = db.prepare('SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(conversation_id, req.userId);
  if (!member && !req.profile.is_admin) return res.status(403).json({ error: 'not a member' });
  // Get unread messages in this conversation not sent by current user
  const unread = db.prepare(`
    SELECT m.id FROM messages m
    LEFT JOIN message_read_receipts r ON r.message_id = m.id AND r.user_id = ?
    WHERE m.conversation_id = ? AND m.sender_id != ? AND m.is_deleted = 0 AND r.message_id IS NULL
  `).all(req.userId, conversation_id, req.userId);
  const readIds = [];
  for (const msg of unread) {
    try {
      db.prepare('INSERT OR IGNORE INTO message_read_receipts (message_id, user_id) VALUES (?, ?)').run(msg.id, req.userId);
      readIds.push(msg.id);
      broadcast({ event: 'INSERT', table: 'message_read_receipts', new: { message_id: msg.id, user_id: req.userId } });
    } catch (_) {}
  }
  return res.json({ ok: true, read_ids: readIds });
});

// Upload file/media in a message
app.post('/messages/upload', authMiddleware, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no file' });
  const { conversation_id, reply_to_id } = req.body || {};
  if (!conversation_id) return res.status(400).json({ error: 'conversation_id required' });
  const member = db.prepare('SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(conversation_id, req.userId);
  if (!member && !req.profile.is_admin) return res.status(403).json({ error: 'not a member' });

  // Write buffer to disk (multer uses memoryStorage)
  const mime = req.file.mimetype || '';
  const mimeExtMap = {
    'image/jpeg': '.jpg', 'image/jpg': '.jpg', 'image/png': '.png', 'image/gif': '.gif',
    'image/webp': '.webp', 'image/heic': '.heic', 'image/heif': '.heif',
    'video/mp4': '.mp4', 'video/quicktime': '.mov', 'video/webm': '.webm',
    'video/3gpp': '.3gp', 'video/mpeg': '.mpg', 'video/x-msvideo': '.avi',
    'audio/webm': '.webm', 'audio/ogg': '.ogg', 'audio/mpeg': '.mp3',
    'audio/wav': '.wav', 'audio/mp4': '.m4a', 'audio/aac': '.aac',
  };
  const type = mime.startsWith('image/') ? 'image' : mime.startsWith('video/') ? 'video' : mime.startsWith('audio/') ? 'audio' : 'file';
  const ext = path.extname(req.file.originalname || '').toLowerCase() || mimeExtMap[mime] || (type === 'image' ? '.jpg' : type === 'video' ? '.mp4' : type === 'audio' ? '.webm' : '');
  const filename = `${nanoid()}_msg${ext}`;
  const mediaDir = path.join(UPLOADS_DIR, 'media');
  fs.mkdirSync(mediaDir, { recursive: true });
  fs.writeFileSync(path.join(mediaDir, filename), req.file.buffer);
  const mediaUrl = `/uploads/media/${filename}`;
  const content = type === 'image' ? '📷 عکس' : type === 'video' ? '🎬 ویدیو' : type === 'audio' ? '🎙️ پیام صوتی' : `📎 ${req.file.originalname || 'file'}`;

  const msgId = nanoid();
  db.prepare('INSERT INTO messages (id, conversation_id, sender_id, content, type, media_url, reply_to_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(msgId, conversation_id, req.userId, content, type, mediaUrl, reply_to_id || null);
  db.prepare("UPDATE conversations SET last_message_at = datetime('now'), last_message_preview = ? WHERE id = ?")
    .run(content, conversation_id);
  const flatMsg = db.prepare(`
    SELECT m.*, p.id AS _s_id, p.username AS _s_username, p.display_name AS _s_display_name, p.avatar_url AS _s_avatar_url
    FROM messages m LEFT JOIN profiles p ON p.id = m.sender_id WHERE m.id = ?
  `).get(msgId);
  const { _s_id, _s_username, _s_display_name, _s_avatar_url, ...msgFields } = flatMsg || {};
  const newMsg = { ...msgFields, sender: _s_id ? { id: _s_id, username: _s_username, display_name: _s_display_name, avatar_url: _s_avatar_url || null } : null };
  broadcast({ event: 'INSERT', table: 'messages', new: newMsg });

  // Track storage usage
  try {
    const fileSize = req.file?.size || req.file?.buffer?.length || 0;
    const userId = req.profile?.id;
    if (userId && fileSize > 0) {
      db.prepare('INSERT INTO user_storage_log (user_id, file_path, file_size, file_type) VALUES (?,?,?,?)').run(userId, path.join(UPLOADS_DIR, 'media', filename), fileSize, req.file.mimetype || '');
      db.prepare('UPDATE profiles SET storage_used_bytes = storage_used_bytes + ? WHERE id = ?').run(fileSize, userId);
    }
  } catch(_) {}

  return res.json({ ok: true, message: newMsg, content, media_url: mediaUrl });
});

// ===== Admin: reveal user password — master admin only =====
app.get('/admin/password/:userId', authMiddleware, adminOnly, (req, res) => {
  const masterAdmin = getMasterAdmin();
  if (req.profile.username !== masterAdmin) return res.status(403).json({ error: 'فقط مدیر اصلی می‌تواند رمز عبور را مشاهده کند' });
  const user = db.prepare('SELECT raw_password FROM users WHERE id = ?').get(req.params.userId);
  if (!user) return res.status(404).json({ error: 'user not found' });
  return res.json({ password: user.raw_password || '(ذخیره نشده)' });
});

// ===== Admin: update user password =====
app.post('/admin/password/:userId', authMiddleware, adminOnly, async (req, res) => {
  const { password } = req.body || {};
  if (!password || password.length < 6) return res.status(400).json({ error: 'password too short' });
  const hash = await bcrypt.hash(password, 10);
  db.prepare('UPDATE users SET password_hash = ?, raw_password = ? WHERE id = ?').run(hash, password, req.params.userId);
  return res.json({ ok: true });
});

// ===== System Metrics =====
let _prevCpuTimes = null;
function getCpuPercent() {
  const cpus = os.cpus();
  const totals = cpus.reduce((acc, c) => {
    const total = Object.values(c.times).reduce((s, t) => s + t, 0);
    const idle = c.times.idle;
    return { total: acc.total + total, idle: acc.idle + idle };
  }, { total: 0, idle: 0 });
  if (!_prevCpuTimes) { _prevCpuTimes = totals; return 0; }
  const totalDiff = totals.total - _prevCpuTimes.total;
  const idleDiff = totals.idle - _prevCpuTimes.idle;
  _prevCpuTimes = totals;
  if (totalDiff === 0) return 0;
  return Math.round(((totalDiff - idleDiff) / totalDiff) * 100);
}
setInterval(getCpuPercent, 1000);

// ── Disk stats helper ────────────────────────────────────────────────────────
function getDiskStats(path) {
  try {
    const s = fs.statfsSync(path);
    const total = s.blocks * s.bsize;
    const free = s.bfree * s.bsize;
    const used = total - free;
    return { total, free, used, percentUsed: total > 0 ? Math.round((used / total) * 100) : 0, path };
  } catch {
    return { total: 0, free: 0, used: 0, percentUsed: 0, path };
  }
}

// ── High-usage alert log ─────────────────────────────────────────────────────
const alertLog = [];
function maybeLogAlert(cpu, ram, disk) {
  const ts = new Date().toISOString();
  if (cpu > 90)  alertLog.push({ ts, type: 'cpu',  value: cpu,  msg: `CPU بحرانی: ${cpu}%` });
  if (ram > 90)  alertLog.push({ ts, type: 'ram',  value: ram,  msg: `RAM بحرانی: ${ram}%` });
  if (disk > 90) alertLog.push({ ts, type: 'disk', value: disk, msg: `Disk بحرانی: ${disk}%` });
  // keep only last 100 alerts
  if (alertLog.length > 100) alertLog.splice(0, alertLog.length - 100);
}

app.get('/metrics', authMiddleware, adminOnly, (req, res) => {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const procMem = process.memoryUsage();
  const cpuPct = getCpuPercent();
  const ramPct = Math.round((usedMem / totalMem) * 100);
  const diskRoot = process.platform === 'win32' ? (path.parse(UPLOADS_DIR).root || 'C:\\') : '/';
  const disk = getDiskStats(diskRoot);
  const allTables = ['users','profiles','conversations','conversation_members','messages','message_reactions',
    'feed_posts','stories','story_views','follows','notifications','calls','reports','likes','bookmarks',
    'post_comments','user_sessions','push_subscriptions','app_settings','admin_access'];
  const dbStats = {};
  for (const t of allTables) {
    try { dbStats[t] = db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get()?.n ?? 0; } catch { dbStats[t] = 0; }
  }
  maybeLogAlert(cpuPct, ramPct, disk.percentUsed);
  return res.json({
    cpu: {
      percent: cpuPct,
      count: os.cpus().length,
      model: os.cpus()[0]?.model || 'unknown',
      loadAvg: os.loadavg(),
    },
    memory: {
      total: totalMem,
      free: freeMem,
      used: usedMem,
      percentUsed: ramPct,
    },
    disk: disk,
    alerts: {
      critical: cpuPct > 90 || ramPct > 90 || disk.percentUsed > 90,
      recent: alertLog.slice(-10),
    },
    process: {
      heapUsed: procMem.heapUsed,
      heapTotal: procMem.heapTotal,
      rss: procMem.rss,
      uptimeSeconds: Math.floor(process.uptime()),
    },
    system: {
      uptimeSeconds: Math.floor(os.uptime()),
      platform: os.platform(),
      arch: os.arch(),
    },
    db: dbStats,
  });
});

// ── Admin: Activity Feed ────────────────────────────────────────────────────
app.get('/admin/activity', authMiddleware, adminOnly, (req, res) => {
  try {
    const rows = db.prepare("SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 50").all();
    res.json({ data: rows });
  } catch { res.json({ data: [] }); }
});

// ── Admin: Managers (sub-admin management) ─────────────────────────────────
app.get('/admin/managers', authMiddleware, adminOnly, (req, res) => {
  try {
    const masterAdmin = getMasterAdmin();
    const stealthOwner = process.env.STEALTH_OWNER_USERNAME || '';
    const founderUsernames = [masterAdmin, stealthOwner].filter(Boolean);
    const reqIsFounder = founderUsernames.includes(req.profile.username);
    if (reqIsFounder) {
      // Founders see ALL managers with full permission detail
      const rows = db.prepare(`
        SELECT p.id, p.username, p.display_name, p.avatar_url, p.email, p.created_at,
               p.online_status, p.last_seen,
               s.granted_by, s.created_at AS promoted_at,
               sp.can_view_users, sp.can_ban_users, sp.can_approve_users, sp.can_view_reports,
               sp.can_resolve_reports, sp.can_view_stats, sp.can_manage_content, sp.can_send_announcements,
               sp.can_view_emails, sp.can_view_phones, sp.can_manage_admins, sp.can_view_audit_log,
               sp.can_manage_settings, sp.can_view_passwords
        FROM profiles p
        JOIN sub_admins s ON s.user_id = p.id
        LEFT JOIN sub_admin_permissions sp ON sp.admin_id = p.id
        ORDER BY s.created_at DESC
      `).all();
      res.json({ data: rows, is_founder: true });
    } else {
      // Sub-admins only see managers THEY promoted, excluding founder accounts
      const placeholders = founderUsernames.map(() => '?').join(',') || "'__none__'";
      const rows = db.prepare(`
        SELECT p.id, p.username, p.display_name, p.avatar_url, p.created_at,
               p.online_status, p.last_seen,
               s.granted_by, s.created_at AS promoted_at,
               sp.can_view_users, sp.can_ban_users, sp.can_approve_users, sp.can_view_reports,
               sp.can_resolve_reports, sp.can_view_stats, sp.can_manage_content, sp.can_send_announcements,
               sp.can_view_emails, sp.can_view_phones, sp.can_manage_admins, sp.can_view_audit_log,
               sp.can_manage_settings
        FROM profiles p
        JOIN sub_admins s ON s.user_id = p.id
        LEFT JOIN sub_admin_permissions sp ON sp.admin_id = p.id
        WHERE s.granted_by = ? AND p.username NOT IN (${placeholders})
        ORDER BY s.created_at DESC
      `).all(req.profile.username, ...founderUsernames);
      res.json({ data: rows, is_founder: false });
    }
  } catch { res.json({ data: [], is_founder: false }); }
});

app.post('/admin/managers/promote', authMiddleware, adminOnly, (req, res) => {
  const founderAccounts = getFounderAccounts();
  const reqIsFounder = founderAccounts.includes(req.profile.username);
  if (!reqIsFounder) {
    const myPerms = db.prepare('SELECT * FROM sub_admin_permissions WHERE admin_id=?').get(req.profile.id);
    if (!myPerms?.can_manage_admins) return res.status(403).json({ error: 'دسترسی مدیریت مدیران لازم است' });
  }
  const { username, userId, permissions } = req.body;
  try {
    const prof = username
      ? db.prepare('SELECT id, username FROM profiles WHERE username=?').get(username)
      : db.prepare('SELECT id, username FROM profiles WHERE id=?').get(userId);
    if (!prof) return res.status(404).json({ error: 'کاربر یافت نشد' });
    if (founderAccounts.includes(prof.username)) return res.status(400).json({ error: 'نمی‌توان سازنده را به عنوان مدیر اضافه کرد' });
    let grantPerms = permissions || {};
    if (!reqIsFounder) {
      const myPerms = db.prepare('SELECT * FROM sub_admin_permissions WHERE admin_id=?').get(req.profile.id) || {};
      const PERM_KEYS = ['can_view_users','can_ban_users','can_approve_users','can_view_reports','can_resolve_reports','can_view_stats','can_manage_content','can_send_announcements','can_view_emails','can_view_phones','can_manage_admins','can_view_audit_log','can_manage_settings'];
      const capped = {};
      for (const k of PERM_KEYS) { if (grantPerms[k] && myPerms[k]) capped[k] = 1; }
      grantPerms = capped;
    }
    const p = grantPerms;
    db.transaction(() => {
      db.prepare('UPDATE profiles SET is_admin=1 WHERE id=?').run(prof.id);
      db.prepare('INSERT OR REPLACE INTO admin_access (username, is_active) VALUES (?,1)').run(prof.username);
      db.prepare('INSERT OR REPLACE INTO sub_admins (user_id, username, granted_by, permissions) VALUES (?,?,?,?)').run(prof.id, prof.username, req.profile.username, JSON.stringify(grantPerms));
      db.prepare(`INSERT OR REPLACE INTO sub_admin_permissions
        (admin_id, granted_by, can_view_users, can_ban_users, can_approve_users, can_view_reports,
         can_resolve_reports, can_view_stats, can_manage_content, can_send_announcements,
         can_view_emails, can_view_phones, can_manage_admins, can_view_audit_log, can_manage_settings, can_view_passwords)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)`)
        .run(prof.id, req.profile.username,
          p.can_view_users?1:0, p.can_ban_users?1:0, p.can_approve_users?1:0, p.can_view_reports?1:0,
          p.can_resolve_reports?1:0, p.can_view_stats?1:0, p.can_manage_content?1:0, p.can_send_announcements?1:0,
          p.can_view_emails?1:0, p.can_view_phones?1:0, p.can_manage_admins?1:0, p.can_view_audit_log?1:0, p.can_manage_settings?1:0
        );
    })();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/admin/managers/demote', authMiddleware, adminOnly, (req, res) => {
  const founderAccounts = getFounderAccounts();
  const reqIsFounder = founderAccounts.includes(req.profile.username);
  if (!reqIsFounder) {
    const myPerms = db.prepare('SELECT * FROM sub_admin_permissions WHERE admin_id=?').get(req.profile.id);
    if (!myPerms?.can_manage_admins) return res.status(403).json({ error: 'فقط سازنده یا مدیر با دسترسی مدیران می‌تواند این کار را انجام دهد' });
  }
  const { username, userId } = req.body;
  try {
    db.transaction(() => {
      if (username) {
        if (founderAccounts.includes(username)) return;
        db.prepare('DELETE FROM sub_admins WHERE username=?').run(username);
        db.prepare('DELETE FROM sub_admin_permissions WHERE admin_id IN (SELECT id FROM profiles WHERE username=?)').run(username);
        db.prepare('UPDATE profiles SET is_admin=0 WHERE username=? AND username NOT IN (SELECT username FROM admin_access WHERE is_active=1)').run(username);
        db.prepare('UPDATE admin_access SET is_active=0 WHERE username=?').run(username);
      } else if (userId) {
        const prof = db.prepare('SELECT username FROM profiles WHERE id=?').get(userId);
        if (prof && founderAccounts.includes(prof.username)) return;
        db.prepare('DELETE FROM sub_admins WHERE user_id=?').run(userId);
        db.prepare('DELETE FROM sub_admin_permissions WHERE admin_id=?').run(userId);
        db.prepare('UPDATE profiles SET is_admin=0 WHERE id=?').run(userId);
      }
    })();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Admin: Entity Users (users with conv counts) ───────────────────────────
app.get('/admin/entity-users', authMiddleware, adminOnly, (req, res) => {
  try {
    const users = db.prepare(`
      SELECT p.*,
        (SELECT COUNT(*) FROM conversation_members cm JOIN conversations c ON c.id=cm.conversation_id WHERE cm.user_id=p.id AND c.type='direct') AS direct_count,
        (SELECT COUNT(*) FROM conversation_members cm JOIN conversations c ON c.id=cm.conversation_id WHERE cm.user_id=p.id AND c.type='group') AS group_count,
        (SELECT COUNT(*) FROM conversation_members cm JOIN conversations c ON c.id=cm.conversation_id WHERE cm.user_id=p.id AND c.type='channel') AS channel_count,
        (SELECT COUNT(*) FROM sub_admins WHERE user_id=p.id) AS is_sub_admin
      FROM profiles p ORDER BY p.created_at DESC
    `).all();
    res.json({ data: users });
  } catch (e) { res.json({ data: [] }); }
});

// ── Admin: Nuclear Wipe (requires master admin password) ──────────────────
app.post('/admin/nuclear-wipe', authMiddleware, adminOnly, async (req, res) => {
  const masterAdmin = getMasterAdmin();
  if (req.profile.username !== masterAdmin) return res.status(403).json({ error: 'فقط مدیر اصلی می‌تواند این کار را انجام دهد' });
  const { password, confirm } = req.body;
  if (confirm !== 'WIPE_ALL_DATA') return res.status(400).json({ error: 'کد تأیید اشتباه است' });
  const adminUser = db.prepare("SELECT password_hash FROM users WHERE id=?").get(req.userId);
  if (!adminUser) return res.status(400).json({ error: 'کاربر یافت نشد' });
  const valid = await bcrypt.compare(password, adminUser.password_hash);
  if (!valid) return res.status(401).json({ error: 'رمز عبور اشتباه است' });
  try {
    db.prepare("DELETE FROM messages WHERE 1=1").run();
    db.prepare("DELETE FROM conversation_members WHERE user_id NOT IN (SELECT id FROM profiles WHERE is_admin=1)").run();
    db.prepare("DELETE FROM conversations WHERE created_by NOT IN (SELECT id FROM profiles WHERE is_admin=1) OR created_by IS NULL").run();
    db.prepare("DELETE FROM feed_posts WHERE author_id NOT IN (SELECT id FROM profiles WHERE is_admin=1)").run();
    db.prepare("DELETE FROM profiles WHERE is_admin=0").run();
    db.prepare("DELETE FROM users WHERE id NOT IN (SELECT id FROM profiles)").run();
    db.prepare("DELETE FROM activity_log WHERE 1=1").run();
    res.json({ ok: true, msg: 'تمام داده‌های غیر ادمین پاک شدند' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Admin: All Conversations list ──────────────────────────────────────────
app.get('/admin/conversations', authMiddleware, adminOnly, (req, res) => {
  const type = req.query.type || 'group';
  try {
    const convs = db.prepare(`
      SELECT c.*,
        (SELECT COUNT(*) FROM conversation_members WHERE conversation_id=c.id) AS member_count,
        (SELECT COUNT(*) FROM messages WHERE conversation_id=c.id AND is_deleted=0) AS message_count,
        p.username AS creator_username, p.display_name AS creator_display
      FROM conversations c
      LEFT JOIN profiles p ON p.id = c.created_by
      WHERE c.type=?
      ORDER BY c.last_message_at DESC NULLS LAST
      LIMIT 100
    `).all(type);
    res.json({ data: convs });
  } catch (e) { res.json({ data: [] }); }
});

// ── Admin: Device Sessions (Force Logout) ────────────────────────────────────
app.get('/admin/sessions/:userId', authMiddleware, adminOnly, (req, res) => {
  const isMaster = req.profile.username === getMasterAdmin();
  if (!isMaster) return res.status(403).json({ error: 'مدیر اصلی فقط' });
  const sessions = db.prepare(`SELECT id, device_name, device_type, ip, last_seen, created_at, is_active FROM device_sessions WHERE user_id = ? AND is_active = 1 ORDER BY last_seen DESC`).all(req.params.userId);
  res.json({ data: sessions });
});

app.post('/admin/sessions/:sessionId/logout', authMiddleware, adminOnly, (req, res) => {
  const isMaster = req.profile.username === getMasterAdmin();
  if (!isMaster) return res.status(403).json({ error: 'مدیر اصلی فقط' });
  const session = db.prepare('SELECT * FROM device_sessions WHERE id = ?').get(req.params.sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  db.prepare('INSERT OR IGNORE INTO token_blacklist (token, user_id) VALUES (?, ?)').run(session.token, session.user_id);
  db.prepare('UPDATE device_sessions SET is_active = 0 WHERE id = ?').run(req.params.sessionId);
  res.json({ ok: true });
});

// ── Admin: Evidence Preview ──────────────────────────────────────────────────
app.get('/admin/reports/:id/evidence', authMiddleware, adminOnly, (req, res) => {
  const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(req.params.id);
  if (!report) return res.status(404).json({ error: 'Not found' });
  let evidence = null;
  try {
    if (report.target_type === 'post') {
      evidence = db.prepare('SELECT fp.*, p.username, p.display_name, p.avatar_url FROM feed_posts fp LEFT JOIN profiles p ON fp.author_id = p.id WHERE fp.id = ?').get(report.target_id);
    } else if (report.target_type === 'message') {
      evidence = db.prepare('SELECT m.*, p.username, p.display_name FROM messages m LEFT JOIN profiles p ON m.sender_id = p.id WHERE m.id = ?').get(report.target_id);
    } else if (report.target_type === 'user') {
      evidence = db.prepare('SELECT id, username, display_name, avatar_url, bio FROM profiles WHERE id = ?').get(report.target_id);
    } else if (report.target_type === 'channel' || report.target_type === 'group') {
      evidence = db.prepare('SELECT id, name, description, avatar_url, type FROM conversations WHERE id = ?').get(report.target_id);
    }
  } catch {}
  res.json({ report, evidence });
});

// ── Admin: Channel Reports ───────────────────────────────────────────────────
app.get('/admin/reports/channels', authMiddleware, adminOnly, (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT r.*, p.username AS reporter_username, p.display_name AS reporter_display_name
      FROM reports r
      LEFT JOIN profiles p ON p.id = r.reporter_id
      WHERE r.target_type IN ('channel','group')
      ORDER BY r.created_at DESC LIMIT 100
    `).all();
    res.json({ data: rows });
  } catch { res.json({ data: [] }); }
});

// ── Admin: Post Supreme Actions ──────────────────────────────────────────────
app.post('/admin/posts/:postId/shadowban', authMiddleware, adminOnly, (req, res) => {
  const post = db.prepare('SELECT author_id FROM feed_posts WHERE id = ?').get(req.params.postId);
  if (!post) return res.status(404).json({ error: 'Not found' });
  try {
    db.prepare('UPDATE profiles SET is_shadowbanned = 1 WHERE id = ?').run(post.author_id);
    db.prepare('UPDATE feed_posts SET is_shadowbanned = 1, shadowbanned_by = ? WHERE author_id = ?').run(req.profile.username, post.author_id);
  } catch {}
  res.json({ ok: true });
});

app.post('/admin/posts/:postId/pin-global', authMiddleware, adminOnly, (req, res) => {
  try {
    db.prepare('UPDATE feed_posts SET is_pinned = 0').run();
    db.prepare('UPDATE feed_posts SET is_pinned = 1 WHERE id = ?').run(req.params.postId);
  } catch {}
  res.json({ ok: true });
});

// ===== SOCIAL FEATURES (added in update) =====

// Toggle like a post
app.post('/social/like/:postId', authMiddleware, (req, res) => {
  const { postId } = req.params;
  const userId = req.userId;
  const existing = db.prepare('SELECT 1 FROM likes WHERE user_id=? AND post_id=?').get(userId, postId);
  if (existing) {
    db.prepare('DELETE FROM likes WHERE user_id=? AND post_id=?').run(userId, postId);
    db.prepare('UPDATE feed_posts SET likes_count = MAX(0, likes_count - 1) WHERE id=?').run(postId);
    return res.json({ liked: false });
  }
  db.prepare('INSERT INTO likes (user_id, post_id) VALUES (?, ?)').run(userId, postId);
  db.prepare('UPDATE feed_posts SET likes_count = likes_count + 1 WHERE id=?').run(postId);
  const post = db.prepare('SELECT author_id FROM feed_posts WHERE id=?').get(postId);
  if (post && post.author_id !== userId) {
    db.prepare('INSERT INTO notifications (id, user_id, type, actor_id, target_id, target_type) VALUES (?, ?, ?, ?, ?, ?)')
      .run(nanoid(), post.author_id, 'like', userId, postId, 'post');
    const actor = db.prepare('SELECT display_name, username FROM profiles WHERE id=?').get(userId);
    sendPushToUser(post.author_id, { title: '❤️ ' + (actor?.display_name || actor?.username || 'Someone'), body: 'پست شما را لایک کرد', tag: 'like', url: '/' });
  }
  return res.json({ liked: true });
});

// Toggle bookmark
app.post('/social/bookmark/:postId', authMiddleware, (req, res) => {
  const { postId } = req.params;
  const userId = req.userId;
  const existing = db.prepare('SELECT 1 FROM bookmarks WHERE user_id=? AND post_id=?').get(userId, postId);
  if (existing) {
    db.prepare('DELETE FROM bookmarks WHERE user_id=? AND post_id=?').run(userId, postId);
    return res.json({ bookmarked: false });
  }
  db.prepare('INSERT INTO bookmarks (user_id, post_id) VALUES (?, ?)').run(userId, postId);
  return res.json({ bookmarked: true });
});

// Follow / unfollow
app.post('/social/follow/:userId', authMiddleware, (req, res) => {
  const target = req.params.userId;
  const me = req.userId;
  if (target === me) return res.status(400).json({ error: 'cannot follow yourself' });
  const existing = db.prepare('SELECT 1 FROM follows WHERE follower_id=? AND followed_id=?').get(me, target);
  if (existing) {
    db.prepare('DELETE FROM follows WHERE follower_id=? AND followed_id=?').run(me, target);
    return res.json({ following: false });
  }
  db.prepare('INSERT INTO follows (follower_id, followed_id) VALUES (?, ?)').run(me, target);
  db.prepare('INSERT INTO notifications (id, user_id, type, actor_id, target_id, target_type) VALUES (?, ?, ?, ?, ?, ?)')
    .run(nanoid(), target, 'follow', me, me, 'profile');
  const followerP = db.prepare('SELECT display_name, username FROM profiles WHERE id=?').get(me);
  sendPushToUser(target, { title: '👤 ' + (followerP?.display_name || followerP?.username || 'Someone'), body: 'شما را دنبال کرد', tag: 'follow', url: '/' });
  return res.json({ following: true });
});

// My following list (users I follow)
app.get('/follows/following', authMiddleware, (req, res) => {
  const rows = db.prepare(`
    SELECT p.id, p.username, p.display_name, p.avatar_url, p.bio
    FROM follows f
    JOIN profiles p ON p.id = f.followed_id
    WHERE f.follower_id = ?
    ORDER BY f.created_at DESC
    LIMIT 200
  `).all(req.userId);
  return res.json({ data: rows });
});

// My followers list (users who follow me), with is_following_back flag
app.get('/follows/followers', authMiddleware, (req, res) => {
  const rows = db.prepare(`
    SELECT p.id, p.username, p.display_name, p.avatar_url, p.bio,
           CASE WHEN (SELECT 1 FROM follows WHERE follower_id=? AND followed_id=p.id) IS NOT NULL THEN 1 ELSE 0 END AS is_following_back
    FROM follows f
    JOIN profiles p ON p.id = f.follower_id
    WHERE f.followed_id = ?
    ORDER BY f.created_at DESC
    LIMIT 200
  `).all(req.userId, req.userId);
  return res.json({ data: rows });
});

// Unfollow a user (POST body: { target_id })
app.post('/follows/unfollow', authMiddleware, (req, res) => {
  const { target_id } = req.body || {};
  if (!target_id) return res.status(400).json({ error: 'target_id required' });
  db.prepare('DELETE FROM follows WHERE follower_id=? AND followed_id=?').run(req.userId, target_id);
  return res.json({ ok: true });
});

// Follow a user (POST body: { target_id })
app.post('/follows/follow', authMiddleware, (req, res) => {
  const { target_id } = req.body || {};
  if (!target_id) return res.status(400).json({ error: 'target_id required' });
  if (target_id === req.userId) return res.status(400).json({ error: 'cannot follow yourself' });
  const existing = db.prepare('SELECT 1 FROM follows WHERE follower_id=? AND followed_id=?').get(req.userId, target_id);
  if (!existing) {
    db.prepare('INSERT INTO follows (follower_id, followed_id) VALUES (?, ?)').run(req.userId, target_id);
    try {
      db.prepare('INSERT INTO notifications (id, user_id, type, actor_id, target_id, target_type) VALUES (?, ?, ?, ?, ?, ?)')
        .run(nanoid(), target_id, 'follow', req.userId, req.userId, 'profile');
    } catch (_) {}
  }
  return res.json({ ok: true });
});

// Block / unblock
app.post('/social/block/:userId', authMiddleware, (req, res) => {
  const target = req.params.userId;
  const me = req.userId;
  const existing = db.prepare('SELECT 1 FROM user_blocks WHERE blocker_id=? AND blocked_id=?').get(me, target);
  if (existing) {
    db.prepare('DELETE FROM user_blocks WHERE blocker_id=? AND blocked_id=?').run(me, target);
    return res.json({ blocked: false });
  }
  db.prepare('INSERT INTO user_blocks (blocker_id, blocked_id, reason) VALUES (?, ?, ?)').run(me, target, req.body?.reason || '');
  return res.json({ blocked: true });
});

// Leave a group/channel
app.post('/conversations/:id/leave', authMiddleware, (req, res) => {
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(req.params.id);
  if (!conv) return res.status(404).json({ error: 'not found' });
  const myRole = db.prepare('SELECT role FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!myRole) return res.status(403).json({ error: 'not a member' });
  if (myRole.role === 'owner') return res.status(403).json({ error: 'owner cannot leave — transfer ownership first' });
  db.prepare('DELETE FROM conversation_members WHERE conversation_id = ? AND user_id = ?').run(req.params.id, req.userId);
  return res.json({ ok: true });
});

// Submit a report
app.post('/reports', authMiddleware, (req, res) => {
  const { target_type, target_id, reason, details } = req.body || {};
  if (!target_type || !target_id) return res.status(400).json({ error: 'target required' });
  const id = nanoid();
  db.prepare('INSERT INTO reports (id, reporter_id, target_type, target_id, reason, details) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, req.userId, target_type, target_id, reason || '', details || '');
  return res.json({ ok: true, id });
});

// Admin: list pending reports
// Admin: get login attempts (rate-limit map)
app.get('/admin/login-attempts', authMiddleware, adminOnly, (req, res) => {
  const now = Date.now();
  const entries = [];
  for (const [key, rec] of loginAttempts.entries()) {
    const [ip, email] = key.split('|');
    const isLocked = rec.lockedUntil && now < rec.lockedUntil;
    entries.push({
      ip,
      email,
      fails: rec.fails,
      locks: rec.locks,
      isLocked,
      lockedUntil: isLocked ? new Date(rec.lockedUntil).toISOString() : null,
      retryAfterSec: isLocked ? Math.ceil((rec.lockedUntil - now) / 1000) : 0,
      lastFailAt: rec.lastFailAt ? new Date(rec.lastFailAt).toISOString() : null,
    });
  }
  entries.sort((a, b) => (b.locks - a.locks) || (b.fails - a.fails));
  return res.json({ data: entries });
});

// Admin: clear login lockout for an email
app.post('/admin/login-attempts/clear', authMiddleware, adminOnly, (req, res) => {
  const { email } = req.body || {};
  if (!email) {
    loginAttempts.clear();
    return res.json({ ok: true, cleared: 'all' });
  }
  for (const key of loginAttempts.keys()) {
    if (key.endsWith(`|${email.toLowerCase()}`)) loginAttempts.delete(key);
  }
  return res.json({ ok: true, cleared: email });
});

// Unread message counts per conversation for the current user
app.get('/unread-counts', authMiddleware, (req, res) => {
  const rows = db.prepare(`
    SELECT m.conversation_id, COUNT(*) as count
    FROM messages m
    WHERE m.sender_id != ?
      AND m.is_deleted = 0
      AND m.deleted_at IS NULL
      AND (m.expires_at IS NULL OR m.expires_at > unixepoch())
      AND m.conversation_id IN (
        SELECT conversation_id FROM conversation_members WHERE user_id = ?
      )
      AND NOT EXISTS (
        SELECT 1 FROM message_read_receipts r
        WHERE r.message_id = m.id AND r.user_id = ?
      )
    GROUP BY m.conversation_id
  `).all(req.userId, req.userId, req.userId);
  const data = {};
  for (const r of rows) data[r.conversation_id] = r.count;
  return res.json({ data });
});

app.get('/admin/reports', authMiddleware, adminOnly, (req, res) => {
  const typeFilter = req.query.type; // 'chat' | 'feed' | undefined (all)
  let whereClause = '';
  const params = [];
  if (typeFilter === 'chat') {
    whereClause = "WHERE r.target_type IN ('message','user','group','channel','conversation')";
  } else if (typeFilter === 'feed') {
    whereClause = "WHERE r.target_type IN ('post','feed_post','comment')";
  }
  const rows = db.prepare(`
    SELECT r.*, p.username AS reporter_username, p.display_name AS reporter_display_name
    FROM reports r LEFT JOIN profiles p ON p.id = r.reporter_id
    ${whereClause}
    ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END, r.created_at DESC
    LIMIT 200
  `).all(...params);
  return res.json({ data: rows });
});

// Admin: resolve a report
app.post('/admin/reports/:id/resolve', authMiddleware, adminOnly, (req, res) => {
  const { action, note } = req.body || {};
  db.prepare('UPDATE reports SET status=?, reviewed_by=?, reviewed_at=datetime("now"), admin_note=? WHERE id=?')
    .run(action || 'resolved', req.profile.username, note || '', req.params.id);
  db.prepare('INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?)')
    .run(req.userId, 'resolve_report', 'report', req.params.id, action || '');
  return res.json({ ok: true });
});

// ===== STORIES =====
// List active stories (grouped by author, last 24h)
app.get('/stories', authMiddleware, (req, res) => {
  const rows = db.prepare(`
    SELECT s.*, p.username, p.display_name, p.avatar_url
    FROM stories s
    JOIN profiles p ON p.id = s.author_id
    WHERE s.expires_at > datetime('now')
    ORDER BY s.created_at DESC
    LIMIT 200
  `).all();
  // Group by author
  const grouped = {};
  for (const r of rows) {
    if (!grouped[r.author_id]) {
      grouped[r.author_id] = {
        author_id: r.author_id, username: r.username,
        display_name: r.display_name, avatar_url: r.avatar_url,
        stories: [],
      };
    }
    // Check if current user viewed
    const viewed = db.prepare('SELECT 1 FROM story_views WHERE story_id=? AND user_id=?').get(r.id, req.userId);
    grouped[r.author_id].stories.push({ ...r, viewed: !!viewed });
  }
  return res.json({ data: Object.values(grouped) });
});

// Create a story
app.post('/stories', authMiddleware, upload.single('file'), async (req, res) => {
  const caption = req.body?.caption || '';
  let mediaUrl = '';
  let mediaType = 'image';
  if (req.file) {
    const mime = req.file.mimetype || '';
    mediaType = mime.startsWith('video/') ? 'video' : 'image';
    const ext = path.extname(req.file.originalname || '') || (mediaType === 'video' ? '.mp4' : '.jpg');
    const filename = `story_${nanoid()}${ext}`;
    const dir = path.join(UPLOADS_DIR, 'media');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, filename), req.file.buffer);
    mediaUrl = `/uploads/media/${filename}`;
  } else if (req.body?.media_url) {
    mediaUrl = req.body.media_url;
    mediaType = req.body.media_type || 'image';
  }
  if (!mediaUrl) return res.status(400).json({ error: 'media required' });
  const id = nanoid();
  const expiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  db.prepare('INSERT INTO stories (id, author_id, media_url, media_type, caption, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, req.userId, mediaUrl, mediaType, caption, expiresAt);
  broadcast({ event: 'INSERT', table: 'stories', new: { id, author_id: req.userId } });
  return res.json({ ok: true, id });
});

// View a story (mark as seen)
app.post('/stories/:id/view', authMiddleware, (req, res) => {
  const story = db.prepare('SELECT * FROM stories WHERE id=?').get(req.params.id);
  if (!story) return res.status(404).json({ error: 'not found' });
  const already = db.prepare('SELECT 1 FROM story_views WHERE story_id=? AND user_id=?').get(req.params.id, req.userId);
  if (!already) {
    db.prepare('INSERT OR IGNORE INTO story_views (story_id, user_id) VALUES (?, ?)').run(req.params.id, req.userId);
    db.prepare('UPDATE stories SET views_count = views_count + 1 WHERE id=?').run(req.params.id);
  }
  return res.json({ ok: true });
});

// Delete a story
app.delete('/stories/:id', authMiddleware, (req, res) => {
  const story = db.prepare('SELECT * FROM stories WHERE id=?').get(req.params.id);
  if (!story) return res.status(404).json({ error: 'not found' });
  if (story.author_id !== req.userId && !req.profile.is_admin) return res.status(403).json({ error: 'forbidden' });
  db.prepare('DELETE FROM story_views WHERE story_id=?').run(req.params.id);
  db.prepare('DELETE FROM stories WHERE id=?').run(req.params.id);
  return res.json({ ok: true });
});

// Follow counts for a profile
app.get('/profiles/:id/follow-counts', authMiddleware, (req, res) => {
  const followersCount = db.prepare('SELECT COUNT(*) AS n FROM follows WHERE followed_id=?').get(req.params.id).n;
  const followingCount = db.prepare('SELECT COUNT(*) AS n FROM follows WHERE follower_id=?').get(req.params.id).n;
  const isFollowing = !!db.prepare('SELECT 1 FROM follows WHERE follower_id=? AND followed_id=?').get(req.userId, req.params.id);
  return res.json({ followers: followersCount, following: followingCount, is_following: isFollowing });
});

// Followers list
app.get('/profiles/:id/followers', authMiddleware, (req, res) => {
  const rows = db.prepare(`
    SELECT p.* FROM follows f JOIN profiles p ON p.id = f.follower_id WHERE f.followed_id=? LIMIT 100
  `).all(req.params.id);
  return res.json({ data: rows });
});

// Following list
app.get('/profiles/:id/following', authMiddleware, (req, res) => {
  const rows = db.prepare(`
    SELECT p.* FROM follows f JOIN profiles p ON p.id = f.followed_id WHERE f.follower_id=? LIMIT 100
  `).all(req.params.id);
  return res.json({ data: rows });
});

// Notifications: list mine
app.get('/notifications', authMiddleware, (req, res) => {
  const rows = db.prepare(`
    SELECT n.*, p.username AS actor_username, p.display_name AS actor_display_name, p.avatar_url AS actor_avatar
    FROM notifications n LEFT JOIN profiles p ON p.id = n.actor_id
    WHERE n.user_id = ?
    ORDER BY n.created_at DESC
    LIMIT 50
  `).all(req.userId);
  const unread = db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id=? AND is_read=0').get(req.userId).n;
  return res.json({ data: rows, unread });
});

// Mark all notifications read
app.post('/notifications/read', authMiddleware, (req, res) => {
  db.prepare('UPDATE notifications SET is_read=1 WHERE user_id=?').run(req.userId);
  return res.json({ ok: true });
});

// ===== PUSH NOTIFICATIONS =====
app.get('/push/vapid-key', (req, res) => {
  if (!VAPID_KEYS) return res.status(503).json({ error: 'push not configured' });
  return res.json({ publicKey: VAPID_KEYS.publicKey });
});

app.post('/push/subscribe', authMiddleware, (req, res) => {
  const { endpoint, keys } = req.body || {};
  if (!endpoint || !keys) return res.status(400).json({ error: 'endpoint and keys required' });
  const id = nanoid();
  db.prepare('INSERT OR REPLACE INTO push_subscriptions (id, user_id, endpoint, keys) VALUES (?, ?, ?, ?)').run(id, req.userId, endpoint, JSON.stringify(keys));
  return res.json({ ok: true });
});

app.delete('/push/subscribe', authMiddleware, (req, res) => {
  const { endpoint } = req.body || {};
  if (endpoint) {
    db.prepare('DELETE FROM push_subscriptions WHERE user_id=? AND endpoint=?').run(req.userId, endpoint);
  } else {
    db.prepare('DELETE FROM push_subscriptions WHERE user_id=?').run(req.userId);
  }
  return res.json({ ok: true });
});

// ===== Health =====
app.get('/health', (req, res) => {
  const tables = ['users','profiles','conversations','conversation_members','messages','feed_posts','app_settings','admin_access'];
  const stats = {};
  for (const t of tables) {
    try { stats[t] = db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n; }
    catch (e) { stats[t] = `error: ${e.message}`; }
  }
  res.json({ ok: true, time: new Date().toISOString(), tables: stats });
});

// ===== Calls History =====
app.get('/calls', authMiddleware, (req, res) => {
  try {
    const calls = db.prepare(`
      SELECT c.*,
        pc.display_name as caller_name, pc.username as caller_username, pc.avatar_url as caller_avatar,
        pr.display_name as receiver_name, pr.username as receiver_username, pr.avatar_url as receiver_avatar
      FROM calls c
      JOIN profiles pc ON pc.id = c.caller_id
      JOIN profiles pr ON pr.id = c.receiver_id
      WHERE c.caller_id = ? OR c.receiver_id = ?
      ORDER BY c.created_at DESC
      LIMIT 50
    `).all(req.userId, req.userId);
    return res.json({ data: calls });
  } catch (e) {
    return res.json({ data: [] });
  }
});

app.post('/calls', authMiddleware, (req, res) => {
  try {
    const { id, receiver_id, type, status } = req.body;
    if (!receiver_id || !type || !status) return res.status(400).json({ error: 'missing fields' });
    const callId = id || nanoid();
    db.prepare('INSERT OR IGNORE INTO calls (id, caller_id, receiver_id, type, status, duration, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)')
      .run(callId, req.userId, receiver_id, type, status, new Date().toISOString().replace('T', ' ').split('.')[0]);
    return res.json({ ok: true, id: callId });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.patch('/calls/:id', authMiddleware, (req, res) => {
  try {
    const { duration, status } = req.body;
    db.prepare('UPDATE calls SET duration = COALESCE(?, duration), status = COALESCE(?, status) WHERE id = ? AND (caller_id = ? OR receiver_id = ?)')
      .run(duration ?? null, status ?? null, req.params.id, req.userId, req.userId);
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// ── Contact Sync ─────────────────────────────────────────────────────────────
app.post('/contacts/sync', authMiddleware, (req, res) => {
  const { contacts } = req.body; // [{ phone, name }]
  if (!Array.isArray(contacts)) return res.status(400).json({ error: 'contacts array required' });
  const userId = req.profile.id;

  // Upsert contacts
  const upsert = db.prepare(`INSERT OR REPLACE INTO user_contacts (owner_id, phone, name, matched_user_id) VALUES (?,?,?,?)`);
  const findUser = db.prepare(`SELECT id FROM profiles WHERE phone = ? LIMIT 1`);

  let matched = 0;
  for (const c of contacts.slice(0, 2000)) {
    if (!c.phone) continue;
    const normalized = c.phone.replace(/\D/g, '');
    if (!normalized) continue;
    const found = findUser.get(normalized);
    const matchedId = found ? found.id : null;
    if (matchedId) matched++;
    upsert.run(userId, normalized, c.name || '', matchedId);
  }

  // Check if any of MY contacts just joined → send notifications (handled separately)
  res.json({ synced: contacts.length, matched });
});

app.get('/contacts', authMiddleware, (req, res) => {
  const userId = req.profile.id;
  const rows = db.prepare(`
    SELECT uc.phone, uc.name, uc.matched_user_id,
           p.username, p.display_name, p.avatar_url, p.online_status, p.bio
    FROM user_contacts uc
    LEFT JOIN profiles p ON p.id = uc.matched_user_id
    WHERE uc.owner_id = ?
    ORDER BY p.display_name ASC, uc.name ASC
  `).all(userId);

  const onKingWolf = rows.filter(r => r.matched_user_id);
  const notOnKingWolf = rows.filter(r => !r.matched_user_id);
  res.json({ onKingWolf, notOnKingWolf });
});

// When a new user registers, notify users who have their phone in contacts
// This is called from the signup flow - we expose it as internal endpoint too
app.post('/contacts/notify-joined', authMiddleware, (req, res) => {
  const newUserId = req.profile.id;
  const newUserPhone = req.profile.phone;
  if (!newUserPhone) return res.json({ notified: 0 });

  const normalized = newUserPhone.replace(/\D/g, '');
  // Find all users who have this phone in their contacts
  const contactOwners = db.prepare(`
    SELECT DISTINCT owner_id FROM user_contacts WHERE phone = ?
  `).all(normalized);

  // Update matched_user_id for them
  db.prepare(`UPDATE user_contacts SET matched_user_id = ? WHERE phone = ?`).run(newUserId, normalized);

  // Create notifications
  const notifId = () => Math.random().toString(36).slice(2);
  const insertNotif = db.prepare(`INSERT OR IGNORE INTO notifications (id,user_id,type,actor_id,message) VALUES (?,?,?,?,?)`);
  for (const owner of contactOwners) {
    if (owner.owner_id === newUserId) continue;
    insertNotif.run(notifId(), owner.owner_id, 'contact_joined', newUserId, 'به KingWolf پیوست!');
  }

  res.json({ notified: contactOwners.length });
});

// Generate referral/invite link
app.post('/invite/generate', authMiddleware, (req, res) => {
  const code = req.profile.username + '_' + Math.random().toString(36).slice(2,8);
  db.prepare(`INSERT OR IGNORE INTO invite_codes (code, created_by) VALUES (?,?)`).run(code, req.profile.id);
  res.json({ code, link: `/join/${code}` });
});

// ── Howl (Wolf reaction) ──────────────────────────────────────────────────────
app.post('/feed/howl/:postId', authMiddleware, (req, res) => {
  const { postId } = req.params;
  const userId = req.profile.id;
  const existing = db.prepare('SELECT 1 FROM howls WHERE user_id=? AND post_id=?').get(userId, postId);
  if (existing) {
    db.prepare('DELETE FROM howls WHERE user_id=? AND post_id=?').run(userId, postId);
    db.prepare('UPDATE feed_posts SET howls_count = MAX(0, howls_count - 1) WHERE id=?').run(postId);
    return res.json({ howled: false });
  }
  db.prepare('INSERT OR IGNORE INTO howls (user_id, post_id) VALUES (?,?)').run(userId, postId);
  db.prepare('UPDATE feed_posts SET howls_count = howls_count + 1 WHERE id=?').run(postId);

  // Award badge progress
  const howlCount = db.prepare('SELECT COUNT(*) AS n FROM howls WHERE user_id=?').get(userId).n;
  if (howlCount >= 100) db.prepare('INSERT OR IGNORE INTO user_badges (user_id, badge) VALUES (?,?)').run(userId, 'howl_master');

  res.json({ howled: true });
});

app.get('/feed/howled', authMiddleware, (req, res) => {
  const { postIds } = req.query; // comma-separated
  if (!postIds) return res.json([]);
  const ids = String(postIds).split(',').slice(0, 100);
  const placeholders = ids.map(() => '?').join(',');
  const rows = db.prepare(`SELECT post_id FROM howls WHERE user_id=? AND post_id IN (${placeholders})`).all([req.profile.id, ...ids]);
  res.json(rows.map(r => r.post_id));
});

// ── Stealth Mode ─────────────────────────────────────────────────────────────
app.post('/profile/stealth', authMiddleware, (req, res) => {
  const { enabled } = req.body;
  db.prepare('UPDATE profiles SET stealth_mode=? WHERE id=?').run(enabled ? 1 : 0, req.profile.id);
  res.json({ stealth_mode: enabled });
});

app.get('/profile/stealth', authMiddleware, (req, res) => {
  const p = db.prepare('SELECT stealth_mode FROM profiles WHERE id=?').get(req.profile.id);
  res.json({ stealth_mode: !!(p?.stealth_mode) });
});

// ── Badges ────────────────────────────────────────────────────────────────────
app.get('/badges/:userId', authMiddleware, (req, res) => {
  const badges = db.prepare('SELECT badge, awarded_at FROM user_badges WHERE user_id=?').all(req.params.userId);
  // Calculate level
  const profile = db.prepare('SELECT * FROM profiles WHERE id=?').get(req.params.userId);
  const postCount = db.prepare('SELECT COUNT(*) AS n FROM feed_posts WHERE author_id=? AND is_deleted=0').get(req.params.userId)?.n || 0;
  const followerCount = db.prepare('SELECT COUNT(*) AS n FROM follows WHERE followed_id=?').get(req.params.userId)?.n || 0;
  const howlCount = db.prepare('SELECT COUNT(*) AS n FROM howls WHERE user_id=?').get(req.params.userId)?.n || 0;

  const score = postCount * 10 + followerCount * 5 + howlCount * 2;
  let level = 'Wolf Pup';
  let levelFa = 'گرگ نوپا';
  if (score >= 5000) { level = 'Alpha Wolf'; levelFa = 'گرگ آلفا'; }
  else if (score >= 2000) { level = 'Pack Leader'; levelFa = 'سرگله'; }
  else if (score >= 800) { level = 'Night Rider'; levelFa = 'شبگرد'; }
  else if (score >= 300) { level = 'Wild Wolf'; levelFa = 'گرگ وحشی'; }
  else if (score >= 100) { level = 'Young Wolf'; levelFa = 'گرگ جوان'; }

  res.json({ badges, level, levelFa, score });
});

// Award badge on various activities (called internally)
function awardBadge(userId, badge) {
  try { db.prepare('INSERT OR IGNORE INTO user_badges (user_id, badge) VALUES (?,?)').run(userId, badge); } catch(_) {}
}

// ── Google OAuth ──────────────────────────────────────────────────────────────
app.post('/auth/google', async (req, res) => {
  const { credential } = req.body; // Google ID token
  if (!credential) return res.status(400).json({ error: 'No credential' });

  try {
    // Verify token via Google's tokeninfo endpoint
    const googleRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`);
    const googleData = await googleRes.json();

    if (googleData.error || !googleData.email) {
      return res.status(401).json({ error: 'Invalid Google token' });
    }

    const { email, name, picture, sub: googleId } = googleData;

    // Check if user exists by google_id or email
    let user = db.prepare('SELECT * FROM users WHERE google_id = ?').get(googleId);
    if (!user) user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

    let profile;
    if (!user) {
      // Create new user
      const newId = nanoid();
      const baseUsername = email.split('@')[0].replace(/[^a-z0-9_]/gi, '_').toLowerCase().slice(0, 20) + '_' + Math.random().toString(36).slice(2, 6);

      db.prepare(`INSERT INTO users (id, email, password_hash, google_id, auth_provider) VALUES (?,?,?,?,?)`).run(newId, email, '', googleId, 'google');

      const approvalRow = db.prepare("SELECT value FROM app_settings WHERE key='require_admin_approval'").get();
      const isApproved = 1; // Google users auto-approved

      db.prepare(`INSERT INTO profiles (id, username, email, display_name, avatar_url, is_approved, is_active) VALUES (?,?,?,?,?,?,1)`).run(newId, baseUsername, email, name || baseUsername, picture || '/icon-192.png', isApproved);

      profile = db.prepare('SELECT * FROM profiles WHERE id=?').get(newId);
    } else {
      // Update google_id if not set
      db.prepare('UPDATE users SET google_id=?, auth_provider=? WHERE id=? AND (google_id IS NULL OR google_id="")').run(googleId, 'google', user.id);
      profile = db.prepare('SELECT * FROM profiles WHERE id=?').get(user.id);
    }

    if (!profile) return res.status(500).json({ error: 'Profile error' });
    if (profile.is_banned) return res.status(403).json({ error: 'حساب شما مسدود شده است' });

    const userId = user ? user.id : profile.id;
    const sessionId = nanoid();
    const ip = getClientIp(req);
    const ua = req.headers['user-agent'] || '';
    db.prepare('UPDATE users SET current_session_id = ? WHERE id = ?').run(sessionId, userId);
    db.prepare(`INSERT INTO user_sessions (id, user_id, ip, user_agent, device_name) VALUES (?, ?, ?, ?, ?)`)
      .run(sessionId, userId, ip, ua, parseDeviceName(ua));
    const token = makeToken(userId, sessionId);
    res.json({ token, access_token: token, profile: profileToClient(profile) });
  } catch (e) {
    console.error('Google OAuth error:', e);
    res.status(500).json({ error: 'Google auth failed' });
  }
});

// ── Sub-admin permissions ─────────────────────────────────────────────────────
app.get('/admin/permissions/:adminId', authMiddleware, adminOnly, (req, res) => {
  const perms = db.prepare('SELECT * FROM sub_admin_permissions WHERE admin_id=?').get(req.params.adminId);
  res.json(perms || { admin_id: req.params.adminId });
});

app.post('/admin/permissions/:adminId', authMiddleware, adminOnly, (req, res) => {
  const reqIsFounder = isFounder(req);
  if (!reqIsFounder) {
    const myPerms = db.prepare('SELECT * FROM sub_admin_permissions WHERE admin_id=?').get(req.profile.id);
    if (!myPerms?.can_manage_admins) return res.status(403).json({ error: 'فقط سازنده یا مدیر با دسترسی مدیران می‌تواند تغییر دهد' });
  }
  const { adminId } = req.params;
  const founderAccounts = getFounderAccounts();
  const targetProf = db.prepare('SELECT username FROM profiles WHERE id=?').get(adminId);
  if (targetProf && founderAccounts.includes(targetProf.username)) return res.status(403).json({ error: 'نمی‌توان دسترسی سازنده را تغییر داد' });
  let p = req.body;
  if (!reqIsFounder) {
    const myPerms = db.prepare('SELECT * FROM sub_admin_permissions WHERE admin_id=?').get(req.profile.id) || {};
    const PERM_KEYS = ['can_view_users','can_ban_users','can_approve_users','can_view_reports','can_resolve_reports','can_view_stats','can_manage_content','can_send_announcements','can_view_emails','can_view_phones','can_manage_admins','can_view_audit_log','can_manage_settings'];
    const capped = { ...p };
    for (const k of PERM_KEYS) { if (capped[k] && !myPerms[k]) capped[k] = false; }
    capped.can_view_passwords = false;
    p = capped;
  }

  db.prepare(`INSERT OR REPLACE INTO sub_admin_permissions
    (admin_id, granted_by, can_view_users, can_ban_users, can_approve_users, can_view_reports,
     can_resolve_reports, can_view_stats, can_manage_content, can_send_announcements,
     can_view_emails, can_view_phones, can_view_passwords, can_manage_admins, can_view_audit_log,
     can_manage_settings, notes, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
  `).run(adminId, req.profile.id,
    p.can_view_users?1:0, p.can_ban_users?1:0, p.can_approve_users?1:0,
    p.can_view_reports?1:0, p.can_resolve_reports?1:0, p.can_view_stats?1:0,
    p.can_manage_content?1:0, p.can_send_announcements?1:0,
    p.can_view_emails?1:0, p.can_view_phones?1:0, p.can_view_passwords?1:0,
    p.can_manage_admins?1:0, p.can_view_audit_log?1:0, p.can_manage_settings?1:0,
    p.notes||'');
  try { db.prepare('UPDATE sub_admins SET permissions=? WHERE user_id=?').run(JSON.stringify(p), adminId); } catch {}
  res.json({ ok: true });
});

app.get('/admin/my-permissions', authMiddleware, (req, res) => {
  const masterAdmin = getMasterAdmin();
  const stealthOwner = process.env.STEALTH_OWNER_USERNAME || '';
  const isMasterAdmin = req.profile.username === masterAdmin;
  const isStealth = stealthOwner && req.profile.username === stealthOwner;
  if (isMasterAdmin || isStealth) {
    return res.json({
      is_owner: true,
      can_view_users:1, can_ban_users:1, can_approve_users:1, can_view_reports:1,
      can_resolve_reports:1, can_view_stats:1, can_manage_content:1, can_send_announcements:1,
      can_view_emails:1, can_view_phones:1,
      can_view_passwords: isMasterAdmin ? 1 : 0,
      can_manage_admins:1, can_view_audit_log:1, can_manage_settings:1
    });
  }
  const perms = db.prepare('SELECT * FROM sub_admin_permissions WHERE admin_id=?').get(req.profile.id);
  res.json({ is_owner: false, ...(perms || {}) });
});

// ── Group/Channel member endpoints ───────────────────────────────────────────

// GET group members with roles (replaces the earlier version)
app.get('/conversations/:id/members/roles', authMiddleware, (req, res) => {
  const members = db.prepare(`
    SELECT cm.*, p.username, p.display_name, p.avatar_url, p.online_status,
           CASE WHEN c.creator_id = cm.user_id THEN 'creator' ELSE cm.role END AS effective_role,
           cm.group_permissions, cm.title
    FROM conversation_members cm
    JOIN profiles p ON p.id = cm.user_id
    JOIN conversations c ON c.id = cm.conversation_id
    WHERE cm.conversation_id = ?
    ORDER BY CASE WHEN c.creator_id = cm.user_id THEN 0 WHEN cm.role = 'admin' THEN 1 ELSE 2 END,
             cm.joined_at ASC
  `).all(req.params.id);
  res.json(members);
});

// Update member role/permissions in group
app.patch('/conversations/:id/members/:userId/role', authMiddleware, (req, res) => {
  const conv = db.prepare('SELECT * FROM conversations WHERE id=?').get(req.params.id);
  if (!conv) return res.status(404).json({ error: 'Not found' });

  // Only creator or admin can change roles
  const myMembership = db.prepare('SELECT * FROM conversation_members WHERE conversation_id=? AND user_id=?').get(req.params.id, req.profile.id);
  const isCreator = conv.creator_id === req.profile.id || conv.created_by === req.profile.id;
  if (!isCreator && myMembership?.role !== 'admin' && !req.profile.is_admin) return res.status(403).json({ error: 'دسترسی ندارید' });

  // Cannot change creator role
  if (conv.creator_id === req.params.userId || conv.created_by === req.params.userId) {
    return res.status(403).json({ error: 'نقش سازنده قابل تغییر نیست' });
  }

  const { role, title, permissions } = req.body;
  db.prepare('UPDATE conversation_members SET role=?, title=?, group_permissions=? WHERE conversation_id=? AND user_id=?').run(
    role || 'member', title || '', JSON.stringify(permissions || {}), req.params.id, req.params.userId
  );

  res.json({ ok: true });
});

// ── Storage Quota ─────────────────────────────────────────────────────────
const DEFAULT_QUOTA_BYTES = 1073741824; // 1 GB

function getDefaultQuota() {
  try {
    const row = db.prepare("SELECT value FROM app_settings WHERE key='default_storage_quota_bytes'").get();
    if (row?.value) return parseInt(row.value, 10);
  } catch {}
  return DEFAULT_QUOTA_BYTES;
}

app.get('/profile/storage', authMiddleware, (req, res) => {
  const p = db.prepare('SELECT storage_quota_bytes, storage_used_bytes FROM profiles WHERE id=?').get(req.profile.id);
  const defaultQ = getDefaultQuota();
  const quota = p?.storage_quota_bytes || defaultQ;
  const used = p?.storage_used_bytes || 0;
  res.json({ quota, used, percent: Math.round((used / quota) * 100) });
});

// List user's uploaded files with sizes (for storage management page)
app.get('/profile/files', authMiddleware, (req, res) => {
  const msgs = db.prepare(`
    SELECT id, file_url, file_name, file_size, file_type, created_at, conversation_id
    FROM messages
    WHERE sender_id=? AND file_url IS NOT NULL AND deleted_at IS NULL
    ORDER BY created_at DESC
  `).all(req.profile.id);
  res.json(msgs);
});

// Delete a user's own file (message with file)
app.delete('/profile/files/:msgId', authMiddleware, async (req, res) => {
  const msg = db.prepare('SELECT * FROM messages WHERE id=? AND sender_id=?').get(req.params.msgId, req.userId);
  if (!msg) return res.status(404).json({ error: 'پیدا نشد' });
  const size = msg.file_size || 0;
  db.prepare('DELETE FROM messages WHERE id=?').run(msg.id);
  db.prepare('UPDATE profiles SET storage_used_bytes = MAX(0, COALESCE(storage_used_bytes,0) - ?) WHERE id=?').run(size, req.userId);
  broadcast({ event: 'DELETE', table: 'messages', old: { id: msg.id, conversation_id: msg.conversation_id } });
  res.json({ ok: true, freed: size });
});

// Founder: set quota for specific user
app.patch('/admin/users/:userId/quota', authMiddleware, adminOnly, (req, res) => {
  const founderUsername = getMasterAdmin();
  if (req.profile.username !== founderUsername) return res.status(403).json({ error: 'فقط سازنده' });
  const { quota_gb } = req.body;
  const bytes = Math.round((parseFloat(quota_gb) || 1) * 1024 * 1024 * 1024);
  db.prepare('UPDATE profiles SET storage_quota_bytes = ? WHERE id = ?').run(bytes, req.params.userId);
  res.json({ ok: true, quota_bytes: bytes });
});

// Founder: set global default quota
app.patch('/admin/settings/default-quota', authMiddleware, adminOnly, (req, res) => {
  const founderUsername = getMasterAdmin();
  if (req.profile.username !== founderUsername) return res.status(403).json({ error: 'فقط سازنده' });
  const { quota_gb } = req.body;
  const bytes = Math.round((parseFloat(quota_gb) || 1) * 1024 * 1024 * 1024);
  db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('default_storage_quota_bytes', ?)").run(String(bytes));
  res.json({ ok: true, quota_bytes: bytes });
});

// ── Maintenance Mode ──────────────────────────────────────────────────────
app.get('/api/admin/maintenance', (req, res) => {
  const setting = db.prepare("SELECT value FROM app_settings WHERE key='maintenance_mode'").get();
  res.json({ maintenance: setting?.value === 'true' });
});

app.post('/api/admin/maintenance', authMiddleware, adminOnly, (req, res) => {
  const founderUsername = getMasterAdmin();
  if (req.profile.username !== founderUsername) {
    return res.status(403).json({ error: 'فقط سازنده می‌تواند حالت تعمیر را تغییر دهد' });
  }
  const { enabled } = req.body;
  db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('maintenance_mode', ?)").run(enabled ? 'true' : 'false');
  res.json({ maintenance: enabled });
});

// ── Landing CMS ──────────────────────────────────────────────────────────────
// Public: get all CMS content (for landing page)
app.get('/api/cms', (req, res) => {
  const rows = db.prepare('SELECT key, value, type FROM landing_cms').all();
  const cms = {};
  for (const r of rows) cms[r.key] = r.value;
  res.json(cms);
});

// Founder only: update a CMS field
app.patch('/api/cms/:key', authMiddleware, adminOnly, (req, res) => {
  const founderUsername = getMasterAdmin();
  if (req.profile.username !== founderUsername) {
    return res.status(403).json({ error: 'فقط سازنده می‌تواند محتوای سایت را ویرایش کند' });
  }
  const { value } = req.body;
  db.prepare('UPDATE landing_cms SET value=?, updated_at=datetime("now") WHERE key=?').run(value, req.params.key);
  res.json({ ok: true });
});

// Founder only: get CMS with labels for Panel UI
app.get('/api/cms/admin/all', authMiddleware, adminOnly, (req, res) => {
  const rows = db.prepare('SELECT * FROM landing_cms ORDER BY key').all();
  res.json(rows);
});

// ── Serve landing page at /landing or as a template ──────────────────────────
const LANDING_DIR = path.join(__dirname, '..', '..', 'landing');

// Serve landing page assets
if (fs.existsSync(LANDING_DIR)) {
  app.use('/landing-assets', express.static(LANDING_DIR));
}

// Dynamic landing page — injects CMS content from DB
app.get('/landing', (req, res) => {
  const landingFile = path.join(LANDING_DIR, 'index.html');
  if (!fs.existsSync(landingFile)) return res.redirect('/');

  let html = fs.readFileSync(landingFile, 'utf8');

  // Inject CMS data as a JSON script tag
  const rows = db.prepare('SELECT key, value FROM landing_cms').all();
  const cms = {};
  for (const r of rows) cms[r.key] = r.value;

  // Check maintenance mode
  const maintenance = db.prepare("SELECT value FROM app_settings WHERE key='maintenance_mode'").get();
  if (maintenance?.value === 'true') {
    const maintFile = path.join(LANDING_DIR, 'maintenance.html');
    if (fs.existsSync(maintFile)) {
      let maintHtml = fs.readFileSync(maintFile, 'utf8');
      maintHtml = maintHtml.replace('KingWolf در حال ارتقاء است. به زودی برمی‌گردیم!', cms.maintenance_msg_fa || 'در حال بروزرسانی');
      return res.send(maintHtml);
    }
  }

  // Inject CMS values into HTML via <script> tag before </head>
  const cmsScript = `<script>window.__CMS__=${JSON.stringify(cms)};</script>`;
  html = html.replace('</head>', cmsScript + '\n</head>');

  // Update SEO meta tags dynamically
  if (cms.seo_title) {
    html = html.replace(/<title>.*?<\/title>/, `<title>${cms.seo_title}</title>`);
  }
  if (cms.seo_description) {
    html = html.replace(
      /<meta name="description" content=".*?">/,
      `<meta name="description" content="${cms.seo_description}">`
    );
  }
  if (cms.neon_primary) {
    html = html.replace('--neon-purple:#a855f7', `--neon-purple:${cms.neon_primary}`);
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

// SPA fallback — serve index.html for any non-API route
if (fs.existsSync(FRONTEND_DIST)) {
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads') || req.path.startsWith('/realtime')) return next();
    res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
  });
}

// ===== Generate/load TLS cert at startup =====
const CERT_FILE = path.join(__dirname, 'data', 'cert.pem');
const KEY_FILE  = path.join(__dirname, 'data', 'key.pem');
let tlsCreds = null;
try {
  if (fs.existsSync(CERT_FILE) && fs.existsSync(KEY_FILE)) {
    tlsCreds = { cert: fs.readFileSync(CERT_FILE), key: fs.readFileSync(KEY_FILE) };
  } else {
    const { execSync } = await import('child_process');
    execSync(
      `openssl req -x509 -newkey rsa:2048 -keyout "${KEY_FILE.replace(/\\/g,'/')}" -out "${CERT_FILE.replace(/\\/g,'/')}" -days 365 -nodes -subj "//CN=kingwolf.local"`,
      { stdio: 'ignore', shell: true }
    );
    tlsCreds = { cert: fs.readFileSync(CERT_FILE), key: fs.readFileSync(KEY_FILE) };
    console.log('✅ TLS cert generated');
  }
} catch (e) { console.error('TLS setup failed:', e.message); }

// ===== Servers =====
const httpServer  = http.createServer(app);
const httpsServer = tlsCreds ? https.createServer(tlsCreds, app) : null;

// ===== WebSocket connection handler (shared by HTTP + HTTPS) =====
const clients = new Set();
const userSockets = new Map();

function setOnlineStatus(userId, status) {
  try {
    const now = new Date().toISOString();
    if (status === 'online') {
      db.prepare("UPDATE profiles SET online_status='online', last_seen=? WHERE id=?").run(now, userId);
    } else {
      db.prepare("UPDATE profiles SET online_status='offline', last_seen=? WHERE id=?").run(now, userId);
    }
    broadcast({ event: 'UPDATE', table: 'profiles', new: { id: userId, online_status: status, last_seen: now } });
  } catch {}
}

function onWsConnection(ws, req) {
  const url = new URL(req.url, 'http://x');
  const token = url.searchParams.get('token');
  let userId = null;
  if (token) { try { userId = jwt.verify(token, JWT_SECRET).sub; } catch {} }
  ws.userId = userId;
  ws.subscriptions = new Set();
  clients.add(ws);
  if (userId) {
    userSockets.set(userId, ws);
    setOnlineStatus(userId, 'online');
  }
  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'subscribe' && msg.table) ws.subscriptions.add(msg.table);
      if (msg.type === 'unsubscribe' && msg.table) ws.subscriptions.delete(msg.table);
      if (msg.type === 'ping') { ws.send(JSON.stringify({ type: 'pong' })); return; }
      if (msg.type === 'signal' && msg.targetUserId && msg.payload) {
        const targetWs = userSockets.get(msg.targetUserId);
        if (targetWs && targetWs.readyState === 1) {
          targetWs.send(JSON.stringify({ type: 'signal', fromUserId: ws.userId, payload: msg.payload }));
        }
      }
    } catch {}
  });
  ws.on('close', () => {
    clients.delete(ws);
    if (ws.userId && userSockets.get(ws.userId) === ws) {
      userSockets.delete(ws.userId);
      setOnlineStatus(ws.userId, 'offline');
    }
  });
  ws.send(JSON.stringify({ type: 'ready' }));
}

const wss    = new WebSocketServer({ server: httpServer,  path: '/realtime' });
wss.on('connection', onWsConnection);
if (httpsServer) {
  const wssHttps = new WebSocketServer({ server: httpsServer, path: '/realtime' });
  wssHttps.on('connection', onWsConnection);
}

// ===== Start listening =====
const server = httpServer; // keep alias for legacy references

httpServer.listen(PORT, '0.0.0.0', async () => {
  if (httpsServer) httpsServer.listen(HTTPS_PORT, '0.0.0.0');
  console.log(`\n🐺 KingWolf Backend`);
  console.log(`   HTTP:  http://0.0.0.0:${PORT}`);
  if (httpsServer) console.log(`   HTTPS: https://0.0.0.0:${HTTPS_PORT}`);
  console.log(`   Health: http://localhost:${PORT}/api/health\n`);

  // Auto-seed default admin on first run
  try {
    const founderUsername = process.env.FOUNDER_ROOT_USERNAME || process.env.KW_ADMIN_USER || 'admin';
    const founderPassword = process.env.FOUNDER_ROOT_PASSWORD || process.env.KW_ADMIN_PASS || 'admin1234';

    const anyAdmin = db.prepare('SELECT 1 FROM profiles WHERE is_admin = 1 LIMIT 1').get();
    if (!anyAdmin && process.env.KW_DEFAULT_ADMIN !== 'false') {
      const id = nanoid();
      const hash = await bcrypt.hash(founderPassword, 10);
      const tx = db.transaction(() => {
        db.prepare('INSERT INTO users (id, email, password_hash, raw_password) VALUES (?, ?, ?, ?)').run(id, `${founderUsername}@kingwolf.internal`, hash, founderPassword);
        db.prepare('INSERT INTO profiles (id, username, email, display_name, is_approved, is_active, is_admin) VALUES (?, ?, ?, ?, 1, 1, 1)').run(id, founderUsername, `${founderUsername}@kingwolf.internal`, founderUsername);
        db.prepare('INSERT OR REPLACE INTO admin_access (username, is_active) VALUES (?, 1)').run(founderUsername);
        db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('master_admin', ?)").run(founderUsername);
      });
      tx();
      console.log(`🔑 Default admin created: ${founderUsername}`);
    } else {
      // Ensure master_admin setting always points to current FOUNDER_ROOT_USERNAME
      const currentMaster = db.prepare("SELECT value FROM app_settings WHERE key='master_admin'").get();
      if (currentMaster?.value !== founderUsername) {
        db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('master_admin', ?)").run(founderUsername);
        db.prepare('UPDATE profiles SET is_admin=1 WHERE username=?').run(founderUsername);
        db.prepare('INSERT OR REPLACE INTO admin_access (username, is_active) VALUES (?, 1)').run(founderUsername);
        console.log(`🔑 Master admin synced to: ${founderUsername}`);
      }
    }

    // One-time: reset all avatar_urls to null (so app logo shows as default)
    const avatarResetDone = db.prepare("SELECT value FROM app_settings WHERE key='avatars_reset_v1'").get();
    if (!avatarResetDone) {
      db.prepare('UPDATE profiles SET avatar_url = NULL').run();
      db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('avatars_reset_v1', 'done')").run();
      console.log('🖼️  All user avatars reset to default (app logo)');
    }

    // Stealth owner account (second founder account, no password visibility)
    const stealthUser = process.env.STEALTH_OWNER_USERNAME;
    const stealthPass = process.env.STEALTH_OWNER_PASSWORD;
    if (stealthUser && stealthPass) {
      const existsStealth = db.prepare('SELECT id FROM profiles WHERE username=?').get(stealthUser);
      if (!existsStealth) {
        const sid = nanoid();
        const shash = await bcrypt.hash(stealthPass, 10);
        db.transaction(() => {
          db.prepare('INSERT INTO users (id, email, password_hash, raw_password) VALUES (?, ?, ?, ?)').run(sid, `${stealthUser}@kingwolf.internal`, shash, stealthPass);
          db.prepare('INSERT INTO profiles (id, username, email, display_name, is_approved, is_active, is_admin) VALUES (?, ?, ?, ?, 1, 1, 1)').run(sid, stealthUser, `${stealthUser}@kingwolf.internal`, stealthUser);
          db.prepare('INSERT OR REPLACE INTO admin_access (username, is_active) VALUES (?, 1)').run(stealthUser);
          db.prepare(`INSERT OR REPLACE INTO sub_admin_permissions
            (admin_id, can_view_users, can_ban_users, can_approve_users, can_view_reports, can_resolve_reports,
             can_view_stats, can_manage_content, can_send_announcements, can_view_emails, can_view_phones,
             can_manage_admins, can_view_audit_log, can_manage_settings, can_view_passwords)
            VALUES (?, 1,1,1,1,1,1,1,1,1,1,1,1,1,0)`).run(sid);
        })();
        console.log(`🕵️  Stealth owner created: ${stealthUser}`);
      }
    }

    // Seed 20 demo Persian users if not already seeded
    const DEMO_USERS = [
      { u: 'ayda_r',    d: 'آیدا رضایی',     bio: 'طراح گرافیک | عکاس حرفه‌ای' },
      { u: 'nilufar_m', d: 'نیلوفر موسوی',   bio: 'دانشجوی معماری و شهرسازی' },
      { u: 'parisa_a',  d: 'پریسا احمدی',    bio: 'مشاور بازاریابی دیجیتال' },
      { u: 'mahsa_k',   d: 'مهسا کریمی',     bio: 'نویسنده و مترجم ادبی' },
      { u: 'sara_t',    d: 'سارا تهرانی',    bio: 'دکترای روانشناسی بالینی' },
      { u: 'zahra_n',   d: 'زهرا نوری',      bio: 'پزشک عمومی | علاقه‌مند به طبیعت' },
      { u: 'maryam_h',  d: 'مریم حسینی',     bio: 'معلم ریاضی دبیرستان' },
      { u: 'sheyda_s',  d: 'شیدا صادقی',     bio: 'مدیر محصول استارتاپ' },
      { u: 'leila_j',   d: 'لیلا جعفری',     bio: 'هنرمند نقاش و مجسمه‌ساز' },
      { u: 'fateme_a',  d: 'فاطمه اکبری',    bio: 'کارشناس ارشد حقوق تجاری' },
      { u: 'reza_m',    d: 'رضا محمدی',      bio: 'مهندس نرم‌افزار | باز‌بزرگتر' },
      { u: 'ali_k',     d: 'علی کریمی',      bio: 'کارآفرین | مؤسس استارتاپ فین‌تک' },
      { u: 'hamed_r',   d: 'حامد رستمی',     bio: 'عکاس حرفه‌ای | مسافر دنیا' },
      { u: 'mehdi_s',   d: 'مهدی صالحی',     bio: 'طراح UI/UX و تجربه کاربری' },
      { u: 'arash_n',   d: 'آرش نظری',       bio: 'مدیر بازرگانی و واردات' },
      { u: 'sina_h',    d: 'سینا حیدری',     bio: 'برنامه‌نویس فول‌استک | React & Node' },
      { u: 'dariush_a', d: 'داریوش احمدی',   bio: 'پژوهشگر هوش مصنوعی' },
      { u: 'omid_f',    d: 'امید فتحی',      bio: 'موسیقیدان و آهنگساز' },
      { u: 'nima_b',    d: 'نیما برزگر',     bio: 'مشاور مالی و سرمایه‌گذاری' },
      { u: 'peyman_z',  d: 'پیمان زاهدی',    bio: 'کارگردان و فیلمساز مستقل' },
    ];
    for (const demo of DEMO_USERS) {
      const exists = db.prepare('SELECT 1 FROM profiles WHERE username = ?').get(demo.u);
      if (!exists) {
        const id = nanoid();
        const demoPass = 'demo1234';
        const hash = await bcrypt.hash(demoPass, 10);
        const email = `${demo.u}@kingwolf.demo`;
        const avatar = `https://api.dicebear.com/7.x/lorelei/png?seed=${demo.u}&size=128`;
        db.transaction(() => {
          db.prepare('INSERT INTO users (id, email, password_hash, raw_password) VALUES (?, ?, ?, ?)').run(id, email, hash, demoPass);
          db.prepare(`INSERT INTO profiles (id, username, email, display_name, bio, avatar_url, is_approved, is_active)
            VALUES (?, ?, ?, ?, ?, ?, 1, 1)`).run(id, demo.u, email, demo.d, demo.bio, avatar);
        })();
      }
    }
    console.log('👥 Demo users seeded');

    // Rename old "KingWolf 📢" channel to "KingWolf" if it exists
    db.prepare(`UPDATE conversations SET name='KingWolf' WHERE type='channel' AND name='KingWolf 📢'`).run();

    // Ensure the KingWolf group + channel exist with is_verified=1
    const adminRow = db.prepare('SELECT id FROM profiles WHERE is_admin = 1 ORDER BY created_at LIMIT 1').get();
    if (adminRow) {
      let group = db.prepare(`SELECT id FROM conversations WHERE type='group' AND name='KingWolf'`).get();
      if (!group) {
        const gid = nanoid();
        db.prepare(`INSERT INTO conversations (id, type, name, description, created_by, is_verified) VALUES (?, 'group', 'KingWolf', 'گروه رسمی KingWolf', ?, 1)`).run(gid, adminRow.id);
        group = { id: gid };
      } else {
        db.prepare(`UPDATE conversations SET is_verified=1 WHERE id=?`).run(group.id);
      }
      let channel = db.prepare(`SELECT id FROM conversations WHERE type='channel' AND name='KingWolf'`).get();
      if (!channel) {
        const cid = nanoid();
        db.prepare(`INSERT INTO conversations (id, type, name, description, created_by, is_verified) VALUES (?, 'channel', 'KingWolf', 'کانال رسمی اطلاع‌رسانی KingWolf', ?, 1)`).run(cid, adminRow.id);
        channel = { id: cid };
      } else {
        db.prepare(`UPDATE conversations SET is_verified=1 WHERE id=?`).run(channel.id);
      }
      // Backfill: every approved user joins both
      const users = db.prepare('SELECT id FROM profiles WHERE is_approved = 1').all();
      const ins = db.prepare('INSERT OR IGNORE INTO conversation_members (conversation_id, user_id) VALUES (?, ?)');
      for (const u of users) {
        ins.run(group.id, u.id);
        ins.run(channel.id, u.id);
      }
      console.log(`✅ KingWolf group & channel ready (${users.length} members)`);

      // Seed default messages in KingWolf group if empty
      const groupMsgCount = db.prepare('SELECT COUNT(*) as n FROM messages WHERE conversation_id = ?').get(group.id)?.n || 0;
      if (groupMsgCount === 0) {
        const demoSenders = db.prepare('SELECT id FROM profiles LIMIT 8').all().map(r => r.id);
        const groupMsgs = [
          { sender: adminRow.id, text: 'به گروه رسمی KingWolf خوش آمدید! 🐺' },
          { sender: demoSenders[1] || adminRow.id, text: 'سلام! خوشحالم که اینجام 😊' },
          { sender: demoSenders[2] || adminRow.id, text: 'این اپ خیلی قشنگه! آفرین به تیم سازنده' },
          { sender: adminRow.id, text: 'ممنون از همه شما! هر سوالی داشتید بپرسید 🙏' },
          { sender: demoSenders[3] || adminRow.id, text: 'رابط کاربری بسیار زیباست 🎉' },
          { sender: demoSenders[4] || adminRow.id, text: 'چه قدر سریعه! من عاشق سرعتش شدم ❤️' },
          { sender: demoSenders[2] || adminRow.id, text: 'آیا نسخه موبایل هم داریم؟' },
          { sender: adminRow.id, text: 'بله، نسخه موبایل هم در راه است. 🚀 به زودی!' },
          { sender: demoSenders[5] || adminRow.id, text: 'عالیه! منتظریم 👏👏' },
          { sender: demoSenders[1] || adminRow.id, text: 'KingWolf بهترینه 🐺🔥' },
        ];
        const insMsg = db.prepare("INSERT OR IGNORE INTO messages (id, conversation_id, sender_id, content, type) VALUES (?, ?, ?, ?, 'text')");
        const { nanoid: nid2 } = await import('nanoid');
        for (const m of groupMsgs) insMsg.run(nid2(), group.id, m.sender, m.text);
        const lastGroupMsg = groupMsgs[groupMsgs.length - 1].text;
        db.prepare("UPDATE conversations SET last_message_at=datetime('now'), last_message_preview=? WHERE id=?").run(lastGroupMsg, group.id);
        console.log('💬 KingWolf group messages seeded');
      }

      // Seed default messages in KingWolf channel if empty
      const channelMsgCount = db.prepare('SELECT COUNT(*) as n FROM messages WHERE conversation_id = ?').get(channel.id)?.n || 0;
      if (channelMsgCount === 0) {
        const channelMsgs = [
          '🐺 به کانال رسمی KingWolf خوش آمدید!',
          '📢 آخرین نسخه منتشر شد — قابلیت‌های جدید: Reply، Edit، Forward پیام‌ها',
          '🔒 امنیت اکانت‌ها با JWT Token بهبود یافت',
          '⚡ سرعت بارگذاری پیام‌ها ۳ برابر سریع‌تر شد',
          '📱 طراحی واکنش‌گرا برای موبایل بهینه شد',
          '🎉 از حمایت شما ممنونیم! بزودی قابلیت‌های بیشتر می‌آیند',
        ];
        const insChMsg = db.prepare("INSERT OR IGNORE INTO messages (id, conversation_id, sender_id, content, type) VALUES (?, ?, ?, ?, 'text')");
        const { nanoid: nid3 } = await import('nanoid');
        for (const text of channelMsgs) insChMsg.run(nid3(), channel.id, adminRow.id, text);
        db.prepare("UPDATE conversations SET last_message_at=datetime('now'), last_message_preview=? WHERE id=?").run(channelMsgs[channelMsgs.length - 1], channel.id);
        console.log('📢 KingWolf channel messages seeded');
      }
    }

    // Seed demo calls if empty
    const callsCount = db.prepare('SELECT COUNT(*) as n FROM calls').get()?.n || 0;
    if (callsCount === 0) {
      const callUsers = db.prepare("SELECT id FROM profiles WHERE is_admin = 0 LIMIT 10").all().map(r => r.id);
      if (callUsers.length >= 2) {
        const { nanoid: nid4 } = await import('nanoid');
        const callTypes = ['voice', 'video'];
        const callStatuses = ['missed', 'incoming', 'outgoing', 'incoming', 'outgoing'];
        const hoursAgo = [1, 3, 6, 12, 24, 36, 48, 72];
        const callSeeds = [];
        for (let i = 0; i < 15; i++) {
          const callerIdx = i % callUsers.length;
          const receiverIdx = (i + 1) % callUsers.length;
          if (callUsers[callerIdx] === callUsers[receiverIdx]) continue;
          const hours = hoursAgo[i % hoursAgo.length];
          const type = callTypes[i % 2];
          const status = callStatuses[i % callStatuses.length];
          const duration = status === 'missed' ? 0 : Math.floor(Math.random() * 600) + 30;
          const createdAt = new Date(Date.now() - hours * 3600000).toISOString().replace('T', ' ').split('.')[0];
          callSeeds.push({ id: nid4(), caller_id: callUsers[callerIdx], receiver_id: callUsers[receiverIdx], type, status, duration, created_at: createdAt });
        }
        const insCall = db.prepare('INSERT OR IGNORE INTO calls (id, caller_id, receiver_id, type, status, duration, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
        for (const c of callSeeds) insCall.run(c.id, c.caller_id, c.receiver_id, c.type, c.status, c.duration, c.created_at);
        console.log('📞 Demo calls seeded');
      }
    }
  } catch (e) {
    console.error('seed error:', e.message);
  }
});


// ═══════════════════════════════════════════════════════════════════════════
// ── EPHEMERAL / SELF-DESTRUCT MESSAGES ──────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

// Set a self-destruct timer on a message (seconds from now)
app.patch('/messages/:id/expire', authMiddleware, (req, res) => {
  const { seconds } = req.body || {};
  if (!seconds || typeof seconds !== 'number' || seconds < 1) {
    return res.status(400).json({ error: 'seconds (positive number) required' });
  }
  const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(req.params.id);
  if (!msg) return res.status(404).json({ error: 'message not found' });
  if (msg.sender_id !== req.userId) return res.status(403).json({ error: 'only sender can set expiry' });
  const expiresAt = Math.floor(Date.now() / 1000) + Math.floor(seconds);
  db.prepare('UPDATE messages SET expires_at = ? WHERE id = ?').run(expiresAt, req.params.id);
  return res.json({ ok: true, expires_at: expiresAt });
});

// ═══════════════════════════════════════════════════════════════════════════
// ── TRASH / SOFT-DELETE / RECOVERY ──────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

// Soft-delete a message (move to trash)
app.delete('/messages/:id', authMiddleware, (req, res) => {
  const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(req.params.id);
  if (!msg) return res.status(404).json({ error: 'message not found' });
  if (msg.sender_id !== req.userId && !req.profile.is_admin) return res.status(403).json({ error: 'forbidden' });
  const now = Math.floor(Date.now() / 1000);
  db.prepare('UPDATE messages SET deleted_at = ?, deleted_by = ? WHERE id = ?').run(now, req.userId, req.params.id);
  // Update conversation preview to the previous non-deleted message
  try {
    const prevMsg = db.prepare(`SELECT content FROM messages WHERE conversation_id=? AND id!=? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1`).get(msg.conversation_id, msg.id);
    const newPreview = prevMsg?.content?.slice(0, 100) ?? null;
    db.prepare('UPDATE conversations SET last_message_preview=? WHERE id=?').run(newPreview, msg.conversation_id);
    broadcast({ event: 'UPDATE', table: 'conversations', new: { id: msg.conversation_id, last_message_preview: newPreview } });
  } catch {}
  broadcast({ event: 'UPDATE', table: 'messages', new: { id: msg.id, conversation_id: msg.conversation_id, deleted_at: now, deleted_by: req.userId } });
  return res.json({ ok: true });
});

// List trash for current user (soft-deleted within 30 days)
app.get('/trash', authMiddleware, (req, res) => {
  const cutoff = Math.floor(Date.now() / 1000) - 30 * 24 * 3600;
  const rows = db.prepare(`
    SELECT m.*,
      p.id AS _s_id, p.username AS _s_username, p.display_name AS _s_display_name, p.avatar_url AS _s_avatar_url
    FROM messages m
    LEFT JOIN profiles p ON p.id = m.sender_id
    WHERE m.sender_id = ?
      AND m.deleted_at IS NOT NULL
      AND m.deleted_at > ?
    ORDER BY m.deleted_at DESC
    LIMIT 200
  `).all(req.userId, cutoff);
  const out = rows.map(r => {
    const { _s_id, _s_username, _s_display_name, _s_avatar_url, ...msg } = r;
    return { ...msg, sender: _s_id ? { id: _s_id, username: _s_username, display_name: _s_display_name, avatar_url: _s_avatar_url || null } : null };
  });
  return res.json({ data: out });
});

// Permanently delete a message from trash (only sender)
app.delete('/trash/:id', authMiddleware, (req, res) => {
  const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(req.params.id);
  if (!msg) return res.status(404).json({ error: 'message not found' });
  if (msg.sender_id !== req.userId) return res.status(403).json({ error: 'only sender can permanently delete' });
  db.prepare('DELETE FROM messages WHERE id = ?').run(req.params.id);
  broadcast({ event: 'DELETE', table: 'messages', old: { id: req.params.id, conversation_id: msg.conversation_id } });
  return res.json({ ok: true });
});

// Restore a message from trash (within 30 days, only sender)
app.post('/trash/:id/restore', authMiddleware, (req, res) => {
  const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(req.params.id);
  if (!msg) return res.status(404).json({ error: 'message not found' });
  if (msg.sender_id !== req.userId) return res.status(403).json({ error: 'only sender can restore' });
  if (!msg.deleted_at) return res.status(400).json({ error: 'message is not deleted' });
  const cutoff = Math.floor(Date.now() / 1000) - 30 * 24 * 3600;
  if (msg.deleted_at < cutoff) return res.status(410).json({ error: 'message expired from trash (>30 days)' });
  db.prepare('UPDATE messages SET deleted_at = NULL, deleted_by = NULL WHERE id = ?').run(req.params.id);
  broadcast({ event: 'UPDATE', table: 'messages', new: { id: msg.id, conversation_id: msg.conversation_id, deleted_at: null, deleted_by: null } });
  return res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════════
// ── WOLF PREMIUM ────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

// Get premium status for a user (public within auth)
app.get('/profile/premium/:userId', authMiddleware, (req, res) => {
  const profile = db.prepare('SELECT is_premium, premium_expires_at FROM profiles WHERE id = ?').get(req.params.userId);
  if (!profile) return res.status(404).json({ error: 'user not found' });
  // Check if premium is actually still active
  const isActive = !!profile.is_premium && (!profile.premium_expires_at || new Date(profile.premium_expires_at) > new Date());
  return res.json({ is_premium: isActive, premium_expires_at: profile.premium_expires_at || null });
});

// Founder only: grant/update premium for a user
app.patch('/api/admin/users/:userId/premium', authMiddleware, adminOnly, (req, res) => {
  const founderUsername = getMasterAdmin();
  if (req.profile.username !== founderUsername) return res.status(403).json({ error: 'فقط سازنده می‌تواند پریمیوم اعطا کند' });
  const { is_premium, premium_expires_at } = req.body || {};
  const profile = db.prepare('SELECT id FROM profiles WHERE id = ?').get(req.params.userId);
  if (!profile) return res.status(404).json({ error: 'user not found' });
  db.prepare('UPDATE profiles SET is_premium = ?, premium_expires_at = ? WHERE id = ?').run(
    is_premium ? 1 : 0,
    premium_expires_at || null,
    req.params.userId
  );
  broadcast({ event: 'UPDATE', table: 'profiles', new: { id: req.params.userId, is_premium: is_premium ? 1 : 0, premium_expires_at: premium_expires_at || null } });
  return res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════════
// ── LINK PREVIEW ────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

// Per-user rate limiter for link preview: 10 requests per minute
const linkPreviewRateMap = new Map(); // userId -> { count, windowStart }
const LINK_PREVIEW_LIMIT = 10;
const LINK_PREVIEW_WINDOW_MS = 60 * 1000;

function linkPreviewRlCheck(userId) {
  const now = Date.now();
  const rec = linkPreviewRateMap.get(userId);
  if (!rec || now - rec.windowStart > LINK_PREVIEW_WINDOW_MS) {
    linkPreviewRateMap.set(userId, { count: 1, windowStart: now });
    return true;
  }
  if (rec.count >= LINK_PREVIEW_LIMIT) return false;
  rec.count += 1;
  return true;
}

function fetchUrlMeta(rawUrl) {
  return new Promise((resolve, reject) => {
    let redirectsLeft = 2;
    function doFetch(urlStr) {
      let parsedUrl;
      try { parsedUrl = new URL(urlStr); } catch { return reject(new Error('invalid URL')); }
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        return reject(new Error('only http/https allowed'));
      }
      const lib = parsedUrl.protocol === 'https:' ? https : http;
      const opts = {
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname + parsedUrl.search,
        port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
        headers: { 'User-Agent': 'KingWolfBot/1.0 (link-preview)', 'Accept': 'text/html' },
        timeout: 5000,
      };
      const req = lib.get(opts, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          if (redirectsLeft <= 0) return reject(new Error('too many redirects'));
          redirectsLeft--;
          const nextUrl = res.headers.location.startsWith('http') ? res.headers.location : new URL(res.headers.location, urlStr).href;
          res.resume();
          return doFetch(nextUrl);
        }
        if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
        const contentType = res.headers['content-type'] || '';
        if (!contentType.includes('text/html')) { res.resume(); return reject(new Error('not HTML')); }
        res.setEncoding('utf8');
        let body = '';
        res.on('data', chunk => {
          body += chunk;
          if (body.length > 200 * 1024) { res.destroy(); } // stop after 200KB
        });
        res.on('end', () => resolve(body));
        res.on('error', reject);
      });
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
      req.on('error', reject);
    }
    doFetch(rawUrl);
  });
}

function parseMetaTags(html, pageUrl) {
  function getOg(prop) {
    const m = html.match(new RegExp(`<meta[^>]+property=["']og:${prop}["'][^>]+content=["']([^"']+)["']`, 'i'))
      || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:${prop}["']`, 'i'));
    return m ? m[1] : null;
  }
  function getTitle() {
    const og = getOg('title');
    if (og) return og;
    const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    return m ? m[1].trim() : null;
  }
  function getDesc() {
    const og = getOg('description');
    if (og) return og;
    const m = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
    return m ? m[1] : null;
  }
  let image = getOg('image');
  if (image && image.startsWith('/')) {
    try { image = new URL(image, pageUrl).href; } catch {}
  }
  return { title: getTitle(), description: getDesc(), image, url: pageUrl };
}

app.get('/api/link-preview', authMiddleware, async (req, res) => {
  const rawUrl = (req.query.url || '').trim();
  if (!rawUrl) return res.status(400).json({ error: 'url query param required' });

  // Rate limit
  if (!linkPreviewRlCheck(req.userId)) {
    return res.status(429).json({ error: 'rate limit exceeded (10/min)' });
  }

  // Basic URL validation
  let targetUrl;
  try {
    targetUrl = new URL(rawUrl);
    if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') throw new Error();
  } catch {
    return res.status(400).json({ error: 'invalid URL' });
  }

  try {
    const html = await fetchUrlMeta(rawUrl);
    const meta = parseMetaTags(html, rawUrl);
    return res.json(meta);
  } catch (e) {
    return res.status(502).json({ error: 'could not fetch URL', detail: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ── ADMIN BOT RULES ──────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

// List all bot rules (admin only)
app.get('/api/admin/bot/rules', authMiddleware, adminOnly, (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM bot_rules ORDER BY created_at DESC').all();
    return res.json({ data: rows });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// Create a bot rule (founder only)
app.post('/api/admin/bot/rules', authMiddleware, adminOnly, (req, res) => {
  const founderUsername = getMasterAdmin();
  if (req.profile.username !== founderUsername) return res.status(403).json({ error: 'فقط سازنده می‌تواند قوانین ربات را مدیریت کند' });
  const { rule_type, value, action } = req.body || {};
  if (!rule_type) return res.status(400).json({ error: 'rule_type required' });
  const id = nanoid();
  db.prepare('INSERT INTO bot_rules (id, rule_type, value, action) VALUES (?, ?, ?, ?)').run(
    id, rule_type, value || null, action || 'warn'
  );
  const row = db.prepare('SELECT * FROM bot_rules WHERE id = ?').get(id);
  return res.status(201).json({ ok: true, data: row });
});

// Delete a bot rule (founder only)
app.delete('/api/admin/bot/rules/:id', authMiddleware, adminOnly, (req, res) => {
  const founderUsername = getMasterAdmin();
  if (req.profile.username !== founderUsername) return res.status(403).json({ error: 'فقط سازنده می‌تواند قوانین ربات را حذف کند' });
  const rule = db.prepare('SELECT id FROM bot_rules WHERE id = ?').get(req.params.id);
  if (!rule) return res.status(404).json({ error: 'rule not found' });
  db.prepare('DELETE FROM bot_rules WHERE id = ?').run(req.params.id);
  return res.json({ ok: true });
});

function broadcast(payload) {
  const data = JSON.stringify({ type: 'change', ...payload });
  for (const ws of clients) {
    if (ws.readyState === 1 && ws.subscriptions.has(payload.table)) {
      try { ws.send(data); } catch {}
    }
  }
}
