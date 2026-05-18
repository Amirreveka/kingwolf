import express from 'express';
import os from 'os';
import https from 'https';
import http from 'http';

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

import { query, queryOne, run, transaction, initDb, UPLOADS_DIR } from './db.js';
import { initCache } from './cache.js';
import webpush from 'web-push';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;
const HTTPS_PORT = process.env.HTTPS_PORT || 3443;

// ── Master admin cache ────────────────────────────────────────────────────────
let _masterAdmin = '';
async function getMasterAdmin() {
  if (_masterAdmin) return _masterAdmin;
  try {
    const row = await queryOne("SELECT value FROM app_settings WHERE key='master_admin'");
    _masterAdmin = row?.value || process.env.FOUNDER_ROOT_USERNAME || 'admin';
  } catch {
    _masterAdmin = process.env.FOUNDER_ROOT_USERNAME || 'admin';
  }
  return _masterAdmin;
}
async function refreshMasterAdmin() {
  _masterAdmin = '';
  return getMasterAdmin();
}
async function isFounder(req) {
  const masterAdmin = await getMasterAdmin();
  const stealthOwner = process.env.STEALTH_OWNER_USERNAME || '';
  return req.profile.username === masterAdmin || (stealthOwner && req.profile.username === stealthOwner);
}
async function getFounderAccounts() {
  const masterAdmin = await getMasterAdmin();
  return [masterAdmin, process.env.STEALTH_OWNER_USERNAME || ''].filter(Boolean);
}

const JWT_SECRET = process.env.JWT_SECRET || (() => {
  const secretFile = path.join(__dirname, 'data', '.jwt-secret');
  if (fs.existsSync(secretFile)) return fs.readFileSync(secretFile, 'utf8').trim();
  const s = nanoid(48);
  fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
  fs.writeFileSync(secretFile, s);
  return s;
})();

// ── S3 Hot-plug Storage ───────────────────────────────────────────────────────
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

async function uploadToS3(localPath, s3Key) {
  if (!USE_S3) return null;
  try {
    const fileData = fs.readFileSync(localPath);
    const url = `${S3_ENDPOINT}/${S3_BUCKET}/${s3Key}`;
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
  fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
  if (fs.existsSync(vapidFile)) {
    VAPID_KEYS = JSON.parse(fs.readFileSync(vapidFile, 'utf8'));
  } else {
    VAPID_KEYS = webpush.generateVAPIDKeys();
    fs.writeFileSync(vapidFile, JSON.stringify(VAPID_KEYS));
    console.log('✅ VAPID keys generated');
  }
  webpush.setVapidDetails('mailto:admin@kingwolf.internal', VAPID_KEYS.publicKey, VAPID_KEYS.privateKey);
} catch (e) { console.error('VAPID setup failed:', e.message); }

async function sendPushToUser(userId, payload) {
  if (!VAPID_KEYS) return;
  try {
    const subs = await query('SELECT * FROM push_subscriptions WHERE user_id=?', [userId]);
    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: JSON.parse(sub.keys) },
          JSON.stringify(payload),
          { TTL: 60 }
        );
      } catch (e) {
        if (e.statusCode === 410 || e.statusCode === 404) {
          await run('DELETE FROM push_subscriptions WHERE id=?', [sub.id]);
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

app.use((req, _res, next) => {
  if (req.url.startsWith('/api/')) req.url = req.url.slice(4);
  else if (req.url === '/api') req.url = '/';
  next();
});

app.use('/uploads', express.static(UPLOADS_DIR));

const FRONTEND_DIST = path.join(__dirname, '..', 'kingwolf', 'dist', 'public');
if (fs.existsSync(FRONTEND_DIST)) {
  app.use(express.static(FRONTEND_DIST));
}

// ===== Auth helpers =====
function makeToken(userId, sessionId) {
  return jwt.sign({ sub: userId, sid: sessionId }, JWT_SECRET, { expiresIn: '30d' });
}

async function authMiddleware(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'unauthorized' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.sub;
    req.sessionId = payload.sid || null;
    const user = await queryOne('SELECT * FROM users WHERE id = ?', [req.userId]);
    if (!user) return res.status(401).json({ error: 'user not found' });
    if (req.sessionId && user.current_session_id && user.current_session_id !== req.sessionId) {
      return res.status(401).json({ error: 'session_expired' });
    }
    const blacklisted = await queryOne('SELECT 1 AS found FROM token_blacklist WHERE token_hash = SHA2(?, 256)', [token]);
    if (blacklisted) return res.status(401).json({ error: 'session_terminated' });
    const profile = await queryOne('SELECT * FROM profiles WHERE id = ?', [req.userId]);
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
const loginAttempts = new Map();
const RL_WINDOW_RESET_MS = 10 * 60 * 1000;
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
    const seconds = 30 * Math.pow(2, rec.locks - 1);
    rec.lockedUntil = now + seconds * 1000;
    rec.fails = 0;
  }
  loginAttempts.set(k, rec);
}
function rlRecordSuccess(req, email) {
  loginAttempts.delete(rlKey(req, email));
}

app.post('/auth/signup', async (req, res) => {
  const { username, password, email, phone, display_name } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'نام کاربری و رمز عبور الزامی است' });
  if (password.length < 6) return res.status(400).json({ error: 'رمز عبور باید حداقل ۶ کاراکتر باشد' });

  const cleanUser = username.toLowerCase().trim().replace(/[^a-z0-9_]/g, '');
  if (cleanUser.length < 3) return res.status(400).json({ error: 'نام کاربری باید حداقل ۳ کاراکتر داشته باشد' });

  const lockRow = await queryOne("SELECT value FROM app_settings WHERE key = 'signup_locked'");
  if (lockRow && lockRow.value === 'true') {
    return res.status(403).json({ error: 'signup is currently disabled' });
  }

  const effectiveEmail = (email && email.trim()) ? email.trim().toLowerCase() : `${cleanUser}@no-reply.kw`;
  const existing = await queryOne('SELECT id FROM users WHERE email = ?', [effectiveEmail]);
  if (existing) return res.status(409).json({ error: 'این ایمیل قبلاً ثبت شده است' });

  const existingUsername = await queryOne('SELECT id FROM profiles WHERE username = ?', [cleanUser]);
  if (existingUsername) return res.status(409).json({ error: 'این نام کاربری قبلاً گرفته شده است' });

  const id = nanoid();
  const hash = await bcrypt.hash(password, 10);
  let finalUsername = cleanUser;
  let n = 0;
  while (
    await queryOne('SELECT id FROM profiles WHERE username = ?', [finalUsername]) ||
    await queryOne('SELECT id FROM conversations WHERE username = ? AND username != ?', [finalUsername, ''])
  ) {
    n++;
    finalUsername = `${cleanUser}${n}`;
  }
  const resolvedUsername = finalUsername;

  const approvalRow = await queryOne("SELECT value FROM app_settings WHERE key = 'require_admin_approval'");
  const isApproved = !(approvalRow && approvalRow.value === 'true');

  try {
    await transaction(async (t) => {
      await t.run('INSERT INTO users (id, email, password_hash, raw_password) VALUES (?, ?, ?, ?)', [id, effectiveEmail, hash, password]);
      const normalizedPhone = phone ? phone.trim().replace(/\D/g, '') : '';
      await t.run(
        'INSERT INTO profiles (id, username, email, display_name, avatar_url, is_approved, phone) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [id, resolvedUsername, effectiveEmail, display_name || resolvedUsername, '/icon-192.png', isApproved ? 1 : 0, normalizedPhone]
      );
      if (normalizedPhone) {
        await t.run('UPDATE user_contacts SET matched_user_id = ? WHERE phone = ?', [id, normalizedPhone]);
      }
      const defaults = await t.query("SELECT id FROM conversations WHERE type IN ('group','channel') AND name = 'KingWolf'");
      for (const conv of defaults) {
        try { await t.run('INSERT IGNORE INTO conversation_members (conversation_id, user_id) VALUES (?, ?)', [conv.id, id]); } catch (_) {}
      }
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  try {
    const allUserIds = await query("SELECT id FROM profiles WHERE id != ? AND is_active = 1 AND is_approved = 1 LIMIT 500", [id]);
    for (const u of allUserIds) {
      await run('INSERT INTO notifications (id, user_id, type, actor_id, target_id, target_type, message) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [nanoid(), u.id, 'join', id, id, 'profile', `${resolvedUsername} joined KingWolf`]);
    }
  } catch (_) {}

  const sessionId = nanoid();
  const ip = getClientIp(req);
  const ua = req.headers['user-agent'] || '';
  await run('UPDATE users SET current_session_id = ? WHERE id = ?', [sessionId, id]);
  await run('INSERT INTO user_sessions (id, user_id, ip, user_agent, device_name) VALUES (?, ?, ?, ?, ?)', [sessionId, id, ip, ua, parseDeviceName(ua)]);
  const token = makeToken(id, sessionId);
  try { await run("INSERT INTO activity_log (user_id, username, action, ip) VALUES (?,?,?,?)", [id, resolvedUsername, 'signup', req.ip || '']); } catch {}
  return res.json({ user: { id, email: effectiveEmail }, access_token: token });
});

app.post('/auth/signin', async (req, res) => {
  const { password } = req.body || {};
  const identifier = (req.body.username || req.body.email || req.body.phone || '').trim();
  if (!identifier || !password) return res.status(400).json({ error: 'email and password required' });

  const rl = rlCheck(req, identifier);
  if (!rl.allowed) {
    return res.status(429).json({ error: 'rate_limited', retryAfter: rl.retryAfter, message: `بیش از حد تلاش — ${rl.retryAfter} ثانیه دیگر دوباره امتحان کنید` });
  }

  let profile = await queryOne('SELECT * FROM profiles WHERE LOWER(username) = LOWER(?)', [identifier]);
  if (!profile) profile = await queryOne('SELECT * FROM profiles WHERE LOWER(email) = LOWER(?)', [identifier]);
  if (!profile) profile = await queryOne('SELECT * FROM profiles WHERE phone = ?', [identifier.replace(/\D/g, '')]);
  const user = profile ? await queryOne('SELECT * FROM users WHERE id = ?', [profile.id]) : null;
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
  await run('UPDATE users SET current_session_id = ? WHERE id = ?', [sessionId, user.id]);
  await run('INSERT INTO user_sessions (id, user_id, ip, user_agent, device_name) VALUES (?, ?, ?, ?, ?)', [sessionId, user.id, ip, ua, deviceName]);
  const token = makeToken(user.id, sessionId);
  try {
    await run("REPLACE INTO device_sessions (id, user_id, token, device_name, device_type, ip, last_seen, is_active) VALUES (?, ?, ?, ?, ?, ?, NOW(), 1)",
      [sessionId, user.id, token, deviceName, /iPhone|iPad|Android/i.test(ua) ? 'mobile' : 'desktop', ip]);
  } catch {}
  try { await run("INSERT INTO activity_log (user_id, username, action, ip) VALUES (?,?,?,?)", [user.id, profile.username, 'login', req.ip || '']); } catch {}
  return res.json({ access_token: token, user: { id: user.id, email: user.email } });
});

app.post('/auth/signout', authMiddleware, async (req, res) => {
  try {
    if (req._rawToken) {
      await run('INSERT IGNORE INTO token_blacklist (token_hash, user_id) VALUES (SHA2(?, 256), ?)', [req._rawToken, req.userId]);
      await run('UPDATE device_sessions SET is_active = 0 WHERE token = ?', [req._rawToken]);
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

app.get('/auth/session-info', authMiddleware, async (req, res) => {
  const session = req.sessionId
    ? await queryOne('SELECT * FROM user_sessions WHERE id = ?', [req.sessionId])
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
    await run('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.userId]);
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

// ===== Generic table CRUD =====
const ALLOWED_TABLES = new Set([
  'profiles', 'conversations', 'conversation_members', 'messages',
  'app_settings', 'feed_posts', 'admin_access', 'admin_users',
  'likes', 'bookmarks', 'follows', 'user_blocks', 'notifications',
  'post_comments', 'reports', 'message_reactions', 'message_read_receipts',
  'pinned_messages', 'admin_audit_log', 'invite_codes', 'banned_words',
  'hashtag_stats', 'conversation_settings', 'calls',
]);

function buildWhere(filters, tableAlias) {
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
        else { parts.push(`${c} = ?`); params.push(f.val); }
        break;
      default: break;
    }
  }
  return { sql: parts.length ? 'WHERE ' + parts.join(' AND ') : '', params };
}

app.post('/db/:table/select', (req, res, next) => {
  if (req.params.table === 'app_settings' || req.params.table === 'admin_users') return doSelect(req, res);
  return authMiddleware(req, res, () => doSelect(req, res));
});

async function doSelect(req, res) {
  const { table } = req.params;
  if (!ALLOWED_TABLES.has(table)) return res.status(400).json({ error: 'unknown table' });
  const { filters = [], order, limit, single } = req.body || {};

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
    const rows = await query(sql, w.params);
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
  const rows = await query(sql, w.params);
  let out = rows;
  if (table === 'profiles') out = rows.map(profileToClient);
  if (single) return res.json({ data: out[0] || null });
  return res.json({ data: out });
}

app.post('/db/:table/insert', authMiddleware, async (req, res) => {
  const { table } = req.params;
  if (!ALLOWED_TABLES.has(table)) return res.status(400).json({ error: 'unknown table' });
  const rows = Array.isArray(req.body.rows) ? req.body.rows : [req.body.row];
  const returnRep = req.body.return !== false;
  const inserted = [];

  try {
    await transaction(async (t) => {
      for (const r of rows) {
        if (!r.id && (table === 'conversations' || table === 'messages' || table === 'feed_posts' ||
            table === 'notifications' || table === 'post_comments' || table === 'reports')) {
          r.id = nanoid();
        }
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
        await t.run(sql, cols.map((c) => r[c]));
        if (returnRep) {
          let got = null;
          if (r.id) {
            got = await t.queryOne(`SELECT * FROM ${table} WHERE id = ?`, [r.id]);
          }
          inserted.push(table === 'profiles' ? profileToClient(got || r) : (got || r));
        }
      }
    });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  if (table === 'messages') {
    inserted.forEach((m) => {
      broadcast({ event: 'INSERT', table, new: m });
      if (m.conversation_id && m.sender_id) {
        (async () => {
          try {
            const members = await query('SELECT user_id FROM conversation_members WHERE conversation_id=?', [m.conversation_id]);
            const senderProfile = await queryOne('SELECT display_name, username FROM profiles WHERE id=?', [m.sender_id]);
            const senderName = senderProfile?.display_name || senderProfile?.username || 'Someone';
            for (const mem of members) {
              if (mem.user_id === m.sender_id) continue;
              const isOnline = userSockets.has(mem.user_id);
              if (!isOnline) {
                sendPushToUser(mem.user_id, { title: senderName, body: m.content?.slice(0, 80) || '📎 media', tag: `msg-${m.conversation_id}`, url: '/' });
              }
            }
          } catch (_) {}
        })();
      }
    });
  } else if (table === 'conversations' || table === 'conversation_members' || table === 'feed_posts') {
    inserted.forEach((m) => broadcast({ event: 'INSERT', table, new: m }));
  }
  return res.json({ data: returnRep ? inserted : null });
});

app.post('/db/:table/update', authMiddleware, async (req, res) => {
  const { table } = req.params;
  if (!ALLOWED_TABLES.has(table)) return res.status(400).json({ error: 'unknown table' });
  const { filters = [], values } = req.body || {};
  if (!values || !Object.keys(values).length) return res.status(400).json({ error: 'no values' });
  const w = buildWhere(filters);

  if (table === 'profiles' && (values.is_banned === 1 || values.is_banned === true)) {
    const founderUsername = await getMasterAdmin();
    const isReqFounder = req.profile?.username === founderUsername;
    if (!isReqFounder) {
      const targets = await query(`SELECT username, is_admin FROM profiles ${w.sql}`, w.params);
      for (const t of targets) {
        if (t.username === founderUsername) return res.status(403).json({ error: 'نمی‌توانید سازنده را مسدود کنید' });
        if (t.is_admin) return res.status(403).json({ error: 'نمی‌توانید مدیر دیگری را مسدود کنید' });
      }
    }
  }

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
    await run(sql, [...Object.values(v), ...w.params]);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  const rows = await query(`SELECT * FROM ${table} ${w.sql}`, w.params);
  const out = table === 'profiles' ? rows.map(profileToClient) : rows;
  out.forEach((r) => broadcast({ event: 'UPDATE', table, new: r }));
  return res.json({ data: out });
});

app.post('/db/:table/delete', authMiddleware, async (req, res) => {
  const { table } = req.params;
  if (!ALLOWED_TABLES.has(table)) return res.status(400).json({ error: 'unknown table' });
  const { filters = [] } = req.body || {};
  const w = buildWhere(filters);
  const rows = await query(`SELECT * FROM ${table} ${w.sql}`, w.params);
  await run(`DELETE FROM ${table} ${w.sql}`, w.params);
  rows.forEach((r) => broadcast({ event: 'DELETE', table, old: r }));
  return res.json({ data: rows });
});

app.post('/db/:table/upsert', authMiddleware, async (req, res) => {
  const { table } = req.params;
  if (!ALLOWED_TABLES.has(table)) return res.status(400).json({ error: 'unknown table' });
  const rows = Array.isArray(req.body.rows) ? req.body.rows : [req.body.row];
  const conflictKey = req.body.onConflict || 'id';
  const out = [];
  try {
    await transaction(async (t) => {
      for (const r of rows) {
        if (table === 'profiles' && r.settings && typeof r.settings === 'object') r.settings = JSON.stringify(r.settings);
        const cols = Object.keys(r);
        const updateCols = cols.filter(c => c !== conflictKey).map(c => `${c}=VALUES(${c})`).join(',');
        const sql = updateCols
          ? `INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(()=>'?').join(',')}) ON DUPLICATE KEY UPDATE ${updateCols}`
          : `INSERT IGNORE INTO ${table} (${cols.join(',')}) VALUES (${cols.map(()=>'?').join(',')})`;
        await t.run(sql, cols.map((c) => r[c]));
        const got = r[conflictKey] ? await t.queryOne(`SELECT * FROM ${table} WHERE ${conflictKey} = ?`, [r[conflictKey]]) : r;
        out.push(table === 'profiles' ? profileToClient(got || r) : (got || r));
      }
    });
  } catch (e) { return res.status(400).json({ error: e.message }); }
  out.forEach((r) => broadcast({ event: 'UPSERT', table, new: r }));
  return res.json({ data: out });
});

// ===== Storage (file upload) =====
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

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
        const isPng = mime.includes('png');
        let pipeline = sharp(req.file.buffer, { failOn: 'none' })
          .rotate()
          .resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true });
        if (isPng) {
          outBuf = await pipeline.png({ quality: 95, compressionLevel: 6 }).toBuffer();
          outExt = '.png';
        } else {
          outBuf = await pipeline.jpeg({ quality: 92, mozjpeg: true }).toBuffer();
          outExt = '.jpg';
        }
      }
    } catch (e) { console.error('image compress failed:', e.message); }
  }

  const filename = nanoid() + outExt;
  const filepath = path.join(dir, filename);
  fs.writeFileSync(filepath, outBuf);
  const publicUrl = `/uploads/${bucket}/${filename}`;
  return res.json({ path: filename, publicUrl });
});

// ===== Find or create a DM conversation =====
app.post('/conversations', authMiddleware, async (req, res) => {
  const { type, participant_id } = req.body || {};
  if (type !== 'direct' || !participant_id) return res.status(400).json({ error: 'type=direct and participant_id required' });
  const existing = await queryOne(`
    SELECT c.id FROM conversations c
    JOIN conversation_members m1 ON m1.conversation_id = c.id AND m1.user_id = ?
    JOIN conversation_members m2 ON m2.conversation_id = c.id AND m2.user_id = ?
    WHERE c.type = 'direct'
    LIMIT 1
  `, [req.userId, participant_id]);
  if (existing) return res.json({ id: existing.id });
  const convId = nanoid();
  await run("INSERT INTO conversations (id, type, created_by) VALUES (?, 'direct', ?)", [convId, req.userId]);
  await run("INSERT IGNORE INTO conversation_members (conversation_id, user_id, role) VALUES (?, ?, 'member')", [convId, req.userId]);
  await run("INSERT IGNORE INTO conversation_members (conversation_id, user_id, role) VALUES (?, ?, 'member')", [convId, participant_id]);
  broadcast({ event: 'INSERT', table: 'conversations', new: { id: convId, type: 'direct', created_by: req.userId } });
  return res.json({ id: convId });
});

// ===== Send message to a conversation =====
app.post('/conversations/:id/messages', authMiddleware, async (req, res) => {
  const { content, type: msgType = 'text', reply_to_id } = req.body || {};
  if (!content) return res.status(400).json({ error: 'content required' });
  const conv = await queryOne('SELECT id FROM conversations WHERE id = ?', [req.params.id]);
  if (!conv) return res.status(404).json({ error: 'conversation not found' });
  const isMember = await queryOne('SELECT 1 AS found FROM conversation_members WHERE conversation_id = ? AND user_id = ?', [req.params.id, req.userId]);
  if (!isMember) return res.status(403).json({ error: 'not a member' });
  const msgId = nanoid();
  await run('INSERT INTO messages (id, conversation_id, sender_id, content, type, reply_to_id) VALUES (?, ?, ?, ?, ?, ?)',
    [msgId, req.params.id, req.userId, content, msgType, reply_to_id || null]);
  await run("UPDATE conversations SET last_message_at = NOW(), last_message_preview = ? WHERE id = ?", [content.slice(0, 100), req.params.id]);
  const msg = await queryOne(`SELECT m.*, p.id AS _s_id, p.username AS _s_username, p.display_name AS _s_display_name, p.avatar_url AS _s_avatar_url FROM messages m JOIN profiles p ON p.id = m.sender_id WHERE m.id = ?`, [msgId]);
  if (msg) broadcast({ event: 'INSERT', table: 'messages', new: msg });
  return res.json({ ok: true, id: msgId });
});

// ===== Get messages for a conversation =====
app.get('/conversations/:id/messages', authMiddleware, async (req, res) => {
  const conv = await queryOne('SELECT id FROM conversations WHERE id = ?', [req.params.id]);
  if (!conv) return res.status(404).json({ error: 'conversation not found' });
  const isMember = await queryOne('SELECT 1 AS found FROM conversation_members WHERE conversation_id = ? AND user_id = ?', [req.params.id, req.userId]);
  if (!isMember && !req.profile.is_admin) return res.status(403).json({ error: 'not a member' });

  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const before = req.query.before || null;
  const params = [req.params.id];
  let cursorClause = '';
  if (before) { cursorClause = 'AND m.created_at < ?'; params.push(before); }

  const rows = await query(`
    SELECT m.*,
      p.id AS _s_id, p.username AS _s_username, p.display_name AS _s_display_name,
      p.avatar_url AS _s_avatar_url, p.is_admin AS _s_is_admin
    FROM messages m
    LEFT JOIN profiles p ON p.id = m.sender_id
    WHERE m.conversation_id = ?
      AND m.deleted_at IS NULL
      AND (m.expires_at IS NULL OR m.expires_at > UNIX_TIMESTAMP())
      ${cursorClause}
    ORDER BY m.created_at DESC
    LIMIT ${limit}
  `, params);

  const out = rows.map(r => {
    const { _s_id, _s_username, _s_display_name, _s_avatar_url, _s_is_admin, ...msg } = r;
    return { ...msg, sender: _s_id ? { id: _s_id, username: _s_username, display_name: _s_display_name, avatar_url: _s_avatar_url || null, is_admin: _s_is_admin } : null };
  });
  return res.json({ data: out });
});

// ===== Conversation Member Management =====
app.get('/conversations/:id/members', authMiddleware, async (req, res) => {
  const conv = await queryOne('SELECT * FROM conversations WHERE id = ?', [req.params.id]);
  if (!conv) return res.status(404).json({ error: 'not found' });
  const myRole = await queryOne('SELECT role FROM conversation_members WHERE conversation_id = ? AND user_id = ?', [req.params.id, req.userId]);
  const isMgr = myRole?.role === 'owner' || myRole?.role === 'admin' || conv.created_by === req.userId || req.profile.is_admin;
  if (conv.type === 'channel' && !isMgr) {
    const countRow = await queryOne('SELECT COUNT(*) as n FROM conversation_members WHERE conversation_id = ?', [req.params.id]);
    const count = countRow?.n || 0;
    return res.json({ data: null, members: null, member_count: count, restricted: true });
  }
  const members = await query(`
    SELECT p.*, cm.role, cm.joined_at, cm.admin_permissions, cm.title
    FROM conversation_members cm
    JOIN profiles p ON p.id = cm.user_id
    WHERE cm.conversation_id = ?
    ORDER BY CASE cm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, cm.joined_at ASC
  `, [req.params.id]);
  const count = members.length;
  return res.json({ data: members.map((m) => ({ ...profileToClient(m), role: m.role, joined_at: m.joined_at, admin_permissions: tryParse(m.admin_permissions, []), title: m.title })), member_count: count, count });
});

app.post('/conversations/:id/username', authMiddleware, async (req, res) => {
  const { username } = req.body || {};
  if (!username) return res.status(400).json({ error: 'username required' });
  const clean = username.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
  if (clean.length < 3) return res.status(400).json({ error: 'username too short (min 3 chars)' });
  const conv = await queryOne('SELECT * FROM conversations WHERE id = ?', [req.params.id]);
  if (!conv) return res.status(404).json({ error: 'not found' });
  const myRole = await queryOne('SELECT role FROM conversation_members WHERE conversation_id = ? AND user_id = ?', [req.params.id, req.userId]);
  const isMgr = myRole?.role === 'owner' || conv.created_by === req.userId || req.profile.is_admin;
  if (!isMgr) return res.status(403).json({ error: 'owner only' });
  const existing = await queryOne('SELECT id FROM conversations WHERE username = ? AND id != ?', [clean, req.params.id]);
  if (existing) return res.status(409).json({ error: 'username already taken' });
  const existingUser = await queryOne('SELECT id FROM profiles WHERE username = ?', [clean]);
  if (existingUser) return res.status(409).json({ error: 'این نام کاربری توسط یک کاربر استفاده شده است' });
  await run('UPDATE conversations SET username = ? WHERE id = ?', [clean, req.params.id]);
  return res.json({ ok: true, username: clean });
});

app.get('/conversations/by-username/:username', authMiddleware, async (req, res) => {
  const clean = req.params.username.replace(/^@/, '').toLowerCase();
  const conv = await queryOne('SELECT * FROM conversations WHERE username = ?', [clean]);
  if (!conv) return res.status(404).json({ error: 'not found' });
  const isMember = await queryOne('SELECT 1 AS found FROM conversation_members WHERE conversation_id = ? AND user_id = ?', [conv.id, req.userId]);
  const countRow = await queryOne('SELECT COUNT(*) as n FROM conversation_members WHERE conversation_id = ?', [conv.id]);
  const memberCount = countRow?.n || 0;
  return res.json({ data: { ...conv, member_count: memberCount, is_member: !!isMember } });
});

app.post('/conversations/:id/promote', authMiddleware, async (req, res) => {
  const { user_id, permissions = [], title = '' } = req.body || {};
  if (!user_id) return res.status(400).json({ error: 'user_id required' });
  const conv = await queryOne('SELECT * FROM conversations WHERE id = ?', [req.params.id]);
  if (!conv) return res.status(404).json({ error: 'not found' });
  const myRole = await queryOne('SELECT role FROM conversation_members WHERE conversation_id = ? AND user_id = ?', [req.params.id, req.userId]);
  const canPromote = myRole?.role === 'owner' || conv.created_by === req.userId || req.profile.is_admin;
  if (!canPromote) return res.status(403).json({ error: 'owner only' });
  await run('UPDATE conversation_members SET role = ?, admin_permissions = ?, title = ? WHERE conversation_id = ? AND user_id = ?',
    ['admin', JSON.stringify(permissions), title, req.params.id, user_id]);
  return res.json({ ok: true });
});

app.post('/conversations/:id/demote', authMiddleware, async (req, res) => {
  const { user_id } = req.body || {};
  if (!user_id) return res.status(400).json({ error: 'user_id required' });
  const conv = await queryOne('SELECT * FROM conversations WHERE id = ?', [req.params.id]);
  if (!conv) return res.status(404).json({ error: 'not found' });
  if ((conv.creator_id && conv.creator_id === user_id) || conv.created_by === user_id) {
    return res.status(403).json({ error: 'نقش سازنده قابل تغییر نیست' });
  }
  const myRole = await queryOne('SELECT role FROM conversation_members WHERE conversation_id = ? AND user_id = ?', [req.params.id, req.userId]);
  const canDemote = myRole?.role === 'owner' || conv.created_by === req.userId || req.profile.is_admin;
  if (!canDemote) return res.status(403).json({ error: 'owner only' });
  const targetRole = await queryOne('SELECT role FROM conversation_members WHERE conversation_id = ? AND user_id = ?', [req.params.id, user_id]);
  if (targetRole?.role === 'owner') return res.status(400).json({ error: 'cannot demote owner' });
  await run("UPDATE conversation_members SET role = ?, admin_permissions = ?, title = ? WHERE conversation_id = ? AND user_id = ?",
    ['member', '[]', '', req.params.id, user_id]);
  return res.json({ ok: true });
});

app.post('/conversations/:id/members', authMiddleware, async (req, res) => {
  const { user_id, role = 'member' } = req.body || {};
  if (!user_id) return res.status(400).json({ error: 'user_id required' });
  const conv = await queryOne('SELECT * FROM conversations WHERE id = ?', [req.params.id]);
  if (!conv) return res.status(404).json({ error: 'conversation not found' });
  const membership = await queryOne('SELECT role FROM conversation_members WHERE conversation_id = ? AND user_id = ?', [req.params.id, req.userId]);
  const isConvAdmin = membership?.role === 'admin' || conv.created_by === req.userId || req.profile.is_admin;
  if (!isConvAdmin) return res.status(403).json({ error: 'not authorized' });
  await run('INSERT IGNORE INTO conversation_members (conversation_id, user_id, role) VALUES (?, ?, ?)', [req.params.id, user_id, role]);
  broadcast({ event: 'UPDATE', table: 'conversation_members', new: { conversation_id: req.params.id, user_id } });
  return res.json({ ok: true });
});

app.delete('/conversations/:id/members/:userId', authMiddleware, async (req, res) => {
  const conv = await queryOne('SELECT * FROM conversations WHERE id = ?', [req.params.id]);
  if (!conv) return res.status(404).json({ error: 'conversation not found' });
  if ((conv.creator_id && conv.creator_id === req.params.userId) || conv.created_by === req.params.userId) {
    return res.status(403).json({ error: 'سازنده گروه را نمی‌توان حذف کرد' });
  }
  const membership = await queryOne('SELECT role FROM conversation_members WHERE conversation_id = ? AND user_id = ?', [req.params.id, req.userId]);
  const isConvAdmin = membership?.role === 'admin' || conv.created_by === req.userId || req.profile.is_admin;
  if (!isConvAdmin && req.params.userId !== req.userId) return res.status(403).json({ error: 'not authorized' });
  await run('DELETE FROM conversation_members WHERE conversation_id = ? AND user_id = ?', [req.params.id, req.params.userId]);
  broadcast({ event: 'DELETE', table: 'conversation_members', old: { conversation_id: req.params.id, user_id: req.params.userId } });
  return res.json({ ok: true });
});

// ===== Admin: online/offline users =====
app.get('/admin/online-users', authMiddleware, adminOnly, async (req, res) => {
  try {
    const users = await query(`
      SELECT id, username, display_name, avatar_url, online_status, last_seen, is_admin
      FROM profiles WHERE is_approved=1 AND is_active=1
      ORDER BY (online_status='online') DESC, last_seen DESC
      LIMIT 300
    `);
    res.json({ data: users });
  } catch { res.json({ data: [] }); }
});

// ===== Admin real-time stats =====
app.get('/admin/stats', authMiddleware, adminOnly, async (req, res) => {
  const [r1,r2,r3,r4,r5,r6,r7,r8,r9,r10] = await Promise.all([
    queryOne('SELECT COUNT(*) AS n FROM profiles'),
    queryOne("SELECT COUNT(*) AS n FROM profiles WHERE is_approved = 1 AND is_banned = 0"),
    queryOne("SELECT COUNT(*) AS n FROM profiles WHERE is_approved = 0"),
    queryOne("SELECT COUNT(*) AS n FROM profiles WHERE is_banned = 1"),
    queryOne("SELECT COUNT(*) AS n FROM messages WHERE is_deleted = 0"),
    queryOne("SELECT COUNT(*) AS n FROM feed_posts WHERE is_deleted = 0"),
    queryOne("SELECT COUNT(*) AS n FROM conversations"),
    queryOne("SELECT COUNT(*) AS n FROM reports WHERE status = 'pending'"),
    queryOne("SELECT COUNT(*) AS n FROM profiles WHERE online_status = 'online'"),
    queryOne("SELECT COUNT(*) AS n FROM profiles WHERE is_admin = 1"),
  ]);
  const totalFiles = (() => {
    try {
      const mediaDir = path.join(__dirname, 'uploads', 'media');
      if (fs.existsSync(mediaDir)) return fs.readdirSync(mediaDir).length;
    } catch (_) {}
    return 0;
  })();
  return res.json({
    totalUsers: r1?.n||0, activeUsers: r2?.n||0, pendingUsers: r3?.n||0, bannedUsers: r4?.n||0,
    totalMessages: r5?.n||0, totalPosts: r6?.n||0, totalConvs: r7?.n||0, totalReports: r8?.n||0,
    onlineUsers: r9?.n||0, totalAdmins: r10?.n||0, totalFiles,
  });
});

app.get('/admin/access/:username', async (req, res) => {
  const row = await queryOne('SELECT * FROM admin_access WHERE username = ? AND is_active = 1', [req.params.username]);
  return res.json({ allowed: !!row });
});

app.post('/admin/users/create', authMiddleware, adminOnly, async (req, res) => {
  const masterAdmin = await getMasterAdmin();
  const isOwner = req.profile.username === masterAdmin;
  if (!isOwner) {
    const myPerms = await queryOne('SELECT * FROM sub_admin_permissions WHERE admin_id=?', [req.profile.id]);
    if (!myPerms?.can_approve_users) return res.status(403).json({ error: 'دسترسی لازم است' });
  }
  const rawUsername = (req.body.username || '').toString().toLowerCase().trim().replace(/[^a-z0-9_]/g, '');
  const { password, display_name, phone } = req.body || {};
  const username = rawUsername;
  if (!username || !password) return res.status(400).json({ error: 'نام کاربری و رمز الزامی است' });
  if (!/^[a-z0-9_]{3,32}$/.test(username)) return res.status(400).json({ error: 'نام کاربری فقط حروف کوچک، اعداد و _ مجاز است (۳ تا ۳۲ کاراکتر)' });
  if (password.length < 6) return res.status(400).json({ error: 'رمز باید حداقل ۶ کاراکتر باشد' });
  const exists = await queryOne('SELECT 1 FROM profiles WHERE LOWER(username)=?', [username]);
  if (exists) return res.status(409).json({ error: 'این نام کاربری قبلاً ثبت شده' });
  try {
    const id = nanoid();
    const hash = await bcrypt.hash(password, 10);
    const email = `${username}@kingwolf.internal`;
    await transaction(async (t) => {
      await t.run('INSERT INTO users (id, email, password_hash, raw_password) VALUES (?, ?, ?, ?)', [id, email, hash, password]);
      await t.run('INSERT INTO profiles (id, username, email, display_name, phone, avatar_url, is_approved, is_active, is_admin) VALUES (?, ?, ?, ?, ?, ?, 1, 1, 0)',
        [id, username, email, display_name || username, phone || null, '/icon-192.png']);
    });
    broadcast({ event: 'INSERT', table: 'profiles', new: { id, username, display_name: display_name || username, is_approved: 1 } });
    return res.json({ ok: true, id, username, password });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.post('/admin/grant', authMiddleware, adminOnly, async (req, res) => {
  const { username } = req.body || {};
  if (!username) return res.status(400).json({ error: 'username required' });
  await run('REPLACE INTO admin_access (username, granted_by, is_active) VALUES (?, ?, 1)', [username, req.profile.username]);
  await run('UPDATE profiles SET is_admin = 1 WHERE username = ?', [username]);
  return res.json({ ok: true });
});

app.post('/admin/revoke', authMiddleware, adminOnly, async (req, res) => {
  const { username } = req.body || {};
  if (!username) return res.status(400).json({ error: 'username required' });
  if (username === req.profile.username) return res.status(400).json({ error: 'cannot revoke yourself' });
  await run('UPDATE admin_access SET is_active = 0 WHERE username = ?', [username]);
  await run('UPDATE profiles SET is_admin = 0 WHERE username = ?', [username]);
  return res.json({ ok: true });
});

app.post('/admin/verify/:userId', authMiddleware, adminOnly, async (req, res) => {
  const user = await queryOne('SELECT * FROM profiles WHERE id = ?', [req.params.userId]);
  if (!user) return res.status(404).json({ error: 'user not found' });
  await run('UPDATE profiles SET is_verified = 1 WHERE id = ?', [req.params.userId]);
  broadcast({ event: 'UPDATE', table: 'profiles', new: { id: req.params.userId, is_verified: 1 } });
  return res.json({ ok: true });
});

app.post('/admin/unverify/:userId', authMiddleware, adminOnly, async (req, res) => {
  const user = await queryOne('SELECT * FROM profiles WHERE id = ?', [req.params.userId]);
  if (!user) return res.status(404).json({ error: 'user not found' });
  await run('UPDATE profiles SET is_verified = 0 WHERE id = ?', [req.params.userId]);
  broadcast({ event: 'UPDATE', table: 'profiles', new: { id: req.params.userId, is_verified: 0 } });
  return res.json({ ok: true });
});

app.get('/admin/list', authMiddleware, adminOnly, async (req, res) => {
  const rows = await query(`
    SELECT a.username, a.granted_by, a.granted_at, a.is_active, p.display_name
    FROM admin_access a LEFT JOIN profiles p ON p.username = a.username
    ORDER BY a.granted_at DESC
  `);
  return res.json({ data: rows });
});

app.post('/admin/create-admin', authMiddleware, adminOnly, async (req, res) => {
  const rl = adminRlCheck(req);
  if (!rl.allowed) return res.status(429).json({ error: `Too many attempts. Retry in ${rl.retryAfter}s`, retryAfter: rl.retryAfter });
  const { username, password } = req.body || {};
  if (!username || !password || password.length < 6) return res.status(400).json({ error: 'username and password (min 6 chars) required' });
  const existing = await queryOne('SELECT 1 FROM profiles WHERE username = ?', [username]);
  if (existing) {
    await run('UPDATE profiles SET is_admin = 1 WHERE username = ?', [username]);
    await run('REPLACE INTO admin_access (username, granted_by, is_active) VALUES (?, ?, 1)', [username, req.profile.username]);
    return res.json({ ok: true, message: 'admin access granted to existing user' });
  }
  const id = nanoid();
  const hash = await bcrypt.hash(password, 10);
  await transaction(async (t) => {
    await t.run('INSERT INTO users (id, email, password_hash, raw_password) VALUES (?, ?, ?, ?)', [id, `${username}@kingwolf.internal`, hash, password]);
    await t.run('INSERT INTO profiles (id, username, display_name, is_approved, is_admin) VALUES (?, ?, ?, 1, 1)', [id, username, username]);
    await t.run('REPLACE INTO admin_access (username, granted_by, is_active) VALUES (?, ?, 1)', [username, req.profile.username]);
  });
  return res.json({ ok: true, message: 'new admin user created' });
});

// ── Broadcast helper ──────────────────────────────────────────────────────────
const clients = new Set();
const userSockets = new Map();
function broadcast(payload) {
  const str = JSON.stringify(payload);
  for (const ws of clients) {
    if (ws.readyState === 1 && (ws.subscriptions.has(payload.table) || ws.subscriptions.size === 0)) {
      try { ws.send(str); } catch {}
    }
  }
}

// ── Admin: users list ─────────────────────────────────────────────────────────
app.get('/admin/users', authMiddleware, adminOnly, async (req, res) => {
  try {
    const users = await query(`
      SELECT p.*, u.email AS user_email, u.raw_password
      FROM profiles p
      LEFT JOIN users u ON u.id = p.id
      ORDER BY p.created_at DESC
      LIMIT 500
    `);
    res.json({ data: users.map(u => ({ ...profileToClient(u), raw_password: undefined })) });
  } catch (e) { res.json({ data: [] }); }
});

app.patch('/admin/users/:userId', authMiddleware, adminOnly, async (req, res) => {
  const allowed = ['display_name','bio','is_approved','is_banned','is_admin','ban_reason','is_verified','is_premium','phone'];
  const values = {};
  for (const k of allowed) { if (req.body[k] !== undefined) values[k] = req.body[k]; }
  if (!Object.keys(values).length) return res.status(400).json({ error: 'no values' });
  const founderUsername = await getMasterAdmin();
  if (values.is_banned) {
    const target = await queryOne('SELECT username FROM profiles WHERE id=?', [req.params.userId]);
    if (target?.username === founderUsername) return res.status(403).json({ error: 'cannot ban founder' });
  }
  const setCols = Object.keys(values).map(k => `${k}=?`).join(',');
  await run(`UPDATE profiles SET ${setCols} WHERE id=?`, [...Object.values(values), req.params.userId]);
  const updated = await queryOne('SELECT * FROM profiles WHERE id=?', [req.params.userId]);
  broadcast({ event: 'UPDATE', table: 'profiles', new: profileToClient(updated) });
  return res.json({ ok: true, data: profileToClient(updated) });
});

app.delete('/admin/users/:userId', authMiddleware, adminOnly, async (req, res) => {
  const founderUsername = await getMasterAdmin();
  const target = await queryOne('SELECT username FROM profiles WHERE id=?', [req.params.userId]);
  if (target?.username === founderUsername) return res.status(403).json({ error: 'cannot delete founder' });
  await run('DELETE FROM users WHERE id=?', [req.params.userId]);
  await run('DELETE FROM profiles WHERE id=?', [req.params.userId]);
  broadcast({ event: 'DELETE', table: 'profiles', old: { id: req.params.userId } });
  return res.json({ ok: true });
});

// ── Admin: settings ───────────────────────────────────────────────────────────
app.get('/admin/settings', authMiddleware, adminOnly, async (req, res) => {
  const rows = await query('SELECT * FROM app_settings');
  const settings = {};
  for (const r of rows) settings[r.key] = r.value;
  return res.json(settings);
});

app.post('/admin/settings', authMiddleware, adminOnly, async (req, res) => {
  const { key, value } = req.body || {};
  if (!key) return res.status(400).json({ error: 'key required' });
  await run('REPLACE INTO app_settings (key, value) VALUES (?, ?)', [key, String(value)]);
  if (key === 'master_admin') await refreshMasterAdmin();
  return res.json({ ok: true });
});

// ── Admin: broadcast announcement ─────────────────────────────────────────────
app.post('/admin/announcement', authMiddleware, adminOnly, async (req, res) => {
  const masterAdmin = await getMasterAdmin();
  const myPerms = await queryOne('SELECT * FROM sub_admin_permissions WHERE admin_id=?', [req.profile.id]);
  if (req.profile.username !== masterAdmin && !myPerms?.can_send_announcements) {
    return res.status(403).json({ error: 'دسترسی ندارید' });
  }
  const { message, type = 'announcement' } = req.body || {};
  if (!message) return res.status(400).json({ error: 'message required' });
  const users = await query('SELECT id FROM profiles WHERE is_active=1 AND is_approved=1');
  const notifId = nanoid();
  for (const u of users) {
    try {
      await run('INSERT INTO notifications (id, user_id, type, actor_id, message) VALUES (?,?,?,?,?)',
        [nanoid(), u.id, type, req.profile.id, message]);
    } catch (_) {}
  }
  broadcast({ event: 'announcement', table: 'notifications', new: { message, type, actor_id: req.profile.id } });
  return res.json({ ok: true, sent: users.length });
});

// ── Admin: audit log ──────────────────────────────────────────────────────────
app.get('/admin/audit-log', authMiddleware, adminOnly, async (req, res) => {
  try {
    const rows = await query(`
      SELECT al.*, p.display_name AS admin_display_name
      FROM admin_audit_log al
      LEFT JOIN profiles p ON p.id = al.admin_id
      ORDER BY al.created_at DESC LIMIT 200
    `);
    res.json({ data: rows });
  } catch { res.json({ data: [] }); }
});

app.get('/admin/activity', authMiddleware, adminOnly, async (req, res) => {
  try {
    const rows = await query('SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 200');
    res.json({ data: rows });
  } catch { res.json({ data: [] }); }
});

// ── Admin: backup/restore ─────────────────────────────────────────────────────
app.get('/admin/backup', authMiddleware, adminOnly, async (req, res) => {
  const masterAdmin = await getMasterAdmin();
  if (req.profile.username !== masterAdmin) return res.status(403).json({ error: 'فقط سازنده' });
  try {
    const tables = ['profiles','conversations','conversation_members','messages','feed_posts','app_settings','follows','likes','bookmarks'];
    const backup = {};
    for (const t of tables) {
      try { backup[t] = await query(`SELECT * FROM ${t} LIMIT 5000`); } catch { backup[t] = []; }
    }
    res.json({ ok: true, timestamp: new Date().toISOString(), data: backup });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Admin: system metrics ─────────────────────────────────────────────────────
app.get('/admin/metrics', authMiddleware, adminOnly, async (req, res) => {
  const mem = process.memoryUsage();
  const cpu = os.loadavg();
  const uptime = process.uptime();
  const rows = await query('SELECT COUNT(*) AS n FROM messages WHERE created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)').catch(() => [{ n: 0 }]);
  res.json({
    memory: { heapUsed: mem.heapUsed, heapTotal: mem.heapTotal, rss: mem.rss },
    cpu: { load1: cpu[0], load5: cpu[1], load15: cpu[2] },
    uptime,
    messagesLastHour: rows[0]?.n || 0,
    nodeVersion: process.version,
    platform: os.platform(),
  });
});

// ── Admin: bot settings ───────────────────────────────────────────────────────
app.get('/admin/bot-settings', authMiddleware, adminOnly, async (req, res) => {
  const row = await queryOne("SELECT value FROM app_settings WHERE key='bot_settings'");
  res.json(row ? tryParse(row.value, {}) : {});
});

app.post('/admin/bot-settings', authMiddleware, adminOnly, async (req, res) => {
  await run("REPLACE INTO app_settings (key, value) VALUES ('bot_settings', ?)", [JSON.stringify(req.body)]);
  res.json({ ok: true });
});

// ── Message edit ──────────────────────────────────────────────────────────────
app.patch('/messages/:id', authMiddleware, async (req, res) => {
  const { content } = req.body || {};
  if (!content) return res.status(400).json({ error: 'content required' });
  const msg = await queryOne('SELECT * FROM messages WHERE id=?', [req.params.id]);
  if (!msg) return res.status(404).json({ error: 'not found' });
  if (msg.sender_id !== req.userId && !req.profile.is_admin) return res.status(403).json({ error: 'forbidden' });
  await run('UPDATE messages SET content=?, is_edited=1, edited_at=NOW() WHERE id=?', [content, req.params.id]);
  broadcast({ event: 'UPDATE', table: 'messages', new: { id: req.params.id, content, is_edited: 1 } });
  return res.json({ ok: true });
});

// ── Message reactions ─────────────────────────────────────────────────────────
app.post('/messages/:id/react', authMiddleware, async (req, res) => {
  const { emoji } = req.body || {};
  if (!emoji) return res.status(400).json({ error: 'emoji required' });
  const existing = await queryOne('SELECT * FROM message_reactions WHERE message_id=? AND user_id=? AND emoji=?', [req.params.id, req.userId, emoji]);
  if (existing) {
    await run('DELETE FROM message_reactions WHERE message_id=? AND user_id=? AND emoji=?', [req.params.id, req.userId, emoji]);
    broadcast({ event: 'UPDATE', table: 'message_reactions', new: { message_id: req.params.id, user_id: req.userId, emoji, removed: true } });
    return res.json({ reacted: false });
  }
  await run('INSERT IGNORE INTO message_reactions (message_id, user_id, emoji) VALUES (?,?,?)', [req.params.id, req.userId, emoji]);
  broadcast({ event: 'INSERT', table: 'message_reactions', new: { message_id: req.params.id, user_id: req.userId, emoji } });
  return res.json({ reacted: true });
});

app.get('/messages/:id/reactions', authMiddleware, async (req, res) => {
  const rows = await query(`
    SELECT mr.emoji, mr.user_id, p.display_name, p.username
    FROM message_reactions mr JOIN profiles p ON p.id=mr.user_id
    WHERE mr.message_id=?
  `, [req.params.id]);
  return res.json({ data: rows });
});

// ── Message forward ───────────────────────────────────────────────────────────
app.post('/messages/:id/forward', authMiddleware, async (req, res) => {
  const { target_conversation_id } = req.body || {};
  if (!target_conversation_id) return res.status(400).json({ error: 'target_conversation_id required' });
  const orig = await queryOne('SELECT * FROM messages WHERE id=?', [req.params.id]);
  if (!orig) return res.status(404).json({ error: 'not found' });
  const isMember = await queryOne('SELECT 1 AS f FROM conversation_members WHERE conversation_id=? AND user_id=?', [target_conversation_id, req.userId]);
  if (!isMember) return res.status(403).json({ error: 'not a member' });
  const newId = nanoid();
  await run('INSERT INTO messages (id, conversation_id, sender_id, content, type, forwarded_from_id) VALUES (?,?,?,?,?,?)',
    [newId, target_conversation_id, req.userId, orig.content, orig.type, orig.id]);
  await run('UPDATE conversations SET last_message_at=NOW(), last_message_preview=? WHERE id=?', [orig.content?.slice(0,100)||'', target_conversation_id]);
  const msg = await queryOne('SELECT m.*, p.username AS _s_username, p.display_name AS _s_display_name FROM messages m JOIN profiles p ON p.id=m.sender_id WHERE m.id=?', [newId]);
  if (msg) broadcast({ event: 'INSERT', table: 'messages', new: msg });
  return res.json({ ok: true, id: newId });
});

// ── Location message ──────────────────────────────────────────────────────────
app.post('/conversations/:id/location', authMiddleware, async (req, res) => {
  const { lat, lng, label } = req.body || {};
  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng required' });
  const isMember = await queryOne('SELECT 1 AS f FROM conversation_members WHERE conversation_id=? AND user_id=?', [req.params.id, req.userId]);
  if (!isMember) return res.status(403).json({ error: 'not a member' });
  const msgId = nanoid();
  const content = JSON.stringify({ type: 'location', lat, lng, label: label || '' });
  await run("INSERT INTO messages (id, conversation_id, sender_id, content, type) VALUES (?,?,?,?,'location')", [msgId, req.params.id, req.userId, content]);
  await run('UPDATE conversations SET last_message_at=NOW(), last_message_preview=? WHERE id=?', ['📍 موقعیت مکانی', req.params.id]);
  broadcast({ event: 'INSERT', table: 'messages', new: { id: msgId, conversation_id: req.params.id, sender_id: req.userId, content, type: 'location' } });
  return res.json({ ok: true, id: msgId });
});

// ── Messages read receipts ────────────────────────────────────────────────────
app.post('/messages/read', authMiddleware, async (req, res) => {
  const { message_ids } = req.body || {};
  if (!Array.isArray(message_ids) || !message_ids.length) return res.status(400).json({ error: 'message_ids required' });
  for (const mid of message_ids) {
    try { await run('INSERT IGNORE INTO message_read_receipts (message_id, user_id) VALUES (?,?)', [mid, req.userId]); } catch {}
  }
  return res.json({ ok: true });
});

app.get('/conversations/:id/read-receipts', authMiddleware, async (req, res) => {
  const rows = await query(`
    SELECT r.message_id, r.user_id, r.read_at, p.display_name, p.username
    FROM message_read_receipts r JOIN profiles p ON p.id=r.user_id
    WHERE r.message_id IN (SELECT id FROM messages WHERE conversation_id=?)
  `, [req.params.id]);
  return res.json({ data: rows });
});

// ── Message file upload ───────────────────────────────────────────────────────
app.post('/conversations/:id/upload', authMiddleware, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no file' });
  const conv = await queryOne('SELECT id FROM conversations WHERE id=?', [req.params.id]);
  if (!conv) return res.status(404).json({ error: 'conversation not found' });
  const isMember = await queryOne('SELECT 1 AS f FROM conversation_members WHERE conversation_id=? AND user_id=?', [req.params.id, req.userId]);
  if (!isMember) return res.status(403).json({ error: 'not a member' });

  const profile = await queryOne('SELECT storage_quota_bytes, storage_used_bytes FROM profiles WHERE id=?', [req.userId]);
  const defaultQ = await getDefaultQuota();
  const quota = profile?.storage_quota_bytes || defaultQ;
  const used = profile?.storage_used_bytes || 0;
  if (used + req.file.size > quota) return res.status(413).json({ error: 'سهمیه ذخیره‌سازی پر شده است' });

  const mime = req.file.mimetype || '';
  const ext = path.extname(req.file.originalname || '') || '';
  const filename = `${nanoid()}${ext}`;
  const dir = path.join(UPLOADS_DIR, 'media');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), req.file.buffer);
  const fileUrl = `/uploads/media/${filename}`;

  const msgId = nanoid();
  await run('INSERT INTO messages (id, conversation_id, sender_id, content, type, file_url, file_name, file_size, file_type) VALUES (?,?,?,?,?,?,?,?,?)',
    [msgId, req.params.id, req.userId, req.file.originalname || filename, mime.startsWith('image/') ? 'image' : mime.startsWith('video/') ? 'video' : 'file',
     fileUrl, req.file.originalname || filename, req.file.size, mime]);
  await run('UPDATE conversations SET last_message_at=NOW(), last_message_preview=? WHERE id=?', ['📎 ' + (req.file.originalname || 'file'), req.params.id]);
  await run('UPDATE profiles SET storage_used_bytes = COALESCE(storage_used_bytes,0) + ? WHERE id=?', [req.file.size, req.userId]);

  const msg = await queryOne('SELECT * FROM messages WHERE id=?', [msgId]);
  if (msg) broadcast({ event: 'INSERT', table: 'messages', new: msg });
  return res.json({ ok: true, id: msgId, fileUrl });
});

// ── Admin: reports ────────────────────────────────────────────────────────────
app.get('/admin/reports', authMiddleware, adminOnly, async (req, res) => {
  const typeFilter = req.query.type;
  let whereClause = '';
  const params = [];
  if (typeFilter === 'chat') {
    whereClause = "WHERE r.target_type IN ('message','user','group','channel','conversation')";
  } else if (typeFilter === 'feed') {
    whereClause = "WHERE r.target_type IN ('post','feed_post','comment')";
  }
  const rows = await query(`
    SELECT r.*, p.username AS reporter_username, p.display_name AS reporter_display_name
    FROM reports r LEFT JOIN profiles p ON p.id = r.reporter_id
    ${whereClause}
    ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END, r.created_at DESC
    LIMIT 200
  `, params);
  return res.json({ data: rows });
});

app.post('/admin/reports/:id/resolve', authMiddleware, adminOnly, async (req, res) => {
  const { action, note } = req.body || {};
  await run("UPDATE reports SET status=?, reviewed_by=?, reviewed_at=NOW(), admin_note=? WHERE id=?",
    [action || 'resolved', req.profile.username, note || '', req.params.id]);
  await run('INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, details) VALUES (?,?,?,?,?)',
    [req.userId, 'resolve_report', 'report', req.params.id, action || '']);
  return res.json({ ok: true });
});

app.get('/admin/reports/:id/evidence', authMiddleware, adminOnly, async (req, res) => {
  const report = await queryOne('SELECT * FROM reports WHERE id = ?', [req.params.id]);
  if (!report) return res.status(404).json({ error: 'Not found' });
  let evidence = null;
  try {
    if (report.target_type === 'post') {
      evidence = await queryOne('SELECT fp.*, p.username, p.display_name, p.avatar_url FROM feed_posts fp LEFT JOIN profiles p ON fp.author_id = p.id WHERE fp.id = ?', [report.target_id]);
    } else if (report.target_type === 'message') {
      evidence = await queryOne('SELECT m.*, p.username, p.display_name FROM messages m LEFT JOIN profiles p ON m.sender_id = p.id WHERE m.id = ?', [report.target_id]);
    } else if (report.target_type === 'user') {
      evidence = await queryOne('SELECT id, username, display_name, avatar_url, bio FROM profiles WHERE id = ?', [report.target_id]);
    } else if (report.target_type === 'channel' || report.target_type === 'group') {
      evidence = await queryOne('SELECT id, name, description, avatar_url, type FROM conversations WHERE id = ?', [report.target_id]);
    }
  } catch {}
  res.json({ report, evidence });
});

app.get('/admin/reports/channels', authMiddleware, adminOnly, async (req, res) => {
  try {
    const rows = await query(`
      SELECT r.*, p.username AS reporter_username, p.display_name AS reporter_display_name
      FROM reports r LEFT JOIN profiles p ON p.id = r.reporter_id
      WHERE r.target_type IN ('channel','group')
      ORDER BY r.created_at DESC LIMIT 100
    `);
    res.json({ data: rows });
  } catch { res.json({ data: [] }); }
});

// ── Admin: sub-admin managers ─────────────────────────────────────────────────
app.get('/admin/managers', authMiddleware, adminOnly, async (req, res) => {
  try {
    const rows = await query(`
      SELECT sa.*, p.display_name, p.avatar_url, p.email,
        sp.can_view_users, sp.can_ban_users, sp.can_approve_users, sp.can_view_reports,
        sp.can_resolve_reports, sp.can_view_stats, sp.can_manage_content, sp.can_send_announcements,
        sp.can_view_emails, sp.can_view_phones, sp.can_manage_admins, sp.can_view_audit_log,
        sp.can_manage_settings, sp.can_manage_cms
      FROM sub_admins sa
      LEFT JOIN profiles p ON p.id = sa.user_id
      LEFT JOIN sub_admin_permissions sp ON sp.admin_id = sa.user_id
      ORDER BY sa.created_at DESC
    `);
    res.json({ data: rows });
  } catch (e) { res.json({ data: [] }); }
});

app.post('/admin/managers/promote', authMiddleware, adminOnly, async (req, res) => {
  const founderAccounts = await getFounderAccounts();
  const reqIsFounder = founderAccounts.includes(req.profile.username);
  if (!reqIsFounder) {
    const myPerms = await queryOne('SELECT * FROM sub_admin_permissions WHERE admin_id=?', [req.profile.id]);
    if (!myPerms?.can_manage_admins) return res.status(403).json({ error: 'فقط سازنده یا مدیر با دسترسی مدیران می‌تواند این کار را انجام دهد' });
  }
  const { username, userId, permissions = {} } = req.body;
  if (!username && !userId) return res.status(400).json({ error: 'username or userId required' });
  try {
    await transaction(async (t) => {
      let prof = username
        ? await t.queryOne('SELECT * FROM profiles WHERE username=?', [username])
        : await t.queryOne('SELECT * FROM profiles WHERE id=?', [userId]);
      if (!prof) throw new Error('user not found');
      if (founderAccounts.includes(prof.username)) return;
      await t.run('REPLACE INTO sub_admins (user_id, username, granted_by, permissions) VALUES (?,?,?,?)',
        [prof.id, prof.username, req.profile.username, JSON.stringify(permissions)]);
      await t.run('UPDATE profiles SET is_admin=1 WHERE id=?', [prof.id]);
      await t.run('REPLACE INTO admin_access (username, granted_by, is_active) VALUES (?,?,1)', [prof.username, req.profile.username]);
    });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/admin/managers/demote', authMiddleware, adminOnly, async (req, res) => {
  const founderAccounts = await getFounderAccounts();
  const reqIsFounder = founderAccounts.includes(req.profile.username);
  if (!reqIsFounder) {
    const myPerms = await queryOne('SELECT * FROM sub_admin_permissions WHERE admin_id=?', [req.profile.id]);
    if (!myPerms?.can_manage_admins) return res.status(403).json({ error: 'فقط سازنده یا مدیر با دسترسی مدیران می‌تواند این کار را انجام دهد' });
  }
  const { username, userId } = req.body;
  try {
    await transaction(async (t) => {
      if (username) {
        if (founderAccounts.includes(username)) return;
        await t.run('DELETE FROM sub_admins WHERE username=?', [username]);
        await t.run('DELETE FROM sub_admin_permissions WHERE admin_id IN (SELECT id FROM profiles WHERE username=?)', [username]);
        await t.run('UPDATE profiles SET is_admin=0 WHERE username=? AND username NOT IN (SELECT username FROM admin_access WHERE is_active=1)', [username]);
        await t.run('UPDATE admin_access SET is_active=0 WHERE username=?', [username]);
      } else if (userId) {
        const prof = await t.queryOne('SELECT username FROM profiles WHERE id=?', [userId]);
        if (prof && founderAccounts.includes(prof.username)) return;
        await t.run('DELETE FROM sub_admins WHERE user_id=?', [userId]);
        await t.run('DELETE FROM sub_admin_permissions WHERE admin_id=?', [userId]);
        await t.run('UPDATE profiles SET is_admin=0 WHERE id=?', [userId]);
      }
    });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/admin/entity-users', authMiddleware, adminOnly, async (req, res) => {
  try {
    const users = await query(`
      SELECT p.*,
        (SELECT COUNT(*) FROM conversation_members cm JOIN conversations c ON c.id=cm.conversation_id WHERE cm.user_id=p.id AND c.type='direct') AS direct_count,
        (SELECT COUNT(*) FROM conversation_members cm JOIN conversations c ON c.id=cm.conversation_id WHERE cm.user_id=p.id AND c.type='group') AS group_count,
        (SELECT COUNT(*) FROM conversation_members cm JOIN conversations c ON c.id=cm.conversation_id WHERE cm.user_id=p.id AND c.type='channel') AS channel_count,
        (SELECT COUNT(*) FROM sub_admins WHERE user_id=p.id) AS is_sub_admin
      FROM profiles p ORDER BY p.created_at DESC
    `);
    res.json({ data: users });
  } catch (e) { res.json({ data: [] }); }
});

app.post('/admin/nuclear-wipe', authMiddleware, adminOnly, async (req, res) => {
  const masterAdmin = await getMasterAdmin();
  if (req.profile.username !== masterAdmin) return res.status(403).json({ error: 'فقط مدیر اصلی می‌تواند این کار را انجام دهد' });
  const { password, confirm } = req.body;
  if (confirm !== 'WIPE_ALL_DATA') return res.status(400).json({ error: 'کد تأیید اشتباه است' });
  const adminUser = await queryOne('SELECT password_hash FROM users WHERE id=?', [req.userId]);
  if (!adminUser) return res.status(400).json({ error: 'کاربر یافت نشد' });
  const valid = await bcrypt.compare(password, adminUser.password_hash);
  if (!valid) return res.status(401).json({ error: 'رمز عبور اشتباه است' });
  try {
    await run('DELETE FROM messages WHERE 1=1');
    await run('DELETE FROM conversation_members WHERE user_id NOT IN (SELECT id FROM profiles WHERE is_admin=1)');
    await run('DELETE FROM conversations WHERE created_by NOT IN (SELECT id FROM profiles WHERE is_admin=1) OR created_by IS NULL');
    await run('DELETE FROM feed_posts WHERE author_id NOT IN (SELECT id FROM profiles WHERE is_admin=1)');
    await run('DELETE FROM profiles WHERE is_admin=0');
    await run('DELETE FROM users WHERE id NOT IN (SELECT id FROM profiles)');
    await run('DELETE FROM activity_log WHERE 1=1');
    res.json({ ok: true, msg: 'تمام داده‌های غیر ادمین پاک شدند' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/admin/conversations', authMiddleware, adminOnly, async (req, res) => {
  const type = req.query.type || 'group';
  try {
    const convs = await query(`
      SELECT c.*,
        (SELECT COUNT(*) FROM conversation_members WHERE conversation_id=c.id) AS member_count,
        (SELECT COUNT(*) FROM messages WHERE conversation_id=c.id AND is_deleted=0) AS message_count,
        p.username AS creator_username, p.display_name AS creator_display
      FROM conversations c
      LEFT JOIN profiles p ON p.id = c.created_by
      WHERE c.type=?
      ORDER BY c.last_message_at IS NULL ASC, c.last_message_at DESC
      LIMIT 100
    `, [type]);
    res.json({ data: convs });
  } catch (e) { res.json({ data: [] }); }
});

app.get('/admin/sessions/:userId', authMiddleware, adminOnly, async (req, res) => {
  const masterAdmin = await getMasterAdmin();
  if (req.profile.username !== masterAdmin) return res.status(403).json({ error: 'مدیر اصلی فقط' });
  const sessions = await query('SELECT id, device_name, device_type, ip, last_seen, created_at, is_active FROM device_sessions WHERE user_id = ? AND is_active = 1 ORDER BY last_seen DESC', [req.params.userId]);
  res.json({ data: sessions });
});

app.post('/admin/sessions/:sessionId/logout', authMiddleware, adminOnly, async (req, res) => {
  const masterAdmin = await getMasterAdmin();
  if (req.profile.username !== masterAdmin) return res.status(403).json({ error: 'مدیر اصلی فقط' });
  const session = await queryOne('SELECT * FROM device_sessions WHERE id = ?', [req.params.sessionId]);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  await run('INSERT IGNORE INTO token_blacklist (token_hash, user_id) VALUES (SHA2(?, 256), ?)', [session.token, session.user_id]);
  await run('UPDATE device_sessions SET is_active = 0 WHERE id = ?', [req.params.sessionId]);
  res.json({ ok: true });
});

app.post('/admin/posts/:postId/shadowban', authMiddleware, adminOnly, async (req, res) => {
  const post = await queryOne('SELECT author_id FROM feed_posts WHERE id = ?', [req.params.postId]);
  if (!post) return res.status(404).json({ error: 'Not found' });
  await run('UPDATE profiles SET is_shadowbanned = 1 WHERE id = ?', [post.author_id]);
  await run('UPDATE feed_posts SET is_shadowbanned = 1, shadowbanned_by = ? WHERE author_id = ?', [req.profile.username, post.author_id]);
  res.json({ ok: true });
});

app.post('/admin/posts/:postId/pin-global', authMiddleware, adminOnly, async (req, res) => {
  await run('UPDATE feed_posts SET is_pinned = 0');
  await run('UPDATE feed_posts SET is_pinned = 1 WHERE id = ?', [req.params.postId]);
  res.json({ ok: true });
});

app.get('/admin/login-attempts', authMiddleware, adminOnly, (req, res) => {
  const now = Date.now();
  const entries = [];
  for (const [key, rec] of loginAttempts.entries()) {
    const [ip, email] = key.split('|');
    const isLocked = rec.lockedUntil && now < rec.lockedUntil;
    entries.push({ ip, email, fails: rec.fails, locks: rec.locks, isLocked, lockedUntil: isLocked ? new Date(rec.lockedUntil).toISOString() : null, retryAfterSec: isLocked ? Math.ceil((rec.lockedUntil - now) / 1000) : 0, lastFailAt: rec.lastFailAt ? new Date(rec.lastFailAt).toISOString() : null });
  }
  entries.sort((a, b) => (b.locks - a.locks) || (b.fails - a.fails));
  return res.json({ data: entries });
});

app.post('/admin/login-attempts/clear', authMiddleware, adminOnly, (req, res) => {
  const { email } = req.body || {};
  if (!email) { loginAttempts.clear(); return res.json({ ok: true, cleared: 'all' }); }
  for (const key of loginAttempts.keys()) {
    if (key.endsWith(`|${email.toLowerCase()}`)) loginAttempts.delete(key);
  }
  return res.json({ ok: true, cleared: email });
});

// ── Unread counts ─────────────────────────────────────────────────────────────
app.get('/unread-counts', authMiddleware, async (req, res) => {
  const rows = await query(`
    SELECT m.conversation_id, COUNT(*) as count
    FROM messages m
    WHERE m.sender_id != ?
      AND m.is_deleted = 0
      AND m.deleted_at IS NULL
      AND (m.expires_at IS NULL OR m.expires_at > UNIX_TIMESTAMP())
      AND m.conversation_id IN (SELECT conversation_id FROM conversation_members WHERE user_id = ?)
      AND NOT EXISTS (SELECT 1 FROM message_read_receipts r WHERE r.message_id = m.id AND r.user_id = ?)
    GROUP BY m.conversation_id
  `, [req.userId, req.userId, req.userId]);
  const data = {};
  for (const r of rows) data[r.conversation_id] = r.count;
  return res.json({ data });
});

// ===== SOCIAL FEATURES =====
app.post('/social/like/:postId', authMiddleware, async (req, res) => {
  const { postId } = req.params;
  const userId = req.userId;
  const existing = await queryOne('SELECT 1 AS f FROM likes WHERE user_id=? AND post_id=?', [userId, postId]);
  if (existing) {
    await run('DELETE FROM likes WHERE user_id=? AND post_id=?', [userId, postId]);
    await run('UPDATE feed_posts SET likes_count = GREATEST(0, likes_count - 1) WHERE id=?', [postId]);
    return res.json({ liked: false });
  }
  await run('INSERT INTO likes (user_id, post_id) VALUES (?, ?)', [userId, postId]);
  await run('UPDATE feed_posts SET likes_count = likes_count + 1 WHERE id=?', [postId]);
  const post = await queryOne('SELECT author_id FROM feed_posts WHERE id=?', [postId]);
  if (post && post.author_id !== userId) {
    await run('INSERT INTO notifications (id, user_id, type, actor_id, target_id, target_type) VALUES (?,?,?,?,?,?)',
      [nanoid(), post.author_id, 'like', userId, postId, 'post']);
    const actor = await queryOne('SELECT display_name, username FROM profiles WHERE id=?', [userId]);
    sendPushToUser(post.author_id, { title: '❤️ ' + (actor?.display_name || actor?.username || 'Someone'), body: 'پست شما را لایک کرد', tag: 'like', url: '/' });
  }
  return res.json({ liked: true });
});

app.post('/social/bookmark/:postId', authMiddleware, async (req, res) => {
  const { postId } = req.params;
  const userId = req.userId;
  const existing = await queryOne('SELECT 1 AS f FROM bookmarks WHERE user_id=? AND post_id=?', [userId, postId]);
  if (existing) {
    await run('DELETE FROM bookmarks WHERE user_id=? AND post_id=?', [userId, postId]);
    return res.json({ bookmarked: false });
  }
  await run('INSERT INTO bookmarks (user_id, post_id) VALUES (?, ?)', [userId, postId]);
  return res.json({ bookmarked: true });
});

app.post('/social/follow/:userId', authMiddleware, async (req, res) => {
  const target = req.params.userId;
  const me = req.userId;
  if (target === me) return res.status(400).json({ error: 'cannot follow yourself' });
  const existing = await queryOne('SELECT 1 AS f FROM follows WHERE follower_id=? AND followed_id=?', [me, target]);
  if (existing) {
    await run('DELETE FROM follows WHERE follower_id=? AND followed_id=?', [me, target]);
    return res.json({ following: false });
  }
  await run('INSERT INTO follows (follower_id, followed_id) VALUES (?, ?)', [me, target]);
  await run('INSERT INTO notifications (id, user_id, type, actor_id, target_id, target_type) VALUES (?,?,?,?,?,?)',
    [nanoid(), target, 'follow', me, me, 'profile']);
  const followerP = await queryOne('SELECT display_name, username FROM profiles WHERE id=?', [me]);
  sendPushToUser(target, { title: '👤 ' + (followerP?.display_name || followerP?.username || 'Someone'), body: 'شما را دنبال کرد', tag: 'follow', url: '/' });
  return res.json({ following: true });
});

app.get('/follows/following', authMiddleware, async (req, res) => {
  const rows = await query(`SELECT p.id, p.username, p.display_name, p.avatar_url, p.bio FROM follows f JOIN profiles p ON p.id = f.followed_id WHERE f.follower_id = ? ORDER BY f.created_at DESC LIMIT 200`, [req.userId]);
  return res.json({ data: rows });
});

app.get('/follows/followers', authMiddleware, async (req, res) => {
  const rows = await query(`
    SELECT p.id, p.username, p.display_name, p.avatar_url, p.bio,
      CASE WHEN (SELECT 1 FROM follows WHERE follower_id=? AND followed_id=p.id) IS NOT NULL THEN 1 ELSE 0 END AS is_following_back
    FROM follows f JOIN profiles p ON p.id = f.follower_id
    WHERE f.followed_id = ? ORDER BY f.created_at DESC LIMIT 200
  `, [req.userId, req.userId]);
  return res.json({ data: rows });
});

app.post('/follows/unfollow', authMiddleware, async (req, res) => {
  const { target_id } = req.body || {};
  if (!target_id) return res.status(400).json({ error: 'target_id required' });
  await run('DELETE FROM follows WHERE follower_id=? AND followed_id=?', [req.userId, target_id]);
  return res.json({ ok: true });
});

app.post('/follows/follow', authMiddleware, async (req, res) => {
  const { target_id } = req.body || {};
  if (!target_id) return res.status(400).json({ error: 'target_id required' });
  if (target_id === req.userId) return res.status(400).json({ error: 'cannot follow yourself' });
  const existing = await queryOne('SELECT 1 AS f FROM follows WHERE follower_id=? AND followed_id=?', [req.userId, target_id]);
  if (!existing) {
    await run('INSERT INTO follows (follower_id, followed_id) VALUES (?, ?)', [req.userId, target_id]);
    try { await run('INSERT INTO notifications (id, user_id, type, actor_id, target_id, target_type) VALUES (?,?,?,?,?,?)', [nanoid(), target_id, 'follow', req.userId, req.userId, 'profile']); } catch (_) {}
  }
  return res.json({ ok: true });
});

app.post('/social/block/:userId', authMiddleware, async (req, res) => {
  const target = req.params.userId;
  const me = req.userId;
  const existing = await queryOne('SELECT 1 AS f FROM user_blocks WHERE blocker_id=? AND blocked_id=?', [me, target]);
  if (existing) {
    await run('DELETE FROM user_blocks WHERE blocker_id=? AND blocked_id=?', [me, target]);
    return res.json({ blocked: false });
  }
  await run('INSERT INTO user_blocks (blocker_id, blocked_id, reason) VALUES (?, ?, ?)', [me, target, req.body?.reason || '']);
  return res.json({ blocked: true });
});

app.post('/conversations/:id/leave', authMiddleware, async (req, res) => {
  const conv = await queryOne('SELECT * FROM conversations WHERE id = ?', [req.params.id]);
  if (!conv) return res.status(404).json({ error: 'not found' });
  const myRole = await queryOne('SELECT role FROM conversation_members WHERE conversation_id = ? AND user_id = ?', [req.params.id, req.userId]);
  if (!myRole) return res.status(403).json({ error: 'not a member' });
  if (myRole.role === 'owner') return res.status(403).json({ error: 'owner cannot leave — transfer ownership first' });
  await run('DELETE FROM conversation_members WHERE conversation_id = ? AND user_id = ?', [req.params.id, req.userId]);
  return res.json({ ok: true });
});

app.post('/reports', authMiddleware, async (req, res) => {
  const { target_type, target_id, reason, details } = req.body || {};
  if (!target_type || !target_id) return res.status(400).json({ error: 'target required' });
  const id = nanoid();
  await run('INSERT INTO reports (id, reporter_id, target_type, target_id, reason, details) VALUES (?, ?, ?, ?, ?, ?)',
    [id, req.userId, target_type, target_id, reason || '', details || '']);
  return res.json({ ok: true, id });
});

// ===== STORIES =====
app.get('/stories', authMiddleware, async (req, res) => {
  const rows = await query(`
    SELECT s.*, p.username, p.display_name, p.avatar_url
    FROM stories s JOIN profiles p ON p.id = s.author_id
    WHERE s.expires_at > NOW()
    ORDER BY s.created_at DESC LIMIT 200
  `);
  const grouped = {};
  for (const r of rows) {
    if (!grouped[r.author_id]) {
      grouped[r.author_id] = { author_id: r.author_id, username: r.username, display_name: r.display_name, avatar_url: r.avatar_url, stories: [] };
    }
    const viewed = await queryOne('SELECT 1 AS f FROM story_views WHERE story_id=? AND user_id=?', [r.id, req.userId]);
    grouped[r.author_id].stories.push({ ...r, viewed: !!viewed });
  }
  return res.json({ data: Object.values(grouped) });
});

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
  const expiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ');
  await run('INSERT INTO stories (id, author_id, media_url, media_type, caption, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
    [id, req.userId, mediaUrl, mediaType, caption, expiresAt]);
  broadcast({ event: 'INSERT', table: 'stories', new: { id, author_id: req.userId } });
  return res.json({ ok: true, id });
});

app.post('/stories/:id/view', authMiddleware, async (req, res) => {
  const story = await queryOne('SELECT * FROM stories WHERE id=?', [req.params.id]);
  if (!story) return res.status(404).json({ error: 'not found' });
  const already = await queryOne('SELECT 1 AS f FROM story_views WHERE story_id=? AND user_id=?', [req.params.id, req.userId]);
  if (!already) {
    await run('INSERT IGNORE INTO story_views (story_id, user_id) VALUES (?, ?)', [req.params.id, req.userId]);
    await run('UPDATE stories SET views_count = views_count + 1 WHERE id=?', [req.params.id]);
  }
  return res.json({ ok: true });
});

app.delete('/stories/:id', authMiddleware, async (req, res) => {
  const story = await queryOne('SELECT * FROM stories WHERE id=?', [req.params.id]);
  if (!story) return res.status(404).json({ error: 'not found' });
  if (story.author_id !== req.userId && !req.profile.is_admin) return res.status(403).json({ error: 'forbidden' });
  await run('DELETE FROM story_views WHERE story_id=?', [req.params.id]);
  await run('DELETE FROM stories WHERE id=?', [req.params.id]);
  return res.json({ ok: true });
});

app.get('/profiles/:id/follow-counts', authMiddleware, async (req, res) => {
  const [fc, fing, isF] = await Promise.all([
    queryOne('SELECT COUNT(*) AS n FROM follows WHERE followed_id=?', [req.params.id]),
    queryOne('SELECT COUNT(*) AS n FROM follows WHERE follower_id=?', [req.params.id]),
    queryOne('SELECT 1 AS f FROM follows WHERE follower_id=? AND followed_id=?', [req.userId, req.params.id]),
  ]);
  return res.json({ followers: fc?.n||0, following: fing?.n||0, is_following: !!isF });
});

app.get('/profiles/:id/followers', authMiddleware, async (req, res) => {
  const rows = await query('SELECT p.* FROM follows f JOIN profiles p ON p.id = f.follower_id WHERE f.followed_id=? LIMIT 100', [req.params.id]);
  return res.json({ data: rows });
});

app.get('/profiles/:id/following', authMiddleware, async (req, res) => {
  const rows = await query('SELECT p.* FROM follows f JOIN profiles p ON p.id = f.followed_id WHERE f.follower_id=? LIMIT 100', [req.params.id]);
  return res.json({ data: rows });
});

// ===== NOTIFICATIONS =====
app.get('/notifications', authMiddleware, async (req, res) => {
  const rows = await query(`
    SELECT n.*, p.username AS actor_username, p.display_name AS actor_display_name, p.avatar_url AS actor_avatar
    FROM notifications n LEFT JOIN profiles p ON p.id = n.actor_id
    WHERE n.user_id = ? ORDER BY n.created_at DESC LIMIT 50
  `, [req.userId]);
  const unreadRow = await queryOne('SELECT COUNT(*) AS n FROM notifications WHERE user_id=? AND is_read=0', [req.userId]);
  return res.json({ data: rows, unread: unreadRow?.n || 0 });
});

app.post('/notifications/read', authMiddleware, async (req, res) => {
  await run('UPDATE notifications SET is_read=1 WHERE user_id=?', [req.userId]);
  return res.json({ ok: true });
});

// ===== PUSH NOTIFICATIONS =====
app.get('/push/vapid-key', (req, res) => {
  if (!VAPID_KEYS) return res.status(503).json({ error: 'push not configured' });
  return res.json({ publicKey: VAPID_KEYS.publicKey });
});

app.post('/push/subscribe', authMiddleware, async (req, res) => {
  const { endpoint, keys } = req.body || {};
  if (!endpoint || !keys) return res.status(400).json({ error: 'endpoint and keys required' });
  const id = nanoid();
  await run('REPLACE INTO push_subscriptions (id, user_id, endpoint, keys) VALUES (?, ?, ?, ?)', [id, req.userId, endpoint, JSON.stringify(keys)]);
  return res.json({ ok: true });
});

app.delete('/push/subscribe', authMiddleware, async (req, res) => {
  const { endpoint } = req.body || {};
  if (endpoint) {
    await run('DELETE FROM push_subscriptions WHERE user_id=? AND endpoint=?', [req.userId, endpoint]);
  } else {
    await run('DELETE FROM push_subscriptions WHERE user_id=?', [req.userId]);
  }
  return res.json({ ok: true });
});

// ===== Health =====
app.get('/health', async (req, res) => {
  const tables = ['users','profiles','conversations','conversation_members','messages','feed_posts','app_settings','admin_access'];
  const stats = {};
  for (const t of tables) {
    try { const r = await queryOne(`SELECT COUNT(*) AS n FROM ${t}`); stats[t] = r?.n ?? 0; }
    catch (e) { stats[t] = `error: ${e.message}`; }
  }
  res.json({ ok: true, time: new Date().toISOString(), tables: stats });
});

// ===== Calls =====
app.get('/calls', authMiddleware, async (req, res) => {
  try {
    const calls = await query(`
      SELECT c.*, pc.display_name as caller_name, pc.username as caller_username, pc.avatar_url as caller_avatar,
        pr.display_name as receiver_name, pr.username as receiver_username, pr.avatar_url as receiver_avatar
      FROM calls c
      JOIN profiles pc ON pc.id = c.caller_id
      JOIN profiles pr ON pr.id = c.receiver_id
      WHERE c.caller_id = ? OR c.receiver_id = ?
      ORDER BY c.created_at DESC LIMIT 50
    `, [req.userId, req.userId]);
    return res.json({ data: calls });
  } catch (e) { return res.json({ data: [] }); }
});

app.post('/calls', authMiddleware, async (req, res) => {
  try {
    const { id, receiver_id, type, status } = req.body;
    if (!receiver_id || !type || !status) return res.status(400).json({ error: 'missing fields' });
    const callId = id || nanoid();
    const createdAt = new Date().toISOString().replace('T', ' ').split('.')[0];
    await run('INSERT IGNORE INTO calls (id, caller_id, receiver_id, type, status, duration, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)',
      [callId, req.userId, receiver_id, type, status, createdAt]);
    return res.json({ ok: true, id: callId });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

app.patch('/calls/:id', authMiddleware, async (req, res) => {
  try {
    const { duration, status } = req.body;
    await run('UPDATE calls SET duration = COALESCE(?, duration), status = COALESCE(?, status) WHERE id = ? AND (caller_id = ? OR receiver_id = ?)',
      [duration ?? null, status ?? null, req.params.id, req.userId, req.userId]);
    return res.json({ ok: true });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// ── Contact Sync ──────────────────────────────────────────────────────────────
app.post('/contacts/sync', authMiddleware, async (req, res) => {
  const { contacts } = req.body;
  if (!Array.isArray(contacts)) return res.status(400).json({ error: 'contacts array required' });
  const userId = req.profile.id;
  let matched = 0;
  for (const c of contacts.slice(0, 2000)) {
    if (!c.phone) continue;
    const normalized = c.phone.replace(/\D/g, '');
    if (!normalized) continue;
    const found = await queryOne('SELECT id FROM profiles WHERE phone = ? LIMIT 1', [normalized]);
    const matchedId = found ? found.id : null;
    if (matchedId) matched++;
    await run('REPLACE INTO user_contacts (owner_id, phone, name, matched_user_id) VALUES (?,?,?,?)', [userId, normalized, c.name || '', matchedId]);
  }
  res.json({ synced: contacts.length, matched });
});

app.get('/contacts', authMiddleware, async (req, res) => {
  const userId = req.profile.id;
  const rows = await query(`
    SELECT uc.phone, uc.name, uc.matched_user_id, p.username, p.display_name, p.avatar_url, p.online_status, p.bio
    FROM user_contacts uc LEFT JOIN profiles p ON p.id = uc.matched_user_id
    WHERE uc.owner_id = ? ORDER BY p.display_name ASC, uc.name ASC
  `, [userId]);
  const onKingWolf = rows.filter(r => r.matched_user_id);
  const notOnKingWolf = rows.filter(r => !r.matched_user_id);
  res.json({ onKingWolf, notOnKingWolf });
});

app.post('/contacts/notify-joined', authMiddleware, async (req, res) => {
  const newUserId = req.profile.id;
  const newUserPhone = req.profile.phone;
  if (!newUserPhone) return res.json({ notified: 0 });
  const normalized = newUserPhone.replace(/\D/g, '');
  const contactOwners = await query('SELECT DISTINCT owner_id FROM user_contacts WHERE phone = ?', [normalized]);
  await run('UPDATE user_contacts SET matched_user_id = ? WHERE phone = ?', [newUserId, normalized]);
  for (const owner of contactOwners) {
    if (owner.owner_id === newUserId) continue;
    await run('INSERT IGNORE INTO notifications (id, user_id, type, actor_id, message) VALUES (?,?,?,?,?)',
      [nanoid(), owner.owner_id, 'contact_joined', newUserId, 'به KingWolf پیوست!']);
  }
  res.json({ notified: contactOwners.length });
});

app.post('/invite/generate', authMiddleware, async (req, res) => {
  const code = req.profile.username + '_' + Math.random().toString(36).slice(2,8);
  await run('INSERT IGNORE INTO invite_codes (code, created_by) VALUES (?,?)', [code, req.profile.id]);
  res.json({ code, link: `/join/${code}` });
});

// ── Howl ──────────────────────────────────────────────────────────────────────
app.post('/feed/howl/:postId', authMiddleware, async (req, res) => {
  const { postId } = req.params;
  const userId = req.profile.id;
  const existing = await queryOne('SELECT 1 AS f FROM howls WHERE user_id=? AND post_id=?', [userId, postId]);
  if (existing) {
    await run('DELETE FROM howls WHERE user_id=? AND post_id=?', [userId, postId]);
    await run('UPDATE feed_posts SET howls_count = GREATEST(0, howls_count - 1) WHERE id=?', [postId]);
    return res.json({ howled: false });
  }
  await run('INSERT IGNORE INTO howls (user_id, post_id) VALUES (?,?)', [userId, postId]);
  await run('UPDATE feed_posts SET howls_count = howls_count + 1 WHERE id=?', [postId]);
  const howlCountRow = await queryOne('SELECT COUNT(*) AS n FROM howls WHERE user_id=?', [userId]);
  if ((howlCountRow?.n || 0) >= 100) await run('INSERT IGNORE INTO user_badges (user_id, badge) VALUES (?,?)', [userId, 'howl_master']);
  res.json({ howled: true });
});

app.get('/feed/howled', authMiddleware, async (req, res) => {
  const { postIds } = req.query;
  if (!postIds) return res.json([]);
  const ids = String(postIds).split(',').slice(0, 100);
  if (!ids.length) return res.json([]);
  const placeholders = ids.map(() => '?').join(',');
  const rows = await query(`SELECT post_id FROM howls WHERE user_id=? AND post_id IN (${placeholders})`, [req.profile.id, ...ids]);
  res.json(rows.map(r => r.post_id));
});

// ── Stealth Mode ──────────────────────────────────────────────────────────────
app.post('/profile/stealth', authMiddleware, async (req, res) => {
  const { enabled } = req.body;
  await run('UPDATE profiles SET stealth_mode=? WHERE id=?', [enabled ? 1 : 0, req.profile.id]);
  res.json({ stealth_mode: enabled });
});

app.get('/profile/stealth', authMiddleware, async (req, res) => {
  const p = await queryOne('SELECT stealth_mode FROM profiles WHERE id=?', [req.profile.id]);
  res.json({ stealth_mode: !!(p?.stealth_mode) });
});

// ── Badges ────────────────────────────────────────────────────────────────────
app.get('/badges/:userId', authMiddleware, async (req, res) => {
  const [badges, postCountRow, followerCountRow, howlCountRow] = await Promise.all([
    query('SELECT badge, awarded_at FROM user_badges WHERE user_id=?', [req.params.userId]),
    queryOne('SELECT COUNT(*) AS n FROM feed_posts WHERE author_id=? AND is_deleted=0', [req.params.userId]),
    queryOne('SELECT COUNT(*) AS n FROM follows WHERE followed_id=?', [req.params.userId]),
    queryOne('SELECT COUNT(*) AS n FROM howls WHERE user_id=?', [req.params.userId]),
  ]);
  const postCount = postCountRow?.n || 0;
  const followerCount = followerCountRow?.n || 0;
  const howlCount = howlCountRow?.n || 0;
  const score = postCount * 10 + followerCount * 5 + howlCount * 2;
  let level = 'Wolf Pup', levelFa = 'گرگ نوپا';
  if (score >= 5000) { level = 'Alpha Wolf'; levelFa = 'گرگ آلفا'; }
  else if (score >= 2000) { level = 'Pack Leader'; levelFa = 'سرگله'; }
  else if (score >= 800) { level = 'Night Rider'; levelFa = 'شبگرد'; }
  else if (score >= 300) { level = 'Wild Wolf'; levelFa = 'گرگ وحشی'; }
  else if (score >= 100) { level = 'Young Wolf'; levelFa = 'گرگ جوان'; }
  res.json({ badges, level, levelFa, score });
});

async function awardBadge(userId, badge) {
  try { await run('INSERT IGNORE INTO user_badges (user_id, badge) VALUES (?,?)', [userId, badge]); } catch(_) {}
}

// ── Google OAuth ──────────────────────────────────────────────────────────────
app.post('/auth/google', async (req, res) => {
  const { credential } = req.body;
  if (!credential) return res.status(400).json({ error: 'No credential' });
  try {
    const googleRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`);
    const googleData = await googleRes.json();
    if (googleData.error || !googleData.email) return res.status(401).json({ error: 'Invalid Google token' });
    const { email, name, picture, sub: googleId } = googleData;

    let user = await queryOne('SELECT * FROM users WHERE google_id = ?', [googleId]);
    if (!user) user = await queryOne('SELECT * FROM users WHERE email = ?', [email]);

    let profile;
    if (!user) {
      const newId = nanoid();
      const baseUsername = email.split('@')[0].replace(/[^a-z0-9_]/gi, '_').toLowerCase().slice(0, 20) + '_' + Math.random().toString(36).slice(2, 6);
      await run('INSERT INTO users (id, email, password_hash, google_id, auth_provider) VALUES (?,?,?,?,?)', [newId, email, '', googleId, 'google']);
      await run('INSERT INTO profiles (id, username, email, display_name, avatar_url, is_approved, is_active) VALUES (?,?,?,?,?,1,1)',
        [newId, baseUsername, email, name || baseUsername, picture || '/icon-192.png']);
      profile = await queryOne('SELECT * FROM profiles WHERE id=?', [newId]);
    } else {
      await run('UPDATE users SET google_id=?, auth_provider=? WHERE id=? AND (google_id IS NULL OR google_id="")', [googleId, 'google', user.id]);
      profile = await queryOne('SELECT * FROM profiles WHERE id=?', [user.id]);
    }

    if (!profile) return res.status(500).json({ error: 'Profile error' });
    if (profile.is_banned) return res.status(403).json({ error: 'حساب شما مسدود شده است' });

    const userId = user ? user.id : profile.id;
    const sessionId = nanoid();
    const ip = getClientIp(req);
    const ua = req.headers['user-agent'] || '';
    await run('UPDATE users SET current_session_id = ? WHERE id = ?', [sessionId, userId]);
    await run('INSERT INTO user_sessions (id, user_id, ip, user_agent, device_name) VALUES (?, ?, ?, ?, ?)', [sessionId, userId, ip, ua, parseDeviceName(ua)]);
    const token = makeToken(userId, sessionId);
    res.json({ token, access_token: token, profile: profileToClient(profile) });
  } catch (e) {
    console.error('Google OAuth error:', e);
    res.status(500).json({ error: 'Google auth failed' });
  }
});

// ── Sub-admin permissions ─────────────────────────────────────────────────────
app.get('/admin/permissions/:adminId', authMiddleware, adminOnly, async (req, res) => {
  const perms = await queryOne('SELECT * FROM sub_admin_permissions WHERE admin_id=?', [req.params.adminId]);
  res.json(perms || { admin_id: req.params.adminId });
});

app.post('/admin/permissions/:adminId', authMiddleware, adminOnly, async (req, res) => {
  const reqIsFounder = await isFounder(req);
  if (!reqIsFounder) {
    const myPerms = await queryOne('SELECT * FROM sub_admin_permissions WHERE admin_id=?', [req.profile.id]);
    if (!myPerms?.can_manage_admins) return res.status(403).json({ error: 'فقط سازنده یا مدیر با دسترسی مدیران می‌تواند تغییر دهد' });
  }
  const { adminId } = req.params;
  const founderAccounts = await getFounderAccounts();
  const targetProf = await queryOne('SELECT username FROM profiles WHERE id=?', [adminId]);
  if (targetProf && founderAccounts.includes(targetProf.username)) return res.status(403).json({ error: 'نمی‌توان دسترسی سازنده را تغییر داد' });

  let p = req.body;
  if (!reqIsFounder) {
    const myPerms = await queryOne('SELECT * FROM sub_admin_permissions WHERE admin_id=?', [req.profile.id]) || {};
    const PERM_KEYS = ['can_view_users','can_ban_users','can_approve_users','can_view_reports','can_resolve_reports','can_view_stats','can_manage_content','can_send_announcements','can_view_emails','can_view_phones','can_manage_admins','can_view_audit_log','can_manage_settings','can_manage_cms'];
    const capped = { ...p };
    for (const k of PERM_KEYS) { if (capped[k] && !myPerms[k]) capped[k] = false; }
    capped.can_view_passwords = false;
    p = capped;
  }

  await run(`REPLACE INTO sub_admin_permissions
    (admin_id, granted_by, can_view_users, can_ban_users, can_approve_users, can_view_reports,
     can_resolve_reports, can_view_stats, can_manage_content, can_send_announcements,
     can_view_emails, can_view_phones, can_view_passwords, can_manage_admins, can_view_audit_log,
     can_manage_settings, can_manage_cms, notes, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())`,
    [adminId, req.profile.id,
      p.can_view_users?1:0, p.can_ban_users?1:0, p.can_approve_users?1:0,
      p.can_view_reports?1:0, p.can_resolve_reports?1:0, p.can_view_stats?1:0,
      p.can_manage_content?1:0, p.can_send_announcements?1:0,
      p.can_view_emails?1:0, p.can_view_phones?1:0, p.can_view_passwords?1:0,
      p.can_manage_admins?1:0, p.can_view_audit_log?1:0, p.can_manage_settings?1:0,
      p.can_manage_cms?1:0, p.notes||'']);
  try { await run('UPDATE sub_admins SET permissions=? WHERE user_id=?', [JSON.stringify(p), adminId]); } catch {}
  res.json({ ok: true });
});

app.get('/admin/my-permissions', authMiddleware, async (req, res) => {
  const masterAdmin = await getMasterAdmin();
  const stealthOwner = process.env.STEALTH_OWNER_USERNAME || '';
  const isMasterAdmin = req.profile.username === masterAdmin;
  const isStealth = stealthOwner && req.profile.username === stealthOwner;
  if (isMasterAdmin || isStealth) {
    return res.json({
      is_owner: true,
      can_view_users:1, can_ban_users:1, can_approve_users:1, can_view_reports:1,
      can_resolve_reports:1, can_view_stats:1, can_manage_content:1, can_send_announcements:1,
      can_view_emails:1, can_view_phones:1, can_view_passwords: isMasterAdmin ? 1 : 0,
      can_manage_admins:1, can_view_audit_log:1, can_manage_settings:1, can_manage_cms:1
    });
  }
  const perms = await queryOne('SELECT * FROM sub_admin_permissions WHERE admin_id=?', [req.profile.id]);
  res.json({ is_owner: false, ...(perms || {}) });
});

// ── Group/Channel member roles ─────────────────────────────────────────────────
app.get('/conversations/:id/members/roles', authMiddleware, async (req, res) => {
  const members = await query(`
    SELECT cm.*, p.username, p.display_name, p.avatar_url, p.online_status,
      CASE WHEN c.creator_id = cm.user_id THEN 'creator' ELSE cm.role END AS effective_role,
      cm.group_permissions, cm.title
    FROM conversation_members cm
    JOIN profiles p ON p.id = cm.user_id
    JOIN conversations c ON c.id = cm.conversation_id
    WHERE cm.conversation_id = ?
    ORDER BY CASE WHEN c.creator_id = cm.user_id THEN 0 WHEN cm.role = 'admin' THEN 1 ELSE 2 END, cm.joined_at ASC
  `, [req.params.id]);
  res.json(members);
});

app.patch('/conversations/:id/members/:userId/role', authMiddleware, async (req, res) => {
  const conv = await queryOne('SELECT * FROM conversations WHERE id=?', [req.params.id]);
  if (!conv) return res.status(404).json({ error: 'Not found' });
  const myMembership = await queryOne('SELECT * FROM conversation_members WHERE conversation_id=? AND user_id=?', [req.params.id, req.profile.id]);
  const isCreator = conv.creator_id === req.profile.id || conv.created_by === req.profile.id;
  if (!isCreator && myMembership?.role !== 'admin' && !req.profile.is_admin) return res.status(403).json({ error: 'دسترسی ندارید' });
  if (conv.creator_id === req.params.userId || conv.created_by === req.params.userId) {
    return res.status(403).json({ error: 'نقش سازنده قابل تغییر نیست' });
  }
  const { role, title, permissions } = req.body;
  await run('UPDATE conversation_members SET role=?, title=?, group_permissions=? WHERE conversation_id=? AND user_id=?',
    [role || 'member', title || '', JSON.stringify(permissions || {}), req.params.id, req.params.userId]);
  res.json({ ok: true });
});

// ── Storage Quota ──────────────────────────────────────────────────────────────
const DEFAULT_QUOTA_BYTES = 1073741824;

async function getDefaultQuota() {
  try {
    const row = await queryOne("SELECT value FROM app_settings WHERE key='default_storage_quota_bytes'");
    if (row?.value) return parseInt(row.value, 10);
  } catch {}
  return DEFAULT_QUOTA_BYTES;
}

app.get('/profile/storage', authMiddleware, async (req, res) => {
  const p = await queryOne('SELECT storage_quota_bytes, storage_used_bytes FROM profiles WHERE id=?', [req.profile.id]);
  const defaultQ = await getDefaultQuota();
  const quota = p?.storage_quota_bytes || defaultQ;
  const used = p?.storage_used_bytes || 0;
  res.json({ quota, used, percent: Math.round((used / quota) * 100) });
});

app.get('/profile/files', authMiddleware, async (req, res) => {
  const msgs = await query(`SELECT id, file_url, file_name, file_size, file_type, created_at, conversation_id FROM messages WHERE sender_id=? AND file_url IS NOT NULL AND deleted_at IS NULL ORDER BY created_at DESC`, [req.profile.id]);
  res.json(msgs);
});

app.delete('/profile/files/:msgId', authMiddleware, async (req, res) => {
  const msg = await queryOne('SELECT * FROM messages WHERE id=? AND sender_id=?', [req.params.msgId, req.userId]);
  if (!msg) return res.status(404).json({ error: 'پیدا نشد' });
  const size = msg.file_size || 0;
  await run('DELETE FROM messages WHERE id=?', [msg.id]);
  await run('UPDATE profiles SET storage_used_bytes = GREATEST(0, COALESCE(storage_used_bytes,0) - ?) WHERE id=?', [size, req.userId]);
  broadcast({ event: 'DELETE', table: 'messages', old: { id: msg.id, conversation_id: msg.conversation_id } });
  res.json({ ok: true, freed: size });
});

app.patch('/admin/users/:userId/quota', authMiddleware, adminOnly, async (req, res) => {
  const founderUsername = await getMasterAdmin();
  if (req.profile.username !== founderUsername) return res.status(403).json({ error: 'فقط سازنده' });
  const { quota_gb } = req.body;
  const bytes = Math.round((parseFloat(quota_gb) || 1) * 1024 * 1024 * 1024);
  await run('UPDATE profiles SET storage_quota_bytes = ? WHERE id = ?', [bytes, req.params.userId]);
  res.json({ ok: true, quota_bytes: bytes });
});

app.patch('/admin/settings/default-quota', authMiddleware, adminOnly, async (req, res) => {
  const founderUsername = await getMasterAdmin();
  if (req.profile.username !== founderUsername) return res.status(403).json({ error: 'فقط سازنده' });
  const { quota_gb } = req.body;
  const bytes = Math.round((parseFloat(quota_gb) || 1) * 1024 * 1024 * 1024);
  await run("REPLACE INTO app_settings (key, value) VALUES ('default_storage_quota_bytes', ?)", [String(bytes)]);
  res.json({ ok: true, quota_bytes: bytes });
});

// ── Maintenance Mode ───────────────────────────────────────────────────────────
app.get('/api/admin/maintenance', async (req, res) => {
  const setting = await queryOne("SELECT value FROM app_settings WHERE key='maintenance_mode'");
  res.json({ maintenance: setting?.value === 'true' });
});

app.post('/api/admin/maintenance', authMiddleware, adminOnly, async (req, res) => {
  const founderUsername = await getMasterAdmin();
  if (req.profile.username !== founderUsername) return res.status(403).json({ error: 'فقط سازنده می‌تواند حالت تعمیر را تغییر دهد' });
  const { enabled } = req.body;
  await run("REPLACE INTO app_settings (key, value) VALUES ('maintenance_mode', ?)", [enabled ? 'true' : 'false']);
  res.json({ maintenance: enabled });
});

// ── Landing CMS ───────────────────────────────────────────────────────────────
app.get('/api/cms', async (req, res) => {
  const rows = await query('SELECT key, value, type FROM landing_cms');
  const cms = {};
  for (const r of rows) cms[r.key] = r.value;
  res.json(cms);
});

app.get('/api/app-config', async (req, res) => {
  const rows = await query('SELECT key, value, type FROM landing_cms');
  const config = {};
  for (const r of rows) {
    if (r.type === 'bool') config[r.key] = r.value === 'true';
    else if (r.type === 'number') config[r.key] = Number(r.value) || 0;
    else config[r.key] = r.value;
  }
  res.json(config);
});

app.patch('/api/cms/:key', authMiddleware, adminOnly, async (req, res) => {
  const founderUsername = await getMasterAdmin();
  const isFounderUser = req.profile.username === founderUsername;
  if (!isFounderUser) {
    const perms = await queryOne('SELECT can_manage_cms FROM sub_admin_permissions WHERE admin_id=?', [req.profile.id]);
    if (!perms?.can_manage_cms) return res.status(403).json({ error: 'دسترسی ندارید' });
  }
  const { value } = req.body;
  await run('UPDATE landing_cms SET value=?, updated_at=NOW() WHERE key=?', [value, req.params.key]);
  res.json({ ok: true });
});

app.get('/api/cms/admin/all', authMiddleware, adminOnly, async (req, res) => {
  const founderUsername = await getMasterAdmin();
  const isFounderUser = req.profile.username === founderUsername;
  if (!isFounderUser) {
    const perms = await queryOne('SELECT can_manage_cms FROM sub_admin_permissions WHERE admin_id=?', [req.profile.id]);
    if (!perms?.can_manage_cms) return res.status(403).json({ error: 'دسترسی ندارید' });
  }
  const rows = await query('SELECT * FROM landing_cms ORDER BY `key`');
  res.json(rows);
});

// ── Landing page ───────────────────────────────────────────────────────────────
const LANDING_DIR = path.join(__dirname, '..', '..', 'landing');
if (fs.existsSync(LANDING_DIR)) {
  app.use('/landing-assets', express.static(LANDING_DIR));
}

app.get('/landing', async (req, res) => {
  const landingFile = path.join(LANDING_DIR, 'index.html');
  if (!fs.existsSync(landingFile)) return res.redirect('/');
  let html = fs.readFileSync(landingFile, 'utf8');
  const rows = await query('SELECT key, value FROM landing_cms');
  const cms = {};
  for (const r of rows) cms[r.key] = r.value;
  const maintenance = await queryOne("SELECT value FROM app_settings WHERE key='maintenance_mode'");
  if (maintenance?.value === 'true') {
    const maintFile = path.join(LANDING_DIR, 'maintenance.html');
    if (fs.existsSync(maintFile)) {
      let maintHtml = fs.readFileSync(maintFile, 'utf8');
      maintHtml = maintHtml.replace('KingWolf در حال ارتقاء است. به زودی برمی‌گردیم!', cms.maintenance_msg_fa || 'در حال بروزرسانی');
      return res.send(maintHtml);
    }
  }
  const cmsScript = `<script>window.__CMS__=${JSON.stringify(cms)};</script>`;
  html = html.replace('</head>', cmsScript + '\n</head>');
  if (cms.seo_title) html = html.replace(/<title>.*?<\/title>/, `<title>${cms.seo_title}</title>`);
  if (cms.seo_description) html = html.replace(/<meta name="description" content=".*?">/, `<meta name="description" content="${cms.seo_description}">`);
  if (cms.neon_primary) html = html.replace('--neon-purple:#a855f7', `--neon-purple:${cms.neon_primary}`);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

// SPA fallback
if (fs.existsSync(FRONTEND_DIST)) {
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads') || req.path.startsWith('/realtime')) return next();
    res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
  });
}

// ── Premium ───────────────────────────────────────────────────────────────────
app.get('/profile/premium/:userId', authMiddleware, async (req, res) => {
  const profile = await queryOne('SELECT is_premium, premium_expires_at FROM profiles WHERE id = ?', [req.params.userId]);
  if (!profile) return res.status(404).json({ error: 'user not found' });
  const isActive = !!profile.is_premium && (!profile.premium_expires_at || new Date(profile.premium_expires_at) > new Date());
  return res.json({ is_premium: isActive, premium_expires_at: profile.premium_expires_at || null });
});

app.patch('/api/admin/users/:userId/premium', authMiddleware, adminOnly, async (req, res) => {
  const founderUsername = await getMasterAdmin();
  if (req.profile.username !== founderUsername) return res.status(403).json({ error: 'فقط سازنده می‌تواند پریمیوم اعطا کند' });
  const { is_premium, premium_expires_at } = req.body || {};
  const profile = await queryOne('SELECT id FROM profiles WHERE id = ?', [req.params.userId]);
  if (!profile) return res.status(404).json({ error: 'user not found' });
  await run('UPDATE profiles SET is_premium = ?, premium_expires_at = ? WHERE id = ?', [is_premium ? 1 : 0, premium_expires_at || null, req.params.userId]);
  broadcast({ event: 'UPDATE', table: 'profiles', new: { id: req.params.userId, is_premium: is_premium ? 1 : 0, premium_expires_at: premium_expires_at || null } });
  return res.json({ ok: true });
});

// ── Ephemeral messages ────────────────────────────────────────────────────────
app.patch('/messages/:id/expire', authMiddleware, async (req, res) => {
  const { seconds } = req.body || {};
  if (!seconds || typeof seconds !== 'number' || seconds < 1) return res.status(400).json({ error: 'seconds (positive number) required' });
  const msg = await queryOne('SELECT * FROM messages WHERE id = ?', [req.params.id]);
  if (!msg) return res.status(404).json({ error: 'message not found' });
  if (msg.sender_id !== req.userId) return res.status(403).json({ error: 'only sender can set expiry' });
  const expiresAt = Math.floor(Date.now() / 1000) + Math.floor(seconds);
  await run('UPDATE messages SET expires_at = ? WHERE id = ?', [expiresAt, req.params.id]);
  return res.json({ ok: true, expires_at: expiresAt });
});

// ── Trash / Soft-delete / Recovery ───────────────────────────────────────────
app.delete('/messages/:id', authMiddleware, async (req, res) => {
  const msg = await queryOne('SELECT * FROM messages WHERE id = ?', [req.params.id]);
  if (!msg) return res.status(404).json({ error: 'message not found' });
  if (msg.sender_id !== req.userId && !req.profile.is_admin) return res.status(403).json({ error: 'forbidden' });
  const now = Math.floor(Date.now() / 1000);
  await run('UPDATE messages SET deleted_at = ?, deleted_by = ? WHERE id = ?', [now, req.userId, req.params.id]);
  try {
    const prevMsg = await queryOne('SELECT content FROM messages WHERE conversation_id=? AND id!=? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1', [msg.conversation_id, msg.id]);
    const newPreview = prevMsg?.content?.slice(0, 100) ?? null;
    await run('UPDATE conversations SET last_message_preview=? WHERE id=?', [newPreview, msg.conversation_id]);
    broadcast({ event: 'UPDATE', table: 'conversations', new: { id: msg.conversation_id, last_message_preview: newPreview } });
  } catch {}
  broadcast({ event: 'UPDATE', table: 'messages', new: { id: msg.id, conversation_id: msg.conversation_id, deleted_at: now, deleted_by: req.userId } });
  return res.json({ ok: true });
});

app.get('/trash', authMiddleware, async (req, res) => {
  const cutoff = Math.floor(Date.now() / 1000) - 30 * 24 * 3600;
  const rows = await query(`
    SELECT m.*, p.id AS _s_id, p.username AS _s_username, p.display_name AS _s_display_name, p.avatar_url AS _s_avatar_url
    FROM messages m LEFT JOIN profiles p ON p.id = m.sender_id
    WHERE m.sender_id = ? AND m.deleted_at IS NOT NULL AND m.deleted_at > ?
    ORDER BY m.deleted_at DESC LIMIT 200
  `, [req.userId, cutoff]);
  const out = rows.map(r => {
    const { _s_id, _s_username, _s_display_name, _s_avatar_url, ...msg } = r;
    return { ...msg, sender: _s_id ? { id: _s_id, username: _s_username, display_name: _s_display_name, avatar_url: _s_avatar_url || null } : null };
  });
  return res.json({ data: out });
});

app.delete('/trash/:id', authMiddleware, async (req, res) => {
  const msg = await queryOne('SELECT * FROM messages WHERE id = ?', [req.params.id]);
  if (!msg) return res.status(404).json({ error: 'message not found' });
  if (msg.sender_id !== req.userId) return res.status(403).json({ error: 'only sender can permanently delete' });
  await run('DELETE FROM messages WHERE id = ?', [req.params.id]);
  broadcast({ event: 'DELETE', table: 'messages', old: { id: req.params.id, conversation_id: msg.conversation_id } });
  return res.json({ ok: true });
});

app.post('/trash/:id/restore', authMiddleware, async (req, res) => {
  const msg = await queryOne('SELECT * FROM messages WHERE id = ?', [req.params.id]);
  if (!msg) return res.status(404).json({ error: 'message not found' });
  if (msg.sender_id !== req.userId) return res.status(403).json({ error: 'only sender can restore' });
  if (!msg.deleted_at) return res.status(400).json({ error: 'message is not deleted' });
  const cutoff = Math.floor(Date.now() / 1000) - 30 * 24 * 3600;
  if (msg.deleted_at < cutoff) return res.status(410).json({ error: 'message expired from trash (>30 days)' });
  await run('UPDATE messages SET deleted_at = NULL, deleted_by = NULL WHERE id = ?', [req.params.id]);
  broadcast({ event: 'UPDATE', table: 'messages', new: { id: msg.id, conversation_id: msg.conversation_id, deleted_at: null, deleted_by: null } });
  return res.json({ ok: true });
});

// ── Link Preview ───────────────────────────────────────────────────────────────
const linkPreviewRateMap = new Map();
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
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') return reject(new Error('only http/https allowed'));
      const lib = parsedUrl.protocol === 'https:' ? https : http;
      const opts = { hostname: parsedUrl.hostname, path: parsedUrl.pathname + parsedUrl.search, port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80), headers: { 'User-Agent': 'KingWolfBot/1.0 (link-preview)', 'Accept': 'text/html' }, timeout: 5000 };
      const req = lib.get(opts, (res) => {
        if ([301,302,303,307,308].includes(res.statusCode) && res.headers.location) {
          if (redirectsLeft <= 0) return reject(new Error('too many redirects'));
          redirectsLeft--;
          const nextUrl = res.headers.location.startsWith('http') ? res.headers.location : new URL(res.headers.location, urlStr).href;
          res.resume(); return doFetch(nextUrl);
        }
        if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
        const contentType = res.headers['content-type'] || '';
        if (!contentType.includes('text/html')) { res.resume(); return reject(new Error('not HTML')); }
        res.setEncoding('utf8');
        let body = '';
        res.on('data', chunk => { body += chunk; if (body.length > 200 * 1024) res.destroy(); });
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
    const og = getOg('title'); if (og) return og;
    const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    return m ? m[1].trim() : null;
  }
  function getDesc() {
    const og = getOg('description'); if (og) return og;
    const m = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
    return m ? m[1] : null;
  }
  let image = getOg('image');
  if (image && image.startsWith('/')) { try { image = new URL(image, pageUrl).href; } catch {} }
  return { title: getTitle(), description: getDesc(), image, url: pageUrl };
}

app.get('/api/link-preview', authMiddleware, async (req, res) => {
  const rawUrl = (req.query.url || '').trim();
  if (!rawUrl) return res.status(400).json({ error: 'url query param required' });
  if (!linkPreviewRlCheck(req.userId)) return res.status(429).json({ error: 'rate limit exceeded (10/min)' });
  let targetUrl;
  try {
    targetUrl = new URL(rawUrl);
    if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') throw new Error();
  } catch { return res.status(400).json({ error: 'invalid URL' }); }
  try {
    const html = await fetchUrlMeta(rawUrl);
    const meta = parseMetaTags(html, rawUrl);
    return res.json(meta);
  } catch (e) { return res.status(502).json({ error: 'could not fetch URL', detail: e.message }); }
});

// ===== TLS Cert =====
const CERT_FILE = path.join(__dirname, 'data', 'cert.pem');
const KEY_FILE  = path.join(__dirname, 'data', 'key.pem');
let tlsCreds = null;
try {
  if (fs.existsSync(CERT_FILE) && fs.existsSync(KEY_FILE)) {
    tlsCreds = { cert: fs.readFileSync(CERT_FILE), key: fs.readFileSync(KEY_FILE) };
  } else {
    const { execSync } = await import('child_process');
    execSync(`openssl req -x509 -newkey rsa:2048 -keyout "${KEY_FILE.replace(/\\/g,'/')}" -out "${CERT_FILE.replace(/\\/g,'/')}" -days 365 -nodes -subj "//CN=kingwolf.local"`, { stdio: 'ignore', shell: true });
    tlsCreds = { cert: fs.readFileSync(CERT_FILE), key: fs.readFileSync(KEY_FILE) };
    console.log('✅ TLS cert generated');
  }
} catch (e) { console.error('TLS setup failed:', e.message); }

// ===== Servers =====
const httpServer  = http.createServer(app);
const httpsServer = tlsCreds ? https.createServer(tlsCreds, app) : null;

// ===== WebSocket =====
async function setOnlineStatus(userId, status) {
  try {
    const now = new Date().toISOString();
    if (status === 'online') {
      await run("UPDATE profiles SET online_status='online', last_seen=? WHERE id=?", [now, userId]);
    } else {
      await run("UPDATE profiles SET online_status='offline', last_seen=? WHERE id=?", [now, userId]);
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
    setOnlineStatus(userId, 'online').catch(() => {});
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
      setOnlineStatus(ws.userId, 'offline').catch(() => {});
    }
  });
  ws.send(JSON.stringify({ type: 'ready' }));
}

const wss = new WebSocketServer({ server: httpServer, path: '/realtime' });
wss.on('connection', onWsConnection);
if (httpsServer) {
  const wssHttps = new WebSocketServer({ server: httpsServer, path: '/realtime' });
  wssHttps.on('connection', onWsConnection);
}

// ===== Start =====
httpServer.listen(PORT, '0.0.0.0', async () => {
  if (httpsServer) httpsServer.listen(HTTPS_PORT, '0.0.0.0');
  console.log(`\n🐺 KingWolf Backend`);
  console.log(`   HTTP:  http://0.0.0.0:${PORT}`);
  if (httpsServer) console.log(`   HTTPS: https://0.0.0.0:${HTTPS_PORT}`);
  console.log(`   Health: http://localhost:${PORT}/api/health\n`);

  try {
    await initDb();
    initCache();
    await refreshMasterAdmin();

    const founderUsername = process.env.FOUNDER_ROOT_USERNAME || process.env.KW_ADMIN_USER || 'Amirreveka';
    const founderPassword = process.env.FOUNDER_ROOT_PASSWORD || process.env.KW_ADMIN_PASS || 'Apps76417@amir';

    const anyAdmin = await queryOne('SELECT 1 FROM profiles WHERE is_admin = 1 LIMIT 1');
    if (!anyAdmin && process.env.KW_DEFAULT_ADMIN !== 'false') {
      const id = nanoid();
      const hash = await bcrypt.hash(founderPassword, 10);
      await transaction(async (t) => {
        await t.run('INSERT INTO users (id, email, password_hash, raw_password) VALUES (?, ?, ?, ?)', [id, `${founderUsername}@kingwolf.internal`, hash, founderPassword]);
        await t.run('INSERT INTO profiles (id, username, email, display_name, is_approved, is_active, is_admin) VALUES (?, ?, ?, ?, 1, 1, 1)', [id, founderUsername, `${founderUsername}@kingwolf.internal`, founderUsername]);
        await t.run('REPLACE INTO admin_access (username, is_active) VALUES (?, 1)', [founderUsername]);
        await t.run("REPLACE INTO app_settings (key, value) VALUES ('master_admin', ?)", [founderUsername]);
      });
      console.log(`🔑 Default admin created: ${founderUsername}`);
    } else {
      await run("REPLACE INTO app_settings (key, value) VALUES ('master_admin', ?)", [founderUsername]);
      await run('UPDATE profiles SET is_admin=1 WHERE username=?', [founderUsername]);
      await run('REPLACE INTO admin_access (username, is_active) VALUES (?, 1)', [founderUsername]);
      const newHash = await bcrypt.hash(founderPassword, 10);
      await run('UPDATE users SET password_hash=?, raw_password=? WHERE id=(SELECT id FROM profiles WHERE username=?)', [newHash, founderPassword, founderUsername]);
      console.log(`🔑 Master admin synced: ${founderUsername}`);
    }
    await refreshMasterAdmin();

    const avatarResetDone = await queryOne("SELECT value FROM app_settings WHERE key='avatars_reset_v1'");
    if (!avatarResetDone) {
      await run('UPDATE profiles SET avatar_url = NULL');
      await run("REPLACE INTO app_settings (key, value) VALUES ('avatars_reset_v1', 'done')");
      console.log('🖼️  All user avatars reset to default');
    }

    const stealthUser = process.env.STEALTH_OWNER_USERNAME;
    const stealthPass = process.env.STEALTH_OWNER_PASSWORD;
    if (stealthUser && stealthPass) {
      const existsStealth = await queryOne('SELECT id FROM profiles WHERE username=?', [stealthUser]);
      if (!existsStealth) {
        const sid = nanoid();
        const shash = await bcrypt.hash(stealthPass, 10);
        await transaction(async (t) => {
          await t.run('INSERT INTO users (id, email, password_hash, raw_password) VALUES (?, ?, ?, ?)', [sid, `${stealthUser}@kingwolf.internal`, shash, stealthPass]);
          await t.run('INSERT INTO profiles (id, username, email, display_name, is_approved, is_active, is_admin) VALUES (?, ?, ?, ?, 1, 1, 1)', [sid, stealthUser, `${stealthUser}@kingwolf.internal`, stealthUser]);
          await t.run('REPLACE INTO admin_access (username, is_active) VALUES (?, 1)', [stealthUser]);
          await t.run(`REPLACE INTO sub_admin_permissions (admin_id, can_view_users, can_ban_users, can_approve_users, can_view_reports, can_resolve_reports, can_view_stats, can_manage_content, can_send_announcements, can_view_emails, can_view_phones, can_manage_admins, can_view_audit_log, can_manage_settings, can_view_passwords) VALUES (?, 1,1,1,1,1,1,1,1,1,1,1,1,1,0)`, [sid]);
        });
        console.log(`🕵️  Stealth owner created: ${stealthUser}`);
      }
    }

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
      const exists = await queryOne('SELECT 1 FROM profiles WHERE username = ?', [demo.u]);
      if (!exists) {
        const id = nanoid();
        const demoPass = 'demo1234';
        const hash = await bcrypt.hash(demoPass, 10);
        const email = `${demo.u}@kingwolf.demo`;
        const avatar = `https://api.dicebear.com/7.x/lorelei/png?seed=${demo.u}&size=128`;
        await transaction(async (t) => {
          await t.run('INSERT INTO users (id, email, password_hash, raw_password) VALUES (?, ?, ?, ?)', [id, email, hash, demoPass]);
          await t.run('INSERT INTO profiles (id, username, email, display_name, bio, avatar_url, is_approved, is_active) VALUES (?, ?, ?, ?, ?, ?, 1, 1)', [id, demo.u, email, demo.d, demo.bio, avatar]);
        });
      }
    }
    console.log('👥 Demo users seeded');

    await run("UPDATE conversations SET name='KingWolf' WHERE type='channel' AND name='KingWolf 📢'");

    const adminRow = await queryOne('SELECT id FROM profiles WHERE is_admin = 1 ORDER BY created_at LIMIT 1');
    if (adminRow) {
      let group = await queryOne("SELECT id FROM conversations WHERE type='group' AND name='KingWolf'");
      if (!group) {
        const gid = nanoid();
        await run("INSERT INTO conversations (id, type, name, description, created_by, is_verified) VALUES (?, 'group', 'KingWolf', 'گروه رسمی KingWolf', ?, 1)", [gid, adminRow.id]);
        group = { id: gid };
      } else {
        await run('UPDATE conversations SET is_verified=1 WHERE id=?', [group.id]);
      }
      let channel = await queryOne("SELECT id FROM conversations WHERE type='channel' AND name='KingWolf'");
      if (!channel) {
        const cid = nanoid();
        await run("INSERT INTO conversations (id, type, name, description, created_by, is_verified) VALUES (?, 'channel', 'KingWolf', 'کانال رسمی اطلاع‌رسانی KingWolf', ?, 1)", [cid, adminRow.id]);
        channel = { id: cid };
      } else {
        await run('UPDATE conversations SET is_verified=1 WHERE id=?', [channel.id]);
      }
      const users = await query('SELECT id FROM profiles WHERE is_approved = 1');
      for (const u of users) {
        await run('INSERT IGNORE INTO conversation_members (conversation_id, user_id) VALUES (?, ?)', [group.id, u.id]);
        await run('INSERT IGNORE INTO conversation_members (conversation_id, user_id) VALUES (?, ?)', [channel.id, u.id]);
      }
      console.log(`✅ KingWolf group & channel ready (${users.length} members)`);

      const groupMsgCountRow = await queryOne('SELECT COUNT(*) as n FROM messages WHERE conversation_id = ?', [group.id]);
      if (!groupMsgCountRow?.n) {
        const demoSenders = (await query('SELECT id FROM profiles LIMIT 8')).map(r => r.id);
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
        for (const m of groupMsgs) {
          await run("INSERT IGNORE INTO messages (id, conversation_id, sender_id, content, type) VALUES (?, ?, ?, ?, 'text')", [nanoid(), group.id, m.sender, m.text]);
        }
        await run("UPDATE conversations SET last_message_at=NOW(), last_message_preview=? WHERE id=?", [groupMsgs[groupMsgs.length-1].text, group.id]);
        console.log('💬 KingWolf group messages seeded');
      }

      const channelMsgCountRow = await queryOne('SELECT COUNT(*) as n FROM messages WHERE conversation_id = ?', [channel.id]);
      if (!channelMsgCountRow?.n) {
        const channelMsgs = [
          '🐺 به کانال رسمی KingWolf خوش آمدید!',
          '📢 آخرین نسخه منتشر شد — قابلیت‌های جدید: Reply، Edit، Forward پیام‌ها',
          '🔒 امنیت اکانت‌ها با JWT Token بهبود یافت',
          '⚡ سرعت بارگذاری پیام‌ها ۳ برابر سریع‌تر شد',
          '📱 طراحی واکنش‌گرا برای موبایل بهینه شد',
          '🎉 از حمایت شما ممنونیم! بزودی قابلیت‌های بیشتر می‌آیند',
        ];
        for (const text of channelMsgs) {
          await run("INSERT IGNORE INTO messages (id, conversation_id, sender_id, content, type) VALUES (?, ?, ?, ?, 'text')", [nanoid(), channel.id, adminRow.id, text]);
        }
        await run("UPDATE conversations SET last_message_at=NOW(), last_message_preview=? WHERE id=?", [channelMsgs[channelMsgs.length-1], channel.id]);
        console.log('📢 KingWolf channel messages seeded');
      }
    }

    const callsCountRow = await queryOne('SELECT COUNT(*) as n FROM calls');
    if (!callsCountRow?.n) {
      const callUsers = (await query('SELECT id FROM profiles WHERE is_admin = 0 LIMIT 10')).map(r => r.id);
      if (callUsers.length >= 2) {
        const callTypes = ['voice', 'video'];
        const callStatuses = ['missed', 'incoming', 'outgoing', 'incoming', 'outgoing'];
        const hoursAgo = [1, 3, 6, 12, 24, 36, 48, 72];
        for (let i = 0; i < 15; i++) {
          const callerIdx = i % callUsers.length;
          const receiverIdx = (i + 1) % callUsers.length;
          if (callUsers[callerIdx] === callUsers[receiverIdx]) continue;
          const hours = hoursAgo[i % hoursAgo.length];
          const type = callTypes[i % 2];
          const status = callStatuses[i % callStatuses.length];
          const duration = status === 'missed' ? 0 : Math.floor(Math.random() * 600) + 30;
          const createdAt = new Date(Date.now() - hours * 3600000).toISOString().replace('T', ' ').split('.')[0];
          await run('INSERT IGNORE INTO calls (id, caller_id, receiver_id, type, status, duration, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [nanoid(), callUsers[callerIdx], callUsers[receiverIdx], type, status, duration, createdAt]);
        }
        console.log('📞 Demo calls seeded');
      }
    }
  } catch (e) {
    console.error('startup error:', e.message, e.stack);
  }
});
