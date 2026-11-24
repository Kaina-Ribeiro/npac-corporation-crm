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

/**
 * Ligado de verdade = o navegador tem a inscrição **e** o servidor a conhece para esta pessoa. Só o
 * navegador não basta: a inscrição dele continua existindo quando o servidor apaga a linha (limpeza,
 * inscrição dada como expirada, o aparelho passou para outra pessoa), e o aparelho ficava "ligado"
 * sem receber nada e sem convite (NPAC-71). Se a consulta falhar, não insiste no convite.
 */
async function ligadoAqui(): Promise<boolean> {
  const sub = await currentSubscription();
  if (!sub) return false;
  try {
    const { known } = await clientApi<{ known: boolean }>('/api/push/subscriptions/check', 'POST', {
      endpoint: sub.endpoint,
    });
    return known;
  } catch {
    return true;
  }
}

export async function pushState(): Promise<PushState> {
  if (iosOutsideHome() && !supported()) return 'ios-home';
  if (!supported()) return iosOutsideHome() ? 'ios-home' : 'unsupported';
  const { publicKey } = await clientApi<{ publicKey: string | null }>('/api/push/key');
  if (!publicKey) return 'server-off';
  if (Notification.permission === 'denied') return 'denied';
  return (await ligadoAqui()) ? 'on' : 'off';
}

/**
 * "Agora não" no convite: esconde neste aparelho por 7 dias (cookie, nada pessoal). O `_2` é de
 * 24/11/2026 (Gabriel): os avisos de todos foram zerados e o convite voltou para todo mundo, também
 * para quem tinha adiado.
 */
const CONVITE_COOKIE = 'npac_push_convite_2';

export function adiarConvite() {
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${CONVITE_COOKIE}=1; Path=/; Max-Age=${7 * 86_400}; SameSite=Lax${secure}`;
}

/**
 * Convite para ativar: só quando dá para ligar e ainda não está ligado neste aparelho. Bloqueado no
 * navegador, sem suporte ou sem push no servidor não convida (a tela /conta/avisos explica cada caso).
 */
export async function conviteState(): Promise<'off' | 'ios-home' | null> {
  if (typeof document === 'undefined' || document.cookie.includes(`${CONVITE_COOKIE}=`))
    return null;
  const ios = iosOutsideHome();
  if (!ios && (!supported() || Notification.permission === 'denied')) return null;
  if (!ios && (await ligadoAqui())) return null;
  const { publicKey } = await clientApi<{ publicKey: string | null }>('/api/push/key');
  if (!publicKey) return null;
  return ios ? 'ios-home' : 'off';
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
