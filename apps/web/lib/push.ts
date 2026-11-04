'use client';
import { clientApi } from './client-api';

/** Estado dos avisos fora do CRM (Web Push) neste aparelho. */
export type PushState = 'unsupported' | 'ios-home' | 'denied' | 'off' | 'on' | 'server-off';

const supported = () =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;

/** iPhone/iPad só recebem avisos com o CRM aberto pela tela inicial (iOS 16.4+). */
const iosOutsideHome = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) &&
  !window.matchMedia('(display-mode: standalone)').matches;

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration('/');
  return (await reg?.pushManager.getSubscription()) ?? null;
}

export async function pushState(): Promise<PushState> {
  if (iosOutsideHome() && !supported()) return 'ios-home';
  if (!supported()) return iosOutsideHome() ? 'ios-home' : 'unsupported';
  const { publicKey } = await clientApi<{ publicKey: string | null }>('/api/push/key');
  if (!publicKey) return 'server-off';
  if (Notification.permission === 'denied') return 'denied';
  return (await currentSubscription()) ? 'on' : 'off';
}

/** Pede a permissão, inscreve o aparelho e registra na API. */
export async function enablePush(): Promise<PushState> {
  const { publicKey } = await clientApi<{ publicKey: string | null }>('/api/push/key');
  if (!publicKey) return 'server-off';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';
  const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(publicKey),
    }));
  const json = sub.toJSON();
  await clientApi('/api/push/subscriptions', 'POST', { endpoint: json.endpoint, keys: json.keys });
  return 'on';
}

/** Desliga neste aparelho (também usado ao sair do CRM). Nunca lança. */
export async function disablePush(): Promise<void> {
  try {
    if (!supported()) return;
    const sub = await currentSubscription();
    if (!sub) return;
    await clientApi('/api/push/subscriptions/remove', 'POST', { endpoint: sub.endpoint }).catch(
      () => {},
    );
    await sub.unsubscribe();
  } catch {
    // Sem push neste navegador: nada a desfazer.
  }
}
