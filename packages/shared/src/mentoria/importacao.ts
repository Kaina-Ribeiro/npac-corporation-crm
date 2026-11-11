import { MENTORIAS, type InscricaoStatus, type Mentoria, type TipoInscricao } from './enums.js';
import { converterLegado, lista, obj, txt, type Bruto } from './legado.js';
import { linkPermitido } from './links.js';
import { nomeNormalizado } from './normalizar.js';
import { dataCalendarioValida, parseData } from './datas.js';
import type { RegistroFicha, RegistroRdv } from './json-backup.js';

/**
 * Importação da carteira (SPEC §7): junta o gerenciador antigo (`.json`) e a planilha da equipe
 * (`.xlsx`) em inscrições prontas para gravar. Lógica pura, sem zod. CPF não chega aqui: quem lê a
 * planilha já o descarta.
 */

export type RespostaForm = {
  carimbo: string | null;
  nome: string;
  apelido: string | null;
  telefone: string | null;
  email: string | null;
  instagram: string | null;
  endereco: string | null;
  conjuge: string | null;
  conjugeParticipa: boolean | null;
  sonho: string | null;
  medo: string | null;
  pulseira: string | null;
  foto: string | null;
  motivacao: string | null;
  camiseta: string | null;
  livros: string | null;
};
export type ProcessoPlanilha = {
  nome: string;
  dataInicio: string | null;
  mentoria: string | null;
  status: string | null;
};
export type CancelamentoPlanilha = { nome: string; mentoria: string | null };
export type PlanilhaLida = {
  respostas: RespostaForm[];
  processos: ProcessoPlanilha[];
  cancelamentos: CancelamentoPlanilha[];
};

export const STATUS_IMPORTACAO = ['ATIVO', 'CANCELADO', 'CONCLUIDO'] as const;
export type StatusImportacao = (typeof STATUS_IMPORTACAO)[number] & InscricaoStatus;

export type DecisoesImportacao = {
  rotulos?: Record<string, Mentoria>;
  casais?: Record<string, { pessoa1: string; pessoa2: string | null }>;
  parecidos?: Record<string, 'JUNTAR' | 'SEPARAR'>;
  status?: Record<string, StatusImportacao>;
};

export type FontesImportacao = {
  gerenciador?: { dashboard?: unknown[]; linhaDoTempo?: unknown[]; rdv?: unknown[] };
  planilha?: PlanilhaLida;
  decisoes?: DecisoesImportacao;
  /** Nomes normalizados que já têm inscrição: ficam de fora. */
  jaCadastrados?: ReadonlySet<string>;
};

export type PessoaImportada = {
  nome: string;
  apelido: string | null;
  whatsapp: string | null;
  email: string | null;
  instagram: string | null;
  profissao: string | null;
  filhosQuantidade: number | null;
  pulseira: string | null;
};

export type MomentoImportado = {
  recebeCentavos: number | null;
  temDividas: boolean | null;
  dividasCentavos: number | null;
  guardadoCentavos: number | null;
  dor: string | null;
  sonho: string | null;
};

export type InscricaoImportada = {
  chave: string;
  /** Todas as formas do nome nas fontes: reimportar qualquer uma não cria outra inscrição. */
  apelidos: string[];
  nome: string;
  tipo: TipoInscricao;
  mentoria: Mentoria | null;
  mentoriaVariante: string | null;
  /** Rótulo como veio da fonte, para agrupar os sem mentoria. */
  rotulo: string;
  status: StatusImportacao;
  dataCompra: string | null;
  dataCompraAproximada: boolean;
  inicioJornada: string | null;
  linkPasta: string | null;
  endereco: string | null;
  pessoas: PessoaImportada[];
  momento: MomentoImportado | null;
  /** Campos do momento inicial que não viraram número e a equipe precisa completar. */
  completar: string[];
  legado: Record<string, unknown>;
};

export type CarteiraPrevia = {
  novos: InscricaoImportada[];
  naoCasados: string[];
  parecidos: [string, string][];
  rotulosSemMentoria: { rotulo: string; total: number }[];
  ignorados: string[];
};

export const SEM_ROTULO = 'Sem mentoria informada';

/** "R$ 8 mil" vira 800000; texto que não é um número limpo fica nulo. Sem ponto flutuante. */
export function valorEmCentavos(texto: string): number | null {
  const m = /^(?:r\$)?\s*(\d[\d.,]*)\s*(mil|k|milh[aã]o|milh[oõ]es)?$/i.exec(texto.trim());
  if (!m) return null;
  let numero = m[1]!;
  let inteiro: string;
  let decimal = '';
  if (numero.includes(',')) {
    if (numero.indexOf(',') !== numero.lastIndexOf(',')) return null;
    [inteiro, decimal] = numero.split(',') as [string, string];
    if (inteiro.includes('.') && !/^\d{1,3}(\.\d{3})+$/.test(inteiro)) return null;
    inteiro = inteiro.replace(/\./g, '');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(numero)) {
    inteiro = numero.replace(/\./g, '');
  } else if (numero.includes('.')) {
    numero = numero.replace(/\.$/, '');
    if (numero.indexOf('.') !== numero.lastIndexOf('.')) return null;
    [inteiro, decimal = ''] = numero.split('.') as [string, string?];
  } else {
    inteiro = numero;
  }
  if (decimal.length > 2 || !/^\d*$/.test(decimal) || !inteiro) return null;
  const centavos = Number(inteiro) * 100 + Number(decimal.padEnd(2, '0') || 0);
  const sufixo = m[2]?.toLowerCase();
  const fator = !sufixo ? 1 : sufixo === 'mil' || sufixo === 'k' ? 1_000 : 1_000_000;
  const total = centavos * fator;
  return Number.isSafeInteger(total) ? total : null;
}

/** Separa "A e B" pelo primeiro " e " (ou " & ") de fora dos parênteses. */
export function separarCasal(nome: string): { pessoa1: string; pessoa2: string | null } {
  let nivel = 0;
  for (let i = 0; i < nome.length; i += 1) {
    const c = nome[i]!;
    if (c === '(') nivel += 1;
    else if (c === ')') nivel = Math.max(0, nivel - 1);
    else if (nivel === 0) {
      const resto = nome.slice(i, i + 3).toLowerCase();
      if (resto === ' e ' || resto === ' & ') {
        const pessoa1 = nome.slice(0, i).trim();
        const pessoa2 = nome.slice(i + 3).trim();
        if (pessoa1 && pessoa2) return { pessoa1, pessoa2 };
      }
    }
  }
  return { pessoa1: nome.trim(), pessoa2: null };
}

/** "6M CASAL", "2M / 2 ENCONTROS": mentoria, variante e se é casal. Ambíguo fica sem mentoria. */
export function mentoriaDoRotulo(rotulo: string): {
  mentoria: Mentoria | null;
  variante: string | null;
  casal: boolean;
} {
  const limpo = rotulo.toUpperCase().replace(/\s+/g, ' ').trim();
  const casal = /\bCASAL\b/.test(limpo);
  const achadas = MENTORIAS.filter((m) =>
    new RegExp(`(?:^|[^0-9A-Z])${m.replace(/(\d)M/, '$1 ?M')}(?:$|[^0-9A-Z])`).test(limpo),
  );
  const mentoria = achadas.length === 1 ? achadas[0]! : null;
  let resto = limpo.replace(/\bMENTORIAS?\b/g, ' ').replace(/\bCASAL\b/g, ' ');
  if (mentoria) resto = resto.replace(new RegExp(mentoria.replace(/(\d)M/, '$1 ?M')), ' ');
  resto = resto
    .replace(/^[\s/,;-]+|[\s/,;-]+$/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\+ (\d)/g, '+$1')
    .toLocaleLowerCase('pt-BR');
  return { mentoria, variante: resto ? resto : null, casal };
}

/** Data das fontes: ISO, "AAAA-MM", "DD/MM/AAAA" ou "MM/AAAA". Sem o dia, dia 1 + aproximada. */
export function dataImportada(texto: string | null | undefined): {
  data: string | null;
  aproximada: boolean;
} {
  const s = (texto ?? '').trim();
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  if (iso) return dataCalendarioValida(iso[1]!) ? { data: iso[1]!, aproximada: false } : vazia;
  const mes = /^(\d{4})-(\d{2})$/.exec(s);
  if (mes) {
    const d = `${mes[1]}-${mes[2]}-01`;
    return dataCalendarioValida(d) ? { data: d, aproximada: true } : vazia;
  }
  const br = /^\d{1,2}\/\d{1,2}\/\d{4}/.exec(s);
  if (br) {
    const { data } = parseData(br[0]);
    return { data, aproximada: false };
  }
  if (/^\d{1,2}\/\d{4}$/.test(s)) {
    const { data } = parseData(s);
    return { data, aproximada: !!data };
  }
  return vazia;
}
const vazia = { data: null, aproximada: false };

/** Decisão por texto vindo de arquivo: "constructor" numa célula não pode achar o protótipo. */
const decisao = <T>(mapa: Record<string, T> | undefined, chave: string): T | undefined =>
  mapa && Object.hasOwn(mapa, chave) ? mapa[chave] : undefined;

/** Chave de decisão de um par parecido, igual para (a, b) e (b, a). */
export const chaveParecidos = (a: string, b: string) =>
  [nomeNormalizado(a), nomeNormalizado(b)].sort().join('|');

type Dash = {
  nome: string;
  tipo: string | null;
  tipoMentoria: string | null;
  dataEntrada: string | null;
  status: string | null;
};

type Fonte = 'dashboard' | 'linhaDoTempo' | 'rdv' | 'planilha';

type Entrada = {
  chave: string;
  nome: string;
  pessoa1: string;
  pessoa2: string | null;
  aliases: Set<string>;
  fontes: Set<Fonte>;
  respostas: RespostaForm[];
  processo?: ProcessoPlanilha;
  cancelado: boolean;
  rotuloCancelamento?: string | null;
  dash?: Dash;
  ficha?: RegistroFicha;
  rdv?: RegistroRdv;
};

const uuidFalso = (() => {
  let n = 0;
  return () => `00000000-0000-4000-8000-${String((n += 1)).padStart(12, '0')}`;
})();

const CONECTIVOS = new Set(['e', 'de', 'da', 'do', 'das', 'dos']);
const tokens = (chave: string) =>
  chave
    .replace(/[()]/g, ' ')
    .split(' ')
    .filter((t) => t && !CONECTIVOS.has(t));

/** Distância de edição, cortada: acima de `max` não interessa. */
function distancia(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let linha = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const nova = [i];
    for (let j = 1; j <= b.length; j += 1)
      nova[j] = Math.min(
        linha[j]! + 1,
        nova[j - 1]! + 1,
        linha[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    linha = nova;
  }
  return linha[b.length]!;
}

/** Mesma pessoa com grafia ou tamanho de nome diferente: "João Fictício" e "João Carlos Fictício". */
function parecem(a: string, b: string): boolean {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.length || !tb.length) return false;
  const [menor, maior] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  if (menor[0] === maior[0] && menor.every((t) => maior.includes(t))) return true;
  return Math.min(a.length, b.length) >= 6 && distancia(a, b, 2) <= 2;
}

/** Casa o cônjuge informado com o nome de outra resposta, aceitando nome mais curto. */
function casaConjuge(conjuge: string, nome: string): boolean {
  const c = tokens(nomeNormalizado(conjuge));
  const n = tokens(nomeNormalizado(nome));
  return c.length > 0 && c[0] === n[0] && c.every((t) => n.includes(t));
}

class Registro {
  private readonly indice = new Map<string, Entrada>();
  readonly entradas: Entrada[] = [];

  criar(nome: string, pessoa2: string | null): Entrada {
    const pessoa1 = pessoa2 ? separarCasal(nome).pessoa1 : nome;
    const e: Entrada = {
      chave: nomeNormalizado(nome),
      nome,
      pessoa1,
      pessoa2,
      aliases: new Set(),
      fontes: new Set(),
      respostas: [],
      cancelado: false,
    };
    this.entradas.push(e);
    this.apelidos(e);
    return e;
  }

  private apelidos(e: Entrada): void {
    const a = nomeNormalizado(e.pessoa1);
    // No casal, primeiro nome solto ("Ana") não identifica ninguém: não vira apelido da entrada.
    const completo = (n: string) => tokens(n).length >= 2;
    const nomes = [e.chave];
    if (!e.pessoa2 || completo(a)) nomes.push(a);
    if (e.pessoa2) {
      const b = nomeNormalizado(e.pessoa2);
      if (completo(b)) nomes.push(b);
      nomes.push(`${a} e ${b}`, `${b} e ${a}`);
    }
    for (const n of nomes) {
      e.aliases.add(n);
      if (!this.indice.has(n)) this.indice.set(n, e);
    }
  }

  /** Acha pela forma inteira ou por uma das pessoas de "A e B"; e completa o par se faltar. */
  achar(nome: string): Entrada | undefined {
    const inteiro = this.indice.get(nomeNormalizado(nome));
    if (inteiro) return inteiro;
    const { pessoa1, pessoa2 } = separarCasal(nome);
    if (!pessoa2) return undefined;
    const a = this.indice.get(nomeNormalizado(pessoa1));
    const b = this.indice.get(nomeNormalizado(pessoa2));
    const e = a ?? b;
    if (!e) return undefined;
    if (a && b && a !== b) {
      if (!a.pessoa2 && !b.pessoa2) this.formarCasal(a, b.pessoa1);
      this.juntar(a, b);
    } else if (!e.pessoa2) {
      this.formarCasal(e, a ? pessoa2 : pessoa1);
    }
    return e;
  }

  private formarCasal(e: Entrada, pessoa2: string): void {
    e.pessoa2 = pessoa2;
    e.nome = `${e.pessoa1} e ${pessoa2}`;
    e.chave = nomeNormalizado(e.nome);
    this.apelidos(e);
  }

  /** `b` passa para `a`; os dois nomes continuam achando a mesma entrada. */
  juntar(a: Entrada, b: Entrada): void {
    if (a === b) return;
    if (!a.pessoa2 && b.pessoa2) {
      // `b` é o casal: `a` assume as duas pessoas, com as respostas na ordem delas.
      a.pessoa1 = b.pessoa1;
      a.pessoa2 = b.pessoa2;
      a.nome = b.nome;
      a.chave = b.chave;
      a.respostas = [...b.respostas, ...a.respostas];
    } else {
      a.respostas.push(...b.respostas);
    }
    a.processo ??= b.processo;
    a.cancelado ||= b.cancelado;
    a.rotuloCancelamento ??= b.rotuloCancelamento;
    a.dash ??= b.dash;
    a.ficha ??= b.ficha;
    a.rdv ??= b.rdv;
    for (const f of b.fontes) a.fontes.add(f);
    for (const n of b.aliases) {
      a.aliases.add(n);
      this.indice.set(n, a);
    }
    this.entradas.splice(this.entradas.indexOf(b), 1);
  }

  /** Acha ou cria pelo nome; "A e B" sugere duas pessoas, salvo quando a fonte diz individual. */
  obter(nome: string, individual = false): Entrada {
    const achada = this.achar(nome);
    if (achada) return achada;
    const { pessoa2 } = individual ? { pessoa2: null } : separarCasal(nome);
    return this.criar(nome, pessoa2);
  }
}

/** Carimbo comparável: "DD/MM/AAAA hh:mm" vira "AAAA-MM-DDThh:mm"; ISO fica como está. */
function ordemCarimbo(c: string | null): string {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(.*)$/.exec(c ?? '');
  return m
    ? `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}T${m[4]!.trim()}`
    : (c ?? '');
}

function lerPlanilhaNoRegistro(r: Registro, p: PlanilhaLida): void {
  // Vale a resposta mais recente de cada pessoa; a ordem é estável entre importações.
  const porNome = new Map<string, RespostaForm>();
  for (const x of p.respostas) {
    const n = nomeNormalizado(x.nome);
    const atual = porNome.get(n);
    if (!atual || ordemCarimbo(x.carimbo) >= ordemCarimbo(atual.carimbo)) porNome.set(n, x);
  }
  const respostas = [...porNome.values()].sort(
    (a, b) =>
      ordemCarimbo(a.carimbo).localeCompare(ordemCarimbo(b.carimbo)) ||
      a.nome.localeCompare(b.nome),
  );
  const pareadas = new Set<RespostaForm>();
  for (const x of respostas) {
    if (pareadas.has(x)) continue;
    const casal = x.conjuge && x.conjugeParticipa === true;
    const par = casal
      ? respostas.find(
          (y) =>
            y !== x &&
            !pareadas.has(y) &&
            casaConjuge(x.conjuge!, y.nome) &&
            (!y.conjuge || casaConjuge(y.conjuge, x.nome)),
        )
      : undefined;
    if (par) pareadas.add(par);
    pareadas.add(x);
    const e = casal
      ? r.criar(`${x.nome} e ${par?.nome ?? x.conjuge!}`, par?.nome ?? x.conjuge!)
      : r.criar(x.nome, null);
    e.pessoa1 = x.nome;
    e.respostas = par ? [x, par] : [x];
    e.fontes.add('planilha');
  }
  for (const x of p.processos) {
    const e = r.obter(x.nome);
    e.processo = x;
    e.fontes.add('planilha');
  }
  for (const x of p.cancelamentos) {
    const e = r.obter(x.nome);
    e.cancelado = true;
    e.rotuloCancelamento = x.mentoria;
    e.fontes.add('planilha');
  }
}

function lerDashboard(dados: unknown[]): Dash[] {
  return dados.flatMap((x) => {
    const b: Bruto = obj(x);
    const nome = txt(b.nome) ?? txt(b.name);
    if (!nome) return [];
    return [
      {
        nome,
        tipo: txt(b.tipo),
        tipoMentoria: txt(b.tipoMentoria),
        dataEntrada: txt(b.dataEntrada),
        status: txt(b.status),
      },
    ];
  });
}

function lerGerenciador(r: Registro, g: NonNullable<FontesImportacao['gerenciador']>): void {
  for (const d of lerDashboard(lista(g.dashboard))) {
    const individual = /individual|solteir/i.test(d.tipo ?? '');
    const e = r.obter(d.nome, individual);
    e.dash = d;
    e.fontes.add('dashboard');
  }
  if (g.linhaDoTempo?.length) {
    const c = converterLegado('linha-do-tempo', g.linhaDoTempo, uuidFalso);
    if (c.arquivo.modulo === 'linha-do-tempo')
      for (const f of c.arquivo.registros) {
        const e = r.obter(f.nome);
        e.ficha = f;
        e.fontes.add('linhaDoTempo');
      }
  }
  if (g.rdv?.length) {
    const c = converterLegado('rdv', g.rdv, uuidFalso);
    if (c.arquivo.modulo === 'rdv')
      for (const f of c.arquivo.registros) {
        const e = r.obter(f.nome);
        e.rdv = f;
        e.fontes.add('rdv');
      }
  }
}

const SEM_DIVIDAS = /^(n[aã]o|nenhuma?|zero|sem d[ií]vidas?)\b/i;
const SEM_FILHOS = /^(n[aã]o|nenhum|zero|sem filhos?)\b/i;

function filhos(texto: string | null | undefined): number | null {
  if (!texto) return null;
  if (SEM_FILHOS.test(texto.trim())) return 0;
  const m = /^(\d{1,2})\b/.exec(texto.trim());
  const n = m ? Number(m[1]) : null;
  return n !== null && n <= 30 ? n : null;
}

function momentoDe(e: Entrada, legado: Record<string, unknown>, completar: string[]) {
  const d = e.rdv?.diagnostico ?? {};
  const originais: Record<string, string> = {};
  const dinheiro = (campo: string, texto: string | null | undefined) => {
    if (!texto) return null;
    const v = valorEmCentavos(texto);
    if (v === null) {
      originais[campo] = texto;
      completar.push(campo);
    }
    return v;
  };
  const recebeCentavos = dinheiro('recebeCentavos', d.renda_atual);
  const guardadoCentavos = dinheiro('guardadoCentavos', d.dinheiro_guardado);
  const semDividas = d.dividas ? SEM_DIVIDAS.test(d.dividas.trim()) : false;
  const dividasCentavos = semDividas ? null : dinheiro('dividasCentavos', d.dividas);
  const temDividas = semDividas ? false : dividasCentavos === null ? null : dividasCentavos > 0;
  const sonho = d.sonhos_objetivos ?? e.respostas.find((r) => r.sonho)?.sonho ?? null;
  const dor = e.respostas.find((r) => r.medo)?.medo ?? null;
  if (Object.keys(originais).length) legado.valoresOriginais = originais;
  const algum = [recebeCentavos, guardadoCentavos, dividasCentavos, temDividas, sonho, dor].some(
    (v) => v !== null,
  );
  return algum || completar.length
    ? { recebeCentavos, temDividas, dividasCentavos, guardadoCentavos, dor, sonho }
    : null;
}

function pessoaDe(nome: string, r: RespostaForm | undefined): PessoaImportada {
  return {
    nome: nome.slice(0, 200),
    apelido: r?.apelido?.slice(0, 80) ?? null,
    whatsapp: r?.telefone ?? null,
    email: r?.email ?? null,
    instagram: r?.instagram?.slice(0, 120) ?? null,
    profissao: null,
    filhosQuantidade: null,
    pulseira: r?.pulseira?.slice(0, 40) ?? null,
  };
}

/** O que a resposta traz sem tela ainda: vai para o legado. */
function extrasDe(r: RespostaForm | undefined): Record<string, string> {
  const extras: Record<string, string> = {};
  if (r?.foto) extras.linkFoto = r.foto;
  if (r?.motivacao) extras.motivacao = r.motivacao;
  if (r?.camiseta) extras.camiseta = r.camiseta;
  if (r?.livros) extras.livros = r.livros;
  return extras;
}

function finalizar(e: Entrada, d: DecisoesImportacao): InscricaoImportada {
  const legado: Record<string, unknown> = {};
  const rotulo =
    e.processo?.mentoria ??
    e.dash?.tipoMentoria ??
    e.rotuloCancelamento ??
    (e.rdv ? 'RDV' : null) ??
    SEM_ROTULO;
  const lido = mentoriaDoRotulo(rotulo === SEM_ROTULO ? '' : rotulo);
  const decidida = lido.mentoria ?? decisao(d.rotulos, rotulo) ?? null;
  if (!lido.mentoria) legado.rotuloOriginal = rotulo;

  const casalDecidido = decisao(d.casais, e.chave);
  const pessoa1 = casalDecidido?.pessoa1 ?? e.pessoa1;
  const pessoa2 = casalDecidido ? casalDecidido.pessoa2 : e.pessoa2;
  const tipo: TipoInscricao = pessoa2 ? 'CASAL' : 'INDIVIDUAL';
  // O contato acompanha a pessoa: se a decisão inverteu o casal, as respostas invertem junto.
  const trocou =
    !!casalDecidido &&
    !!e.pessoa2 &&
    nomeNormalizado(casalDecidido.pessoa1) === nomeNormalizado(e.pessoa2);
  const [r1, r2] = trocou ? [e.respostas[1], e.respostas[0]] : [e.respostas[0], e.respostas[1]];
  const pessoas = [pessoaDe(pessoa1, r1)];
  if (pessoa2) pessoas.push(pessoaDe(pessoa2, r2));

  const completar: string[] = [];
  const momento = momentoDe(e, legado, completar);
  if (lido.casal && !pessoa2) completar.push('pessoa_2');
  const trabalho = e.rdv?.diagnostico.trabalho;
  if (trabalho) {
    if (trabalho.length <= 120) pessoas[0]!.profissao = trabalho;
    else legado.trabalho = trabalho;
  }
  const qtd = filhos(e.rdv?.diagnostico.filhos);
  if (qtd !== null) pessoas[0]!.filhosQuantidade = qtd;
  else if (e.rdv?.diagnostico.filhos) legado.filhos = e.rdv.diagnostico.filhos;
  if (e.rdv?.diagnostico.idade) legado.idade = e.rdv.diagnostico.idade;
  if (e.rdv?.diagnostico.situacao_conjugal)
    legado.situacaoConjugal = e.rdv.diagnostico.situacao_conjugal;
  if (e.rdv?.diagnostico.patrimonio) legado.patrimonio = e.rdv.diagnostico.patrimonio;

  const compra = dataImportada(e.processo?.dataInicio ?? e.dash?.dataEntrada);
  const inicioJornada =
    decidida && decidida !== 'RDV' ? dataImportada(e.processo?.dataInicio).data : null;
  if (decidida && decidida !== 'RDV' && !inicioJornada) completar.push('inicioJornada');

  if (e.dash?.status) legado.statusEngajamento = e.dash.status;
  if (e.processo?.status) legado.statusPlanilha = e.processo.status;
  Object.assign(legado, extrasDe(e.respostas[0]));
  const extras2 = extrasDe(e.respostas[1]);
  if (Object.keys(extras2).length) legado.pessoa2 = extras2;
  if (e.ficha) {
    legado.antesDepois = e.ficha.campos;
    legado.notasMomentoInicial = e.ficha.notasMomentoInicial ?? null;
    legado.notasMomentoAtual = e.ficha.notasMomentoAtual ?? null;
    legado.tempoMentoria = e.ficha.tempoMentoria ?? null;
    legado.conquistas = e.ficha.conquistas;
  }
  if (e.rdv) {
    legado.eventos = e.rdv.eventos;
    legado.quadros = e.rdv.quadros;
  }
  const midias = [...(e.ficha?.midias ?? []), ...(e.rdv?.midias ?? [])];
  if (midias.length) legado.midias = midias;

  const pasta = e.rdv?.pastaUrl ?? null;
  const pastaOk = pasta && linkPermitido(pasta) ? pasta : null;
  if (pasta && !pastaOk) legado.linkPasta = pasta;

  const status: StatusImportacao =
    decisao(d.status, e.chave) ?? (e.cancelado ? 'CANCELADO' : 'ATIVO');
  return {
    chave: e.chave,
    apelidos: [...e.aliases],
    nome: pessoa2 ? `${pessoa1} e ${pessoa2}` : pessoa1,
    tipo,
    mentoria: decidida,
    mentoriaVariante: lido.variante?.slice(0, 80) ?? null,
    rotulo,
    status,
    dataCompra: compra.data,
    dataCompraAproximada: compra.aproximada,
    inicioJornada,
    linkPasta: pastaOk,
    endereco: e.respostas.find((r) => r.endereco)?.endereco ?? null,
    pessoas,
    momento,
    completar,
    legado,
  };
}

function acharParecidos(entradas: Entrada[], d: DecisoesImportacao): [string, string][] {
  const baldes = new Map<string, Entrada[]>();
  for (const e of entradas) {
    const ts = tokens(e.chave);
    const chaves = new Set([...ts, ts[0]?.slice(0, 3) ?? '']);
    for (const k of chaves) {
      if (!k) continue;
      const b = baldes.get(k) ?? [];
      b.push(e);
      baldes.set(k, b);
    }
  }
  const vistos = new Set<string>();
  const pares: [string, string][] = [];
  for (const b of baldes.values())
    for (let i = 0; i < b.length; i += 1)
      for (let j = i + 1; j < b.length; j += 1) {
        const k = chaveParecidos(b[i]!.nome, b[j]!.nome);
        if (vistos.has(k)) continue;
        vistos.add(k);
        if (decisao(d.parecidos, k) === 'SEPARAR') continue;
        if (parecem(b[i]!.chave, b[j]!.chave)) pares.push([b[i]!.nome, b[j]!.nome]);
      }
  return pares.sort((x, y) => x[0].localeCompare(y[0]));
}

/**
 * Quem chega com nome parecido com alguém já cadastrado: sem decisão aparece na prévia e entra;
 * "é a mesma pessoa" fica de fora, sem mexer no cadastro.
 */
function compararComBase(novas: Entrada[], ja: ReadonlySet<string>, d: DecisoesImportacao) {
  const baldes = new Map<string, string[]>();
  for (const nome of ja) {
    const ts = tokens(nome);
    for (const k of new Set([...ts, ts[0]?.slice(0, 3) ?? ''])) {
      if (!k) continue;
      const b = baldes.get(k) ?? [];
      b.push(nome);
      baldes.set(k, b);
    }
  }
  const pares: [string, string][] = [];
  const juntadas = new Set<Entrada>();
  for (const e of novas) {
    const ts = tokens(e.chave);
    const candidatos = new Set(
      [...ts, ts[0]?.slice(0, 3) ?? ''].flatMap((k) => baldes.get(k) ?? []),
    );
    for (const nome of candidatos) {
      if (![...e.aliases].some((a) => parecem(a, nome))) continue;
      const decidido = decisao(d.parecidos, chaveParecidos(e.nome, nome));
      if (decidido === 'SEPARAR') continue;
      if (decidido === 'JUNTAR') juntadas.add(e);
      else pares.push([e.nome, nome]);
    }
  }
  return { pares: pares.filter(([n]) => ![...juntadas].some((e) => e.nome === n)), juntadas };
}

/** Junta as fontes, aplica as decisões e separa o que entra do que fica de fora. */
export function montarCarteira(fontes: FontesImportacao): CarteiraPrevia {
  const d = fontes.decisoes ?? {};
  const r = new Registro();
  if (fontes.planilha) lerPlanilhaNoRegistro(r, fontes.planilha);
  if (fontes.gerenciador) lerGerenciador(r, fontes.gerenciador);

  for (const [k, v] of Object.entries(d.parecidos ?? {})) {
    if (v !== 'JUNTAR') continue;
    const [a, b] = k.split('|');
    const ea = r.entradas.find((e) => e.aliases.has(a!));
    const eb = r.entradas.find((e) => e.aliases.has(b!));
    if (ea && eb) r.juntar(ea, eb);
  }

  const provided = new Set<Fonte>();
  if (fontes.planilha) provided.add('planilha');
  if (fontes.gerenciador?.dashboard?.length) provided.add('dashboard');
  if (fontes.gerenciador?.linhaDoTempo?.length) provided.add('linhaDoTempo');
  if (fontes.gerenciador?.rdv?.length) provided.add('rdv');

  const ja = fontes.jaCadastrados ?? new Set<string>();
  const candidatas: Entrada[] = [];
  const ignorados: string[] = [];
  for (const e of r.entradas) {
    if ([...e.aliases].some((n) => ja.has(n))) ignorados.push(e.nome);
    else candidatas.push(e);
  }
  const base = compararComBase(candidatas, ja, d);
  const novas = candidatas.filter((e) => !base.juntadas.has(e));
  ignorados.push(...[...base.juntadas].map((e) => e.nome));

  const novos = novas.map((e) => finalizar(e, d));
  const contagem = new Map<string, number>();
  for (const n of novos) if (!n.mentoria) contagem.set(n.rotulo, (contagem.get(n.rotulo) ?? 0) + 1);

  return {
    novos,
    naoCasados:
      provided.size > 1 ? novas.filter((e) => e.fontes.size === 1).map((e) => e.nome) : [],
    parecidos: [...acharParecidos(novas, d), ...base.pares],
    rotulosSemMentoria: [...contagem]
      .map(([rotulo, total]) => ({ rotulo, total }))
      .sort((a, b) => a.rotulo.localeCompare(b.rotulo)),
    ignorados,
  };
}
