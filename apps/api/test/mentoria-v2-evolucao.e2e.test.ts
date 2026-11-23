import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { ConquistaDTO, EvolucaoDTO, FichaDTO } from '@npac/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { EvolucaoLegado } from '../src/mentoria/evolucao-legado.js';
import { aad, MentoriaCrypto } from '../src/mentoria/mentoria-crypto.js';
import { api, closeTestApp, createTestApp, ORIGIN, owner, resetAuthState } from './helpers.js';

// NPAC-57: aba Evolução (spec 2026-11-21, §6). Leem Admin, Acompanhamento (com "só a carteira") e Operação;
// escrevem Admin e Acompanhamento; a Especialista recebe 404 em tudo.
let app: NestFastifyApplication;
let h: ReturnType<typeof api>;
const ids: Record<string, string> = {};

const DIA = 86_400_000;
const dia = (n: number) =>
  new Date(Date.now() + n * DIA - 3 * 3_600_000).toISOString().slice(0, 10);

const comoPerfil = async (perfil: string | null, admin = false) => {
  await owner`delete from mentoria_perfis where user_id = ${ids.carla!}`;
  if (perfil)
    await owner`insert into mentoria_perfis (user_id, perfil, admin)
      values (${ids.carla!}, ${perfil}, ${admin})`;
  return h.signIn('carla@npac.com.br');
};
const acomp = () => comoPerfil('ACOMPANHAMENTO');
const operacao = () => comoPerfil('OPERACAO');
const manu = () => comoPerfil('ESPECIALISTA');
const diretor = () => h.signIn('diretor@npac.com.br');

let n = 0;
const inscricao = async (responsavel: string | null = null) => {
  n += 1;
  const [i] = await owner<{ id: string }[]>`
    insert into mentoria_inscricoes (tipo, mentoria, status, inicio_jornada, termino_previsto, responsavel_id)
    values ('INDIVIDUAL', 'RDV', 'ATIVO', ${dia(-60)}::date, ${dia(300)}::date, ${responsavel})
    returning id`;
  await owner`insert into mentoria_pessoas (inscricao_id, ordem, nome, nome_norm)
    values (${i!.id}, 1, ${`Mentorado Fictício ${n}`}, ${`mentorado ficticio ${n}`})`;
  return i!.id;
};
/** A Especialista enxerga a ficha só da inscrição em que conduz uma reunião. */
const conduzir = (insc: string) =>
  owner`insert into mentoria_reunioes (inscricao_id, tipo, conduzida_por, inicio, status)
    values (${insc}, 'POSICIONAMENTO', ${ids.carla!}, now() - interval '1 hour', 'REALIZADA')`;

const url = (insc: string) => `/api/mentoria/inscricoes/${insc}/evolucao`;
const ler = async (s: string, insc: string) => {
  const r = await h.get(url(insc), s);
  expect(r.status, r.text).toBe(200);
  return r.body as EvolucaoDTO;
};
const salvar = (s: string, insc: string, b: object) => h.put(url(insc), b, s);
const salvarOk = async (s: string, insc: string, b: object) => {
  const r = await salvar(s, insc, b);
  expect(r.status, r.text).toBe(200);
  return r.body as { version: number };
};
const novaConquista = (s: string, insc: string, b: object = {}) =>
  h.post(
    `/api/mentoria/inscricoes/${insc}/conquistas`,
    { data: dia(-1), descricao: 'Quitou o cartão', ...b },
    s,
  );
const novaConquistaOk = async (s: string, insc: string, b: object = {}) => {
  const r = await novaConquista(s, insc, b);
  expect(r.status, r.text).toBe(201);
  return r.body as ConquistaDTO;
};
const ficha = async (s: string, insc: string) => {
  const r = await h.get(`/api/mentoria/inscricoes/${insc}`, s);
  expect(r.status, r.text).toBe(200);
  return r.body as FichaDTO;
};
const historico = (insc: string) =>
  owner<{ tipo: string; campos: string[] }[]>`
    select tipo, campos from mentoria_historico where inscricao_id = ${insc} order by id`;

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xda, 0x00, 0x08, 0x01, 0x02, 0x03, 0x04, 0xff, 0xd9]);
const MP4 = Buffer.concat([
  Buffer.from([0x00, 0x00, 0x00, 0x18]),
  Buffer.from('ftypisom', 'latin1'),
  Buffer.alloc(12),
]);
const PDF = Buffer.from('%PDF-1.4\n%fictício\n');
const subir = (s: string, dono: string, donoId: string, arquivo: Buffer, nome: string) =>
  request(app.getHttpServer())
    .post(`/api/mentoria/${dono}/${donoId}/midia`)
    .set('Origin', ORIGIN)
    .set('Cookie', s)
    .attach('arquivo', arquivo, { filename: nome });

beforeAll(async () => {
  app = await createTestApp();
  h = api(app);
  for (const u of ['carla', 'diretor']) {
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

describe('ler e salvar', () => {
  it('Admin e Acompanhamento: GET traz version 0 e campos nulos numa inscrição nova', async () => {
    const i = await inscricao();
    for (const s of [await diretor(), await acomp()]) {
      const e = await ler(s, i);
      expect(e).toMatchObject({
        inscricaoId: i,
        version: 0,
        atualAtualizadoEm: null,
        atualAtualizadoPor: null,
        fotoInicial: null,
        fotoAtual: null,
        conquistas: [],
        podeEditar: true,
      });
      expect(Object.values(e.campos).every((v) => v === null)).toBe(true);
      expect(Object.keys(e.campos).sort()).toEqual(
        [
          'areaAtuacao',
          'atualNotas',
          'inicialNotas',
          'investimentos',
          'renda',
          'reservaAntes',
          'reservaHoje',
          'saude',
        ].sort(),
      );
    }
  });

  it('PUT salva reservaAntes e atualNotas; GET devolve decifrado; atualAtualizadoPor = nome de quem salvou', async () => {
    const i = await inscricao();
    const s = await acomp();
    const r1 = await salvarOk(s, i, { version: 0, reservaAntes: 'Nenhuma reserva' });
    expect(r1.version).toBe(1);
    let e = await ler(s, i);
    expect(e.campos.reservaAntes).toBe('Nenhuma reserva');
    expect(e.atualAtualizadoPor).toBeNull();
    const r2 = await salvarOk(s, i, { version: 1, atualNotas: 'Renda: dobrou\nSaúde: 🙂' });
    expect(r2.version).toBe(2);
    e = await ler(s, i);
    expect(e).toMatchObject({ version: 2, atualAtualizadoPor: 'Carla' });
    expect(e.campos).toMatchObject({
      reservaAntes: 'Nenhuma reserva',
      atualNotas: 'Renda: dobrou\nSaúde: 🙂',
    });
    expect(e.atualAtualizadoEm).not.toBeNull();
    // Cifrado no banco: o texto não aparece cru.
    const [cru] = await owner<{ reserva_antes: string; atual_notas: string }[]>`
      select reserva_antes, atual_notas from mentoria_evolucao where inscricao_id = ${i}`;
    expect(cru!.reserva_antes).not.toContain('reserva');
    expect(cru!.atual_notas).not.toContain('dobrou');
    // Vazio apaga.
    await salvarOk(s, i, { version: 2, reservaAntes: '   ' });
    expect((await ler(s, i)).campos.reservaAntes).toBeNull();
  });

  it('PUT com version velha → 409 VERSION_CONFLICT; version 0 com linha já criada também', async () => {
    const i = await inscricao();
    const s = await acomp();
    await salvarOk(s, i, { version: 0, renda: 'A' });
    await salvarOk(s, i, { version: 1, saude: 'B' });
    const r = await salvar(s, i, { version: 1, renda: 'C' });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('VERSION_CONFLICT');
    expect((await salvar(s, i, { version: 0, renda: 'D' })).status).toBe(409);
    expect((await ler(s, i)).campos.renda).toBe('A');
  });

  it('PUT com campo fora da lista, 2.001 caracteres ou só version → 400 em português', async () => {
    const i = await inscricao();
    const s = await acomp();
    const fora = await salvar(s, i, { version: 0, renda: 'a', dor: 'x' });
    expect(fora.status).toBe(400);
    expect(fora.body.message).toBe('Dados inválidos');
    const longo = await salvar(s, i, { version: 0, renda: 'x'.repeat(2001) });
    expect(longo.status).toBe(400);
    expect(longo.body.message).toBe('Escreva até 2.000 caracteres por campo');
    const vazio = await salvar(s, i, { version: 0 });
    expect(vazio.status).toBe(400);
    expect(vazio.body.message).toBe('Envie ao menos um campo');
  });

  it('histórico grava evolucao.editada só com nomes de campos', async () => {
    const i = await inscricao();
    const s = await acomp();
    await salvarOk(s, i, { version: 0, renda: 'Texto secreto da renda', atualNotas: 'Outro' });
    const hs = await historico(i);
    expect(hs).toEqual([{ tipo: 'evolucao.editada', campos: ['renda', 'atualNotas'] }]);
    expect(JSON.stringify(hs)).not.toContain('secreto');
  });
});

describe('quem vê e quem edita', () => {
  it('Operação: GET 200 e podeEditar false; PUT e conquista 404', async () => {
    const i = await inscricao();
    await salvarOk(await acomp(), i, { version: 0, renda: 'Dobrou' });
    const s = await operacao();
    const e = await ler(s, i);
    expect(e).toMatchObject({ podeEditar: false, campos: { renda: 'Dobrou' } });
    expect((await salvar(s, i, { version: 1, renda: 'X' })).status).toBe(404);
    expect((await novaConquista(s, i)).status).toBe(404);
    expect((await subir(s, 'evolucao-inicial', i, JPEG, 'a.jpg')).status).toBe(404);
  });

  it('Especialista: GET, PUT, POST conquista, foto e DELETE conquista → 404', async () => {
    const i = await inscricao();
    await conduzir(i);
    const c = await novaConquistaOk(await acomp(), i);
    const s = await manu();
    expect((await h.get(url(i), s)).status).toBe(404);
    expect((await salvar(s, i, { version: 0, renda: 'X' })).status).toBe(404);
    expect((await novaConquista(s, i)).status).toBe(404);
    expect((await subir(s, 'evolucao-atual', i, JPEG, 'a.jpg')).status).toBe(404);
    expect((await subir(s, 'conquista', c.id, JPEG, 'a.jpg')).status).toBe(404);
    expect((await h.del(`/api/mentoria/conquistas/${c.id}`, {}, s)).status).toBe(404);
  });

  it('"só a carteira": inscrição fora da carteira → 404 em GET, PUT, conquista e foto', async () => {
    const minha = await inscricao(ids.carla!);
    const outra = await inscricao();
    const c = await novaConquistaOk(await diretor(), outra);
    await comoPerfil('ACOMPANHAMENTO');
    const p = await h.put(
      '/api/mentoria/perfis',
      { userId: ids.carla!, perfil: 'ACOMPANHAMENTO', admin: false, alcance: 'CARTEIRA' },
      await diretor(),
    );
    expect(p.status, p.text).toBe(200);
    const s = await h.signIn('carla@npac.com.br');
    expect((await ler(s, minha)).podeEditar).toBe(true);
    await salvarOk(s, minha, { version: 0, renda: 'Minha' });
    expect((await h.get(url(outra), s)).status).toBe(404);
    expect((await salvar(s, outra, { version: 0, renda: 'X' })).status).toBe(404);
    expect((await novaConquista(s, outra)).status).toBe(404);
    expect((await subir(s, 'evolucao-inicial', outra, JPEG, 'a.jpg')).status).toBe(404);
    expect((await subir(s, 'conquista', c.id, JPEG, 'a.jpg')).status).toBe(404);
    expect((await h.del(`/api/mentoria/conquistas/${c.id}`, {}, s)).status).toBe(404);
  });

  it('ficha traz pode.verEvolucao/pode.evolucao certos por perfil', async () => {
    const i = await inscricao();
    await conduzir(i);
    expect((await ficha(await diretor(), i)).pode).toMatchObject({
      verEvolucao: true,
      evolucao: true,
    });
    expect((await ficha(await acomp(), i)).pode).toMatchObject({
      verEvolucao: true,
      evolucao: true,
    });
    expect((await ficha(await operacao(), i)).pode).toMatchObject({
      verEvolucao: true,
      evolucao: false,
    });
    expect((await ficha(await manu(), i)).pode).toMatchObject({
      verEvolucao: false,
      evolucao: false,
    });
  });

  it('inscrição que não existe → 404', async () => {
    const s = await diretor();
    const nada = '00000000-0000-4000-8000-000000000000';
    expect((await h.get(url(nada), s)).status).toBe(404);
    expect((await salvar(s, nada, { version: 0, renda: 'X' })).status).toBe(404);
    expect((await novaConquista(s, nada)).status).toBe(404);
  });
});

describe('o que vem das outras abas', () => {
  it('GET traz daAba (dor, sonho, meta), partida (centavos, concluidoEm) e pilares INICIAL por pessoa', async () => {
    const i = await inscricao();
    const s = await acomp();
    const m = await h.put(
      `/api/mentoria/inscricoes/${i}/momento`,
      {
        version: 0,
        recebeCentavos: 500_000,
        custoCentavos: 400_000,
        temDividas: true,
        dividasCentavos: 1_000_000,
        guardadoCentavos: 20_000,
        dor: 'Dívida no cartão',
        sonho: 'Casa própria',
        meta: 'Reserva de 6 meses',
      },
      s,
    );
    expect(m.status, m.text).toBe(200);
    const f = await ficha(s, i);
    const pessoa = f.pessoas[0]!;
    const a = await h.put(
      `/api/mentoria/pessoas/${pessoa.id}/avaliacoes`,
      { tipo: 'PILARES', notaFe: 8, notaSaude: 5, notaDinheiro: 3, notaRelacionamentos: 9 },
      s,
    );
    expect(a.status, a.text).toBe(200);
    let e = await ler(s, i);
    expect(e.daAba).toEqual({
      dor: 'Dívida no cartão',
      sonho: 'Casa própria',
      meta: 'Reserva de 6 meses',
    });
    expect(e.partida).toEqual({
      recebeCentavos: 500_000,
      custoCentavos: 400_000,
      dividasCentavos: 1_000_000,
      guardadoCentavos: 20_000,
      concluidoEm: null,
    });
    expect(e.pilares).toEqual([
      { pessoaId: pessoa.id, nome: pessoa.nome, fe: 8, saude: 5, dinheiro: 3, relacionamentos: 9 },
    ]);
    const c = await h.post(`/api/mentoria/inscricoes/${i}/momento/concluir`, {}, s);
    expect(c.status, c.text).toBe(200);
    e = await ler(s, i);
    expect(e.partida.concluidoEm).not.toBeNull();
  });

  it('sem momento nem pilares: partida nula e pilares com notas nulas', async () => {
    const i = await inscricao();
    const e = await ler(await acomp(), i);
    expect(e.daAba).toEqual({ dor: null, sonho: null, meta: null });
    expect(e.partida).toEqual({
      recebeCentavos: null,
      custoCentavos: null,
      dividasCentavos: null,
      guardadoCentavos: null,
      concluidoEm: null,
    });
    expect(e.pilares).toHaveLength(1);
    expect(e.pilares[0]).toMatchObject({
      fe: null,
      saude: null,
      dinheiro: null,
      relacionamentos: null,
    });
  });
});

describe('conquistas e fotos', () => {
  it('conquista: POST, foto e vídeo aceitos, PDF recusado (400); DELETE 204 e a mídia entra na fila', async () => {
    const i = await inscricao();
    const s = await acomp();
    const c1 = await novaConquistaOk(s, i, { data: dia(-10), descricao: 'Primeira' });
    expect(c1).toMatchObject({ data: dia(-10), descricao: 'Primeira', midia: null });
    const c2 = await novaConquistaOk(s, i, { data: null, descricao: 'Sem data' });
    const c3 = await novaConquistaOk(s, i, { data: dia(-2), descricao: null });
    const foto = await subir(s, 'conquista', c1.id, JPEG, 'a.jpg');
    expect(foto.status, foto.text).toBe(201);
    const video = await subir(s, 'conquista', c3.id, MP4, 'v.mp4');
    expect(video.status, video.text).toBe(201);
    expect(video.body.tipo).toBe('VIDEO');
    const pdf = await subir(s, 'conquista', c2.id, PDF, 'c.pdf');
    expect(pdf.status).toBe(400);
    expect(pdf.body.message).toBe('Envie uma foto ou um vídeo');
    const e = await ler(s, i);
    // Por data, sem data por último.
    expect(e.conquistas.map((c) => c.id)).toEqual([c1.id, c3.id, c2.id]);
    expect(e.conquistas[0]!.midia).toEqual({ id: foto.body.id, tipo: 'FOTO' });
    expect(e.conquistas[1]!.midia).toEqual({ id: video.body.id, tipo: 'VIDEO' });
    // Trocar a mídia da conquista manda a anterior para a fila.
    const outra = await subir(s, 'conquista', c1.id, JPEG, 'b.jpg');
    expect(outra.status, outra.text).toBe(201);
    expect((await ler(s, i)).conquistas[0]!.midia?.id).toBe(outra.body.id);
    const del = await h.del(`/api/mentoria/conquistas/${c1.id}`, {}, s);
    expect(del.status, del.text).toBe(204);
    expect((await ler(s, i)).conquistas.map((c) => c.id)).toEqual([c3.id, c2.id]);
    expect(
      await owner`select 1 from mentoria_midia where id in (${foto.body.id}, ${outra.body.id})`,
    ).toHaveLength(0);
    expect(await owner`select 1 from mentoria_midia_exclusao`).toHaveLength(2);
    expect((await h.del(`/api/mentoria/conquistas/${c1.id}`, {}, s)).status).toBe(404);
    expect((await historico(i)).map((x) => [x.tipo, x.campos])).toEqual([
      ['conquista.adicionada', ['data', 'descricao']],
      ['conquista.adicionada', ['descricao']],
      ['conquista.adicionada', ['data']],
      ['conquista.removida', []],
    ]);
  });

  it('conquista: data fora da faixa e descrição com 501 caracteres → 400', async () => {
    const i = await inscricao();
    const s = await acomp();
    expect((await novaConquista(s, i, { data: '0025-01-01' })).status).toBe(400);
    const longa = await novaConquista(s, i, { descricao: 'x'.repeat(501) });
    expect(longa.status).toBe(400);
    expect(longa.body.message).toBe('Escreva até 500 caracteres na descrição');
  });

  it('fotos dos momentos: só foto; trocar apaga a anterior; a atual grava o rodapé', async () => {
    const i = await inscricao();
    const s = await acomp();
    expect((await subir(s, 'evolucao-inicial', i, MP4, 'v.mp4')).status).toBe(400);
    const f1 = await subir(s, 'evolucao-inicial', i, JPEG, 'a.jpg');
    expect(f1.status, f1.text).toBe(201);
    let e = await ler(s, i);
    expect(e.version).toBe(1);
    expect(e.fotoInicial?.id).toBe(f1.body.id);
    expect(e.atualAtualizadoPor).toBeNull();
    const f2 = await subir(s, 'evolucao-inicial', i, JPEG, 'b.jpg');
    expect(f2.status, f2.text).toBe(201);
    const a1 = await subir(s, 'evolucao-atual', i, JPEG, 'c.jpg');
    expect(a1.status, a1.text).toBe(201);
    e = await ler(s, i);
    expect(e.fotoInicial?.id).toBe(f2.body.id);
    expect(e.fotoAtual?.id).toBe(a1.body.id);
    expect(e.atualAtualizadoPor).toBe('Carla');
    expect(await owner`select 1 from mentoria_midia where id = ${f1.body.id}`).toHaveLength(0);
    expect(await owner`select 1 from mentoria_midia_exclusao`).toHaveLength(1);
    // A version subiu: um PUT com a version antiga dá conflito.
    expect((await salvar(s, i, { version: 1, renda: 'X' })).status).toBe(409);
    await salvarOk(s, i, { version: e.version, renda: 'X' });
    expect((await historico(i)).filter((x) => x.tipo === 'evolucao.foto')).toEqual([
      { tipo: 'evolucao.foto', campos: ['fotoInicial'] },
      { tipo: 'evolucao.foto', campos: ['fotoInicial'] },
      { tipo: 'evolucao.foto', campos: ['fotoAtual'] },
    ]);
    // A Operação vê a foto (download), mas não envia.
    const op = await operacao();
    expect((await h.get(`/api/mentoria/midia/${a1.body.id}`, op)).status).toBe(200);
  });

  it('anonimizar pela API zera evolução e conquistas e enfileira as fotos', async () => {
    const i = await inscricao();
    const s = await diretor();
    await salvarOk(s, i, { version: 0, renda: 'Dobrou', inicialNotas: 'Começo' });
    const c = await novaConquistaOk(s, i);
    expect((await subir(s, 'conquista', c.id, JPEG, 'a.jpg')).status).toBe(201);
    expect((await subir(s, 'evolucao-inicial', i, JPEG, 'b.jpg')).status).toBe(201);
    const r = await h.post(`/api/mentoria/inscricoes/${i}/anonimizar`, {}, s);
    expect(r.status, r.text).toBe(204);
    const e = await ler(s, i);
    expect(Object.values(e.campos).every((v) => v === null)).toBe(true);
    expect(e.fotoInicial).toBeNull();
    expect(e.conquistas).toHaveLength(1);
    expect(e.conquistas[0]).toMatchObject({ descricao: null, midia: null });
    expect(await owner`select 1 from mentoria_midia_exclusao`).toHaveLength(2);
  });
});

describe('cópia do legado', () => {
  const LEGADO = {
    antesDepois: {
      RESERVA_FINANCEIRA: { antes: 'Nenhuma', depois: 'R$ 30 mil' },
      EVOLUCAO_RENDA: { antes: 'x', depois: 'Dobrou' },
      EVOLUCAO_SAUDE: { depois: 'Perdeu 10 kg' },
      INVESTIMENTOS_MENTORIA: { depois: 'Tesouro Direto' },
      AREA_ATUACAO: { depois: 'Abriu a loja' },
      FE: { antes: 'Afastados' },
      DINHEIRO: { antes: 'Dívidas' },
    },
    notasMomentoInicial: 'Chegaram cansados 😮‍💨',
    notasMomentoAtual: 'Dívidas quitadas\r\nViajaram juntos',
    conquistas: [
      { data: '10/03/2026', descricao: 'Quitou o carro' },
      { data: '03/2026', descricao: 'Primeira viagem' },
    ],
  };
  const legado = () => app.get(EvolucaoLegado);
  /** `texto` cru (sem `JSON.stringify`); `cifrar: false` grava sem cifra (ilegível). */
  const comTexto = async (texto: string, cifrar = true) => {
    const i = await inscricao();
    const dados = cifrar
      ? app.get(MentoriaCrypto).cifrarTexto(texto, aad('mentoria_legado', 'dados', i))
      : texto;
    await owner`insert into mentoria_legado (inscricao_id, dados) values (${i}, ${dados})`;
    return i;
  };
  const comLegado = (dados: unknown) => comTexto(JSON.stringify(dados));

  it('copia reserva, renda, saúde, investimentos, área, notas e conquistas de um legado importado', async () => {
    const i = await comLegado(LEGADO);
    expect(await legado().copiarPendentes()).toBe(1);
    const e = await ler(await diretor(), i);
    expect(e.campos).toEqual({
      reservaAntes: 'Nenhuma',
      reservaHoje: 'R$ 30 mil',
      renda: 'Dobrou',
      saude: 'Perdeu 10 kg',
      investimentos: 'Tesouro Direto',
      areaAtuacao: 'Abriu a loja',
      inicialNotas: 'Chegaram cansados 😮‍💨\nFé: Afastados\nDinheiro: Dívidas',
      atualNotas: 'Dívidas quitadas\r\nViajaram juntos',
    });
    expect(e.atualAtualizadoPor).toBeNull();
    expect(e.conquistas.map((c) => [c.data, c.descricao])).toEqual([
      ['2026-03-10', 'Quitou o carro'],
      [null, 'Primeira viagem'],
    ]);
    // Sem histórico e sem autoria.
    expect(await historico(i)).toEqual([]);
    expect(
      await owner`select 1 from mentoria_conquistas where inscricao_id = ${i} and criado_por is not null`,
    ).toHaveLength(0);
  });

  it('segunda chamada devolve 0 e não duplica conquistas', async () => {
    const i = await comLegado(LEGADO);
    expect(await legado().copiarPendentes()).toBe(1);
    expect(await legado().copiarPendentes()).toBe(0);
    expect(await owner`select 1 from mentoria_conquistas where inscricao_id = ${i}`).toHaveLength(
      2,
    );
  });

  it('não sobrescreve campo que a equipe já escreveu antes da cópia', async () => {
    const i = await comLegado(LEGADO);
    const s = await acomp();
    await salvarOk(s, i, { version: 0, renda: 'Escrito pela equipe', atualNotas: 'Nosso texto' });
    const antes = await ler(s, i);
    expect(await legado().copiarPendentes()).toBe(1);
    const e = await ler(s, i);
    expect(e.campos).toMatchObject({
      renda: 'Escrito pela equipe',
      atualNotas: 'Nosso texto',
      reservaAntes: 'Nenhuma',
      saude: 'Perdeu 10 kg',
    });
    // O rodapé continua o da pessoa que escreveu.
    expect(e.atualAtualizadoPor).toBe('Carla');
    expect(e.atualAtualizadoEm).toBe(antes.atualAtualizadoEm);
    // A version subiu: a fila da tela recebe 409 e recarrega.
    expect(e.version).toBeGreaterThan(antes.version);
  });

  it('duas chamadas em paralelo copiam uma vez só', async () => {
    const i = await comLegado(LEGADO);
    const [a, b] = await Promise.all([legado().copiarPendentes(), legado().copiarPendentes()]);
    expect(a + b).toBe(1);
    expect(await owner`select 1 from mentoria_conquistas where inscricao_id = ${i}`).toHaveLength(
      2,
    );
  });

  it('legado com JSON ilegível: pula, conta 0, não lança; o legível ao lado é copiado', async () => {
    const ruim = await comTexto('não é um texto cifrado', false);
    const quebrado = await comTexto('{ isto não é json');
    expect(await legado().copiarPendentes()).toBe(0);
    const bom = await comLegado(LEGADO);
    expect(await legado().copiarPendentes()).toBe(1);
    // Os ilegíveis continuam pendentes para a próxima subida.
    expect(
      await owner`select 1 from mentoria_evolucao where inscricao_id in (${ruim}, ${quebrado})`,
    ).toHaveLength(0);
    expect(
      await owner`select 1 from mentoria_evolucao where inscricao_id = ${bom} and legado_copiado_em is not null`,
    ).toHaveLength(1);
  });
});
