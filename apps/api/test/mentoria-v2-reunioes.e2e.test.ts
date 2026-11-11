import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { api, closeTestApp, createTestApp, owner, resetAuthState } from './helpers.js';

let app: NestFastifyApplication;
let h: ReturnType<typeof api>;
const ids: Record<string, string> = {};

const comoPerfil = async (perfil: string | null, admin = false) => {
  await owner`delete from mentoria_perfis where user_id = ${ids.carla!}`;
  if (perfil)
    await owner`insert into mentoria_perfis (user_id, perfil, admin)
      values (${ids.carla!}, ${perfil}, ${admin})`;
  return h.signIn('carla@npac.com.br');
};
const duda = () => comoPerfil('ACOMPANHAMENTO', true);
const operacao = () => comoPerfil('OPERACAO');
const manu = () => comoPerfil('ESPECIALISTA');

/** `datetime-local` de Brasília, `horas` a partir de agora. */
const quando = async (horas: number) => {
  const [r] = await owner<{ d: string }[]>`
    select to_char((now() at time zone 'America/Sao_Paulo') + make_interval(hours => ${horas}::int),
      'YYYY-MM-DD"T"HH24:MI') as d`;
  return r!.d;
};

let n = 0;
const inscricao = async (
  opts: { mentoria?: string; status?: string; importada?: boolean } = {},
) => {
  n += 1;
  const [i] = await owner<{ id: string }[]>`
    insert into mentoria_inscricoes (tipo, mentoria, status, importada)
    values ('INDIVIDUAL', ${opts.mentoria ?? 'RDV'}, ${opts.status ?? 'ATIVO'},
      ${opts.importada ?? false}) returning id`;
  await owner`insert into mentoria_pessoas (inscricao_id, ordem, nome, nome_norm)
    values (${i!.id}, 1, ${`Mentorado Fictício ${n}`}, ${`mentorado ficticio ${n}`})`;
  await owner`insert into mentoria_onboarding_etapas (inscricao_id, etapa, status)
    select ${i!.id}, e, 'PENDENTE'
    from unnest(array['BOAS_VINDAS','GRUPOS','AQUECIMENTO','PME_AQUECIMENTO','CAIXA','IDR']) e`;
  return i!.id;
};

type Criar = {
  inscricaoId: string;
  tipo: string;
  inicio: string;
  conduzidaPor?: string | null;
  condutorInscricaoId?: string;
};
const criar = (s: string, b: Criar) => h.post('/api/mentoria/reunioes', b, s);
const criarOk = async (s: string, b: Criar) => {
  const r = await criar(s, { conduzidaPor: ids.diretor, ...b });
  expect(r.status, r.text).toBe(201);
  return r.body as { id: string; version: number };
};
const abrir = async (s: string, id: string) => {
  const r = await h.get(`/api/mentoria/reunioes/${id}`, s);
  expect(r.status, r.text).toBe(200);
  return r.body as Record<string, unknown> & { version: number; status: string };
};
const patch = (s: string, id: string, b: object) => h.patch(`/api/mentoria/reunioes/${id}`, b, s);

beforeAll(async () => {
  app = await createTestApp();
  h = api(app);
  for (const u of ['carla', 'diretor', 'ale', 'sonia', 'ana']) {
    const [r] = await owner<{ id: string }[]>`select id from "user" where username = ${u}`;
    ids[u] = r!.id;
  }
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

describe('estados e registro', () => {
  it('estado segue AGENDADA → CONFIRMADA → LINK_ENVIADO → REALIZADA', async () => {
    const s = await operacao();
    const i = await inscricao();
    const r = await criarOk(s, { inscricaoId: i, tipo: 'ACOMP_2PME', inicio: await quando(-1) });
    let v = r.version;
    for (const status of ['CONFIRMADA', 'LINK_ENVIADO', 'REALIZADA']) {
      const p = await patch(s, r.id, { version: v, status });
      expect(p.status, p.text).toBe(200);
      v = p.body.version;
      expect((await abrir(s, r.id)).status).toBe(status);
    }
    const volta = await patch(s, r.id, { version: v, status: 'CONFIRMADA' });
    expect(volta.status).toBe(400);
  });

  it('REALIZADA antes do horário → 400 "A reunião ainda não aconteceu"', async () => {
    const s = await operacao();
    const r = await criarOk(s, {
      inscricaoId: await inscricao(),
      tipo: 'ACOMP_2PME',
      inicio: await quando(2),
    });
    const p = await patch(s, r.id, { version: r.version, status: 'REALIZADA' });
    expect(p.status).toBe(400);
    expect(p.body.message).toBe('A reunião ainda não aconteceu');
  });

  it('o registro fica cifrado e volta decifrado na página', async () => {
    const s = await duda();
    const r = await criarOk(s, {
      inscricaoId: await inscricao(),
      tipo: 'ACOMP_2PME',
      inicio: await quando(-1),
    });
    const p = await patch(s, r.id, {
      version: r.version,
      status: 'REALIZADA',
      resumo: 'Resumo fictício',
      trava: 'Trava fictícia',
      anotacaoInterna: 'Nota fictícia',
      humor: 4,
    });
    expect(p.status, p.text).toBe(200);
    const [banco] = await owner<{ resumo: string; trava: string }[]>`
      select resumo, trava from mentoria_reunioes where id = ${r.id}`;
    expect(banco!.resumo).not.toContain('fictício');
    expect(banco!.trava).not.toContain('fictícia');
    const d = await abrir(s, r.id);
    expect(d).toMatchObject({
      resumo: 'Resumo fictício',
      anotacaoInterna: 'Nota fictícia',
      humor: 4,
    });
    const hist = await owner<{ campos: string[] }[]>`
      select campos from mentoria_historico where tipo like 'reuniao.%'`;
    expect(JSON.stringify(hist)).not.toContain('fictício');
  });

  it('próxima reunião no registro cria a próxima AGENDADA', async () => {
    const s = await duda();
    const i = await inscricao();
    const r = await criarOk(s, { inscricaoId: i, tipo: 'MENSAL_6M', inicio: await quando(-1) });
    const p = await patch(s, r.id, {
      version: r.version,
      status: 'REALIZADA',
      proxima: { inicio: await quando(24 * 30) },
    });
    expect(p.status, p.text).toBe(200);
    const nova = await abrir(s, p.body.proximaId);
    expect(nova).toMatchObject({ status: 'AGENDADA', tipo: 'MENSAL_6M', inscricaoId: i });
    expect((nova.conduzidaPor as { id: string }).id).toBe(ids.diretor);
  });

  it('remarcar: antiga REMARCADA, nova AGENDADA ligada', async () => {
    const s = await operacao();
    const i = await inscricao();
    const r = await criarOk(s, { inscricaoId: i, tipo: 'IDR', inicio: await quando(3) });
    const nova = await h.post(
      `/api/mentoria/reunioes/${r.id}/remarcar`,
      { version: r.version, inicio: await quando(48) },
      s,
    );
    expect(nova.status, nova.text).toBe(200);
    const antiga = await abrir(s, r.id);
    expect(antiga).toMatchObject({ status: 'REMARCADA', remarcadaParaId: nova.body.id });
    expect(await abrir(s, nova.body.id)).toMatchObject({ status: 'AGENDADA', tipo: 'IDR' });
    // Remarcar de novo a já remarcada é recusado; a versão velha dá 409.
    const outra = await h.post(
      `/api/mentoria/reunioes/${r.id}/remarcar`,
      { version: antiga.version, inicio: await quando(72) },
      s,
    );
    expect(outra.status).toBe(400);
    const velha = await h.post(
      `/api/mentoria/reunioes/${nova.body.id}/remarcar`,
      { version: 99, inicio: await quando(72) },
      s,
    );
    expect(velha.status).toBe(409);
  });

  it('excluir só AGENDADA sem registro', async () => {
    const s = await operacao();
    const i = await inscricao();
    const a = await criarOk(s, { inscricaoId: i, tipo: 'ACOMP_2PME', inicio: await quando(5) });
    const b = await criarOk(s, { inscricaoId: i, tipo: 'ACOMP_2PME', inicio: await quando(6) });
    await patch(s, b.id, { version: b.version, status: 'CONFIRMADA' });
    const c = await criarOk(s, { inscricaoId: i, tipo: 'ACOMP_2PME', inicio: await quando(7) });
    await patch(s, c.id, { version: c.version, resumo: 'Algo fictício' });
    expect((await h.del(`/api/mentoria/reunioes/${a.id}`, {}, s)).status).toBe(204);
    expect((await h.get(`/api/mentoria/reunioes/${a.id}`, s)).status).toBe(404);
    for (const id of [b.id, c.id]) {
      const r = await h.del(`/api/mentoria/reunioes/${id}`, {}, s);
      expect(r.status).toBe(400);
      expect(r.body.message).toContain('Só reunião agendada e sem registro');
    }
  });

  it('interesse em renovar só em RENOVACAO', async () => {
    const s = await duda();
    const i = await inscricao();
    const a = await criarOk(s, { inscricaoId: i, tipo: 'ACOMP_2PME', inicio: await quando(-1) });
    const r = await patch(s, a.id, { version: a.version, interesseRenovar: true });
    expect(r.status).toBe(400);
    const b = await criarOk(s, { inscricaoId: i, tipo: 'RENOVACAO', inicio: await quando(-1) });
    expect((await patch(s, b.id, { version: b.version, interesseRenovar: true })).status).toBe(200);
  });
});

describe('quem conduz', () => {
  it('MENTORADO_EXPERIENTE aceita condutor_inscricao_id sem usuário', async () => {
    const s = await duda();
    const i = await inscricao();
    const padrinho = await inscricao();
    const r = await criar(s, {
      inscricaoId: i,
      tipo: 'MENTORADO_EXPERIENTE',
      inicio: await quando(24),
      conduzidaPor: null,
      condutorInscricaoId: padrinho,
    });
    expect(r.status, r.text).toBe(201);
    const d = await abrir(s, r.body.id);
    expect(d.conduzidaPor).toBeNull();
    expect((d.condutorInscricao as { id: string }).id).toBe(padrinho);
    const sem = await criar(s, {
      inscricaoId: i,
      tipo: 'MENTORADO_EXPERIENTE',
      inicio: await quando(24),
      conduzidaPor: null,
    });
    expect(sem.status).toBe(400);
  });

  it('outros tipos exigem conduzida_por', async () => {
    const s = await duda();
    const r = await criar(s, {
      inscricaoId: await inscricao(),
      tipo: 'POSICIONAMENTO',
      inicio: await quando(24),
      conduzidaPor: null,
    });
    expect(r.status).toBe(400);
    expect(r.body.message).toContain('quem conduz');
  });

  it('condutor pode ser usuário com cargo comercial, que segue sem acesso ao módulo', async () => {
    const s = await duda();
    const i = await inscricao();
    await criarOk(s, {
      inscricaoId: i,
      tipo: 'ACOMP_EMERGENCIA',
      inicio: await quando(24),
      conduzidaPor: ids.sonia!,
    });
    const sonia = await h.signIn('sonia@npac.com.br');
    expect((await h.post('/api/mentoria/reunioes/agenda', {}, sonia)).status).toBe(404);
    expect((await h.get(`/api/mentoria/inscricoes/${i}`, sonia)).status).toBe(404);
    // Desativado não conduz.
    await owner`update "user" set active = false where id = ${ids.ana!}`;
    const r = await criar(s, {
      inscricaoId: i,
      tipo: 'ACOMP_EMERGENCIA',
      inicio: await quando(24),
      conduzidaPor: ids.ana!,
    });
    expect(r.status).toBe(400);
  });

  it('Operação registra IDR conduzida pelo Leo', async () => {
    const s = await operacao();
    const i = await inscricao();
    // `ale` faz o papel do Leo: um usuário qualquer, sem acesso ao módulo.
    const r = await criarOk(s, {
      inscricaoId: i,
      tipo: 'IDR',
      inicio: await quando(-1),
      conduzidaPor: ids.ale!,
    });
    const p = await patch(s, r.id, { version: r.version, status: 'REALIZADA', resumo: 'Fictício' });
    expect(p.status, p.text).toBe(200);
    expect((await abrir(s, r.id)).status).toBe('REALIZADA');
  });
});

describe('Especialista', () => {
  it('Manu edita só as reuniões dela', async () => {
    const d = await h.signIn('diretor@npac.com.br');
    const i = await inscricao();
    const dela = await criarOk(d, {
      inscricaoId: i,
      tipo: 'POSICIONAMENTO',
      inicio: await quando(-1),
      conduzidaPor: ids.carla!,
    });
    const outra = await criarOk(d, {
      inscricaoId: i,
      tipo: 'ACOMP_2PME',
      inicio: await quando(-1),
    });
    const s = await manu();
    const p = await patch(s, dela.id, { version: dela.version, status: 'REALIZADA', resumo: 'Ok' });
    expect(p.status, p.text).toBe(200);
    expect((await patch(s, outra.id, { version: outra.version, resumo: 'X' })).status).toBe(404);
    expect((await h.get(`/api/mentoria/reunioes/${outra.id}`, s)).status).toBe(404);
    // Nem cria IDR, nem exclui.
    const idr = await criar(s, {
      inscricaoId: i,
      tipo: 'IDR',
      inicio: await quando(24),
      conduzidaPor: ids.carla!,
    });
    expect(idr.status).toBe(404);
    expect((await h.del(`/api/mentoria/reunioes/${dela.id}`, {}, s)).status).toBe(404);
  });

  it('excluir a reunião da Manu tira o acesso dela àquela ficha', async () => {
    const d = await h.signIn('diretor@npac.com.br');
    const i = await inscricao();
    const r = await criarOk(d, {
      inscricaoId: i,
      tipo: 'POSICIONAMENTO',
      inicio: await quando(24),
      conduzidaPor: ids.carla!,
    });
    let s = await manu();
    expect((await h.get(`/api/mentoria/inscricoes/${i}`, s)).status).toBe(200);
    const d2 = await h.signIn('diretor@npac.com.br');
    expect((await h.del(`/api/mentoria/reunioes/${r.id}`, {}, d2)).status).toBe(204);
    s = await manu();
    expect((await h.get(`/api/mentoria/inscricoes/${i}`, s)).status).toBe(404);
  });

  it('Manu marca a ação do mês 5 de quem é dela e recebe 404 nas outras', async () => {
    const d = await h.signIn('diretor@npac.com.br');
    const dela = await inscricao();
    const outra = await inscricao();
    for (const i of [dela, outra]) {
      await owner`update mentoria_inscricoes set inicio_jornada = '2026-01-10',
          termino_previsto = '2027-01-10' where id = ${i}`;
      await owner`select mentoria_gerar_acoes(${i}::uuid, '2026-01-01'::date)`;
    }
    await criarOk(d, {
      inscricaoId: dela,
      tipo: 'POSICIONAMENTO',
      inicio: await quando(24),
      conduzidaPor: ids.carla!,
    });
    const s = await manu();
    const acao = async (i: string, mes: number) => {
      const [a] = await owner<{ id: string; version: number }[]>`
        select id, version from mentoria_acoes where inscricao_id = ${i} and mes = ${mes}`;
      return a!;
    };
    const m5 = await acao(dela, 5);
    const r = await h.patch(
      `/api/mentoria/acoes/${m5.id}`,
      { version: m5.version, itensFeitos: ['Posicionamento entregue'] },
      s,
    );
    expect(r.status, r.text).toBe(200);
    const m4 = await acao(dela, 4);
    expect(
      (await h.patch(`/api/mentoria/acoes/${m4.id}`, { version: m4.version, status: 'FEITA' }, s))
        .status,
    ).toBe(404);
    const fora = await acao(outra, 5);
    expect(
      (
        await h.patch(
          `/api/mentoria/acoes/${fora.id}`,
          { version: fora.version, status: 'FEITA' },
          s,
        )
      ).status,
    ).toBe(404);
  });
});

describe('painéis', () => {
  it('taxa de comparecimento = REALIZADA ÷ (REALIZADA + FALTOU)', async () => {
    const s = await duda();
    const i = await inscricao();
    const resultados = ['REALIZADA', 'REALIZADA', 'REALIZADA', 'FALTOU'];
    for (const status of resultados) {
      const r = await criarOk(s, { inscricaoId: i, tipo: 'MENSAL_6M', inicio: await quando(-1) });
      expect((await patch(s, r.id, { version: r.version, status })).status).toBe(200);
    }
    await criarOk(s, { inscricaoId: i, tipo: 'MENSAL_6M', inicio: await quando(-1) });
    const c = await h.post('/api/mentoria/reunioes/controle-mensal', {}, s);
    expect(c.status, c.text).toBe(200);
    expect(c.body.comparecimento).toEqual({ realizadas: 3, faltas: 1, taxa: 75 });
  });

  it('controle mensal lista quem fez e quem falta, em todas as mentorias, com filtro', async () => {
    const s = await duda();
    const rdv = await inscricao({ mentoria: 'RDV' });
    const m2 = await inscricao({ mentoria: '2M' });
    const m6 = await inscricao({ mentoria: '6M' });
    await inscricao({ mentoria: '6M', status: 'ONBOARDING' });
    for (const i of [rdv, m6]) {
      const r = await criarOk(s, { inscricaoId: i, tipo: 'MENSAL_6M', inicio: await quando(-1) });
      await patch(s, r.id, { version: r.version, status: 'REALIZADA' });
    }
    const todos = await h.post('/api/mentoria/reunioes/controle-mensal', {}, s);
    expect(todos.status, todos.text).toBe(200);
    const nomes = (l: { inscricaoId: string }[]) => l.map((x) => x.inscricaoId).sort();
    expect(nomes(todos.body.fizeram)).toEqual([rdv, m6].sort());
    expect(nomes(todos.body.faltam)).toEqual([m2]);
    const so6 = await h.post('/api/mentoria/reunioes/controle-mensal', { mentoria: '6M' }, s);
    expect(nomes(so6.body.fizeram)).toEqual([m6]);
    expect(so6.body.faltam).toEqual([]);
    const outroMes = await h.post('/api/mentoria/reunioes/controle-mensal', { mes: '2020-01' }, s);
    expect(outroMes.body.fizeram).toEqual([]);
  });

  it('sem reunião há 30 dias conta da importação quando não há reunião', async () => {
    const s = await duda();
    const importada = await inscricao({ importada: true });
    const antiga = await inscricao({ importada: true });
    const comReuniao = await inscricao({ importada: true });
    const comIdr = await inscricao();
    await owner`update mentoria_inscricoes set criado_em = now() - interval '40 days'
      where id in (${antiga}, ${comReuniao}, ${comIdr})`;
    await owner`update mentoria_inscricoes set data_idr = (now() - interval '10 days')::date
      where id = ${comIdr}`;
    const r = await criarOk(s, {
      inscricaoId: comReuniao,
      tipo: 'ACOMP_EMERGENCIA',
      inicio: await quando(-24 * 5),
    });
    await patch(s, r.id, { version: r.version, status: 'REALIZADA' });
    const res = await h.post('/api/mentoria/reunioes/sem-reuniao', {}, s);
    expect(res.status, res.text).toBe(200);
    const itens = res.body.itens as { inscricaoId: string; base: string; dias: number }[];
    expect(itens.map((x) => x.inscricaoId)).toEqual([antiga]);
    expect(itens[0]).toMatchObject({ base: 'IMPORTACAO', dias: 40 });
    expect(itens.some((x) => x.inscricaoId === importada)).toBe(false);
  });

  it('agenda da semana traz as reuniões e filtra por quem conduz', async () => {
    const s = await operacao();
    const i = await inscricao();
    await criarOk(s, { inscricaoId: i, tipo: 'ACOMP_2PME', inicio: await quando(0) });
    await criarOk(s, {
      inscricaoId: i,
      tipo: 'ACOMP_2PME',
      inicio: await quando(0),
      conduzidaPor: ids.sonia!,
    });
    const a = await h.post('/api/mentoria/reunioes/agenda', {}, s);
    expect(a.status, a.text).toBe(200);
    expect(a.body.reunioes).toHaveLength(2);
    const f = await h.post('/api/mentoria/reunioes/agenda', { condutorId: ids.sonia }, s);
    expect(f.body.reunioes).toHaveLength(1);
  });
});

describe('contatos', () => {
  it('Operação registra contato; Manu e Mentor não', async () => {
    const s = await operacao();
    const i = await inscricao();
    const r = await h.post(
      '/api/mentoria/contatos',
      { inscricaoId: i, canal: 'WHATSAPP', respondeu: true, observacao: 'Obs fictícia' },
      s,
    );
    expect(r.status, r.text).toBe(201);
    const [c] = await owner<{ observacao: string; feito_por: string }[]>`
      select observacao, feito_por from mentoria_contatos`;
    expect(c!.observacao).not.toContain('fictícia');
    expect(c!.feito_por).toBe(ids.carla);
    for (const perfil of ['ESPECIALISTA', 'MENTOR']) {
      const outro = await comoPerfil(perfil);
      const x = await h.post('/api/mentoria/contatos', { inscricaoId: i, canal: 'LIGACAO' }, outro);
      expect(x.status).toBe(404);
    }
  });

  it('rotas de reunião dão 404 ao Mentor e a quem não tem perfil', async () => {
    for (const perfil of ['MENTOR', null]) {
      const s = await comoPerfil(perfil);
      expect((await h.post('/api/mentoria/reunioes/agenda', {}, s)).status).toBe(404);
      expect((await h.get('/api/mentoria/reunioes/condutores', s)).status).toBe(404);
    }
  });
});
