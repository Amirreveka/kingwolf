// E2E encryption using WebCrypto ECDH P-256 + AES-GCM 256
// Private key lives only in IndexedDB — never sent to server.
// Public key is uploaded to the user's profile on first use.

const DB_NAME   = 'kw_e2e_keys';
const DB_STORE  = 'keys';
const DB_VER    = 1;
const KEY_ID    = 'self';

// ── IndexedDB helpers ────────────────────────────────────────────────────────
function openKeyDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function idbGet(key: string): Promise<any> {
  const db = await openKeyDb();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(DB_STORE, 'readonly');
    const req = tx.objectStore(DB_STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function idbSet(key: string, value: any): Promise<void> {
  const db = await openKeyDb();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(DB_STORE, 'readwrite');
    const req = tx.objectStore(DB_STORE).put(value, key);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

// ── Key generation / loading ─────────────────────────────────────────────────
export interface E2EKeyPair {
  privateKey:    CryptoKey;
  publicKeyRaw:  string;  // base64url-encoded SPKI public key
}

export async function getOrCreateKeyPair(): Promise<E2EKeyPair> {
  const stored = await idbGet(KEY_ID);
  if (stored) {
    // Re-import the stored private key JWK + publicKeyRaw
    const privateKey = await crypto.subtle.importKey(
      'jwk', stored.privateKeyJwk,
      { name: 'ECDH', namedCurve: 'P-256' },
      false, ['deriveKey']
    );
    return { privateKey, publicKeyRaw: stored.publicKeyRaw };
  }

  // Generate new keypair
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey']
  );

  const privateKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
  const publicKeySpki = await crypto.subtle.exportKey('spki', keyPair.publicKey);
  const publicKeyRaw  = btoa(String.fromCharCode(...new Uint8Array(publicKeySpki)));

  await idbSet(KEY_ID, { privateKeyJwk, publicKeyRaw });
  return { privateKey: keyPair.privateKey, publicKeyRaw };
}

export async function getPublicKeyRaw(): Promise<string | null> {
  const stored = await idbGet(KEY_ID);
  return stored?.publicKeyRaw ?? null;
}

// ── Key derivation ───────────────────────────────────────────────────────────
async function deriveSharedKey(myPrivateKey: CryptoKey, theirPublicKeyRaw: string): Promise<CryptoKey> {
  const spki = Uint8Array.from(atob(theirPublicKeyRaw), c => c.charCodeAt(0));
  const theirPublicKey = await crypto.subtle.importKey(
    'spki', spki,
    { name: 'ECDH', namedCurve: 'P-256' },
    false, []
  );
  return crypto.subtle.deriveKey(
    { name: 'ECDH', public: theirPublicKey },
    myPrivateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// ── Encrypt ──────────────────────────────────────────────────────────────────
// Returns a compact string: base64(iv) + '.' + base64(ciphertext)
export async function encryptMessage(
  plaintext: string,
  myPrivateKey: CryptoKey,
  theirPublicKeyRaw: string
): Promise<string> {
  const sharedKey = await deriveSharedKey(myPrivateKey, theirPublicKeyRaw);
  const iv        = crypto.getRandomValues(new Uint8Array(12));
  const encoded   = new TextEncoder().encode(plaintext);
  const cipher    = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, sharedKey, encoded);

  const ivB64     = btoa(String.fromCharCode(...iv));
  const cipherB64 = btoa(String.fromCharCode(...new Uint8Array(cipher)));
  return `e2e:${ivB64}.${cipherB64}`;
}

// ── Decrypt ──────────────────────────────────────────────────────────────────
export async function decryptMessage(
  ciphertext: string,
  myPrivateKey: CryptoKey,
  theirPublicKeyRaw: string
): Promise<string> {
  if (!ciphertext.startsWith('e2e:')) return ciphertext; // not encrypted
  const [ivB64, cipherB64] = ciphertext.slice(4).split('.');
  if (!ivB64 || !cipherB64) return ciphertext;

  const iv        = Uint8Array.from(atob(ivB64), c => c.charCodeAt(0));
  const cipher    = Uint8Array.from(atob(cipherB64), c => c.charCodeAt(0));
  const sharedKey = await deriveSharedKey(myPrivateKey, theirPublicKeyRaw);

  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, sharedKey, cipher);
  return new TextDecoder().decode(plain);
}

export function isEncrypted(content: string): boolean {
  return typeof content === 'string' && content.startsWith('e2e:');
}
