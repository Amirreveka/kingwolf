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
import { db, UPLOADS_DIR } from './db.js';
import webpush from 'web-push';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;
const HTTPS_PORT = process.env.HTTPS_PORT || 3443;
const JWT_SECRET = process.env.JWT_SECRET || (() => {
  const secretFile = path.join(__dirname, 'data', '.jwt-secret');
  if (fs.existsSync(secretFile)) return fs.readFileSync(secretFile, 'utf8').trim();
  const s = nanoid(48);
  fs.writeFileSync(secretFile, s);
  return s;
})();

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
app.use(express.json({ limit: '10mb' }));

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
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  if (password.length < 6) return res.status(400).json({ error: 'password too short' });

  const lockRow = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('signup_locked');
  if (lockRow && lockRow.value === 'true') {
    return res.status(403).json({ error: 'signup is currently disabled' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'already registered' });

  const id = nanoid();
  const hash = await bcrypt.hash(password, 10);
  // Derive username from email local-part as a sensible default
  const usernameDefault = (email.split('@')[0] || 'user').toLowerCase().replace(/[^a-z0-9_]/g, '');
  // Make sure it's unique
  let username = usernameDefault;
  let n = 0;
  while (db.prepare('SELECT id FROM profiles WHERE username = ?').get(username)) {
    n++;
    username = `${usernameDefault}${n}`;
  }

  const approvalRow = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('require_admin_approval');
  const isApproved = !(approvalRow && approvalRow.value === 'true');

  const tx = db.transaction(() => {
    db.prepare('INSERT INTO users (id, email, password_hash, raw_password) VALUES (?, ?, ?, ?)').run(id, email, hash, password);
    db.prepare(`
      INSERT INTO profiles (id, username, email, display_name, is_approved)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, username, email, username, isApproved ? 1 : 0);

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
        .run(nanoid(), u.id, 'join', id, id, 'profile', `${username} joined KingWolf`);
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
  try { db.prepare("INSERT INTO activity_log (user_id, username, action, ip) VALUES (?,?,?,?)").run(id, username, 'signup', req.ip || ''); } catch {}
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
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });

  // Rate limit
  const rl = rlCheck(req, email);
  if (!rl.allowed) {
    return res.status(429).json({ error: 'rate_limited', retryAfter: rl.retryAfter, message: `بیش از حد تلاش — ${rl.retryAfter} ثانیه دیگر دوباره امتحان کنید` });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) { rlRecordFail(req, email); return res.status(401).json({ error: 'invalid credentials' }); }
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) { rlRecordFail(req, email); return res.status(401).json({ error: 'invalid credentials' }); }

  const profile = db.prepare('SELECT * FROM profiles WHERE id = ?').get(user.id);
  if (profile && profile.is_banned) return res.status(403).json({ error: 'banned' });
  if (profile && !profile.is_admin && !profile.is_approved) {
    return res.status(403).json({ error: 'pending_approval' });
  }

  rlRecordSuccess(req, email);
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
    is_approved: !!p.is_approved,
    is_active: !!p.is_active,
    is_banned: !!p.is_banned,
    is_admin: !!p.is_admin,
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

// ===== Conversation Member Management =====
app.get('/conversations/:id/members', authMiddleware, (req, res) => {
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(req.params.id);
  if (!conv) return res.status(404).json({ error: 'not found' });
  const myRole = db.prepare('SELECT role FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(req.params.id, req.userId);
  const isMgr = myRole?.role === 'owner' || myRole?.role === 'admin' || conv.created_by === req.userId || req.profile.is_admin;
  // For channels: only admins/owners see the full member list; others see only count
  if (conv.type === 'channel' && !isMgr) {
    const count = db.prepare('SELECT COUNT(*) as n FROM conversation_members WHERE conversation_id = ?').get(req.params.id)?.n || 0;
    return res.json({ data: [], count, restricted: true });
  }
  const members = db.prepare(`
    SELECT p.*, cm.role, cm.joined_at, cm.admin_permissions, cm.title
    FROM conversation_members cm
    JOIN profiles p ON p.id = cm.user_id
    WHERE cm.conversation_id = ?
    ORDER BY CASE cm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, cm.joined_at ASC
  `).all(req.params.id);
  const count = members.length;
  return res.json({ data: members.map((m, i) => ({ ...profileToClient(m), role: m.role, joined_at: m.joined_at, admin_permissions: tryParse(m.admin_permissions, []), title: m.title })), count });
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
  const membership = db.prepare('SELECT role FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(req.params.id, req.userId);
  const isConvAdmin = membership?.role === 'admin' || conv.created_by === req.userId || req.profile.is_admin;
  if (!isConvAdmin && req.params.userId !== req.userId) return res.status(403).json({ error: 'not authorized' });
  db.prepare('DELETE FROM conversation_members WHERE conversation_id = ? AND user_id = ?').run(req.params.id, req.params.userId);
  broadcast({ event: 'DELETE', table: 'conversation_members', old: { conversation_id: req.params.id, user_id: req.params.userId } });
  return res.json({ ok: true });
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

// ===== Admin: backup (export DB data as JSON) =====
app.get('/admin/backup', authMiddleware, adminOnly, (req, res) => {
  try {
    const users = db.prepare('SELECT * FROM profiles').all();
    const conversations = db.prepare('SELECT * FROM conversations').all();
    const members = db.prepare('SELECT * FROM conversation_members').all();
    const messages = db.prepare('SELECT * FROM messages WHERE is_deleted = 0').all();
    const feedPosts = db.prepare('SELECT * FROM feed_posts WHERE is_deleted = 0').all();
    const backup = {
      version: 2,
      timestamp: new Date().toISOString(),
      data: { users, conversations, members, messages, feedPosts },
    };
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="kingwolf-backup-${Date.now()}.json"`);
    return res.json(backup);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// ===== Admin: restore backup =====
app.post('/admin/restore', authMiddleware, adminOnly, express.json({ limit: '100mb' }), (req, res) => {
  const { data } = req.body || {};
  if (!data) return res.status(400).json({ error: 'no data' });
  try {
    let added = 0;
    const tx = db.transaction(() => {
      for (const msg of (data.messages || [])) {
        const exists = db.prepare('SELECT 1 FROM messages WHERE id = ?').get(msg.id);
        if (!exists) { db.prepare('INSERT OR IGNORE INTO messages (id, conversation_id, sender_id, content, type, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(msg.id, msg.conversation_id, msg.sender_id, msg.content, msg.type || 'text', msg.created_at); added++; }
      }
    });
    tx();
    return res.json({ ok: true, added });
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
  return res.json({ ok: true, message: newMsg, content, media_url: mediaUrl });
});

// ===== Admin: reveal user password =====
app.get('/admin/password/:userId', authMiddleware, adminOnly, (req, res) => {
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
  const disk = getDiskStats('/');
  const tables = ['users','profiles','conversations','conversation_members','messages','feed_posts','app_settings','admin_access'];
  const dbStats = {};
  for (const t of tables) {
    try { dbStats[t] = db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n; } catch { dbStats[t] = 0; }
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
    const rows = db.prepare(`
      SELECT p.id, p.username, p.display_name, p.avatar_url, p.email, p.created_at,
             s.permissions, s.granted_by, s.created_at AS promoted_at
      FROM profiles p
      JOIN sub_admins s ON s.user_id = p.id
      ORDER BY s.created_at DESC
    `).all();
    res.json({ data: rows });
  } catch { res.json({ data: [] }); }
});

app.post('/admin/managers/promote', authMiddleware, adminOnly, (req, res) => {
  const masterAdmin = process.env.KW_ADMIN_USER || 'admin';
  if (req.profile.username !== masterAdmin) return res.status(403).json({ error: 'فقط مدیر اصلی می‌تواند ناظر تعیین کند' });
  const { userId, permissions } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId required' });
  try {
    const prof = db.prepare('SELECT username FROM profiles WHERE id=?').get(userId);
    if (!prof) return res.status(404).json({ error: 'کاربر یافت نشد' });
    db.prepare('INSERT OR REPLACE INTO sub_admins (user_id, username, granted_by, permissions) VALUES (?,?,?,?)').run(userId, prof.username, req.profile.username, JSON.stringify(permissions || {}));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/admin/managers/demote', authMiddleware, adminOnly, (req, res) => {
  const masterAdmin = process.env.KW_ADMIN_USER || 'admin';
  if (req.profile.username !== masterAdmin) return res.status(403).json({ error: 'فقط مدیر اصلی می‌تواند این کار را انجام دهد' });
  const { userId } = req.body;
  try {
    db.prepare('DELETE FROM sub_admins WHERE user_id=?').run(userId);
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
  const masterAdmin = process.env.KW_ADMIN_USER || 'admin';
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
  const isMaster = req.profile.username === (process.env.KW_ADMIN_USER || 'admin');
  if (!isMaster) return res.status(403).json({ error: 'مدیر اصلی فقط' });
  const sessions = db.prepare(`SELECT id, device_name, device_type, ip, last_seen, created_at, is_active FROM device_sessions WHERE user_id = ? AND is_active = 1 ORDER BY last_seen DESC`).all(req.params.userId);
  res.json({ data: sessions });
});

app.post('/admin/sessions/:sessionId/logout', authMiddleware, adminOnly, (req, res) => {
  const isMaster = req.profile.username === (process.env.KW_ADMIN_USER || 'admin');
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
    const anyAdmin = db.prepare('SELECT 1 FROM profiles WHERE is_admin = 1 LIMIT 1').get();
    if (!anyAdmin && process.env.KW_DEFAULT_ADMIN !== 'false') {
      const username = process.env.KW_ADMIN_USER || 'admin';
      const password = process.env.KW_ADMIN_PASS || 'admin1234';
      const id = nanoid();
      const hash = await bcrypt.hash(password, 10);
      const tx = db.transaction(() => {
        db.prepare('INSERT INTO users (id, email, password_hash, raw_password) VALUES (?, ?, ?, ?)').run(id, `${username}@kingwolf.internal`, hash, password);
        db.prepare('INSERT INTO profiles (id, username, email, display_name, is_approved, is_active, is_admin) VALUES (?, ?, ?, ?, 1, 1, 1)').run(id, username, `${username}@kingwolf.internal`, username);
        db.prepare('INSERT OR REPLACE INTO admin_access (username, is_active) VALUES (?, 1)').run(username);
      });
      tx();
      console.log(`🔑 Default admin: ${username} / ${password}`);
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


function broadcast(payload) {
  const data = JSON.stringify({ type: 'change', ...payload });
  for (const ws of clients) {
    if (ws.readyState === 1 && ws.subscriptions.has(payload.table)) {
      try { ws.send(data); } catch {}
    }
  }
}
