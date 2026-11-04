'use client';
import { ErroDeEnvio, FieldQueue, type StatusFila } from '@npac/shared/mentoria';
import { useEffect, useState } from 'react';

/**
 * Liga a fila de salvamento (regra 2, D5) à API. Usa `fetch` direto (não o `clientApi`) para
 * ler o status e o `code` do 409. Uma fila por aba; nada vai para storage. Chave do registro:
 * `mentorado:<id>`, `ficha:<id>` ou `rdv:<id>`. Campo com ponto vira objeto aninhado
 * (`campos.FE.antes` → `{ campos: { FE: { antes } } }`).
 */
const ROTAS: Record<string, string> = {
  mentorado: '/api/mentoria/mentorados',
  ficha: '/api/mentoria/fichas',
  rdv: '/api/mentoria/rdv',
};

function url(key: string): string {
  const [tipo, id] = key.split(':');
  const base = tipo ? ROTAS[tipo] : undefined;
  if (!base || !id) throw new Error(`Registro desconhecido: ${key}`);
  return `${base}/${id}`;
}

function aninhar(patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [campo, valor] of Object.entries(patch)) {
    const partes = campo.split('.');
    let alvo = out;
    partes.slice(0, -1).forEach((p) => {
      alvo[p] = (alvo[p] as Record<string, unknown> | undefined) ?? {};
      alvo = alvo[p] as Record<string, unknown>;
    });
    alvo[partes.at(-1)!] = valor;
  }
  return out;
}

async function enviar(key: string, patch: Record<string, unknown>, version: number) {
  let res: Response;
  try {
    res = await fetch(url(key), {
      method: 'PATCH',
      cache: 'no-store',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ version, ...aninhar(patch) }),
    });
  } catch {
    throw new ErroDeEnvio('Sem conexão');
  }
  if (res.status === 401) window.location.replace('/login');
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: unknown };
    const msg = typeof data.message === 'string' ? data.message : 'Não foi possível salvar.';
    throw new ErroDeEnvio(msg, res.status);
  }
  return ((await res.json()) as { version: number }).version;
}

async function recarregarVersion(key: string): Promise<number> {
  const res = await fetch(url(key), { cache: 'no-store' });
  if (!res.ok) throw new ErroDeEnvio('Não foi possível recarregar', res.status);
  return ((await res.json()) as { version: number }).version;
}

let fila: FieldQueue | null = null;
let avisos: ((msg: string) => void)[] = [];

/** A fila única da aba (criada no primeiro uso, só no navegador). */
export function filaDeSalvamento(): FieldQueue {
  if (fila) return fila;
  fila = new FieldQueue({ send: enviar, reloadVersion: recarregarVersion });
  fila.onConflict(() =>
    avisos.forEach((a) => a('Outra pessoa alterou este registro; sua edição foi reaplicada.')),
  );
  fila.onError((_k, _c, msg) => avisos.forEach((a) => a(msg)));
  const q = fila;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') return;
    q.aoEsconder((key, patch, version) => {
      try {
        void fetch(url(key), {
          method: 'PATCH',
          keepalive: true,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ version, ...aninhar(patch) }),
        });
        return true;
      } catch {
        return false;
      }
    });
  });
  window.addEventListener('beforeunload', (e) => {
    if (q.isBusy() || q.naoSalvo()) e.preventDefault();
  });
  return fila;
}

/** Lista do módulo só recarrega sem fila pendente (D5, D24). */
export const filaOcupada = () => fila?.isBusy() ?? false;

/**
 * Salvar ao sair do campo: `salvar(chave, campo, valor)`. A version de partida vem da tela
 * (`registrar`); as seguintes, das respostas do PATCH.
 */
export function useFieldSaver() {
  const [status, setStatus] = useState<StatusFila>('saved');
  const [aviso, setAviso] = useState('');
  useEffect(() => {
    const q = filaDeSalvamento();
    setStatus(q.status());
    const off = q.onStatus(setStatus);
    const a = (m: string) => setAviso(m);
    avisos.push(a);
    return () => {
      off();
      avisos = avisos.filter((x) => x !== a);
    };
  }, []);
  return {
    status,
    pendentes: status.startsWith('queued:') ? Number(status.slice(7)) : status === 'saving' ? 1 : 0,
    aviso,
    limparAviso: () => setAviso(''),
    registrar: (key: string, version: number) => {
      const q = filaDeSalvamento();
      const atual = q.version(key);
      if (atual == null || version > atual) q.setVersion(key, version);
    },
    /** Version mais nova que a fila conhece (para excluir sem 409 depois de editar). */
    versionDe: (key: string) => filaDeSalvamento().version(key),
    salvar: (key: string, campo: string, valor: unknown) =>
      filaDeSalvamento().enqueue(key, campo, valor),
  };
}

export type { StatusFila };
