import { useEffect, useRef, useState } from 'react';
import { getOrCreateKeyPair, type E2EKeyPair } from '../lib/e2e';

export interface E2EState {
  ready:        boolean;
  keyPair:      E2EKeyPair | null;
  publicKeyRaw: string | null;
}

let _singleton: E2EKeyPair | null = null;
let _pending: Promise<E2EKeyPair> | null = null;

// Upload public key to server profile
async function uploadPublicKey(publicKeyRaw: string, token: string) {
  try {
    await fetch('/api/profile/public-key', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ public_key: publicKeyRaw }),
    });
  } catch { /* silent */ }
}

export function useE2E(userId: string | null | undefined): E2EState {
  const [state, setState] = useState<E2EState>({ ready: false, keyPair: null, publicKeyRaw: null });
  const uploadedRef = useRef(false);

  useEffect(() => {
    if (!userId) return;
    if (_singleton) {
      setState({ ready: true, keyPair: _singleton, publicKeyRaw: _singleton.publicKeyRaw });
      return;
    }
    if (!_pending) _pending = getOrCreateKeyPair();
    _pending.then(kp => {
      _singleton = kp;
      setState({ ready: true, keyPair: kp, publicKeyRaw: kp.publicKeyRaw });
      if (!uploadedRef.current) {
        uploadedRef.current = true;
        const token = localStorage.getItem('kingwolf_token');
        if (token) uploadPublicKey(kp.publicKeyRaw, token);
      }
    }).catch(() => {
      setState({ ready: false, keyPair: null, publicKeyRaw: null });
    });
  }, [userId]);

  return state;
}

// For use outside React components (e.g. supabase shim)
export async function getE2EKeyPair(): Promise<E2EKeyPair | null> {
  if (_singleton) return _singleton;
  try {
    _singleton = await getOrCreateKeyPair();
    return _singleton;
  } catch { return null; }
}
