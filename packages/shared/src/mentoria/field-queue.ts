/**
 * Fila de salvamento por campo do Acompanhamento (regra 2 do PDF, D5): salva ao sair do campo,
 * um envio por vez por registro, só o último valor de cada campo. A `version` de cada registro
 * vem da resposta do PATCH anterior. Em 409 a fila recarrega o registro: se ninguém mexeu no campo,
 * reaplica o valor local; se outra pessoa mudou aquele campo, avisa e não sobrescreve (SPEC, T5).
 * TS puro: sem React, sem storage (nada de dado pessoal em localStorage/sessionStorage).
 */

export type StatusFila = 'saved' | 'saving' | `queued:${number}` | 'error' | 'unsaved';

/** Erro do envio. Sem `status` (ou >= 500) = falha de rede ou servidor: tenta de novo. */
export class ErroDeEnvio extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export type FieldQueueOpts = {
  /** PATCH do registro com um campo; devolve a nova version. */
  send(key: string, patch: Record<string, unknown>, version: number): Promise<number>;
  /** Lê a version atual do registro (depois de um 409). */
  reloadVersion(key: string): Promise<number>;
  /** Lê version e valores atuais (depois de um 409); sem ele, a fila só reaplica. */
  reload?(key: string): Promise<{ version: number; valores: Record<string, unknown> }>;
  retryMs?: number;
};

const vazio = (v: unknown) => v === undefined || v === null || v === '';

/** O valor que a pessoa viu ainda é o do servidor? Vazio e nulo contam como o mesmo. */
export function resolverConflito(
  valorVisto: unknown,
  valorServidor: unknown,
): 'REAPLICAR' | 'AVISAR' {
  if (vazio(valorVisto) && vazio(valorServidor)) return 'REAPLICAR';
  return valorVisto === valorServidor ? 'REAPLICAR' : 'AVISAR';
}

// O pacote não depende de tipos de DOM nem de Node: o timer vem do ambiente.
const esperar = (ms: number) =>
  new Promise<void>((ok) =>
    (globalThis as unknown as { setTimeout(cb: () => void, ms: number): unknown }).setTimeout(
      ok,
      ms,
    ),
  );

/** Até onde o navegador aceita `fetch(..., { keepalive: true })` com folga. */
export const LIMITE_KEEPALIVE_BYTES = 60 * 1024;

type Registro = {
  version: number | null;
  campos: Map<string, unknown>;
  /** Valor que a pessoa via antes de editar, por campo ainda não confirmado. */
  vistos: Map<string, unknown>;
  emVoo: string | null;
};

const bytes = (v: unknown) => {
  const s = JSON.stringify(v) ?? '';
  let n = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }
  return n;
};

export class FieldQueue {
  private readonly regs = new Map<string, Registro>();
  private statusCbs: ((s: StatusFila) => void)[] = [];
  private conflictCbs: ((key: string) => void)[] = [];
  private errorCbs: ((key: string, campo: string, msg: string) => void)[] = [];
  private campoMudouCbs: ((key: string, campo: string, valor: unknown) => void)[] = [];
  private esperando: (() => void)[] = [];
  private erro = false;
  private naoSalvos = new Set<string>();
  private ultimo: StatusFila = 'saved';

  constructor(private readonly opts: FieldQueueOpts) {}

  private reg(key: string): Registro {
    let r = this.regs.get(key);
    if (!r) {
      r = { version: null, campos: new Map(), vistos: new Map(), emVoo: null };
      this.regs.set(key, r);
    }
    return r;
  }

  /** Version conhecida do registro (a da tela, ou a do último PATCH). */
  setVersion(key: string, version: number): void {
    this.reg(key).version = version;
  }
  version(key: string): number | null {
    return this.regs.get(key)?.version ?? null;
  }

  /**
   * Nova edição: substitui o valor pendente do mesmo campo e entra no fim da fila do registro.
   * `visto` é o valor que a pessoa via antes de editar; fica o da primeira edição não confirmada.
   */
  enqueue(key: string, campo: string, valor: unknown, ...visto: [unknown?]): void {
    const r = this.reg(key);
    if (visto.length && !r.vistos.has(campo)) r.vistos.set(campo, visto[0]);
    if (r.emVoo !== campo) r.campos.delete(campo);
    r.campos.set(campo, valor);
    this.erro = false;
    this.notificar();
    void this.bombear(key);
  }

  /** Campos ainda não confirmados pelo servidor. */
  pending(): number {
    let n = 0;
    for (const r of this.regs.values()) n += r.campos.size;
    return n;
  }
  /** Com fila pendente, a tela não recarrega a lista (nem por foco nem por `crm:invalidate`). */
  isBusy(): boolean {
    return this.pending() > 0;
  }
  naoSalvo(): boolean {
    return this.naoSalvos.size > 0;
  }

  status(): StatusFila {
    if (this.naoSalvos.size) return 'unsaved';
    const n = this.pending();
    if (n > 1) return `queued:${n}`;
    if (n === 1) return 'saving';
    return this.erro ? 'error' : 'saved';
  }

  onStatus(cb: (s: StatusFila) => void): () => void {
    this.statusCbs.push(cb);
    return () => (this.statusCbs = this.statusCbs.filter((c) => c !== cb));
  }
  onConflict(cb: (key: string) => void): () => void {
    this.conflictCbs.push(cb);
    return () => (this.conflictCbs = this.conflictCbs.filter((c) => c !== cb));
  }
  onError(cb: (key: string, campo: string, msg: string) => void): () => void {
    this.errorCbs.push(cb);
    return () => (this.errorCbs = this.errorCbs.filter((c) => c !== cb));
  }

  /** Outra pessoa mudou o campo: a edição local foi descartada e `valor` é o do servidor. */
  onCampoMudou(cb: (key: string, campo: string, valor: unknown) => void): () => void {
    this.campoMudouCbs.push(cb);
    return () => (this.campoMudouCbs = this.campoMudouCbs.filter((c) => c !== cb));
  }

  /** Resolve quando não houver mais nada pendente. */
  idle(): Promise<void> {
    if (!this.isBusy()) return Promise.resolve();
    return new Promise((r) => this.esperando.push(r));
  }

  /**
   * Aba escondida ou fechando: manda por keepalive o que cabe (até 60 KB por registro) e marca
   * o resto como "não salvo", para a tela avisar antes de sair. A fila segue normal se a aba
   * voltar; o valor repetido é idempotente.
   */
  aoEsconder(
    keepalive: (key: string, patch: Record<string, unknown>, version: number) => boolean,
  ): void {
    for (const [key, r] of this.regs) {
      if (!r.campos.size || r.version == null) continue;
      const patch: Record<string, unknown> = {};
      let total = 0;
      for (const [campo, valor] of r.campos) {
        const b = bytes(valor);
        if (total + b > LIMITE_KEEPALIVE_BYTES) {
          this.naoSalvos.add(`${key}\u0000${campo}`);
          continue;
        }
        patch[campo] = valor;
        total += b;
      }
      if (Object.keys(patch).length && !keepalive(key, patch, r.version)) {
        for (const campo of Object.keys(patch)) this.naoSalvos.add(`${key}\u0000${campo}`);
      }
    }
    this.notificar();
  }

  private notificar(): void {
    const s = this.status();
    if (s === this.ultimo && s !== 'saved') return;
    this.ultimo = s;
    for (const cb of this.statusCbs) cb(s);
    if (!this.isBusy()) for (const r of this.esperando.splice(0)) r();
  }

  /** 409: recarrega; campo que o outro mudou sai da fila e avisa, o resto é reaplicado. */
  private async aoConflitar(key: string, r: Registro, campo: string): Promise<void> {
    if (!this.opts.reload) {
      r.version = await this.opts.reloadVersion(key).catch(() => null);
      for (const cb of this.conflictCbs) cb(key);
      return;
    }
    const atual = await this.opts.reload(key).catch(() => null);
    r.version = atual?.version ?? null;
    for (const cb of this.conflictCbs) cb(key);
    if (!atual || !r.vistos.has(campo)) return;
    const servidor = atual.valores[campo];
    if (resolverConflito(r.vistos.get(campo), servidor) === 'REAPLICAR') return;
    r.campos.delete(campo);
    r.vistos.delete(campo);
    this.naoSalvos.delete(`${key}\u0000${campo}`);
    for (const cb of this.campoMudouCbs) cb(key, campo, servidor);
  }

  private async bombear(key: string): Promise<void> {
    const r = this.reg(key);
    if (r.emVoo !== null) return;
    while (r.campos.size) {
      const [campo, valor] = r.campos.entries().next().value as [string, unknown];
      r.emVoo = campo;
      try {
        if (r.version == null) r.version = await this.opts.reloadVersion(key);
        r.version = await this.opts.send(key, { [campo]: valor }, r.version);
        // Só sai da fila se ninguém editou o campo enquanto o envio estava em voo.
        if (r.campos.get(campo) === valor) {
          r.campos.delete(campo);
          r.vistos.delete(campo);
        } else if (r.vistos.has(campo)) r.vistos.set(campo, valor);
        this.naoSalvos.delete(`${key}\u0000${campo}`);
      } catch (e) {
        const st = e instanceof ErroDeEnvio ? e.status : undefined;
        if (st === 409) {
          await this.aoConflitar(key, r, campo);
        } else if (st !== undefined && st < 500) {
          r.campos.delete(campo);
          r.vistos.delete(campo);
          this.naoSalvos.delete(`${key}\u0000${campo}`);
          this.erro = true;
          for (const cb of this.errorCbs) cb(key, campo, (e as Error).message);
        } else {
          await esperar(this.opts.retryMs ?? 2000);
        }
      } finally {
        r.emVoo = null;
      }
      this.notificar();
    }
  }
}
