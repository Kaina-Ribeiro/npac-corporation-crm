import { describe, expect, it } from 'vitest';
import {
  NOVIDADES,
  ULTIMA_NOVIDADE,
  naoVistas,
  novidadeVisivel,
  novidadesPara,
  versaoNaTela,
  vistaAvanca,
  type Novidade,
  type PessoaNovidades,
} from '../src/novidades.js';

// NPAC-77: versão no rodapé e novidades por cargo.
const com = (cargo: string, head = false) => ({ area: 'COMERCIAL' as const, cargo, head });
const acomp = (cargo: string | null, head = false) => ({
  area: 'ACOMPANHAMENTO' as const,
  cargo,
  head,
});
const P = {
  diretoria: { mestre: true, areas: [] },
  head: { mestre: false, areas: [com('HEAD', true)] },
  sdr: { mestre: false, areas: [com('SDR')] },
  closer: { mestre: false, areas: [com('CLOSER')] },
  eduarda: { mestre: false, areas: [acomp('ACOMPANHAMENTO', true)] },
  acompanhamento: { mestre: false, areas: [acomp('ACOMPANHAMENTO')] },
  operacao: { mestre: false, areas: [acomp('OPERACAO')] },
  especialista: { mestre: false, areas: [acomp('ESPECIALISTA')] },
  envios: { mestre: false, areas: [acomp('ENVIOS')] },
  semPerfil: { mestre: false, areas: [acomp(null)] },
  duasAreas: { mestre: false, areas: [com('SDR'), acomp('OPERACAO')] },
} satisfies Record<string, PessoaNovidades>;

const n = (o: Partial<Novidade>): Novidade => ({
  id: 'x',
  data: '2026-11-25',
  para: ['todos'],
  tipo: 'novo',
  icone: 'versao',
  titulo: 't',
  texto: 't',
  onde: 'o',
  ...o,
});

describe('versaoNaTela', () => {
  it.each([
    ['v0.24.1-rc', '0.24.1'],
    ['v0.24.1', '0.24.1'],
    ['v0.24.3-hf-rc', '0.24.3'],
    ['v0.24.3-hf', '0.24.3'],
    ['v0.2.0-rc.3', '0.2.0'],
    ['0.25.0-rc', '0.25.0'],
    [' v1.2.3-rc ', '1.2.3'],
    [undefined, 'dev'],
    [null, 'dev'],
    ['', 'dev'],
    ['main', 'dev'],
    ['v1.2', 'dev'],
    ['v1.2.3-beta', 'dev'],
  ])('%s → %s', (tag, tela) => expect(versaoNaTela(tag)).toBe(tela));
});

describe('novidadeVisivel', () => {
  const casos: [string, Partial<Novidade>, (keyof typeof P)[]][] = [
    ['todos', { para: ['todos'] }, Object.keys(P) as (keyof typeof P)[]],
    ['comercial', { para: ['comercial'] }, ['diretoria', 'head', 'sdr', 'closer', 'duasAreas']],
    ['sdr', { para: ['sdr'] }, ['diretoria', 'head', 'sdr', 'duasAreas']],
    ['sdr só cargo SDR', { para: ['sdr'], cargos: ['SDR'] }, ['diretoria', 'sdr', 'duasAreas']],
    ['closer', { para: ['closer'] }, ['diretoria', 'head', 'closer']],
    [
      'acompanhamento',
      { para: ['acompanhamento'] },
      [
        'diretoria',
        'eduarda',
        'acompanhamento',
        'operacao',
        'especialista',
        'envios',
        'semPerfil',
        'duasAreas',
      ],
    ],
    ['acompanhamento-admin', { para: ['acompanhamento-admin'] }, ['diretoria', 'eduarda']],
    [
      'acompanhamento com perfis',
      { para: ['acompanhamento'], perfis: ['ACOMPANHAMENTO', 'OPERACAO'] },
      ['diretoria', 'eduarda', 'acompanhamento', 'operacao', 'duasAreas'],
    ],
    [
      'comercial ou acompanhamento',
      { para: ['comercial', 'acompanhamento-admin'] },
      ['diretoria', 'head', 'sdr', 'closer', 'eduarda', 'duasAreas'],
    ],
  ];
  it.each(casos)('%s', (_nome, entrada, veem) => {
    const quem = (Object.keys(P) as (keyof typeof P)[]).filter((k) =>
      novidadeVisivel(n(entrada), P[k]),
    );
    expect(quem.sort()).toEqual([...veem].sort());
  });

  it('a Diretoria vê todas as entradas do arquivo', () => {
    expect(novidadesPara(P.diretoria)).toHaveLength(NOVIDADES.length);
  });

  it('Especialista não vê o Dashboard; SDR não vê o do Acompanhamento', () => {
    const ids = (p: PessoaNovidades) => novidadesPara(p).map((x) => x.id);
    expect(ids(P.especialista)).not.toContain('npac-75-dashboard');
    expect(ids(P.eduarda)).toContain('npac-75-dashboard');
    expect(ids(P.sdr)).not.toContain('npac-75-dashboard');
    expect(ids(P.sdr)).toContain('npac-65-venda-direta');
    expect(ids(P.head)).not.toContain('npac-65-venda-direta');
    expect(ids(P.closer)).toContain('npac-68-closer-vendas');
  });
});

describe('naoVistas', () => {
  const lista = [
    n({ id: 'c', para: ['todos'] }),
    n({ id: 'b', para: ['acompanhamento'] }),
    n({ id: 'a', para: ['comercial'] }),
  ];
  it('as visíveis acima da última vista', () => {
    expect(naoVistas(P.eduarda, 'a', lista).map((x) => x.id)).toEqual(['c', 'b']);
    expect(naoVistas(P.sdr, 'a', lista).map((x) => x.id)).toEqual(['c']);
    expect(naoVistas(P.sdr, 'c', lista)).toEqual([]);
  });
  it('sem vista ou id que saiu do arquivo: nada (não despeja o histórico)', () => {
    expect(naoVistas(P.eduarda, null, lista)).toEqual([]);
    expect(naoVistas(P.eduarda, 'sumiu', lista)).toEqual([]);
  });
  it('vista na mais nova: nada', () => {
    expect(naoVistas(P.diretoria, ULTIMA_NOVIDADE)).toEqual([]);
  });
});

describe('vistaAvanca', () => {
  const [a, b] = [NOVIDADES[0]!.id, NOVIDADES[1]!.id];
  it('só avança para um id mais novo que exista', () => {
    expect(vistaAvanca(b, a)).toBe(true);
    expect(vistaAvanca(a, b)).toBe(false);
    expect(vistaAvanca(a, a)).toBe(false);
    expect(vistaAvanca(null, b)).toBe(true);
    expect(vistaAvanca('sumiu', b)).toBe(true);
    expect(vistaAvanca(b, 'nao-existe')).toBe(false);
  });
});

describe('arquivo NOVIDADES', () => {
  it('ids únicos, no formato e a mais nova é a ULTIMA_NOVIDADE', () => {
    const ids = NOVIDADES.map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(ULTIMA_NOVIDADE).toBe('npac-77-versao');
  });

  it('datas válidas, da mais nova para a mais antiga', () => {
    for (const x of NOVIDADES) {
      expect(x.data).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(x.data))).toBe(false);
    }
    const datas = NOVIDADES.map((x) => x.data);
    expect(datas).toEqual([...datas].sort().reverse());
  });

  it('textos sem e-mail nem telefone; link só interno', () => {
    for (const x of NOVIDADES) {
      const tudo = `${x.titulo} ${x.texto} ${x.onde}`;
      expect(tudo, x.id).not.toMatch(/[\w.+-]+@[\w-]+\.\w+/);
      expect(tudo, x.id).not.toMatch(/\d[\d\s().-]{7,}\d/);
      expect(x.titulo.trim(), x.id).not.toBe('');
      expect(x.texto.trim(), x.id).not.toBe('');
      if (x.href) expect(x.href, x.id).toMatch(/^\/(?!\/)[\w\-/]*$/);
      expect(x.para.length, x.id).toBeGreaterThan(0);
    }
  });
});
