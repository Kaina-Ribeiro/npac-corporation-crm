import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ErroDeEnvio,
  FieldQueue,
  resolverConflito,
  type StatusFila,
} from '../src/mentoria/field-queue.js';

/** Servidor falso: guarda a version de cada registro e responde como o PATCH da API. */
function servidor() {
  const versions = new Map<string, number>([['m1', 1]]);
  const gravados: { key: string; patch: Record<string, unknown>; version: number }[] = [];
  let emVoo = 0;
  let maxEmVoo = 0;
  let falhasDeRede = 0;
  const pendentes: (() => void)[] = [];
  let segurar = false;
  const send = async (key: string, patch: Record<string, unknown>, version: number) => {
    emVoo++;
    maxEmVoo = Math.max(maxEmVoo, emVoo);
    if (segurar) await new Promise<void>((r) => pendentes.push(r));
    else await Promise.resolve();
    emVoo--;
    if (falhasDeRede > 0) {
      falhasDeRede--;
      throw new ErroDeEnvio('rede');
    }
    const atual = versions.get(key) ?? 1;
    if (version !== atual) throw new ErroDeEnvio('conflito', 409);
    gravados.push({ key, patch, version });
    versions.set(key, atual + 1);
    return atual + 1;
  };
  return {
    versions,
    gravados,
    send,
    reloadVersion: async (key: string) => versions.get(key) ?? 1,
    get maxEmVoo() {
      return maxEmVoo;
    },
    falharRede: (n: number) => (falhasDeRede = n),
    segurar: (s: boolean) => (segurar = s),
    soltar: () => pendentes.splice(0).forEach((r) => r()),
  };
}

let fakeStorage: { setItem: ReturnType<typeof vi.fn>; getItem: ReturnType<typeof vi.fn> };
beforeEach(() => {
  fakeStorage = { setItem: vi.fn(), getItem: vi.fn() };
  vi.stubGlobal('localStorage', fakeStorage);
  vi.stubGlobal('sessionStorage', fakeStorage);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const fila = (s: ReturnType<typeof servidor>) => {
  const q = new FieldQueue({ send: s.send, reloadVersion: s.reloadVersion, retryMs: 1 });
  q.setVersion('m1', 1);
  return q;
};

describe('FieldQueue', () => {
  it('duas edições no mesmo campo enviam só a última', async () => {
    const s = servidor();
    const q = fila(s);
    s.segurar(true);
    q.enqueue('m1', 'nome', 'A');
    q.enqueue('m1', 'tipo', 'x');
    q.enqueue('m1', 'tipo', 'y');
    s.segurar(false);
    s.soltar();
    await q.idle();
    expect(s.gravados.map((g) => g.patch)).toEqual([{ nome: 'A' }, { tipo: 'y' }]);
  });

  it('nunca há dois envios em voo para o mesmo registro', async () => {
    const s = servidor();
    const q = fila(s);
    for (let i = 0; i < 10; i++) q.enqueue('m1', `c${i % 3}`, i);
    await q.idle();
    expect(s.maxEmVoo).toBe(1);
  });

  it('edições em campos diferentes do mesmo registro vão em ordem e nenhuma se perde', async () => {
    const s = servidor();
    const q = fila(s);
    q.enqueue('m1', 'nome', 'N');
    q.enqueue('m1', 'tipo', 'T');
    q.enqueue('m1', 'status', 'EM_RISCO');
    await q.idle();
    expect(s.gravados.map((g) => Object.keys(g.patch)[0])).toEqual(['nome', 'tipo', 'status']);
  });

  it('segunda edição no mesmo registro usa a version devolvida pelo PATCH anterior (servidor falso que incrementa version)', async () => {
    const s = servidor();
    const q = fila(s);
    q.enqueue('m1', 'nome', 'A');
    await q.idle();
    q.enqueue('m1', 'nome', 'B');
    await q.idle();
    expect(s.gravados.map((g) => g.version)).toEqual([1, 2]);
    expect(q.version('m1')).toBe(3);
  });

  it('409 recarrega a version e reaplica o valor local (último a sair vence)', async () => {
    const s = servidor();
    const q = fila(s);
    const conflitos: string[] = [];
    q.onConflict((key) => conflitos.push(key));
    s.versions.set('m1', 4); // outra sessão gravou
    q.enqueue('m1', 'nome', 'meu valor');
    await q.idle();
    expect(s.gravados).toEqual([{ key: 'm1', patch: { nome: 'meu valor' }, version: 4 }]);
    expect(conflitos).toEqual(['m1']);
  });

  it('409 causado por outra sessão reaplica o valor local e recarrega a version, mesmo com fila pendente', async () => {
    const s = servidor();
    const q = fila(s);
    s.versions.set('m1', 2);
    q.enqueue('m1', 'nome', 'A');
    q.enqueue('m1', 'tipo', 'B');
    await q.idle();
    expect(s.gravados.map((g) => [g.patch, g.version])).toEqual([
      [{ nome: 'A' }, 2],
      [{ tipo: 'B' }, 3],
    ]);
  });

  it('falha de rede mantém o item e tenta de novo', async () => {
    const s = servidor();
    const q = fila(s);
    s.falharRede(2);
    q.enqueue('m1', 'nome', 'A');
    await q.idle();
    expect(s.gravados).toHaveLength(1);
    expect(q.pending()).toBe(0);
  });

  it('pending() volta a 0 após sucesso e o status passa por fila → salvando → salvo', async () => {
    const s = servidor();
    const q = fila(s);
    const status: StatusFila[] = [];
    q.onStatus((st) => status.push(st));
    s.segurar(true);
    q.enqueue('m1', 'nome', 'A');
    q.enqueue('m1', 'tipo', 'B');
    expect(q.pending()).toBe(2);
    s.segurar(false);
    s.soltar();
    await q.idle();
    expect(q.pending()).toBe(0);
    expect(status).toContain('queued:2');
    expect(status).toContain('saving');
    expect(status.at(-1)).toBe('saved');
  });

  it('isBusy() é true enquanto há fila, e a lista não recarrega', async () => {
    const s = servidor();
    const q = fila(s);
    const recarregar = vi.fn();
    const talvezRecarregar = () => {
      if (!q.isBusy()) recarregar();
    };
    s.segurar(true);
    q.enqueue('m1', 'nome', 'A');
    expect(q.isBusy()).toBe(true);
    talvezRecarregar();
    expect(recarregar).not.toHaveBeenCalled();
    s.segurar(false);
    s.soltar();
    await q.idle();
    expect(q.isBusy()).toBe(false);
    talvezRecarregar();
    expect(recarregar).toHaveBeenCalledTimes(1);
  });

  it('a fila não grava nada em storage (spy em localStorage e sessionStorage)', async () => {
    const s = servidor();
    const q = fila(s);
    q.enqueue('m1', 'nome', 'Nome Fictício');
    await q.idle();
    q.aoEsconder(() => true);
    expect(fakeStorage.setItem).not.toHaveBeenCalled();
    expect(fakeStorage.getItem).not.toHaveBeenCalled();
  });

  it('erro de validação (400) tira o item da fila e avisa', async () => {
    const s = servidor();
    const q = new FieldQueue({
      send: async () => {
        throw new ErroDeEnvio('Dados inválidos', 400);
      },
      reloadVersion: s.reloadVersion,
      retryMs: 1,
    });
    q.setVersion('m1', 1);
    const erros: string[] = [];
    q.onError((_k, _c, msg) => erros.push(msg));
    q.enqueue('m1', 'status', 'ESFRIANDO');
    await q.idle();
    expect(q.pending()).toBe(0);
    expect(erros).toEqual(['Dados inválidos']);
    expect(q.status()).toBe('error');
  });

  describe('conflito por campo (duas pessoas na mesma ficha)', () => {
    /** Servidor com os valores do registro: outra pessoa muda um campo e sobe a version. */
    function comValores(valores: Record<string, unknown>) {
      const s = servidor();
      const q = new FieldQueue({
        send: s.send,
        reloadVersion: s.reloadVersion,
        reload: async (key) => ({ version: s.versions.get(key) ?? 1, valores }),
        retryMs: 1,
      });
      q.setVersion('m1', 1);
      return { s, q };
    }

    it('409 em campo que o outro não mudou: recarrega version e reaplica', async () => {
      const { s, q } = comValores({ nome: 'Antigo', cidade: 'Mudada pelo outro' });
      const avisos: unknown[] = [];
      q.onCampoMudou((_k, campo, v) => avisos.push([campo, v]));
      s.versions.set('m1', 2);
      q.enqueue('m1', 'nome', 'Novo', 'Antigo');
      await q.idle();
      expect(s.gravados).toEqual([{ key: 'm1', patch: { nome: 'Novo' }, version: 2 }]);
      expect(avisos).toEqual([]);
      expect(q.status()).toBe('saved');
    });

    it('409 em campo que o outro mudou: avisa e não sobrescreve', async () => {
      const { s, q } = comValores({ nome: 'Do outro' });
      const avisos: unknown[] = [];
      q.onCampoMudou((_k, campo, v) => avisos.push([campo, v]));
      s.versions.set('m1', 2);
      q.enqueue('m1', 'nome', 'Meu', 'Antigo');
      await q.idle();
      expect(s.gravados).toEqual([]);
      expect(avisos).toEqual([['nome', 'Do outro']]);
      expect(q.pending()).toBe(0);
    });

    it('segunda edição antes do envio guarda o valor visto da primeira', async () => {
      const { s, q } = comValores({ nome: 'Antigo' });
      s.segurar(true);
      q.enqueue('m1', 'tipo', 'x', null);
      q.enqueue('m1', 'nome', 'Primeiro', 'Antigo');
      q.enqueue('m1', 'nome', 'Segundo', 'Primeiro');
      s.versions.set('m1', 2);
      s.segurar(false);
      s.soltar();
      await q.idle();
      expect(s.gravados.at(-1)?.patch).toEqual({ nome: 'Segundo' });
    });

    it('campo vazio e nulo contam como o mesmo valor', () => {
      expect(resolverConflito('', null)).toBe('REAPLICAR');
      expect(resolverConflito(undefined, null)).toBe('REAPLICAR');
      expect(resolverConflito('a', 'a')).toBe('REAPLICAR');
      expect(resolverConflito(10, 20)).toBe('AVISAR');
    });
  });

  it('nota de 200 KB com aba fechada: fica "não salvo" até confirmar', async () => {
    const s = servidor();
    const q = fila(s);
    s.segurar(true);
    q.enqueue('m1', 'nome', 'curto');
    q.enqueue('m1', 'notas', 'a'.repeat(200 * 1024));
    const enviados: Record<string, unknown>[] = [];
    q.aoEsconder((_key, patch) => {
      enviados.push(patch);
      return true;
    });
    // O valor curto vai por keepalive; o grande não cabe (60 KB) e fica marcado.
    expect(enviados.map((p) => Object.keys(p)[0])).toEqual(['nome']);
    expect(q.naoSalvo()).toBe(true);
    expect(q.status()).toBe('unsaved');
    s.segurar(false);
    s.soltar();
    await q.idle();
    expect(q.naoSalvo()).toBe(false);
    expect(q.status()).toBe('saved');
  });
});
