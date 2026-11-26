import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { normalizarItem } from '@npac/shared';
import type { CicloDTO, CronogramaDTO, FichaDTO, ItemBancoDTO } from '@npac/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MENTORIA_CLOCK } from '../src/mentoria/relogio.js';
import {
  api,
  closeTestApp,
  createTestApp,
  owner,
  resetAuthState,
  type FakeClock,
} from './helpers.js';

// NPAC-60: cronograma do PME (desenho docs/superpowers/specs/2026-11-24-cronograma-design.md, §7 e §10).
let app: NestFastifyApplication;
let h: ReturnType<typeof api>;
let relogio: FakeClock;
const ids: Record<string, string> = {};

const DIA = 86_400_000;
/** Quinta, 10/12/2026, 10h de Brasília. */
const AGORA = Date.parse('2026-12-10T10:00:00-03:00');
const dia = (n: number) => new Date(AGORA - n * DIA - 3 * 3_600_000).toISOString().slice(0, 10);

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
const inscricao = async (
  opts: { mentoria?: string; whatsapp?: string; variante?: string | null } = {},
) => {
  n += 1;
  const [i] = await owner<{ id: string }[]>`
    insert into mentoria_inscricoes (tipo, mentoria, mentoria_variante, status, inicio_jornada,
      termino_previsto)
    values ('INDIVIDUAL', ${opts.mentoria ?? '2M'}, ${opts.variante ?? null}, 'ATIVO', ${dia(60)}::date,
      ${dia(-300)}::date) returning id`;
  await owner`insert into mentoria_pessoas (inscricao_id, ordem, nome, nome_norm, whatsapp_idx)
    values (${i!.id}, 1, ${`Mentorado Fictício ${n}`}, ${`mentorado ficticio ${n}`},
      ${opts.whatsapp ?? `w-${n}`})`;
  return i!.id;
};

/** Itens no banco pelo owner: `qtd` de cada bloco, na ordem. */
const itens: Record<string, string[]> = {};
async function banco(qtd = 4) {
  for (const b of ['EXPERIENCIA', 'DESAFIO', 'FILME', 'LIVRO', 'EAP']) {
    itens[b] = [];
    for (let k = 1; k <= qtd; k++) {
      const texto = `${b} Fictício ${k}`;
      const [r] = await owner<{ id: string }[]>`
        insert into mentoria_cronograma_itens (bloco, texto, texto_norm, ordem)
        values (${b}, ${texto}, ${normalizarItem(texto)}, ${k}) returning id`;
      itens[b]!.push(r!.id);
    }
  }
}

const enviar = (s: string, id: string, b: object = {}) =>
  h.post(`/api/mentoria/inscricoes/${id}/ciclos`, b, s);
const enviarOk = async (s: string, id: string, b: object = {}) => {
  const r = await enviar(s, id, b);
  expect(r.status, r.text).toBe(201);
  return r.body as CicloDTO;
};
const cronograma = async (s: string, id: string) => {
  const r = await h.get(`/api/mentoria/inscricoes/${id}/cronograma`, s);
  expect(r.status, r.text).toBe(200);
  return r.body as CronogramaDTO;
};
/** Os 8 itens do modelo: 1 experiência, 1 desafio, 2 filmes, 1 livro e 3 EAP. */
const modelo = () => [
  { itemId: itens.EXPERIENCIA![0], bloco: 'EXPERIENCIA' },
  { itemId: itens.DESAFIO![0], bloco: 'DESAFIO' },
  { itemId: itens.FILME![0], bloco: 'FILME' },
  { itemId: itens.FILME![1], bloco: 'FILME' },
  { itemId: itens.LIVRO![0], bloco: 'LIVRO' },
  { itemId: itens.EAP![0], bloco: 'EAP' },
  { itemId: itens.EAP![1], bloco: 'EAP' },
  { itemId: itens.EAP![2], bloco: 'EAP' },
];
const historico = async (id: string) =>
  owner<{ tipo: string; campos: string[] }[]>`
    select tipo, campos from mentoria_historico where inscricao_id = ${id} order by id`;

beforeAll(async () => {
  app = await createTestApp();
  h = api(app);
  relogio = app.get(MENTORIA_CLOCK);
  for (const u of ['carla', 'diretor']) {
    const [r] = await owner<{ id: string }[]>`select id from "user" where username = ${u}`;
    ids[u] = r!.id;
  }
});
afterAll(async () => {
  await owner`delete from mentoria_perfis`;
  await owner`truncate mentoria_inscricoes cascade`;
  await owner`delete from mentoria_cronograma_itens`;
  await closeTestApp(app);
});
beforeEach(async () => {
  await resetAuthState();
  await owner`truncate mentoria_inscricoes cascade`;
  await owner`delete from mentoria_perfis`;
  await owner`delete from mentoria_cronograma_itens`;
  await banco();
  relogio.set(AGORA);
});

describe('envio do PME com o cronograma', () => {
  it('a Operação envia o 2º PME com 8 itens: extras → cronograma → encerramento, tudo na %', async () => {
    const i = await inscricao();
    const s = await operacao();
    await enviarOk(s, i);
    const c = await enviarOk(s, i, { cronograma: modelo() });
    expect(c.numero).toBe(2);
    expect(c.tarefas.map((t) => t.origem)).toEqual([
      ...Array(4).fill('EXTRA'),
      ...Array(8).fill('PME'),
      'ENCERRAMENTO',
    ]);
    const pme = c.tarefas.filter((t) => t.origem === 'PME');
    expect(pme.map((t) => t.cronogramaBloco)).toEqual([
      'EXPERIENCIA',
      'DESAFIO',
      'FILME',
      'FILME',
      'LIVRO',
      'EAP',
      'EAP',
      'EAP',
    ]);
    expect(pme[1]!.descricao).toBe('DESAFIO Fictício 1');
    expect(pme.every((t) => t.prazo === c.prazo && t.status === 'PENDENTE')).toBe(true);
    expect(c.pctTarefas).toBe(0);
    // Texto cifrado como as extras; o histórico leva só o nome do campo.
    const [t] = await owner<{ d: string }[]>`
      select descricao as d from mentoria_tarefas where id = ${pme[1]!.id}`;
    expect(t!.d).not.toMatch(/Fictício/);
    const h2 = (await historico(i)).filter((x) => x.tipo === 'pme.enviado');
    expect(h2.at(-1)!.campos).toEqual(['pme_2', 'pme_1_nao_concluido', 'cronograma']);

    // O Acompanhamento marca uma como feita (13 tarefas: 1/13 = 8%); a Operação não marca.
    const sa = await acomp();
    const r = await h.patch(
      `/api/mentoria/tarefas/${pme[0]!.id}`,
      { version: pme[0]!.version, status: 'FEITA' },
      sa,
    );
    expect(r.status, r.text).toBe(200);
    const ficha = (await h.get(`/api/mentoria/inscricoes/${i}`, sa)).body as FichaDTO;
    expect(ficha.ciclos[0]!.pctTarefas).toBe(8);
    const so = await operacao();
    const recusa = await h.patch(
      `/api/mentoria/tarefas/${pme[1]!.id}`,
      { version: pme[1]!.version, status: 'FEITA' },
      so,
    );
    expect(recusa.status).toBe(404);
  });

  it('item "só desta pessoa" vira tarefa sem entrar no banco', async () => {
    const i = await inscricao();
    const c = await enviarOk(await acomp(), i, {
      cronograma: [{ bloco: 'DESAFIO', texto: '  Vender o terreno fictício  ' }],
    });
    const t = c.tarefas.find((x) => x.origem === 'PME')!;
    expect(t).toMatchObject({ cronogramaBloco: 'DESAFIO', descricao: 'Vender o terreno fictício' });
    const [r] = await owner<
      { n: number }[]
    >`select count(*)::int as n from mentoria_cronograma_itens`;
    expect(r!.n).toBe(20);
  });

  it('recusa item escondido, texto vazio, item repetido no envio e mais de 20', async () => {
    const i = await inscricao();
    const s = await operacao();
    await owner`update mentoria_cronograma_itens set ativo = false where id = ${itens.FILME![3]!}`;
    const esc = await enviar(s, i, { cronograma: [{ itemId: itens.FILME![3], bloco: 'FILME' }] });
    expect(esc.status).toBe(400);
    expect(esc.body.message).toBe('Esse item está escondido no banco');
    const vazio = await enviar(s, i, { cronograma: [{ bloco: 'FILME', texto: '   ' }] });
    expect(vazio.status).toBe(400);
    const grande = await enviar(s, i, {
      cronograma: [{ bloco: 'FILME', texto: 'x'.repeat(2001) }],
    });
    expect(grande.status).toBe(400);
    const dup = await enviar(s, i, {
      cronograma: [
        { itemId: itens.FILME![0], bloco: 'FILME' },
        { itemId: itens.FILME![0], bloco: 'FILME' },
      ],
    });
    expect(dup.status).toBe(409);
    const muitos = await enviar(s, i, {
      cronograma: Array.from({ length: 21 }, (_, k) => ({ bloco: 'EAP', texto: `EAP ${k}` })),
    });
    expect(muitos.status).toBe(400);
    // Nada foi criado.
    const [c] = await owner<{ n: number }[]>`
      select count(*)::int as n from mentoria_ciclos where inscricao_id = ${i}`;
    expect(c!.n).toBe(0);
  });

  it('item recebido no RDV da mesma pessoa (WhatsApp igual) → 409 "Esse item já foi do RDV"', async () => {
    const rdv = await inscricao({ mentoria: 'RDV', whatsapp: 'w-mesma' });
    const doisM = await inscricao({ mentoria: '2M', whatsapp: 'w-mesma' });
    const outra = await inscricao({ mentoria: '2M', whatsapp: 'w-outra' });
    const s = await operacao();
    await enviarOk(s, rdv, { cronograma: [{ itemId: itens.LIVRO![0], bloco: 'LIVRO' }] });
    const r = await enviar(s, doisM, { cronograma: [{ itemId: itens.LIVRO![0], bloco: 'LIVRO' }] });
    expect(r.status).toBe(409);
    expect(r.body.message).toBe('Esse item já foi do RDV');
    // Outra pessoa recebe o mesmo item sem problema.
    await enviarOk(s, outra, { cronograma: [{ itemId: itens.LIVRO![0], bloco: 'LIVRO' }] });
    // E a sugestão da 2M pula o livro do RDV.
    const cr = await cronograma(s, doisM);
    expect(cr.sugestao.LIVRO.map((x) => x.id)).toEqual([itens.LIVRO![1]]);
    expect(cr.recebidos).toEqual([
      expect.objectContaining({
        itemId: itens.LIVRO![0],
        bloco: 'LIVRO',
        pmeNumero: 1,
        resultado: 'PENDENTE',
        inscricaoId: rdv,
        mentoria: 'RDV',
        propria: false,
      }),
    ]);
  });

  it('item de um PME anterior da própria inscrição → 409 com o número', async () => {
    const i = await inscricao();
    const s = await operacao();
    await enviarOk(s, i, { cronograma: [{ itemId: itens.EAP![0], bloco: 'EAP' }] });
    const r = await enviar(s, i, { cronograma: [{ itemId: itens.EAP![0], bloco: 'EAP' }] });
    expect(r.status).toBe(409);
    expect(r.body.message).toBe('Esse item já foi do 1º PME');
  });

  it('envio sem cronograma continua igual (extras e encerramento)', async () => {
    const i = await inscricao();
    const c = await enviarOk(await operacao(), i);
    expect(c.tarefas.map((t) => t.origem)).toEqual(['EXTRA', 'EXTRA', 'ENCERRAMENTO']);
    expect((await historico(i)).map((x) => x.campos)).toEqual([['pme_1']]);
  });
});

describe('dados da janela e da aba (GET …/cronograma)', () => {
  it('banco, recebidos, próximo número e sugestão do modelo; PLANEJADO do número primeiro', async () => {
    const i = await inscricao();
    const s = await operacao();
    await enviarOk(s, i, { cronograma: [{ itemId: itens.FILME![0], bloco: 'FILME' }] });
    await owner`insert into mentoria_cronograma_anteriores (inscricao_id, item_id, pme_numero, resultado)
      values (${i}, ${itens.FILME![3]!}, 2, 'PLANEJADO'), (${i}, ${itens.LIVRO![0]!}, null, 'JA_TINHA')`;
    const cr = await cronograma(s, i);
    expect(cr.proximo).toBe(2);
    expect(cr.semCronograma).toBe(false);
    expect(cr.podeEscolher).toBe(true);
    expect(cr.banco).toHaveLength(20);
    expect(cr.sugestao.FILME.map((x) => x.id)).toEqual([itens.FILME![3], itens.FILME![1]]);
    expect(cr.sugestao.LIVRO.map((x) => x.id)).toEqual([itens.LIVRO![1]]);
    expect(cr.sugestao.EAP).toHaveLength(3);
    expect(cr.recebidos.map((r) => r.resultado).sort()).toEqual([
      'JA_TINHA',
      'PENDENTE',
      'PLANEJADO',
    ]);
    // Enviar o 2º com o planejado liga a linha da planilha: ela sai dos recebidos.
    await enviarOk(s, i, { cronograma: [{ itemId: itens.FILME![3], bloco: 'FILME' }] });
    const depois = await cronograma(s, i);
    expect(depois.recebidos.filter((r) => r.itemId === itens.FILME![3])).toEqual([
      expect.objectContaining({ resultado: 'PENDENTE', pmeNumero: 2, propria: true }),
    ]);
  });

  it('inscrição "sem cronograma": sem sugestão', async () => {
    const i = await inscricao({ variante: '2M sem cronograma' });
    const cr = await cronograma(await acomp(), i);
    expect(cr.semCronograma).toBe(true);
    expect(Object.values(cr.sugestao).flat()).toEqual([]);
  });

  it('a ficha diz quem vê a aba Cronograma', async () => {
    const i = await inscricao();
    const pode = async (s: string) =>
      ((await h.get(`/api/mentoria/inscricoes/${i}`, s)).body as FichaDTO).pode.verCronograma;
    expect(await pode(await diretor())).toBe(true);
    expect(await pode(await acomp())).toBe(true);
    expect(await pode(await operacao())).toBe(true);
    await owner`insert into mentoria_reunioes (inscricao_id, tipo, conduzida_por, inicio)
      values (${i}, 'POSICIONAMENTO', ${ids.carla!}, now())`;
    expect(await pode(await manu())).toBe(false);
  });
});

describe('incluir e tirar itens do PME em andamento', () => {
  it('inclui no ciclo aberto, tira o pendente, recusa tirar o feito e incluir em ciclo fechado', async () => {
    const i = await inscricao();
    const s = await operacao();
    const c1 = await enviarOk(s, i);
    const inc = await h.post(
      `/api/mentoria/ciclos/${c1.id}/cronograma`,
      {
        cronograma: [
          { itemId: itens.EAP![0], bloco: 'EAP' },
          { bloco: 'EAP', texto: 'Vídeo extra' },
        ],
      },
      s,
    );
    expect(inc.status, inc.text).toBe(201);
    const c = inc.body as CicloDTO;
    const pme = c.tarefas.filter((t) => t.origem === 'PME');
    expect(pme).toHaveLength(2);
    expect((await historico(i)).at(-1)).toEqual({
      tipo: 'pme.cronograma_incluido',
      campos: ['EAP'],
    });
    // Repetir o item no mesmo PME.
    const rep = await h.post(
      `/api/mentoria/ciclos/${c1.id}/cronograma`,
      { cronograma: [{ itemId: itens.EAP![0], bloco: 'EAP' }] },
      s,
    );
    expect(rep.status).toBe(409);
    expect(rep.body.message).toBe('Esse item já está neste PME');

    const tira = await h.del(
      `/api/mentoria/tarefas/${pme[0]!.id}/cronograma`,
      {
        version: pme[0]!.version,
      },
      s,
    );
    expect(tira.status, tira.text).toBe(204);
    expect((await historico(i)).at(-1)).toEqual({
      tipo: 'pme.cronograma_removido',
      campos: ['EAP'],
    });

    const sa = await acomp();
    await h.patch(
      `/api/mentoria/tarefas/${pme[1]!.id}`,
      { version: pme[1]!.version, status: 'FEITA' },
      sa,
    );
    const feita = await h.del(
      `/api/mentoria/tarefas/${pme[1]!.id}/cronograma`,
      {
        version: pme[1]!.version + 1,
      },
      sa,
    );
    expect(feita.status).toBe(400);
    expect(feita.body.message).toBe('Item já marcado ou com comprovante não sai do PME');
    const velha = await h.del(
      `/api/mentoria/tarefas/${pme[1]!.id}/cronograma`,
      {
        version: pme[1]!.version,
      },
      sa,
    );
    expect(velha.status).toBe(409);

    // Ciclo fechado (encerramento feito) não recebe item.
    const enc = c.tarefas.find((t) => t.origem === 'ENCERRAMENTO')!;
    await h.patch(`/api/mentoria/tarefas/${enc.id}`, { version: enc.version, status: 'FEITA' }, sa);
    const fechado = await h.post(
      `/api/mentoria/ciclos/${c1.id}/cronograma`,
      { cronograma: [{ itemId: itens.EAP![1], bloco: 'EAP' }] },
      sa,
    );
    expect(fechado.status).toBe(400);
    expect(fechado.body.message).toBe('Só entra item no PME em andamento');
  });
});

describe('banco de itens (Configurações → Cronograma, só a Admin)', () => {
  it('a Admin cria, corrige e esconde; texto repetido → 409; versão velha → 409', async () => {
    const s = await diretor();
    const lista = await h.get('/api/mentoria/cronograma/itens?bloco=FILME', s);
    expect(lista.status).toBe(200);
    expect((lista.body as ItemBancoDTO[]).map((x) => x.texto)).toEqual([
      'FILME Fictício 1',
      'FILME Fictício 2',
      'FILME Fictício 3',
      'FILME Fictício 4',
    ]);
    const novo = await h.post(
      '/api/mentoria/cronograma/itens',
      { bloco: 'FILME', texto: ' Filme Novo ' },
      s,
    );
    expect(novo.status, novo.text).toBe(201);
    const item = novo.body as ItemBancoDTO;
    expect(item).toMatchObject({
      bloco: 'FILME',
      texto: 'Filme Novo',
      ordem: 5,
      ativo: true,
      version: 1,
      envios: 0,
    });
    const rep = await h.post(
      '/api/mentoria/cronograma/itens',
      { bloco: 'FILME', texto: 'filme, NOVO!' },
      s,
    );
    expect(rep.status).toBe(409);
    expect(rep.body.message).toBe('Esse item já está no banco');
    // O mesmo texto em outro bloco pode.
    const outro = await h.post(
      '/api/mentoria/cronograma/itens',
      { bloco: 'LIVRO', texto: 'Filme Novo' },
      s,
    );
    expect(outro.status).toBe(201);

    const ed = await h.patch(
      `/api/mentoria/cronograma/itens/${item.id}`,
      { version: 1, texto: 'Filme Novo (corrigido)' },
      s,
    );
    expect(ed.status, ed.text).toBe(200);
    expect(ed.body).toMatchObject({ texto: 'Filme Novo (corrigido)', version: 2 });
    const choca = await h.patch(
      `/api/mentoria/cronograma/itens/${item.id}`,
      { version: 2, texto: 'FILME Fictício 1' },
      s,
    );
    expect(choca.status).toBe(409);
    const esc = await h.patch(
      `/api/mentoria/cronograma/itens/${item.id}`,
      { version: 2, ativo: false },
      s,
    );
    expect(esc.body).toMatchObject({ ativo: false, version: 3 });
    const velha = await h.patch(
      `/api/mentoria/cronograma/itens/${item.id}`,
      { version: 2, ativo: true },
      s,
    );
    expect(velha.status).toBe(409);
    expect(velha.body.code).toBe('VERSION_CONFLICT');
    expect(
      (
        await h.patch(
          `/api/mentoria/cronograma/itens/${crypto.randomUUID()}`,
          { version: 1, ativo: true },
          s,
        )
      ).status,
    ).toBe(404);

    // "envios" conta as tarefas que usam o item.
    const i = await inscricao();
    await enviarOk(s, i, { cronograma: [{ itemId: itens.FILME![0], bloco: 'FILME' }] });
    const todos = (await h.get('/api/mentoria/cronograma/itens', s)).body as ItemBancoDTO[];
    expect(todos.find((x) => x.id === itens.FILME![0])!.envios).toBe(1);
    expect(todos.map((x) => x.bloco).filter((b, k, a) => a.indexOf(b) === k)).toEqual([
      'EXPERIENCIA',
      'DESAFIO',
      'FILME',
      'LIVRO',
      'EAP',
    ]);
  });

  it('Acompanhamento e Operação recebem 404 no banco', async () => {
    for (const s of [await acomp(), await operacao()]) {
      expect((await h.get('/api/mentoria/cronograma/itens', s)).status).toBe(404);
      expect(
        (await h.post('/api/mentoria/cronograma/itens', { bloco: 'EAP', texto: 'X' }, s)).status,
      ).toBe(404);
      expect(
        (
          await h.patch(
            `/api/mentoria/cronograma/itens/${itens.EAP![0]!}`,
            { version: 1, ativo: false },
            s,
          )
        ).status,
      ).toBe(404);
    }
  });
});

describe('Especialista: 404 em tudo do cronograma', () => {
  it('rotas novas e o envio com itens', async () => {
    const i = await inscricao();
    const c = await enviarOk(await operacao(), i, {
      cronograma: [{ itemId: itens.EAP![0], bloco: 'EAP' }],
    });
    const t = c.tarefas.find((x) => x.origem === 'PME')!;
    await owner`insert into mentoria_reunioes (inscricao_id, tipo, conduzida_por, inicio)
      values (${i}, 'POSICIONAMENTO', ${ids.carla!}, now())`;
    const s = await manu();
    expect((await h.get(`/api/mentoria/inscricoes/${i}/cronograma`, s)).status).toBe(404);
    expect(
      (
        await h.post(
          `/api/mentoria/ciclos/${c.id}/cronograma`,
          { cronograma: [{ itemId: itens.EAP![1], bloco: 'EAP' }] },
          s,
        )
      ).status,
    ).toBe(404);
    expect(
      (await h.del(`/api/mentoria/tarefas/${t.id}/cronograma`, { version: t.version }, s)).status,
    ).toBe(404);
    expect((await h.get('/api/mentoria/cronograma/itens', s)).status).toBe(404);
    expect(
      (await h.post('/api/mentoria/cronograma/itens', { bloco: 'EAP', texto: 'X' }, s)).status,
    ).toBe(404);
    expect(
      (
        await h.patch(
          `/api/mentoria/cronograma/itens/${itens.EAP![0]!}`,
          { version: 1, ativo: false },
          s,
        )
      ).status,
    ).toBe(404);
    // Na ficha, o card do PME não traz as tarefas do cronograma.
    const ficha = (await h.get(`/api/mentoria/inscricoes/${i}`, s)).body as FichaDTO;
    expect(ficha.ciclos.flatMap((x) => x.tarefas).filter((x) => x.origem === 'PME')).toEqual([]);
  });
});
