import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { api, closeTestApp, createTestApp, owner, resetAuthState } from './helpers.js';

let app: NestFastifyApplication;
let h: ReturnType<typeof api>;
let carlaId: string;
let leoId: string;

const operacao = async () => {
  await owner`delete from mentoria_perfis where user_id = ${carlaId}`;
  await owner`insert into mentoria_perfis (user_id, perfil, admin) values (${carlaId}, 'OPERACAO', false)`;
  return h.signIn('carla@npac.com.br');
};

const inscricao = async (mentoria = 'RDV', status = 'ONBOARDING', importada = false) => {
  const [i] = await owner<{ id: string }[]>`
    insert into mentoria_inscricoes (tipo, mentoria, status, importada)
    values ('INDIVIDUAL', ${mentoria}, ${status}, ${importada}) returning id`;
  await owner`insert into mentoria_pessoas (inscricao_id, ordem, nome, nome_norm)
    values (${i!.id}, 1, 'Mentorado Fictício 70', 'mentorado ficticio 70')`;
  await owner`insert into mentoria_onboarding_etapas (inscricao_id, etapa, status)
    select ${i!.id}, e, ${importada ? 'ANTERIOR_AO_SISTEMA' : 'PENDENTE'}
    from unnest(array['BOAS_VINDAS','GRUPOS','AQUECIMENTO','PME_AQUECIMENTO','CAIXA','IDR']) e`;
  return i!.id;
};

const reuniao = async (s: string, inscricaoId: string, tipo: string, inicio: string) => {
  const r = await h.post(
    '/api/mentoria/reunioes',
    { inscricaoId, tipo, inicio, conduzidaPor: leoId },
    s,
  );
  expect(r.status, r.text).toBe(201);
  return r.body as { id: string; version: number };
};
const resultado = async (s: string, r: { id: string; version: number }, status: string) => {
  const p = await h.patch(`/api/mentoria/reunioes/${r.id}`, { version: r.version, status }, s);
  expect(p.status, p.text).toBe(200);
};
const estado = async (id: string) => {
  const [i] = await owner<
    {
      data_idr: string | null;
      inicio: string | null;
      status: string;
      etapa: string;
      acoes: number;
    }[]
  >`select to_char(i.data_idr, 'YYYY-MM-DD') as data_idr,
      to_char(i.inicio_jornada, 'YYYY-MM-DD') as inicio, i.status,
      (select e.status from mentoria_onboarding_etapas e
       where e.inscricao_id = i.id and e.etapa = 'IDR') as etapa,
      (select count(*)::int from mentoria_acoes a where a.inscricao_id = i.id) as acoes
    from mentoria_inscricoes i where i.id = ${id}`;
  return i!;
};
const acao = async (id: string, mes: number, tipo?: string) => {
  const [a] = await owner<{ status: string; itens_feitos: string[] }[]>`
    select status, itens_feitos from mentoria_acoes
    where inscricao_id = ${id} and mes = ${mes}
      and (${tipo ?? null}::text is null or reuniao_tipo = ${tipo ?? null})`;
  return a!;
};
/** `datetime-local` de Brasília de `dias` a partir de hoje, às `hora`. */
const em = async (dias: number, hora = '10:00') => {
  const [r] = await owner<{ d: string }[]>`
    select to_char((now() at time zone 'America/Sao_Paulo')::date + ${dias}::int, 'YYYY-MM-DD') as d`;
  return `${r!.d}T${hora}`;
};
const comPlano = async (mentoria: string, inicio: string) => {
  const id = await inscricao(mentoria, 'ATIVO');
  await owner`update mentoria_inscricoes set inicio_jornada = ${inicio}::date,
      termino_previsto = (${inicio}::date + interval '12 months')::date where id = ${id}`;
  await owner`select mentoria_gerar_acoes(${id}::uuid, '2020-01-01'::date)`;
  return id;
};

beforeAll(async () => {
  app = await createTestApp();
  h = api(app);
  const [c] = await owner<{ id: string }[]>`select id from "user" where username = 'carla'`;
  const [l] = await owner<{ id: string }[]>`select id from "user" where username = 'ale'`;
  carlaId = c!.id;
  leoId = l!.id;
});
afterAll(async () => {
  await owner`delete from mentoria_perfis`;
  await owner`truncate mentoria_inscricoes cascade`;
  await closeTestApp(app);
});
beforeEach(async () => {
  await resetAuthState();
  await owner`truncate mentoria_inscricoes cascade`;
  await owner`delete from mentoria_perfis`;
});

describe('IDR inicia a jornada', () => {
  it('IDR às 21h de 10/03 grava data_idr 2026-03-10', async () => {
    const s = await operacao();
    const id = await inscricao();
    await resultado(s, await reuniao(s, id, 'IDR', '2026-03-10T21:00'), 'REALIZADA');
    expect(await estado(id)).toMatchObject({ data_idr: '2026-03-10', inicio: '2026-03-10' });
  });

  it('IDR às 23h30 de 10/03 grava data_idr 2026-03-10', async () => {
    const s = await operacao();
    const id = await inscricao();
    await resultado(s, await reuniao(s, id, 'IDR', '2026-03-10T23:30'), 'REALIZADA');
    expect(await estado(id)).toMatchObject({ data_idr: '2026-03-10', inicio: '2026-03-10' });
    const [a] = await owner<{ d: string }[]>`
      select to_char(data_prevista, 'YYYY-MM-DD') as d from mentoria_acoes
      where inscricao_id = ${id} and mes = 2`;
    expect(a!.d).toBe('2026-05-05'); // mês 2 = 10/04 + 25 dias (FIM_PME)
  });

  it('IDR realizada: status ATIVO, etapa concluída, ações criadas, na mesma transação', async () => {
    const s = await operacao();
    const id = await inscricao();
    const r = await reuniao(s, id, 'IDR', await em(-1, '21:00'));
    expect((await estado(id)).etapa).toBe('ENVIADA');
    await resultado(s, r, 'REALIZADA');
    expect(await estado(id)).toMatchObject({ status: 'ATIVO', etapa: 'CONCLUIDA', acoes: 12 });
    const hist = await owner<{ tipo: string }[]>`
      select tipo from mentoria_historico where inscricao_id = ${id} order by id`;
    expect(hist.map((x) => x.tipo)).toContain('idr.realizada');
  });

  it('segunda IDR realizada não duplica ações nem muda o início', async () => {
    const s = await operacao();
    const id = await inscricao();
    await resultado(s, await reuniao(s, id, 'IDR', '2026-03-10T21:00'), 'REALIZADA');
    await resultado(s, await reuniao(s, id, 'IDR', '2026-04-02T21:00'), 'REALIZADA');
    expect(await estado(id)).toMatchObject({
      data_idr: '2026-03-10',
      inicio: '2026-03-10',
      acoes: 12,
      etapa: 'CONCLUIDA',
    });
  });

  it('IDR FALTOU deixa a etapa aberta', async () => {
    const s = await operacao();
    const id = await inscricao();
    await resultado(s, await reuniao(s, id, 'IDR', await em(-1, '21:00')), 'FALTOU');
    expect(await estado(id)).toMatchObject({
      status: 'ONBOARDING',
      etapa: 'PENDENTE',
      data_idr: null,
      acoes: 0,
    });
    const painel = await h.post('/api/mentoria/onboarding/painel', {}, s);
    expect(painel.body.idrsAAgendar).toEqual([]); // a Caixa ainda não chegou neste cenário
  });

  it('remarcar mantém a etapa enviada; excluir a agendada a devolve para agendar', async () => {
    const s = await operacao();
    const id = await inscricao();
    const r = await reuniao(s, id, 'IDR', await em(2, '21:00'));
    const nova = await h.post(
      `/api/mentoria/reunioes/${r.id}/remarcar`,
      { version: r.version, inicio: await em(3, '21:00') },
      s,
    );
    expect(nova.status, nova.text).toBe(200);
    expect((await estado(id)).etapa).toBe('ENVIADA');
    expect((await h.del(`/api/mentoria/reunioes/${nova.body.id}`, {}, s)).status).toBe(204);
    expect((await estado(id)).etapa).toBe('PENDENTE');
  });

  it('importado RDV: a IDR realizada gera as ações; as passadas nascem anteriores ao sistema', async () => {
    const s = await operacao();
    const id = await inscricao('RDV', 'ATIVO', true);
    await resultado(s, await reuniao(s, id, 'IDR', await em(-100, '21:00')), 'REALIZADA');
    const e = await estado(id);
    expect(e).toMatchObject({ status: 'ATIVO', etapa: 'ANTERIOR_AO_SISTEMA', acoes: 12 });
    const [x] = await owner<{ antes: number }[]>`
      select count(*) filter (where anterior_ao_sistema)::int as antes
      from mentoria_acoes where inscricao_id = ${id}`;
    expect(x!.antes).toBeGreaterThan(0);
  });
});

describe('reunião conclui ação', () => {
  it('reunião TRIMESTRAL_2M realizada conclui a ação do período', async () => {
    const s = await operacao();
    const id = await comPlano('2M', '2026-01-10');
    // Período do mês 4 (10/04): a reunião de 20/04 conclui a do mês 4; a do mês 1 já passou.
    await owner`update mentoria_acoes set status = 'FEITA'
      where inscricao_id = ${id} and mes = 1 and reuniao_tipo = 'TRIMESTRAL_2M'`;
    await resultado(s, await reuniao(s, id, 'TRIMESTRAL_2M', '2026-04-20T10:00'), 'REALIZADA');
    expect((await acao(id, 4, 'TRIMESTRAL_2M')).status).toBe('FEITA');
    expect((await acao(id, 7, 'TRIMESTRAL_2M')).status).toBe('PENDENTE');
  });

  it('reunião alguns dias antes da data conclui a ação que vem', async () => {
    const s = await operacao();
    const id = await comPlano('6M', '2026-01-10');
    await owner`update mentoria_acoes set status = 'FEITA' where inscricao_id = ${id} and mes = 1`;
    await resultado(s, await reuniao(s, id, 'MENSAL_6M', '2026-02-05T10:00'), 'REALIZADA');
    expect((await acao(id, 2)).status).toBe('FEITA');
  });

  it('CARTOES_MILHAS realizada conclui a ação FLEXIVEL; segunda reunião não dá erro', async () => {
    const s = await operacao();
    const id = await comPlano('RDV', '2025-11-10');
    await resultado(s, await reuniao(s, id, 'CARTOES_MILHAS', '2026-06-12T10:00'), 'REALIZADA');
    const m7 = await acao(id, 7);
    expect(m7.status).toBe('FEITA');
    expect(m7.itens_feitos).toContain('Reunião registrada');
    await resultado(s, await reuniao(s, id, 'CARTOES_MILHAS', '2026-06-20T10:00'), 'REALIZADA');
    expect((await acao(id, 7)).status).toBe('FEITA');
  });
});
