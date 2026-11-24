import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { expect, test } from '@playwright/test';

// Service worker dos avisos (NPAC-71, Igor 24/11/2026). No iPhone, um push que não mostra aviso faz
// o sistema cancelar a inscrição; o push do Chat com o Chat aberto não mostrava nada. Aqui o
// `public/sw.js` roda num `self` de mentira (sem navegador): o que importa é o que ele decide.

const CODIGO = readFileSync(fileURLToPath(new URL('../public/sw.js', import.meta.url)), 'utf8');

type Janela = { focused: boolean; visibilityState: string; url: string };

/** Entrega um push ao service worker e devolve os avisos que ele mostrou. */
async function entregar(opts: {
  payload: Record<string, unknown>;
  janelas: Janela[];
  /** Endereço da inscrição; `null` = sem inscrição; `'erro'` = a leitura falha. */
  inscricao: string | null | 'erro';
}): Promise<{ title: string; tag?: string }[]> {
  const ouvintes = new Map<string, (e: unknown) => void>();
  const mostrados: { title: string; tag?: string }[] = [];
  const self = {
    addEventListener: (tipo: string, fn: (e: unknown) => void) => ouvintes.set(tipo, fn),
    skipWaiting: () => undefined,
    clients: { matchAll: () => Promise.resolve(opts.janelas), claim: () => Promise.resolve() },
    registration: {
      showNotification: (title: string, o: { tag?: string }) => {
        mostrados.push({ title, tag: o.tag });
        return Promise.resolve();
      },
      pushManager: {
        getSubscription: () =>
          opts.inscricao === 'erro'
            ? Promise.reject(new Error('sem acesso'))
            : Promise.resolve(opts.inscricao ? { endpoint: opts.inscricao } : null),
      },
    },
  };
  vm.runInNewContext(CODIGO, { self, URL });
  let espera: Promise<unknown> = Promise.resolve();
  ouvintes.get('push')!({
    data: { json: () => opts.payload },
    waitUntil: (p: Promise<unknown>) => (espera = p),
  });
  await espera;
  return mostrados;
}

const CHAT = { title: 'Nova mensagem no Chat', url: '/chat', tag: 'chat' };
const NO_CHAT: Janela[] = [
  { focused: true, visibilityState: 'visible', url: 'https://crm.exemplo.com/chat' },
];
const APPLE = 'https://web.push.apple.com/QF3abc';
const GOOGLE = 'https://fcm.googleapis.com/fcm/send/abc';

test.describe('service worker dos avisos', () => {
  test('iPhone com o Chat aberto: o push do Chat mostra o aviso', async () => {
    const avisos = await entregar({ payload: CHAT, janelas: NO_CHAT, inscricao: APPLE });
    expect(avisos).toEqual([{ title: 'Nova mensagem no Chat', tag: 'chat' }]);
  });

  test('sem conseguir ler a inscrição, mostra o aviso', async () => {
    for (const inscricao of [null, 'erro'] as const)
      expect(await entregar({ payload: CHAT, janelas: NO_CHAT, inscricao })).toHaveLength(1);
  });

  test('Chrome com o Chat aberto e em foco segue sem alerta do sistema', async () => {
    expect(await entregar({ payload: CHAT, janelas: NO_CHAT, inscricao: GOOGLE })).toEqual([]);
  });

  test('Chat fechado ou outro tipo de aviso mostram em qualquer aparelho', async () => {
    const fora: Janela[] = [
      { focused: true, visibilityState: 'visible', url: 'https://crm.exemplo.com/hoje' },
    ];
    for (const inscricao of [APPLE, GOOGLE]) {
      expect(await entregar({ payload: CHAT, janelas: fora, inscricao })).toHaveLength(1);
      const lembrete = { title: 'Reunião com Ana às 15:00', url: '/hoje', tag: 'reuniao-1' };
      expect(await entregar({ payload: lembrete, janelas: NO_CHAT, inscricao })).toHaveLength(1);
    }
  });
});
