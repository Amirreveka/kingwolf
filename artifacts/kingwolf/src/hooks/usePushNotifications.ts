import { useEffect, useRef } from 'react';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

export function usePushNotifications(userId: string | null | undefined) {
  const subscribedRef = useRef(false);

  useEffect(() => {
    if (!userId || subscribedRef.current) return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

    async function setup() {
      try {
        // Register service worker
        const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        await navigator.serviceWorker.ready;

        // Ask permission
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return;

        // Get VAPID public key
        const token = localStorage.getItem('kingwolf_token');
        if (!token) return;
        const keyRes = await fetch('/api/push/vapid-key');
        if (!keyRes.ok) return;
        const { publicKey } = await keyRes.json();
        if (!publicKey) return;

        // Subscribe
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });

        const { endpoint, keys } = sub.toJSON() as any;
        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ endpoint, keys }),
        });

        subscribedRef.current = true;
      } catch (e) {
        // Silent fail — push is optional
      }
    }

    setup();
  }, [userId]);
}
