import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { appDb, closeTestConnections, ownerSql } from '../src/testing.js';
import { withUser } from '../src/with-user.js';

const DB = 'npac_test_db';
const owner = ownerSql(DB);
const db = appDb(DB);
const ACOMP = 'mf-acomp';
const SDR = 'mf-sdr';

let pessoa: string;
let ficha: string;

async function pgError(p: Promise<unknown>): Promise<{ code?: string; message: string }> {
  try {
    await p;
  } catch (e) {
    const err = e instanceof Error && e.cause instanceof Error ? e.cause : e;
    return err as { code?: string; message: string };
  }
  throw new Error('esperava erro');
}

const como = (u: string, q: ReturnType<typeof sql>) =>
  withUser(db, u, async (tx) => (await tx.execute(q)) as unknown as Record<string, unknown>[]);
const versao = async (tabela: 'mentoria_rdv_pessoas' | 'mentoria_fichas', id: string) => {
  const [r] = await owner<
    { version: number }[]
  >`select version from ${owner(tabela)} where id = ${id}`;
  return r!.version;
};
const fila = async () =>
  (
    await owner<
      { chave_objeto: string }[]
    >`select chave_objeto from mentoria_midia_exclusao order by id`
  ).map((r) => r.chave_objeto);

beforeAll(async () => {
  await owner`delete from "user" where id in (${ACOMP}, ${SDR})`;
  await owner`insert into "user" (id, name, email, role, can_prospect, can_close) values
    (${ACOMP}, 'Acomp MF', 'acomp@mf.test', 'ACOMPANHAMENTO', false, false),
    (${SDR}, 'Sdr MF', 'sdr@mf.test', 'SDR', true, false)`;
});
beforeEach(async () => {
  await owner`truncate mentoria_mentorados, mentoria_fichas, mentoria_rdv_pessoas, mentoria_midia, mentoria_midia_exclusao cascade`;
  pessoa = randomUUID();
  ficha = randomUUID();
  await owner`insert into mentoria_rdv_pessoas (id, nome, nome_norm) values (${pessoa}, 'Mentorado Fictício 01', 'mentorado ficticio 01')`;
  await owner`insert into mentoria_fichas (id, nome, nome_norm) values (${ficha}, 'Mentorado Fictício 02', 'mentorado ficticio 02')`;
});
afterAll(async () => {
  await owner`truncate mentoria_mentorados, mentoria_fichas, mentoria_rdv_pessoas, mentoria_midia, mentoria_midia_exclusao cascade`;
  await owner`delete from "user" where id in (${ACOMP}, ${SDR})`;
  await closeTestConnections();
});

describe('funções do acompanhamento', () => {
  it('função recusa usuário sem papel (42501), mesmo chamada direta', async () => {
    const chamadas = [
      sql`select mentoria_colar_diagnostico(${pessoa}, 1, '{"idade":"x"}'::jsonb)`,
      sql`select mentoria_colar_link_pasta(${pessoa}, 1, 'https://drive.google.com/drive/folders/x')`,
      sql`select mentoria_excluir_registro('RDV_PESSOA', ${pessoa}, 1)`,
      sql`select mentoria_excluir_midia(${randomUUID()})`,
    ];
    for (const q of chamadas) expect((await pgError(como(SDR, q))).code).toBe('42501');
    // Controle: o papel do módulo chama a mesma função.
    await como(ACOMP, sql`select mentoria_colar_diagnostico(${pessoa}, 1, '{"idade":"x"}'::jsonb)`);
  });

  it('colar diagnóstico grava as chaves enviadas e incrementa version', async () => {
    const [r] = await como(
      ACOMP,
      sql`select mentoria_colar_diagnostico(${pessoa}, 1, '{"idade":"c1","renda_atual":"c2"}'::jsonb) as v`,
    );
    expect(r?.v).toBe(2);
    const [d] = await owner<{ idade: string; renda_atual: string; colado_por: string }[]>`
      select idade, renda_atual, colado_por from mentoria_rdv_diagnostico where pessoa_id = ${pessoa}`;
    expect(d).toEqual({ idade: 'c1', renda_atual: 'c2', colado_por: ACOMP });
    expect(await versao('mentoria_rdv_pessoas', pessoa)).toBe(2);
  });

  it('colar diagnóstico com 2 de 9 chaves mantém as outras 7', async () => {
    const todas = {
      idade: 'a',
      situacao_conjugal: 'b',
      filhos: 'c',
      trabalho: 'd',
      renda_atual: 'e',
      dinheiro_guardado: 'f',
      patrimonio: 'g',
      dividas: 'h',
      sonhos_objetivos: 'i',
    };
    await como(
      ACOMP,
      sql`select mentoria_colar_diagnostico(${pessoa}, 1, ${JSON.stringify(todas)}::jsonb)`,
    );
    await como(
      ACOMP,
      sql`select mentoria_colar_diagnostico(${pessoa}, 2, '{"idade":"A","dividas":"H"}'::jsonb)`,
    );
    const [d] =
      await owner`select idade, situacao_conjugal, filhos, trabalho, renda_atual, dinheiro_guardado, patrimonio, dividas, sonhos_objetivos from mentoria_rdv_diagnostico where pessoa_id = ${pessoa}`;
    expect(d).toEqual({ ...todas, idade: 'A', dividas: 'H' });
  });

  it('colar diagnóstico com chave desconhecida é recusado', async () => {
    const e = await pgError(
      como(ACOMP, sql`select mentoria_colar_diagnostico(${pessoa}, 1, '{"cpf":"x"}'::jsonb)`),
    );
    expect(e.code).toBe('22023');
  });

  it('colar diagnóstico com version antiga → VERSION_CONFLICT e nada gravado', async () => {
    const e = await pgError(
      como(ACOMP, sql`select mentoria_colar_diagnostico(${pessoa}, 7, '{"idade":"x"}'::jsonb)`),
    );
    expect(e.code).toBe('P0409');
    expect(e.message).toBe('VERSION_CONFLICT');
    const rows = await owner`select 1 from mentoria_rdv_diagnostico where pessoa_id = ${pessoa}`;
    expect(rows).toHaveLength(0);
  });

  it('colar link da pasta grava, sobe a version e recusa link fora da allowlist', async () => {
    const [r] = await como(
      ACOMP,
      sql`select mentoria_colar_link_pasta(${pessoa}, 1, 'https://drive.google.com/drive/folders/x') as v`,
    );
    expect(r?.v).toBe(2);
    const [p] = await owner<
      { pasta_url: string }[]
    >`select pasta_url from mentoria_rdv_pessoas where id = ${pessoa}`;
    expect(p?.pasta_url).toBe('https://drive.google.com/drive/folders/x');
    const e = await pgError(
      como(ACOMP, sql`select mentoria_colar_link_pasta(${pessoa}, 2, 'javascript:alert(1)')`),
    );
    expect(e.code).toBe('23514');
  });

  it('confirmar dúvida sem data é recusado', async () => {
    const duvida = randomUUID();
    await owner`insert into mentoria_rdv_duvidas (id, pessoa_id, texto) values (${duvida}, ${pessoa}, 'x')`;
    const e = await pgError(
      como(
        ACOMP,
        sql`select mentoria_confirmar_duvida(${duvida}, 1, ${randomUUID()}, 'sem data', null, 'blob', null)`,
      ),
    );
    expect(e.code).toBe('22023');
    expect(e.message).toContain('DD/MM/AAAA');
  });

  it('confirmar dúvida cria evento e marca a dúvida na mesma transação', async () => {
    const duvida = randomUUID();
    const evento = randomUUID();
    await owner`insert into mentoria_rdv_duvidas (id, pessoa_id, texto) values (${duvida}, ${pessoa}, 'x')`;
    const [r] = await como(
      ACOMP,
      sql`select mentoria_confirmar_duvida(${duvida}, 1, ${evento}, '05/03/2026', '2026-03-05', 'blob', 5) as v`,
    );
    expect(r?.v).toBe(2);
    const [ev] =
      await owner`select origem, data_texto, checklist_item, duvida_id from mentoria_rdv_eventos where id = ${evento}`;
    expect(ev).toEqual({
      origem: 'DUVIDA_CONFIRMADA',
      data_texto: '05/03/2026',
      checklist_item: 5,
      duvida_id: duvida,
    });
    const [du] =
      await owner`select status, evento_id, resolvida_por from mentoria_rdv_duvidas where id = ${duvida}`;
    expect(du).toEqual({ status: 'CONFIRMADA', evento_id: evento, resolvida_por: ACOMP });
    // Falha de um reverte o outro: checklist inválido não cria evento nem marca a dúvida.
    const outra = randomUUID();
    await owner`insert into mentoria_rdv_duvidas (id, pessoa_id, texto) values (${outra}, ${pessoa}, 'y')`;
    const e = await pgError(
      como(
        ACOMP,
        sql`select mentoria_confirmar_duvida(${outra}, 2, ${randomUUID()}, '05/03/2026', '2026-03-05', 'blob', 10)`,
      ),
    );
    expect(e.code).toBe('23514');
    const [o] = await owner`select status from mentoria_rdv_duvidas where id = ${outra}`;
    expect(o?.status).toBe('ABERTA');
    const [n] = await owner<{ n: number }[]>`select count(*)::int as n from mentoria_rdv_eventos`;
    expect(n?.n).toBe(1);
  });

  it('descartar dúvida marca DESCARTADA e não cria evento', async () => {
    const duvida = randomUUID();
    await owner`insert into mentoria_rdv_duvidas (id, pessoa_id, texto) values (${duvida}, ${pessoa}, 'x')`;
    const [r] = await como(ACOMP, sql`select mentoria_descartar_duvida(${duvida}, 1) as v`);
    expect(r?.v).toBe(2);
    const [du] = await owner`select status from mentoria_rdv_duvidas where id = ${duvida}`;
    expect(du?.status).toBe('DESCARTADA');
    const e = await pgError(como(ACOMP, sql`select mentoria_descartar_duvida(${duvida}, 2)`));
    expect(e.code).toBe('22023');
  });

  it('excluir ficha remove conquistas, campos e mídia e enfileira a chave de cada mídia', async () => {
    const conquista = randomUUID();
    await owner`insert into mentoria_conquistas (id, ficha_id, descricao) values (${conquista}, ${ficha}, 'x')`;
    await owner`insert into mentoria_ficha_campos (ficha_id, secao, chave) values (${ficha}, 'PILAR', 'FE')`;
    await owner`insert into mentoria_midia (dono_tipo, dono_id, tipo, chave_objeto, mime, tamanho_bytes) values
      ('FICHA_ANTES', ${ficha}, 'FOTO', 'k-antes', 'image/jpeg', 10),
      ('CONQUISTA', ${conquista}, 'FOTO', 'k-conquista', 'image/jpeg', 10)`;
    await owner`insert into mentoria_midia (dono_tipo, dono_id, tipo, url_video)
      values ('CONQUISTA', ${conquista}, 'LINK_VIDEO', 'https://youtu.be/x')`;
    await como(ACOMP, sql`select mentoria_excluir_registro('FICHA', ${ficha}, 1)`);
    expect(await fila()).toEqual(expect.arrayContaining(['k-antes', 'k-conquista']));
    expect(await fila()).toHaveLength(2);
    for (const t of [
      'mentoria_fichas',
      'mentoria_conquistas',
      'mentoria_ficha_campos',
      'mentoria_midia',
    ]) {
      const [n] = await owner<{ n: number }[]>`select count(*)::int as n from ${owner(t)}`;
      expect(n?.n, t).toBe(0);
    }
  });

  it('excluir pessoa do RDV enfileira mídia de perfil, eventos e quadros', async () => {
    const evento = randomUUID();
    const quadro = randomUUID();
    await owner`insert into mentoria_rdv_eventos (id, pessoa_id, data_texto, data, origem) values (${evento}, ${pessoa}, '01/01/2026', '2026-01-01', 'MANUAL')`;
    await owner`insert into mentoria_rdv_quadros (id, pessoa_id, quadro) values (${quadro}, ${pessoa}, 'IMOVEL_LEILAO')`;
    await owner`insert into mentoria_midia (dono_tipo, dono_id, tipo, chave_objeto, mime, tamanho_bytes) values
      ('RDV_PESSOA', ${pessoa}, 'FOTO', 'k-perfil', 'image/jpeg', 1),
      ('RDV_EVENTO', ${evento}, 'PDF', 'k-evento', 'application/pdf', 1),
      ('RDV_QUADRO_ITEM', ${quadro}, 'VIDEO', 'k-quadro', 'video/mp4', 1)`;
    await como(ACOMP, sql`select mentoria_excluir_registro('RDV_PESSOA', ${pessoa}, 1)`);
    expect((await fila()).sort()).toEqual(['k-evento', 'k-perfil', 'k-quadro']);
    const [n] = await owner<{ n: number }[]>`select count(*)::int as n from mentoria_rdv_eventos`;
    expect(n?.n).toBe(0);
  });

  it('excluir filho usa a version do pai e a incrementa', async () => {
    const evento = randomUUID();
    await owner`insert into mentoria_rdv_eventos (id, pessoa_id, data_texto, data, origem) values (${evento}, ${pessoa}, '01/01/2026', '2026-01-01', 'MANUAL')`;
    await owner`insert into mentoria_midia (dono_tipo, dono_id, tipo, chave_objeto, mime, tamanho_bytes) values ('RDV_EVENTO', ${evento}, 'FOTO', 'k-ev', 'image/jpeg', 1)`;
    await como(ACOMP, sql`select mentoria_excluir_registro('RDV_EVENTO', ${evento}, 1)`);
    expect(await versao('mentoria_rdv_pessoas', pessoa)).toBe(2);
    expect(await fila()).toEqual(['k-ev']);
  });

  it('excluir com version antiga → VERSION_CONFLICT', async () => {
    const e = await pgError(
      como(ACOMP, sql`select mentoria_excluir_registro('FICHA', ${ficha}, 9)`),
    );
    expect(e.code).toBe('P0409');
    const [n] = await owner<{ n: number }[]>`select count(*)::int as n from mentoria_fichas`;
    expect(n?.n).toBe(1);
  });

  it('excluir registro inexistente → P0002', async () => {
    const e = await pgError(
      como(ACOMP, sql`select mentoria_excluir_registro('FICHA', ${randomUUID()}, 1)`),
    );
    expect(e.code).toBe('P0002');
  });

  it('função recusa kind desconhecido', async () => {
    const e = await pgError(
      como(ACOMP, sql`select mentoria_excluir_registro('LEAD', ${ficha}, 1)`),
    );
    expect(e.code).toBe('22023');
  });

  it('excluir mídia apaga a linha e enfileira a chave na mesma transação', async () => {
    const [m] = await owner<
      { id: string }[]
    >`insert into mentoria_midia (dono_tipo, dono_id, tipo, chave_objeto, mime, tamanho_bytes)
      values ('FICHA_DEPOIS', ${ficha}, 'FOTO', 'k-depois', 'image/jpeg', 1) returning id`;
    await como(ACOMP, sql`select mentoria_excluir_midia(${m!.id})`);
    expect(await fila()).toEqual(['k-depois']);
    const [n] = await owner<{ n: number }[]>`select count(*)::int as n from mentoria_midia`;
    expect(n?.n).toBe(0);
  });

  it('npac_app recebe 42501 em DELETE direto de mentoria_midia', async () => {
    expect((await pgError(como(ACOMP, sql`delete from mentoria_midia`))).code).toBe('42501');
  });

  it('funções do worker recusam usuário comum e aceitam o role do worker', async () => {
    await owner`insert into mentoria_midia_exclusao (chave_objeto) values ('k-1'), ('k-2')`;
    expect(
      (await pgError(como(ACOMP, sql`select * from mentoria_midia_fila_pendente(10)`))).code,
    ).toBe('42501');
    const pendentes = await db.transaction(async (tx) => {
      await tx.execute(sql`set local role npac_media_worker`);
      return (await tx.execute(
        sql`select id, chave_objeto from mentoria_midia_fila_pendente(10)`,
      )) as unknown as {
        id: number;
        chave_objeto: string;
      }[];
    });
    expect(pendentes.map((p) => p.chave_objeto)).toEqual(['k-1', 'k-2']);
    await db.transaction(async (tx) => {
      await tx.execute(sql`set local role npac_media_worker`);
      await tx.execute(sql`select mentoria_midia_marcar_removida(${pendentes[0]!.id})`);
    });
    const [r] = await owner<
      { n: number }[]
    >`select count(*)::int as n from mentoria_midia_exclusao where removido_em is not null`;
    expect(r?.n).toBe(1);
    expect(
      (await pgError(como(ACOMP, sql`select mentoria_midia_marcar_removida(${pendentes[1]!.id})`)))
        .code,
    ).toBe('42501');
  });
});
