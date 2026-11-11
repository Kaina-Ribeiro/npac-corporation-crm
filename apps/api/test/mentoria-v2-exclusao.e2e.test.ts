import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { api, auditCount, closeTestApp, createTestApp, owner, resetAuthState } from './helpers.js';

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

const virar = async (username: string, perfil: string) => {
  await owner`update "user" set role = 'ACOMPANHAMENTO', can_prospect = false, can_close = false
    where id = ${ids[username]!}`;
  await owner`insert into mentoria_perfis (user_id, perfil) values (${ids[username]!}, ${perfil})`;
};

/** Pela API, para o contato sair cifrado como em produção. */
const criar = async (s: string, pessoas: object[], extra: object = {}) => {
  const r = await h.post(
    '/api/mentoria/inscricoes',
    { tipo: pessoas.length === 2 ? 'CASAL' : 'INDIVIDUAL', mentoria: 'RDV', pessoas, ...extra },
    s,
  );
  expect(r.status, r.text).toBe(201);
  return r.body.id as string;
};
const exportar = (s: string, body: object) => h.post('/api/mentoria/exportar', body, s);

let modelo = 0;
const acao = async (i: string, b: { status?: string; pessoa?: string }) => {
  modelo += 1;
  await owner`
    insert into mentoria_acoes (inscricao_id, plano_modelo_id, mes, foco, acao, gatilho,
      dias_para_executar, data_prevista, data_limite, responsavel_perfil, responsavel_id, status)
    select ${i}, m.id, m.mes, m.foco, m.acao, m.gatilho, 0, current_date + 5, current_date + 5,
      'ACOMPANHAMENTO', ${b.pessoa ?? null}, ${b.status ?? 'PENDENTE'}
    from mentoria_plano_modelo m where m.mentoria = 'RDV'
    order by m.mes, m.id offset ${modelo % 12} limit 1`;
};

beforeAll(async () => {
  app = await createTestApp();
  h = api(app);
  for (const u of ['carla', 'diretor', 'igor', 'ale']) {
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
afterEach(async () => {
  await owner`delete from mentoria_perfis where user_id = ${ids.igor!}`;
  await owner`update "user" set role = 'SDR', can_prospect = true, can_close = false
    where id = ${ids.igor!}`;
});

describe('excluir e anonimizar', () => {
  it('excluir inscrição: só admin, enfileira a mídia', async () => {
    const s = await duda();
    const i = await criar(s, [{ nome: 'Mentorado Fictício 1' }]);
    const [p] = await owner<
      { id: string }[]
    >`select id from mentoria_pessoas where inscricao_id = ${i}`;
    await owner`insert into mentoria_midia (dono_tipo, dono_id, tipo, chave_objeto, mime, tamanho_bytes)
      values ('PESSOA_FOTO', ${p!.id}, 'FOTO', 'chave-ficticia-1', 'image/png', 10),
             ('FOTO_FAMILIA', ${i}, 'FOTO', 'chave-ficticia-2', 'image/png', 10)`;
    const op = await comoPerfil('OPERACAO');
    expect((await h.del(`/api/mentoria/inscricoes/${i}`, {}, op)).status).toBe(404);
    const acomp = await comoPerfil('ACOMPANHAMENTO');
    expect((await h.del(`/api/mentoria/inscricoes/${i}`, {}, acomp)).status).toBe(404);
    const admin = await duda();
    const antes = await auditCount('mentoria.inscricao.excluida');
    const r = await h.del(`/api/mentoria/inscricoes/${i}`, {}, admin);
    expect(r.status, r.text).toBe(204);
    expect(await owner`select 1 from mentoria_inscricoes where id = ${i}`).toHaveLength(0);
    expect(await owner`select 1 from mentoria_midia`).toHaveLength(0);
    const fila = await owner<{ chave_objeto: string }[]>`
      select chave_objeto from mentoria_midia_exclusao order by chave_objeto`;
    expect(fila.map((x) => x.chave_objeto)).toEqual(['chave-ficticia-1', 'chave-ficticia-2']);
    expect(await auditCount('mentoria.inscricao.excluida')).toBe(antes + 1);
    expect((await h.del(`/api/mentoria/inscricoes/${i}`, {}, admin)).status).toBe(404);
  });

  it('anonimizar apaga pessoais, cifrados, endereço e legado; mantém contagens', async () => {
    const s = await duda();
    const i = await criar(s, [
      {
        nome: 'Mentorado Fictício 2',
        apelido: 'Fictício',
        whatsapp: '11999990002',
        email: 'f2@exemplo.com',
        cidade: 'Cidade',
      },
    ]);
    await owner`insert into mentoria_enderecos (inscricao_id, endereco, cep) values (${i}, 'cifrado', '01001000')`;
    await owner`insert into mentoria_legado (inscricao_id, dados) values (${i}, 'cifrado')`;
    await owner`insert into mentoria_momento_inicial (inscricao_id, dor, sonho) values (${i}, 'cifrado', 'cifrado')`;
    await owner`insert into mentoria_anotacoes (inscricao_id, autor_id, texto) values (${i}, ${ids.carla!}, 'cifrado')`;
    await owner`insert into mentoria_reunioes (inscricao_id, tipo, conduzida_por, inicio, status, resumo)
      values (${i}, 'ACOMP_2PME', ${ids.carla!}, now() - interval '1 day', 'REALIZADA', 'cifrado')`;
    await acao(i, {});
    await acao(i, { status: 'FEITA' });
    const acomp = await comoPerfil('ACOMPANHAMENTO');
    expect((await h.post(`/api/mentoria/inscricoes/${i}/anonimizar`, {}, acomp)).status).toBe(404);
    const admin = await duda();
    const r = await h.post(`/api/mentoria/inscricoes/${i}/anonimizar`, {}, admin);
    expect(r.status, r.text).toBe(204);
    const [p] = await owner<Record<string, unknown>[]>`
      select nome, apelido, whatsapp, whatsapp_idx, email, email_idx, cidade
      from mentoria_pessoas where inscricao_id = ${i}`;
    expect(p).toEqual({
      nome: 'Anonimizado',
      apelido: null,
      whatsapp: null,
      whatsapp_idx: null,
      email: null,
      email_idx: null,
      cidade: null,
    });
    for (const t of [
      'mentoria_enderecos',
      'mentoria_legado',
      'mentoria_momento_inicial',
      'mentoria_anotacoes',
    ])
      expect(await owner`select 1 from ${owner(t)} where inscricao_id = ${i}`, t).toHaveLength(0);
    const [reu] = await owner<{ n: number; resumo: string | null }[]>`
      select count(*)::int as n, max(resumo) as resumo from mentoria_reunioes where inscricao_id = ${i}`;
    expect(reu).toEqual({ n: 1, resumo: null });
    const [ac] = await owner<{ n: number }[]>`
      select count(*)::int as n from mentoria_acoes where inscricao_id = ${i}`;
    expect(ac!.n).toBe(2);
    const hist = await owner<{ tipo: string; campos: string[] }[]>`
      select tipo, campos from mentoria_historico where inscricao_id = ${i}`;
    expect(hist.map((x) => x.tipo)).toContain('inscricao.anonimizada');
    expect(JSON.stringify(hist)).not.toMatch(/Fictício|exemplo/);
    const ficha = await h.get(`/api/mentoria/inscricoes/${i}`, admin);
    expect(ficha.status).toBe(200);
    expect(ficha.body.nome).toBe('Anonimizado');
  });
});

describe('CSV', () => {
  it('CSV: admin e Acompanhamento; Operação 404', async () => {
    const op = await comoPerfil('OPERACAO');
    expect((await exportar(op, { aba: 'MENTORADOS' })).status).toBe(404);
    const manu = await comoPerfil('ESPECIALISTA');
    expect((await exportar(manu, { aba: 'MENTORADOS' })).status).toBe(404);
    const acomp = await comoPerfil('ACOMPANHAMENTO');
    for (const aba of ['MENTORADOS', 'FILA', 'PLANO', 'REUNIOES']) {
      const r = await exportar(acomp, { aba });
      expect(r.status, `${aba}: ${r.text}`).toBe(200);
      expect(r.headers['content-type']).toContain('text/csv');
    }
    const diretor = await h.signIn('diretor@npac.com.br');
    expect((await exportar(diretor, { aba: 'MENTORADOS' })).status).toBe(200);
  });

  it('CSV: contato só para admin; dor, sonho e anotações nunca', async () => {
    const admin = await duda();
    const i = await criar(admin, [
      { nome: 'Mentorado Fictício 3', whatsapp: '11999990003', email: 'f3@exemplo.com' },
    ]);
    const momento = await h.put(
      `/api/mentoria/inscricoes/${i}/momento`,
      { version: 0, dor: 'Dor fictícia', sonho: 'Sonho fictício', meta: 'Meta fictícia' },
      admin,
    );
    expect(momento.status, momento.text).toBe(200);
    const nota = await h.post(
      `/api/mentoria/inscricoes/${i}/anotacoes`,
      { texto: 'Nota fictícia' },
      admin,
    );
    expect(nota.status, nota.text).toBe(201);
    const comContato = (await exportar(admin, { aba: 'MENTORADOS' })).text;
    expect(comContato).toContain('WhatsApp');
    expect(comContato).toContain('+5511999990003');
    expect(comContato).toContain('f3@exemplo.com');
    const acomp = await comoPerfil('ACOMPANHAMENTO');
    const semContato = (await exportar(acomp, { aba: 'MENTORADOS' })).text;
    expect(semContato).toContain('Mentorado Fictício 3');
    expect(semContato).not.toContain('WhatsApp');
    expect(semContato).not.toContain('99999');
    expect(semContato).not.toContain('exemplo.com');
    for (const csv of [comContato, semContato])
      expect(csv).not.toMatch(/fictícia|Sonho fictício|Nota fictícia|Dor|Sonho|Anota/);
  });

  it('CSV neutraliza fórmulas e grava auditoria', async () => {
    const admin = await duda();
    await criar(admin, [{ nome: '=HIPERLINK("x")' }]);
    const antes = await auditCount('mentoria.csv');
    const r = await exportar(admin, { aba: 'MENTORADOS' });
    expect(r.text).toContain(`"'=HIPERLINK(""x"")"`);
    expect(await auditCount('mentoria.csv')).toBe(antes + 1);
    const [a] = await owner<{ data: Record<string, unknown> }[]>`
      select data from audit_log where action = 'mentoria.csv' order by id desc limit 1`;
    expect(a!.data).toEqual({ aba: 'MENTORADOS', linhas: 1, contato: true });
  });
});

describe('carteira', () => {
  it('transferir carteira move inscrições e ações pendentes', async () => {
    await virar('igor', 'ACOMPANHAMENTO');
    await comoPerfil('ACOMPANHAMENTO');
    const [i] = await owner<{ id: string }[]>`
      insert into mentoria_inscricoes (tipo, mentoria, status, responsavel_id)
      values ('INDIVIDUAL', 'RDV', 'ATIVO', ${ids.carla!}) returning id`;
    await owner`insert into mentoria_pessoas (inscricao_id, ordem, nome, nome_norm)
      values (${i!.id}, 1, 'Mentorado Fictício 4', 'mentorado ficticio 4')`;
    const [fim] = await owner<{ id: string }[]>`
      insert into mentoria_inscricoes (tipo, mentoria, status, responsavel_id)
      values ('INDIVIDUAL', 'RDV', 'CONCLUIDO', ${ids.carla!}) returning id`;
    await acao(i!.id, { pessoa: ids.carla });
    await acao(i!.id, { pessoa: ids.carla, status: 'FEITA' });
    const acomp = await h.signIn('carla@npac.com.br');
    const corpo = { de: ids.carla, para: ids.igor };
    expect((await h.post('/api/mentoria/carteira/transferir', corpo, acomp)).status).toBe(404);
    const diretor = await h.signIn('diretor@npac.com.br');
    const semPerfil = await h.post(
      '/api/mentoria/carteira/transferir',
      { de: ids.carla, para: ids.ale },
      diretor,
    );
    expect(semPerfil.status).toBe(400);
    const r = await h.post('/api/mentoria/carteira/transferir', corpo, diretor);
    expect(r.status, r.text).toBe(200);
    expect(r.body).toEqual({ inscricoes: 1, acoes: 1 });
    const [ins] = await owner<{ responsavel_id: string }[]>`
      select responsavel_id from mentoria_inscricoes where id = ${i!.id}`;
    expect(ins!.responsavel_id).toBe(ids.igor);
    const [concluida] = await owner<{ responsavel_id: string }[]>`
      select responsavel_id from mentoria_inscricoes where id = ${fim!.id}`;
    expect(concluida!.responsavel_id).toBe(ids.carla);
    const acoes = await owner<{ status: string; responsavel_id: string }[]>`
      select status, responsavel_id from mentoria_acoes where inscricao_id = ${i!.id} order by status`;
    expect(acoes).toEqual([
      { status: 'FEITA', responsavel_id: ids.carla },
      { status: 'PENDENTE', responsavel_id: ids.igor },
    ]);
    const [hist] = await owner<{ campos: string[] }[]>`
      select campos from mentoria_historico where tipo = 'inscricao.transferida'`;
    expect(hist!.campos).toEqual(['responsavelId']);
  });
});
