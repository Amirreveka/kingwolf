/**
 * Drop-in Supabase-compatible shim.
 * Backs every call with our local REST + WebSocket backend.
 */

// Use a relative prefix so this works whether you're on localhost, GitHub Codespaces,
// Replit, your phone on the same Wi-Fi, or behind any reverse proxy. The frontend's
// vite.config.ts proxies `/api`, `/uploads`, and `/realtime` to the backend on :3001.
const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api';
const WS_BASE = (() => {
  if (typeof window === 'undefined') return 'ws://localhost:3001/realtime';
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/realtime`;
})();
const TOKEN_KEY = 'kingwolf_token';

function getToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
function setToken(t: string | null) {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

async function api(path: string, opts: RequestInit = {}): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(opts.headers as any) };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  let body: any = null;
  try { body = await res.json(); } catch {}
  if (!res.ok) {
    const errMsg = body?.message || body?.error || `HTTP ${res.status}`;
    // Auto-signout when server says this session was replaced by a new device login
    if (res.status === 401 && body?.error === 'session_expired') {
      setToken(null);
      _session = null;
      emitAuth('SIGNED_OUT');
    }
    return { error: { message: errMsg, status: res.status, code: body?.error, retryAfter: body?.retryAfter }, data: null };
  }
  return { data: body, error: null };
}

type AuthSession = { user: { id: string; email: string } } | null;
let _session: AuthSession = null;
const authListeners: Array<(event: string, session: AuthSession) => void> = [];

function emitAuth(event: string) {
  for (const fn of authListeners) {
    try { fn(event, _session); } catch {}
  }
}

async function refreshSession(): Promise<AuthSession> {
  if (!getToken()) { _session = null; return null; }
  const { data, error } = await api('/auth/session');
  if (error) { _session = null; setToken(null); return null; }
  _session = { user: data.user };
  return _session;
}

refreshSession();

// ===== Realtime WS =====
let ws: WebSocket | null = null;
const wsSubs: Map<string, Set<(payload: any) => void>> = new Map();
let wsConnecting = false;
let wsReconnectDelay = 1000;

function connectWs() {
  if (ws && (ws.readyState === 0 || ws.readyState === 1)) return;
  if (wsConnecting) return;
  wsConnecting = true;
  const token = getToken();
  const url = `${WS_BASE}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
  try { ws = new WebSocket(url); } catch { wsConnecting = false; return; }
  ws.onopen = () => {
    wsConnecting = false;
    wsReconnectDelay = 1000;
    for (const t of wsSubs.keys()) ws!.send(JSON.stringify({ type: 'subscribe', table: t }));
  };
  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'change' && msg.table) {
        const handlers = wsSubs.get(msg.table);
        if (handlers) {
          const payload = { eventType: msg.event, new: msg.new || null, old: msg.old || null, table: msg.table };
          handlers.forEach((h) => { try { h(payload); } catch {} });
        }
      }
    } catch {}
  };
  ws.onclose = () => {
    wsConnecting = false;
    ws = null;
    if (wsSubs.size > 0) {
      setTimeout(connectWs, wsReconnectDelay);
      wsReconnectDelay = Math.min(wsReconnectDelay * 2, 15000);
    }
  };
  ws.onerror = () => {};
}

function subscribeTable(table: string, handler: (p: any) => void) {
  let set = wsSubs.get(table);
  if (!set) { set = new Set(); wsSubs.set(table, set); }
  set.add(handler);
  connectWs();
  if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: 'subscribe', table }));
}
function unsubscribeTable(table: string, handler: (p: any) => void) {
  const set = wsSubs.get(table);
  if (!set) return;
  set.delete(handler);
  if (set.size === 0) wsSubs.delete(table);
}

class QueryBuilder {
  table: string;
  _filters: Array<{ col: string; op: string; val: any }> = [];
  _order: { col: string; ascending: boolean } | null = null;
  _limit: number | null = null;
  _single = false;
  _maybeSingle = false;
  _mode: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
  _values: any = null;
  _rows: any[] = [];
  _upsertOpts: any = {};
  _returnRep = true;

  constructor(table: string) { this.table = table; }

  select(_cols?: string, _opts?: any) {
    if (this._mode === 'select') this._mode = 'select';
    return this;
  }
  eq(col: string, val: any) { this._filters.push({ col, op: 'eq', val }); return this; }
  neq(col: string, val: any) { this._filters.push({ col, op: 'neq', val }); return this; }
  gt(col: string, val: any) { this._filters.push({ col, op: 'gt', val }); return this; }
  lt(col: string, val: any) { this._filters.push({ col, op: 'lt', val }); return this; }
  gte(col: string, val: any) { this._filters.push({ col, op: 'gte', val }); return this; }
  lte(col: string, val: any) { this._filters.push({ col, op: 'lte', val }); return this; }
  in(col: string, vals: any[]) { this._filters.push({ col, op: 'in', val: vals }); return this; }
  like(col: string, pat: string) { this._filters.push({ col, op: 'like', val: pat }); return this; }
  ilike(col: string, pat: string) { this._filters.push({ col, op: 'ilike', val: pat }); return this; }
  is(col: string, val: any) { this._filters.push({ col, op: 'is', val }); return this; }
  or(_expr: string) { return this; }
  order(col: string, opts?: { ascending?: boolean }) {
    this._order = { col, ascending: opts?.ascending !== false };
    return this;
  }
  limit(n: number) { this._limit = n; return this; }
  range(_from: number, _to: number) { return this; }
  single() { this._single = true; return this; }
  maybeSingle() { this._maybeSingle = true; return this; }

  insert(rowOrRows: any) {
    this._mode = 'insert';
    this._rows = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows];
    return this;
  }
  update(values: any) { this._mode = 'update'; this._values = values; return this; }
  delete() { this._mode = 'delete'; return this; }
  upsert(rowOrRows: any, opts: any = {}) {
    this._mode = 'upsert';
    this._rows = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows];
    this._upsertOpts = opts;
    return this;
  }

  async _exec(): Promise<{ data: any; error: any }> {
    const body: any = {};
    if (this._filters.length) body.filters = this._filters;
    if (this._order) body.order = this._order;
    if (this._limit !== null) body.limit = this._limit;
    let path = '';
    switch (this._mode) {
      case 'select':
        path = `/db/${this.table}/select`;
        if (this._single || this._maybeSingle) body.single = true;
        break;
      case 'insert':
        path = `/db/${this.table}/insert`;
        body.rows = this._rows;
        body.return = this._returnRep;
        break;
      case 'update':
        path = `/db/${this.table}/update`;
        body.values = this._values;
        break;
      case 'delete':
        path = `/db/${this.table}/delete`;
        break;
      case 'upsert':
        path = `/db/${this.table}/upsert`;
        body.rows = this._rows;
        body.onConflict = this._upsertOpts.onConflict || 'id';
        break;
    }
    const { data, error } = await api(path, { method: 'POST', body: JSON.stringify(body) });
    if (error) return { data: null, error };
    let result = data?.data ?? null;
    if ((this._mode === 'insert' || this._mode === 'upsert' || this._mode === 'update') && this._single) {
      result = Array.isArray(result) ? result[0] : result;
    }
    return { data: result, error: null };
  }

  then<T1, T2>(
    onfulfilled?: (value: { data: any; error: any }) => T1 | PromiseLike<T1>,
    onrejected?: (reason: any) => T2 | PromiseLike<T2>
  ): Promise<T1 | T2> {
    return this._exec().then(onfulfilled as any, onrejected as any);
  }
}

// ===== Client-side image down-scaling (saves bandwidth before upload). =====
async function compressImageClientSide(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  if (file.type.includes('svg') || file.type.includes('gif')) return file;
  if (file.size < 500 * 1024) return file; // skip compression for files under 500KB
  try {
    const bmp = await createImageBitmap(file);
    const max = 1920;
    let { width, height } = bmp;
    if (width > max || height > max) {
      const r = Math.min(max / width, max / height);
      width = Math.round(width * r);
      height = Math.round(height * r);
    }
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bmp, 0, 0, width, height);
    const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.92));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

const storage = {
  from(bucket: string) {
    return {
      async upload(_path: string, file: File, _opts?: any) {
        const compressed = await compressImageClientSide(file);
        const fd = new FormData();
        fd.append('file', compressed);
        const headers: Record<string, string> = {};
        const token = getToken();
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch(`${API_BASE}/storage/${bucket}/upload`, { method: 'POST', headers, body: fd });
        let body: any = null; try { body = await res.json(); } catch {}
        if (!res.ok) return { data: null, error: { message: body?.error || 'upload failed' } };
        return { data: { path: body.path }, error: null };
      },
      getPublicUrl(filename: string) {
        return { data: { publicUrl: `/uploads/${bucket}/${filename}` } };
      },
      async remove(_paths: string[]) { return { data: null, error: null }; },
    };
  },
};

class Channel {
  name: string;
  _subs: Array<{ table: string; eventFilter: string; handler: (p: any) => void; internalHandler: (p: any) => void }> = [];
  constructor(name: string) { this.name = name; }
  on(_eventStr: string, opts: any, handler: (payload: any) => void) {
    const table = opts?.table || null;
    const eventFilter = (opts?.event || '*').toUpperCase();
    // Parse Supabase-style filter like "conversation_id=eq.uuid"
    const filterStr: string | null = opts?.filter || null;
    let rowFilter: ((row: any) => boolean) | null = null;
    if (filterStr) {
      const m = filterStr.match(/^(\w+)=eq\.(.+)$/);
      if (m) {
        const col = m[1], val = m[2];
        rowFilter = (row: any) => row && String(row[col]) === String(val);
      }
    }
    if (table) {
      const internalHandler = (p: any) => {
        if (eventFilter !== '*' && p.eventType !== eventFilter) return;
        if (rowFilter) {
          const row = p.new || p.old;
          if (!rowFilter(row)) return;
        }
        handler(p);
      };
      this._subs.push({ table, eventFilter, handler, internalHandler });
    }
    return this;
  }
  subscribe(cb?: (status: string) => void) {
    for (const sub of this._subs) subscribeTable(sub.table, sub.internalHandler);
    if (cb) setTimeout(() => cb('SUBSCRIBED'), 0);
    return this;
  }
  unsubscribe() {
    for (const sub of this._subs) unsubscribeTable(sub.table, sub.internalHandler);
    this._subs = [];
  }
}

export const supabase = {
  auth: {
    async signInWithPassword({ email, password }: { email: string; password: string }) {
      const { data, error } = await api('/auth/signin', {
        method: 'POST', body: JSON.stringify({ email, password }),
      });
      if (error) return { data: null, error };
      setToken(data.access_token);
      _session = { user: data.user };
      emitAuth('SIGNED_IN');
      return { data: { user: data.user, session: _session }, error: null };
    },
    async signUp({ email, password }: { email: string; password: string }) {
      const { data, error } = await api('/auth/signup', {
        method: 'POST', body: JSON.stringify({ email, password }),
      });
      if (error) return { data: null, error };
      // Backend may include a token so a follow-up insert/upsert works without a second sign-in.
      if (data.access_token) {
        setToken(data.access_token);
        _session = { user: data.user };
        emitAuth('SIGNED_IN');
      }
      return { data: { user: data.user, session: _session }, error: null };
    },
    async signOut() {
      try { await api('/auth/signout', { method: 'POST' }); } catch {}
      setToken(null);
      _session = null;
      emitAuth('SIGNED_OUT');
      return { error: null };
    },
    async getSession() {
      if (_session) return { data: { session: _session }, error: null };
      const s = await refreshSession();
      return { data: { session: s }, error: null };
    },
    async getUser() {
      const s = _session || (await refreshSession());
      return { data: { user: s?.user || null }, error: null };
    },
    onAuthStateChange(cb: (event: string, session: AuthSession) => void) {
      authListeners.push(cb);
      setTimeout(() => cb('INITIAL_SESSION', _session), 0);
      return {
        data: {
          subscription: {
            unsubscribe: () => {
              const i = authListeners.indexOf(cb);
              if (i >= 0) authListeners.splice(i, 1);
            },
          },
        },
      };
    },
    async updateUser(values: { password?: string; email?: string }) {
      const { data, error } = await api('/auth/update', {
        method: 'POST', body: JSON.stringify(values),
      });
      if (error) return { data: null, error };
      return { data, error: null };
    },
  },

  from(table: string) { return new QueryBuilder(table); },
  storage,
  channel(name: string) { return new Channel(name); },
  removeChannel(ch: Channel | null) { if (ch) ch.unsubscribe(); },
};

export const EDGE_URL = `${API_BASE}/edge`;

export async function checkAdminAccess(username: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/admin/access/${encodeURIComponent(username)}`);
    const body = await res.json();
    return !!body.allowed;
  } catch { return false; }
}
