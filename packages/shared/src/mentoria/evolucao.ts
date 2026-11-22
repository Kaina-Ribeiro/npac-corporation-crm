import { dataCalendarioValida } from './datas.js';
import { lista, obj, txt } from './legado.js';

/**
 * Aba Evolução (NPAC-57, spec 2026-11-21). Sem zod: a tela usa `topicos()` para montar as listas e a API usa
 * `legadoParaEvolucao()` na cópia única dos textos do sistema antigo.
 */

/** Campos de texto da evolução, na ordem da tela (cartões, depois os dois momentos). */
export const CAMPOS_EVOLUCAO = [
  'reservaAntes',
  'reservaHoje',
  'renda',
  'saude',
  'investimentos',
  'areaAtuacao',
  'inicialNotas',
  'atualNotas',
] as const;
export type CampoEvolucao = (typeof CAMPOS_EVOLUCAO)[number];

export const LIMITE_CAMPO_EVOLUCAO = 2000;
export const LIMITE_DESCRICAO_CONQUISTA = 500;
/** "Rótulo: texto" põe o rótulo em negrito só com 1 a 24 caracteres. */
const LIMITE_ROTULO = 24;

export type Topico = { rotulo: string | null; texto: string };

/**
 * Cada linha não vazia vira um tópico. "Rótulo: texto" (dois-pontos seguidos de espaço) separa o rótulo quando ele tem
 * de 1 a 24 caracteres e há texto depois; senão, a linha inteira é o texto. Link ("https://…") e hora ("10:30") ficam
 * como estão.
 */
export function topicos(texto: string | null | undefined): Topico[] {
  if (!texto) return [];
  return texto
    .split(/\r\n|\r|\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((linha) => {
      const m = /^([^:]*):\s+(\S.*)$/u.exec(linha);
      const rotulo = m?.[1]?.trim() ?? '';
      const tamanho = [...rotulo].length;
      if (!m || tamanho < 1 || tamanho > LIMITE_ROTULO) return { rotulo: null, texto: linha };
      return { rotulo, texto: m[2]!.trim() };
    });
}

export type EvolucaoDoLegado = {
  campos: Partial<Record<CampoEvolucao, string>>;
  conquistas: { data: string | null; descricao: string | null }[];
};

/** Pilares antigos (só o "antes") que entram nas outras anotações do Momento inicial, nessa ordem. */
const PILARES_LEGADO = [
  ['FE', 'Fé'],
  ['SAUDE', 'Saúde'],
  ['DINHEIRO', 'Dinheiro'],
  ['RELACIONAMENTOS', 'Relacionamentos'],
] as const;

/** A importação guarda DD/MM/AAAA; só um dia de calendário que existe vira data (AAAA-MM-DD). */
function dataDoLegado(v: unknown): string | null {
  const s = txt(v);
  if (!s) return null;
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  const iso = br ? `${br[3]}-${br[2]}-${br[1]}` : s;
  return dataCalendarioValida(iso) ? iso : null;
}

/**
 * Textos do sistema antigo (`mentoria_legado.dados`, já decifrado) → campos da evolução e conquistas (spec §6.4).
 * Qualquer formato estranho vira vazio, sem lançar: a cópia segue para a próxima inscrição.
 */
export function legadoParaEvolucao(legado: unknown): EvolucaoDoLegado {
  const l = obj(legado);
  const ad = obj(l.antesDepois);
  const lado = (chave: string, qual: 'antes' | 'depois') => txt(obj(ad[chave])[qual]);

  const campos: EvolucaoDoLegado['campos'] = {};
  const por = (campo: CampoEvolucao, valor: string | null) => {
    if (valor) campos[campo] = valor;
  };
  por('reservaAntes', lado('RESERVA_FINANCEIRA', 'antes'));
  por('reservaHoje', lado('RESERVA_FINANCEIRA', 'depois'));
  por('renda', lado('EVOLUCAO_RENDA', 'depois'));
  por('saude', lado('EVOLUCAO_SAUDE', 'depois'));
  por('investimentos', lado('INVESTIMENTOS_MENTORIA', 'depois'));
  por('areaAtuacao', lado('AREA_ATUACAO', 'depois'));
  const inicial = [
    txt(l.notasMomentoInicial),
    ...PILARES_LEGADO.map(([chave, rotulo]) => {
      const t = lado(chave, 'antes');
      return t ? `${rotulo}: ${t}` : null;
    }),
  ].filter((t): t is string => t !== null);
  por('inicialNotas', inicial.length ? inicial.join('\n') : null);
  por('atualNotas', txt(l.notasMomentoAtual));

  const conquistas = lista(l.conquistas)
    .filter((c) => c && typeof c === 'object' && !Array.isArray(c))
    .map((c) => {
      const o = obj(c);
      return { data: dataDoLegado(o.data), descricao: txt(o.descricao) };
    })
    .filter((c) => c.data !== null || c.descricao !== null);

  return { campos, conquistas };
}
