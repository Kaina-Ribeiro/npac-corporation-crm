import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { ETAPAS, type FichaDTO, type HistoricoItem, type PainelOnboarding } from '@npac/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { api, closeTestApp, createTestApp, owner, resetAuthState } from './helpers.js';

// NPAC-75 (Duda, 24/11/2026, "1A, 2B, 3C, 4B" + opção A): engajamento marcado à mão na ficha; o Dashboard (antigo
// Onboarding) soma. Marcam Admin e Acompanhamento; Operação só vê; Especialista não vê; "só a carteira" vê a dela.
let app: NestFastifyApplication;
let h: ReturnType<typeof api>;
let carla = '';

const comoPerfil = async (perfil: string, admin = false) => {
  await owner`delete from mentoria_perfis where user_id = ${carla}`;
  await owner`insert into mentoria_perfis (user_id, perfil, admin) values (${carla}, ${perfil}, ${admin})`;
  return h.signIn('carla@npac.com.br');
};

const inscricao = async (
  n: number,
  o: { status?: string; mentoria?: string; variante?: string | null; resp?: string | null } = {},
) => {
  const [i] = await owner<{ id: string }[]>`
    insert into mentoria_inscricoes (tipo, mentoria, mentoria_variante, status, inicio_jornada, termino_previsto,
      responsavel_id)
    values ('INDIVIDUAL', ${o.mentoria ?? '2M'}, ${o.variante ?? null}, ${o.status ?? 'ATIVO'}, current_date - 60,
      current_date + 300, ${o.resp ?? null}) returning id`;
  await owner`insert into mentoria_pessoas (inscricao_id, ordem, nome, nome_norm)
    values (${i!.id}, 1, ${`Mentorado Fictício G${n}`}, ${`mentorado ficticio g${n}`})`;
  return i!.id;
};

const ficha = async (s: string, insc: string) => {
  const r = await h.get(`/api/mentoria/inscricoes/${insc}`, s);
  expect(r.status, r.text).toBe(200);
  return r.body as FichaDTO;
};
const painel = async (s: string) => {
  const r = await h.post('/api/mentoria/onboarding/painel', {}, s);
  expect(r.status, r.text).toBe(200);
  return (r.body as PainelOnboarding).engajamento;
};
const marcar = async (s: string, insc: string, engajamento: string | null) => {
  const { version } = await ficha(s, insc);
  return h.patch(`/api/mentoria/inscricoes/${insc}`, { version, engajamento }, s);
};

beforeAll(async () => {
  app = await createTestApp();
  h = api(app);
  const [r] = await owner<{ id: string }[]>`select id from "user" where username = 'carla'`;
  carla = r!.id;
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

describe('campo na ficha', () => {
  it('Acompanhamento marca e desmarca; o histórico guarda só o nome do campo', async () => {
    const insc = await inscricao(1);
    const s = await comoPerfil('ACOMPANHAMENTO');
    let f = await ficha(s, insc);
    expect(f.engajamento).toBeNull();
    expect(f.pode.verEngajamento).toBe(true);
    expect(f.pode.engajamento).toBe(true);

    expect((await marcar(s, insc, 'EM_ATENCAO')).status).toBe(200);
    f = await ficha(s, insc);
    expect(f.engajamento).toBe('EM_ATENCAO');
    expect((await marcar(s, insc, null)).status).toBe(200);
    expect((await ficha(s, insc)).engajamento).toBeNull();
    expect((await marcar(s, insc, 'TALVEZ')).status).toBe(400);

    const r = await h.get(`/api/mentoria/inscricoes/${insc}/historico`, s);
    const itens = (r.body as { itens: HistoricoItem[] }).itens;
    const ed = itens.filter((i) => i.tipo === 'inscricao.editada');
    expect(ed.length).toBe(2);
    expect(ed.every((i) => JSON.stringify(i.campos) === '["engajamento"]')).toBe(true);
    expect(JSON.stringify(itens)).not.toContain('EM_ATENCAO');
  });

  it('a Operação vê e não marca (404); edita o resto da inscrição', async () => {
    const insc = await inscricao(1);
    await owner`update mentoria_inscricoes set engajamento = 'EM_RISCO' where id = ${insc}`;
    const s = await comoPerfil('OPERACAO');
    const f = await ficha(s, insc);
    expect(f.engajamento).toBe('EM_RISCO');
    expect(f.pode.verEngajamento).toBe(true);
    expect(f.pode.engajamento).toBe(false);
    expect((await marcar(s, insc, 'ENGAJADO')).status).toBe(404);
    const v = await h.patch(
      `/api/mentoria/inscricoes/${insc}`,
      { version: f.version, mentoriaVariante: '2 encontros' },
      s,
    );
    expect(v.status, v.text).toBe(200);
  });

  it('a Especialista não vê o campo nem o Dashboard', async () => {
    const insc = await inscricao(1);
    await owner`update mentoria_inscricoes set engajamento = 'ENGAJADO' where id = ${insc}`;
    await owner`insert into mentoria_reunioes (inscricao_id, tipo, conduzida_por, inicio)
      values (${insc}, 'POSICIONAMENTO', ${carla}, now() - interval '2 hours')`;
    const s = await comoPerfil('ESPECIALISTA');
    const f = await ficha(s, insc);
    expect(f.engajamento).toBeNull();
    expect(f.pode.verEngajamento).toBe(false);
    expect((await marcar(s, insc, 'EM_RISCO')).status).toBe(404);
    expect((await h.post('/api/mentoria/onboarding/painel', {}, s)).status).toBe(404);
  });

  it('a Diretoria marca', async () => {
    const insc = await inscricao(1);
    const s = await h.signIn('diretor@npac.com.br');
    expect((await marcar(s, insc, 'ENGAJADO')).status).toBe(200);
    expect((await ficha(s, insc)).engajamento).toBe('ENGAJADO');
  });
});

describe('Dashboard', () => {
  it('Total sem cancelados e concluídos; grupos e tipos somam na hora', async () => {
    const a = await inscricao(1, { variante: '2 encontros' });
    const b = await inscricao(2, { variante: ' 2  Encontros ', status: 'ONBOARDING' });
    for (const etapa of ETAPAS)
      await owner`insert into mentoria_onboarding_etapas (inscricao_id, etapa, status, criado_por)
        values (${b}, ${etapa}, 'PENDENTE', ${carla})`;
    await inscricao(3, { mentoria: 'RDV', status: 'PAUSADO' });
    await inscricao(4, { mentoria: '6M', status: 'RENOVADO' });
    await inscricao(5, { status: 'CANCELADO' });
    await inscricao(6, { status: 'CONCLUIDO' });
    const s = await comoPerfil('ACOMPANHAMENTO', true);

    let e = await painel(s);
    expect(e.total).toBe(4);
    expect(e.grupos.map((g) => [g.grupo, g.total])).toEqual([
      ['ENGAJADO', 0],
      ['EM_ATENCAO', 0],
      ['EM_RISCO', 0],
      ['SEM', 4],
    ]);
    expect(e.tipos).toEqual([
      { rotulo: '2M / 2 encontros', total: 2 },
      { rotulo: '6M', total: 1 },
      { rotulo: 'RDV', total: 1 },
    ]);

    expect((await marcar(s, a, 'ENGAJADO')).status).toBe(200);
    expect((await marcar(s, b, 'EM_RISCO')).status).toBe(200);
    e = await painel(s);
    expect(e.grupos.map((g) => g.total)).toEqual([1, 0, 1, 2]);
    expect(e.grupos[0]!.pessoas[0]).toMatchObject({
      inscricaoId: a,
      nome: 'Mentorado Fictício G1',
      tipo: 'INDIVIDUAL',
      mentoria: '2M',
      variante: '2 encontros',
    });
  });

  it('"só a carteira" conta só a carteira; a Operação vê todas', async () => {
    await inscricao(1, { resp: carla });
    await inscricao(2);
    await owner`update mentoria_inscricoes set engajamento = 'ENGAJADO'`;
    let s = await comoPerfil('ACOMPANHAMENTO');
    await owner`update area_membros set alcance = 'CARTEIRA'
      where user_id = ${carla} and area = 'ACOMPANHAMENTO'`;
    let e = await painel(s);
    expect(e.total).toBe(1);
    expect(e.grupos[0]!.total).toBe(1);

    s = await comoPerfil('OPERACAO');
    e = await painel(s);
    expect(e.total).toBe(2);
    expect(e.grupos[0]!.total).toBe(2);
  });
});
