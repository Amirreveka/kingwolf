import Redis from 'ioredis';

let redis = null;
let _connected = false;

function getRedis() {
  if (redis) return redis;

  const url = process.env.REDIS_URL || '';
  const host = process.env.REDIS_HOST || 'localhost';
  const port = parseInt(process.env.REDIS_PORT || '6379');
  const password = process.env.REDIS_PASSWORD || undefined;

  try {
    redis = url
      ? new Redis(url, { lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 1 })
      : new Redis({ host, port, password, lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 1 });

    redis.on('connect', () => { _connected = true; console.log('✅ Redis connected'); });
    redis.on('error',   (e) => { _connected = false; /* silent — cache is optional */ });
    redis.on('close',   () => { _connected = false; });

    redis.connect().catch(() => { _connected = false; });
  } catch (e) {
    redis = null;
  }
  return redis;
}

// Default TTLs (seconds)
const TTL = {
  short:  60,
  medium: 300,
  long:   3600,
};

export async function cacheGet(key) {
  try {
    const r = getRedis();
    if (!r || !_connected) return null;
    const val = await r.get(key);
    return val ? JSON.parse(val) : null;
  } catch { return null; }
}

export async function cacheSet(key, value, ttl = TTL.medium) {
  try {
    const r = getRedis();
    if (!r || !_connected) return;
    await r.setex(key, ttl, JSON.stringify(value));
  } catch { /* silent */ }
}

export async function cacheDel(key) {
  try {
    const r = getRedis();
    if (!r || !_connected) return;
    await r.del(key);
  } catch { /* silent */ }
}

export async function cacheDelPattern(pattern) {
  try {
    const r = getRedis();
    if (!r || !_connected) return;
    const keys = await r.keys(pattern);
    if (keys.length) await r.del(...keys);
  } catch { /* silent */ }
}

export function isRedisConnected() { return _connected; }

export { TTL };

// Initialize (call on startup — non-blocking)
export function initCache() {
  getRedis();
}
