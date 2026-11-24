import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { FichaDTO, HistoricoItem } from '@npac/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { api, closeTestApp, createTestApp, owner, resetAuthState } from './helpers.js';

// NPAC-70 (Duda, 24/11/2026, "1A, 2C"): contato e anotação do Histórico da ficha se excluem só pela Admin do
// Acompanhamento e pela Diretoria. Os demais perfis recebem 404 (regra do módulo). O histórico ganha
// `contato.excluido` / `anotacao.excluida`, sem o texto.
let app: NestFastifyApplication;
let h: ReturnType<typeof api>;
let carla = '';

const comoPerfil = async (perfil: string, admin = false) => {
  await owner`delete from mentoria_perfis where user_id = ${carla}`;
  await owner`insert into mentoria_perfis (user_id, perfil, admin) values (${carla}, ${perfil}, ${admin})`;
  return h.signIn('carla@npac.com.br');
};

const inscricao = async () => {
  const [i] = await owner<{ id: string }[]>`
    insert into mentoria_inscricoes (tipo, mentoria, status, inicio_jornada, termino_previsto, responsavel_id)
    values ('INDIVIDUAL', 'RDV', 'ATIVO', current_date - 60, current_date + 300, null) returning id`;
  await owner`insert into mentoria_pessoas (inscricao_id, ordem, nome, nome_norm)
    values (${i!.id}, 1, 'Mentorado Fictício Ex', 'mentorado ficticio ex')`;
  return i!.id;
};
const ficha = async (s: string, insc: string) => {
  const r = await h.get(`/api/mentoria/inscricoes/${insc}`, s);
  expect(r.status, r.text).toBe(200);
  return r.body as FichaDTO;
};
const historico = async (s: string, insc: string) => {
  const r = await h.get(`/api/mentoria/inscricoes/${insc}/historico`, s);
  expect(r.status, r.text).toBe(200);
  return (r.body as { itens: HistoricoItem[] }).itens;
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

describe('excluir contato e anotação (NPAC-70)', () => {
  it('Acompanhamento e Operação recebem 404; a Admin exclui e o histórico mostra só o tipo', async () => {
    const insc = await inscricao();
    let s = await comoPerfil('ACOMPANHAMENTO');
    const c = await h.post(
      '/api/mentoria/contatos',
      { inscricaoId: insc, canal: 'REUNIAO', motivo: 'ACM', respondeu: true, observacao: 'TESTE' },
      s,
    );
    expect(c.status, c.text).toBe(201);
    const a = await h.post(`/api/mentoria/inscricoes/${insc}/anotacoes`, { texto: 'Teste' }, s);
    expect(a.status, a.text).toBe(201);
    const contatoId = (c.body as { id: string }).id;
    const anotacaoId = (a.body as { id: string }).id;
    expect((await ficha(s, insc)).pode.admin).toBe(false);

    for (const perfil of ['ACOMPANHAMENTO', 'OPERACAO']) {
      s = await comoPerfil(perfil);
      expect((await h.del(`/api/mentoria/contatos/${contatoId}`, {}, s)).status).toBe(404);
      expect((await h.del(`/api/mentoria/anotacoes/${anotacaoId}`, {}, s)).status).toBe(404);
    }

    s = await comoPerfil('ACOMPANHAMENTO', true);
    expect((await ficha(s, insc)).pode.admin).toBe(true);
    expect((await ficha(s, insc)).contatos.map((x) => x.id)).toEqual([contatoId]);
    expect((await h.del(`/api/mentoria/contatos/${contatoId}`, {}, s)).status).toBe(204);
    expect((await h.del(`/api/mentoria/anotacoes/${anotacaoId}`, {}, s)).status).toBe(204);
    expect((await ficha(s, insc)).contatos).toEqual([]);
    const itens = await historico(s, insc);
    expect(itens.some((i) => i.tipo === 'anotacao')).toBe(false);
    const excluidos = itens.filter(
      (i) => i.tipo.endsWith('.excluido') || i.tipo.endsWith('.excluida'),
    );
    expect(excluidos.map((i) => [i.tipo, i.campos, i.texto]).sort()).toEqual([
      ['anotacao.excluida', [], null],
      ['contato.excluido', [], null],
    ]);

    // Já excluído, ou id que não existe: 404.
    expect((await h.del(`/api/mentoria/contatos/${contatoId}`, {}, s)).status).toBe(404);
    expect((await h.del(`/api/mentoria/anotacoes/nao-e-id`, {}, s)).status).toBe(404);
  });

  it('a Diretoria exclui', async () => {
    const insc = await inscricao();
    const s = await h.signIn('diretor@npac.com.br');
    const a = await h.post(`/api/mentoria/inscricoes/${insc}/anotacoes`, { texto: 'Teste' }, s);
    expect(a.status, a.text).toBe(201);
    const id = (a.body as { id: string }).id;
    expect((await h.del(`/api/mentoria/anotacoes/${id}`, {}, s)).status).toBe(204);
    expect((await historico(s, insc)).some((i) => i.tipo === 'anotacao')).toBe(false);
  });
});
