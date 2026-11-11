'use client';
import {
  ErroDeEnvio,
  FieldQueue,
  type AcaoDTO,
  type FichaDTO,
  type PlanoModeloLinha,
  type StatusFila,
} from '@npac/shared/mentoria';
import { useEffect, useState } from 'react';

/**
 * Liga a fila de salvamento (T5 do SPEC) à API. Usa `fetch` direto (não o `clientApi`) para ler o
 * status do 409. Uma fila por aba; nada vai para storage. Chaves do registro:
 * `inscricao:<id>`, `pessoa:<inscricaoId>:<pessoaId>`, `etapa:<inscricaoId>:<etapaId>`,
 * `endereco:<id>`, `momento:<id>`, `acao:<inscricaoId>:<acaoId>`, `modelo:<id>` e
 * `avaliacao:<pessoaId>:<tipo>` (esta sem version: uma coluna por envio, não colide).
 */
type Alvo = { url: string; method: 'PATCH' | 'PUT'; corpo: (v: number) => object };

function alvo(key: string): Alvo {
  const [tipo, a, b] = key.split(':');
  const comVersion = (version: number) => ({ version });
  const base = '/api/mentoria';
  switch (tipo) {
    case 'inscricao':
      return { url: `${base}/inscricoes/${a}`, method: 'PATCH', corpo: comVersion };
    case 'pessoa':
      return { url: `${base}/pessoas/${b}`, method: 'PATCH', corpo: comVersion };
    case 'endereco':
      return { url: `${base}/inscricoes/${a}/endereco`, method: 'PUT', corpo: comVersion };
    case 'momento':
      return { url: `${base}/inscricoes/${a}/momento`, method: 'PUT', corpo: comVersion };
    case 'etapa':
      return { url: `${base}/onboarding/${b}`, method: 'PATCH', corpo: comVersion };
    case 'avaliacao':
      return { url: `${base}/pessoas/${a}/avaliacoes`, method: 'PUT', corpo: () => ({ tipo: b }) };
    case 'acao':
      return { url: `${base}/acoes/${b}`, method: 'PATCH', corpo: comVersion };
    case 'modelo':
      return {
        url: `${base}/plano-modelo`,
        method: 'PUT',
        corpo: (version) => ({ id: a, version }),
      };
    default:
      throw new Error(`Registro desconhecido: ${key}`);
  }
}

async function enviar(key: string, patch: Record<string, unknown>, version: number) {
  const { url, method, corpo } = alvo(key);
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      cache: 'no-store',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...corpo(version), ...patch }),
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

/** Version e valores atuais do registro, lidos da ficha. Registro sem linha ainda: version 0. */
async function recarregar(key: string) {
  const [tipo, a, b] = key.split(':');
  if (tipo === 'avaliacao') return { version: 0, valores: {} };
  // A fila compara por igualdade: listas vão como texto, nos dois lados da comparação.
  if (tipo === 'modelo') {
    const res = await fetch('/api/mentoria/plano-modelo', { cache: 'no-store' });
    if (!res.ok) throw new ErroDeEnvio('Não foi possível recarregar', res.status);
    const l = ((await res.json()) as PlanoModeloLinha[]).find((x) => x.id === a);
    return {
      version: l?.version ?? 0,
      valores: { ...l, itens: JSON.stringify(l?.itens ?? []) } as Record<string, unknown>,
    };
  }
  if (tipo === 'acao') {
    const res = await fetch(`/api/mentoria/acoes/${b}`, { cache: 'no-store' });
    if (!res.ok) throw new ErroDeEnvio('Não foi possível recarregar', res.status);
    const x = (await res.json()) as AcaoDTO;
    return {
      version: x.version,
      valores: { ...x, itensFeitos: JSON.stringify(x.itensFeitos) } as Record<string, unknown>,
    };
  }
  const res = await fetch(`/api/mentoria/inscricoes/${a}`, { cache: 'no-store' });
  if (!res.ok) throw new ErroDeEnvio('Não foi possível recarregar', res.status);
  const ficha = (await res.json()) as FichaDTO;
  const linha =
    tipo === 'pessoa'
      ? ficha.pessoas.find((p) => p.id === b)
      : tipo === 'etapa'
        ? ficha.onboarding.find((e) => e.id === b)
        : tipo === 'endereco'
          ? ficha.endereco
          : tipo === 'momento'
            ? ficha.momento
            : ficha;
  return {
    version: linha?.version ?? 0,
    valores: (linha ?? {}) as unknown as Record<string, unknown>,
  };
}

type Ouvinte = { mudou(valor: unknown): void; erro(): void };

let fila: FieldQueue | null = null;
let avisos: ((msg: string) => void)[] = [];
const ouvintes = new Map<string, Set<Ouvinte>>();
const idCampo = (key: string, campo: string) => `${key}\u0000${campo}`;

/** Mostra um aviso no indicador de salvamento. */
export const avisar = (msg: string) => avisos.forEach((a) => a(msg));

/** A fila única da aba (criada no primeiro uso, só no navegador). */
export function filaDeSalvamento(): FieldQueue {
  if (fila) return fila;
  fila = new FieldQueue({
    send: enviar,
    reload: recarregar,
    reloadVersion: async (key) => (await recarregar(key)).version,
  });
  fila.onCampoMudou((key, campo, valor) => {
    ouvintes.get(idCampo(key, campo))?.forEach((o) => o.mudou(valor));
    avisar('Outra pessoa mudou este campo; o valor dela foi mantido.');
  });
  fila.onError((key, campo, msg) => {
    ouvintes.get(idCampo(key, campo))?.forEach((o) => o.erro());
    avisar(msg);
  });
  const q = fila;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') return;
    q.aoEsconder((key, patch, version) => {
      try {
        const { url, method, corpo } = alvo(key);
        void fetch(url, {
          method,
          keepalive: true,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ...corpo(version), ...patch }),
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

/** Salva ao sair do campo; `visto` é o valor que a pessoa via antes de editar. */
export const salvarCampo = (key: string, campo: string, valor: unknown, visto: unknown) =>
  filaDeSalvamento().enqueue(key, campo, valor, visto);

/** Version de partida do registro: a da tela, a não ser que a fila já conheça uma mais nova. */
export function registrarVersion(key: string, version: number) {
  const q = filaDeSalvamento();
  const atual = q.version(key);
  if (atual == null || version > atual) q.setVersion(key, version);
}

/** Avisa o campo quando outra pessoa o mudou ou quando o servidor recusou o valor. */
export function ouvirCampo(key: string, campo: string, o: Ouvinte): () => void {
  const id = idCampo(key, campo);
  const lista = ouvintes.get(id) ?? new Set<Ouvinte>();
  ouvintes.set(id, lista);
  lista.add(o);
  return () => {
    lista.delete(o);
    if (!lista.size) ouvintes.delete(id);
  };
}

/** Status da fila e último aviso, para o indicador "Tudo salvo". */
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
  };
}

export type { StatusFila };
