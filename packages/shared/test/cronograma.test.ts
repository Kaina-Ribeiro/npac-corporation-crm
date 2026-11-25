import { describe, expect, it } from 'vitest';
import {
  BLOCOS,
  BLOCO_LABEL,
  BLOCO_PLURAL,
  MODELO_PME,
  jaRecebido,
  motivoJaRecebido,
  normalizarItem,
  semCronograma,
  sugerirItens,
  type ItemBanco,
  type Recebido,
} from '../src/mentoria/cronograma.js';

// NPAC-60: cronograma do PME (desenho docs/superpowers/specs/2026-11-24-cronograma-design.md, C4–C7 e §6).

function item(id: string, bloco: ItemBanco['bloco'], ordem: number, ativo = true): ItemBanco {
  return { id, bloco, texto: `Item ${id}`, ordem, ativo };
}

function recebido(r: Partial<Recebido> & Pick<Recebido, 'itemId' | 'bloco'>): Recebido {
  return {
    pmeNumero: 1,
    resultado: 'FEITA',
    inscricaoId: 'insc-1',
    mentoria: '2M',
    propria: true,
    ...r,
  };
}

/** Banco com 4 de cada bloco, na ordem. */
const BANCO: ItemBanco[] = BLOCOS.flatMap((b) =>
  [1, 2, 3, 4, 5].map((n) => item(`${b}-${n}`, b, n)),
);

describe('rótulos e modelo', () => {
  it('5 blocos com os títulos da planilha', () => {
    expect(BLOCOS).toEqual(['EXPERIENCIA', 'DESAFIO', 'FILME', 'LIVRO', 'EAP']);
    expect(BLOCO_LABEL.EXPERIENCIA).toBe('Experiência');
    expect(BLOCO_PLURAL.FILME).toBe('Filmes');
    expect(BLOCO_PLURAL.EAP).toBe('EAP');
  });

  it('modelo do PME: 3 EAP, 1 experiência, 1 desafio, 2 filmes, 1 livro (C5)', () => {
    expect(MODELO_PME).toEqual({ EAP: 3, EXPERIENCIA: 1, DESAFIO: 1, FILME: 2, LIVRO: 1 });
  });
});

describe('normalizarItem', () => {
  it('minúsculas, sem acento, pontuação e espaços colapsados', () => {
    expect(normalizarItem('  Já LEU,  o Pacto!! ')).toBe('ja leu o pacto');
    expect(normalizarItem('Filme: "À Procura da Felicidade"')).toBe(
      'filme a procura da felicidade',
    );
    expect(normalizarItem('EAP 3 - https://youtu.be/abc')).toBe('eap 3 https youtu be abc');
  });
});

describe('semCronograma (C6)', () => {
  it('reconhece "sem cronograma" sem acento nem maiúsculas', () => {
    expect(semCronograma('2M sem Cronograma')).toBe(true);
    expect(semCronograma('RDV - SEM CRONOGRAMA')).toBe(true);
    expect(semCronograma('2M com cronograma')).toBe(false);
    expect(semCronograma(null)).toBe(false);
    expect(semCronograma('')).toBe(false);
  });
});

describe('jaRecebido (§6)', () => {
  it('tarefa e histórico contam; PLANEJADO só conta se for de outra inscrição', () => {
    expect(jaRecebido(recebido({ itemId: 'a', bloco: 'FILME' }))).toBe(true);
    expect(jaRecebido(recebido({ itemId: 'a', bloco: 'FILME', resultado: 'NAO_FEZ' }))).toBe(true);
    expect(
      jaRecebido(recebido({ itemId: 'a', bloco: 'LIVRO', resultado: 'JA_TINHA', pmeNumero: null })),
    ).toBe(true);
    expect(
      jaRecebido(recebido({ itemId: 'a', bloco: 'FILME', resultado: 'PLANEJADO', pmeNumero: 2 })),
    ).toBe(false);
    expect(
      jaRecebido(recebido({ itemId: 'a', bloco: 'FILME', resultado: 'PLANEJADO', pmeNumero: 5 })),
    ).toBe(false);
    expect(
      jaRecebido(
        recebido({
          itemId: 'a',
          bloco: 'FILME',
          resultado: 'PLANEJADO',
          pmeNumero: 5,
          propria: false,
        }),
      ),
    ).toBe(true);
  });
});

describe('motivoJaRecebido', () => {
  it('diz de qual PME ou de qual mentoria veio', () => {
    expect(motivoJaRecebido(recebido({ itemId: 'a', bloco: 'FILME', pmeNumero: 3 }))).toBe(
      'Esse item já foi do 3º PME',
    );
    expect(
      motivoJaRecebido(recebido({ itemId: 'a', bloco: 'FILME', propria: false, mentoria: 'RDV' })),
    ).toBe('Esse item já foi do RDV');
    expect(
      motivoJaRecebido(
        recebido({ itemId: 'a', bloco: 'LIVRO', resultado: 'JA_TINHA', pmeNumero: null }),
      ),
    ).toBe('A pessoa já tinha esse item antes');
  });
});

describe('sugerirItens (C4)', () => {
  it('sugere o modelo do PME na ordem do banco', () => {
    const s = sugerirItens(BANCO, [], 2, false);
    expect(s.DESAFIO.map((i) => i.id)).toEqual(['DESAFIO-1']);
    expect(s.FILME.map((i) => i.id)).toEqual(['FILME-1', 'FILME-2']);
    expect(s.EAP.map((i) => i.id)).toEqual(['EAP-1', 'EAP-2', 'EAP-3']);
    expect(s.EXPERIENCIA).toHaveLength(1);
    expect(s.LIVRO).toHaveLength(1);
  });

  it('pula o item recebido, também em outra inscrição, e o item escondido', () => {
    const banco = BANCO.map((i) => (i.id === 'FILME-2' ? { ...i, ativo: false } : i));
    const s = sugerirItens(
      banco,
      [
        recebido({ itemId: 'DESAFIO-1', bloco: 'DESAFIO', propria: false, mentoria: 'RDV' }),
        recebido({ itemId: 'FILME-1', bloco: 'FILME', resultado: 'PENDENTE' }),
      ],
      2,
      false,
    );
    expect(s.DESAFIO.map((i) => i.id)).toEqual(['DESAFIO-2']);
    expect(s.FILME.map((i) => i.id)).toEqual(['FILME-3', 'FILME-4']);
  });

  it('põe primeiro o PLANEJADO do número pedido e guarda o de outro número', () => {
    const s = sugerirItens(
      BANCO,
      [
        recebido({ itemId: 'FILME-4', bloco: 'FILME', resultado: 'PLANEJADO', pmeNumero: 2 }),
        recebido({ itemId: 'FILME-1', bloco: 'FILME', resultado: 'PLANEJADO', pmeNumero: 6 }),
      ],
      2,
      false,
    );
    expect(s.FILME.map((i) => i.id)).toEqual(['FILME-4', 'FILME-2']);
  });

  it('PLANEJADO além do modelo entra mesmo assim (veio da planilha)', () => {
    const s = sugerirItens(
      BANCO,
      [
        recebido({ itemId: 'LIVRO-3', bloco: 'LIVRO', resultado: 'PLANEJADO', pmeNumero: 4 }),
        recebido({ itemId: 'LIVRO-5', bloco: 'LIVRO', resultado: 'PLANEJADO', pmeNumero: 4 }),
      ],
      4,
      false,
    );
    expect(s.LIVRO.map((i) => i.id)).toEqual(['LIVRO-3', 'LIVRO-5']);
  });

  it('inscrição sem cronograma: tudo vazio', () => {
    const s = sugerirItens(BANCO, [], 2, true);
    for (const b of BLOCOS) expect(s[b]).toEqual([]);
  });
});
