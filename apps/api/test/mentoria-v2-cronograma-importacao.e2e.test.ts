import { readFileSync } from 'node:fs';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { CronogramaDTO, PreviaCronograma, ResultadoCronograma } from '@npac/shared';
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

// NPAC-60, fase 3: importação da planilha do cronograma (desenho §8, C8, C13–C15). A planilha é a fixture fictícia
// do shared (mesma forma da real; o arquivo da equipe nunca entra aqui).
const CSV = readFileSync(
  new URL('../../../packages/shared/test/fixtures/cronograma-ficticio.csv', import.meta.url),
  'utf8',
);

let app: NestFastifyApplication;
let h: ReturnType<typeof api>;
let relogio: FakeClock;
const ids: Record<string, string> = {};
const insc = {} as Record<'i301' | 'i302' | 'i304' | 'i306r' | 'i306d', string>;

const DIA = 86_400_000;
/** Quinta, 10/12/2026, 10h de Brasília. */
const AGORA = Date.parse('2026-12-10T10:00:00-03:00');
const dia = (n: number) => new Date(AGORA - n * DIA - 3 * 3_600_000).toISOString().slice(0, 10);
const norm = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

const comoPerfil = async (perfil: string | null, admin = false) => {
  await owner`delete from mentoria_perfis where user_id = ${ids.carla!}`;
  if (perfil)
    await owner`insert into mentoria_perfis (user_id, perfil, admin)
      values (${ids.carla!}, ${perfil}, ${admin})`;
  return h.signIn('carla@npac.com.br');
};

async function inscricao(
  mentoria: string,
  status: string,
  nomes: string[],
  whatsapp: string | null = null,
) {
  const [i] = await owner<{ id: string }[]>`
    insert into mentoria_inscricoes (tipo, mentoria, status, inicio_jornada, termino_previsto)
    values (${nomes.length === 2 ? 'CASAL' : 'INDIVIDUAL'}, ${mentoria}, ${status}, ${dia(90)}::date,
      ${dia(-270)}::date) returning id`;
  for (const [k, nome] of nomes.entries())
    await owner`insert into mentoria_pessoas (inscricao_id, ordem, nome, nome_norm, whatsapp_idx)
      values (${i!.id}, ${k + 1}, ${nome}, ${norm(nome)}, ${k === 0 ? whatsapp : null})`;
  return i!.id;
}

const previa = async (s: string, body: object = {}) => {
  const r = await h.post('/api/mentoria/cronograma/importar/previa', { csv: CSV, ...body }, s);
  expect(r.status, r.text).toBe(200);
  return r.body as PreviaCronograma;
};
const importar = async (s: string, body: object = {}) => {
  const r = await h.post('/api/mentoria/cronograma/importar', { csv: CSV, ...body }, s);
  expect(r.status, r.text).toBe(200);
  return r.body as ResultadoCronograma;
};
const contagens = async () => {
  const [r] = await owner<
    { itens: number; anteriores: number; tarefas: number; ciclos: number; hist: number }[]
  >`select (select count(*)::int from mentoria_cronograma_itens) as itens,
      (select count(*)::int from mentoria_cronograma_anteriores) as anteriores,
      (select count(*)::int from mentoria_tarefas where origem = 'PME') as tarefas,
      (select count(*)::int from mentoria_ciclos) as ciclos,
      (select count(*)::int from mentoria_historico) as hist`;
  return r!;
};
const anteriores = (id: string) =>
  owner<{ texto: string; pme_numero: number | null; resultado: string }[]>`
    select i.texto, x.pme_numero, x.resultado from mentoria_cronograma_anteriores x
    join mentoria_cronograma_itens i on i.id = x.item_id
    where x.inscricao_id = ${id}
    order by array_position(array['EXPERIENCIA','DESAFIO','FILME','LIVRO','EAP'], i.bloco), i.ordem`;

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
  relogio.set(AGORA);
  // 301: 2M ativo com o 2º PME aberto (C8). 302/303 e 304/305: casais sem PME. 306: RDV concluído e 2M
  // da mesma pessoa (dúvida). "Mentorada" (só o primeiro nome) casa com os dois casais.
  insc.i301 = await inscricao('2M', 'ATIVO', ['Mentorado Fictício 301']);
  await owner`insert into mentoria_ciclos (inscricao_id, numero, enviado_em, concluido_em)
    values (${insc.i301}, 1, ${dia(50)}, ${dia(25)})`;
  await owner`insert into mentoria_ciclos (inscricao_id, numero, enviado_em)
    values (${insc.i301}, 2, ${dia(10)})`;
  insc.i302 = await inscricao('RDV', 'ATIVO', ['Mentorado Fictício 303', 'Mentorada Fictícia 302']);
  insc.i304 = await inscricao('6M', 'ATIVO', ['Mentorada Fictícia 304', 'Mentorado Fictício 305']);
  insc.i306r = await inscricao('RDV', 'CONCLUIDO', ['Mentorado Fictício 306'], 'w306');
  insc.i306d = await inscricao('2M', 'ATIVO', ['Mentorado Fictício 306'], 'w306');
  // "O Pacto" já está no banco (outra grafia).
  await owner`insert into mentoria_cronograma_itens (bloco, texto, texto_norm, ordem)
    values ('FILME', 'O PACTO', 'o pacto', 1)`;
});

describe('prévia', () => {
  it('itens por bloco, colunas casadas, dúvidas com as candidatas e as contagens da regra C8', async () => {
    const s = await h.signIn('diretor@npac.com.br');
    const p = await previa(s, { arquivo: 'CRONOGRAMA - CRONOGRAMA.csv' });
    expect(p.itens).toEqual([
      { bloco: 'EXPERIENCIA', novos: 3, existentes: 0, juntados: 0 },
      { bloco: 'DESAFIO', novos: 3, existentes: 0, juntados: 0 },
      { bloco: 'FILME', novos: 2, existentes: 1, juntados: 0 },
      { bloco: 'LIVRO', novos: 3, existentes: 0, juntados: 0 },
      { bloco: 'EAP', novos: 3, existentes: 0, juntados: 1 },
    ]);
    const col = (c: number) => p.colunas.find((x) => x.coluna === c)!;
    expect(col(3)).toMatchObject({
      nome: 'Mentorado Fictício 301',
      situacao: 'LIGADA',
      inscricaoId: insc.i301,
      maiorMes: 3,
      marcas: 12,
    });
    expect(col(11)).toMatchObject({ situacao: 'LIGADA', inscricaoId: insc.i301 });
    expect(col(4)).toMatchObject({ situacao: 'LIGADA', inscricaoId: insc.i302 });
    expect(col(5)).toMatchObject({ situacao: 'LIGADA', inscricaoId: insc.i304 });
    // Ponto de atenção 4: RDV e 2M da mesma pessoa nunca ligam sozinhos.
    expect(col(6)).toMatchObject({
      situacao: 'DUVIDA',
      inscricaoId: null,
      maiorMes: 12,
      dica: 'Vai até o 12º mês: deve ser o RDV. Vale também na 2M.',
    });
    expect(col(6).candidatas.map((c) => [c.mentoria, c.status])).toEqual(
      expect.arrayContaining([
        ['RDV', 'CONCLUIDO'],
        ['2M', 'ATIVO'],
      ]),
    );
    expect(col(7)).toMatchObject({ situacao: 'DUVIDA', inscricaoId: null });
    expect(col(8)).toMatchObject({ situacao: 'SEM_FICHA', candidatas: [] });
    expect(col(10)).toMatchObject({ situacao: 'SEM_MARCACAO' });
    expect(p.ligadas).toBe(4);
    expect(p.mesmaFicha).toEqual([
      { inscricaoId: insc.i301, nome: 'Mentorado Fictício 301', colunas: [3, 11] },
    ]);
    // 301 (2º PME aberto): mês 2 = 6 tarefas, meses 1 = recebidos (5 com a coluna K), 3 = planejado, 1 já tinha.
    // 302: 3 recebidos, 1 não fez, 1 já tinha. 304: 1 recebido, 2 não fez, 1 já tinha.
    expect({
      tarefas: p.tarefas,
      recebidos: p.recebidos,
      planejados: p.planejados,
      jaTinha: p.jaTinha,
      naoFez: p.naoFez,
    }).toEqual({ tarefas: 6, recebidos: 9, planejados: 1, jaTinha: 3, naoFez: 3 });
    expect(p.ignoradas).toEqual({ MES_FORA: 1, TEXTO: 1 });
    expect(p.fichas).toHaveLength(5);
    // A prévia não grava nada.
    expect(await contagens()).toMatchObject({ itens: 1, anteriores: 0, tarefas: 0 });
  });

  it('com a decisão da Admin a coluna em dúvida entra; "IGNORAR" tira uma ligada', async () => {
    const s = await h.signIn('diretor@npac.com.br');
    const p = await previa(s, { decisoes: { 5: insc.i306r, 4: 'IGNORAR' } });
    expect(p.colunas.find((x) => x.indice === 5)!.inscricaoId).toBe(insc.i306r);
    expect(p.colunas.find((x) => x.indice === 4)!.inscricaoId).toBeNull();
    // +4 recebidos e +1 já tinha do RDV; −1 não fez −1 recebido −1 já tinha do casal 304 ignorado.
    expect({ recebidos: p.recebidos, jaTinha: p.jaTinha, naoFez: p.naoFez }).toEqual({
      recebidos: 12,
      jaTinha: 3,
      naoFez: 1,
    });
  });

  it('decisão para ficha ou coluna que não existe: 400', async () => {
    const s = await h.signIn('diretor@npac.com.br');
    for (const decisoes of [{ 5: '00000000-0000-4000-8000-000000000000' }, { 99: 'IGNORAR' }]) {
      const r = await h.post('/api/mentoria/cronograma/importar/previa', { csv: CSV, decisoes }, s);
      expect(r.status).toBe(400);
    }
  });

  it('.xlsx (ou o zip do Excel) e arquivo sem os blocos: 400 com o que fazer', async () => {
    const s = await h.signIn('diretor@npac.com.br');
    const casos = [
      { csv: CSV, arquivo: 'CRONOGRAMA.xlsx' },
      { csv: 'PK\u0003\u0004conteudo', arquivo: 'cronograma' },
    ];
    for (const b of casos) {
      const r = await h.post('/api/mentoria/cronograma/importar/previa', b, s);
      expect(r.status).toBe(400);
      expect(r.body.message).toBe('Baixe a aba CRONOGRAMA em CSV');
    }
    const r = await h.post('/api/mentoria/cronograma/importar', { csv: 'a,b\n1,2' }, s);
    expect(r.status).toBe(400);
    expect(r.body.message).toContain('Baixe a aba CRONOGRAMA em CSV');
  });

  it('só a Admin: Acompanhamento, Operação e Especialista recebem 404', async () => {
    for (const perfil of ['ACOMPANHAMENTO', 'OPERACAO', 'ESPECIALISTA']) {
      const s = await comoPerfil(perfil);
      for (const rota of ['importar/previa', 'importar']) {
        const r = await h.post(`/api/mentoria/cronograma/${rota}`, { csv: CSV }, s);
        expect(r.status, `${perfil} ${rota}`).toBe(404);
      }
    }
    // A Admin do módulo (selo) importa.
    const s = await comoPerfil('ACOMPANHAMENTO', true);
    await previa(s);
  });
});

describe('importar', () => {
  it('grava pela regra C8, só acrescenta e a segunda vez não muda nada', async () => {
    const s = await h.signIn('diretor@npac.com.br');
    const antes = await contagens();
    const r = await importar(s, { decisoes: { 5: insc.i306r } });
    expect(r).toEqual({
      itens: 14,
      colunas: 4,
      tarefas: 6,
      recebidos: 13,
      planejados: 1,
      jaTinha: 4,
      naoFez: 3,
    });
    const depois = await contagens();
    expect(depois).toMatchObject({
      itens: 15,
      anteriores: 21,
      tarefas: 6,
      ciclos: antes.ciclos,
      hist: antes.hist,
    });

    // 301: as 6 do 2º mês viram tarefas pendentes do 2º PME (o aberto), com o prazo do ciclo.
    const tarefas = await owner<{ numero: number; status: string; bloco: string; prazo: string }[]>`
      select c.numero, t.status, t.cronograma_bloco as bloco, t.prazo::text = c.prazo::text as prazo
      from mentoria_tarefas t join mentoria_ciclos c on c.id = t.ciclo_id
      where t.inscricao_id = ${insc.i301} and t.origem = 'PME' order by t.ordem`;
    expect(tarefas.map((t) => [t.numero, t.status, t.bloco, t.prazo])).toEqual([
      [2, 'PENDENTE', 'EXPERIENCIA', true],
      [2, 'PENDENTE', 'DESAFIO', true],
      [2, 'PENDENTE', 'FILME', true],
      [2, 'PENDENTE', 'LIVRO', true],
      [2, 'PENDENTE', 'EAP', true],
      [2, 'PENDENTE', 'EAP', true],
    ]);
    // Mês 1 = recebido (com a coluna repetida K), mês 3 = planejado, "já leu" = já tinha.
    expect(await anteriores(insc.i301)).toEqual([
      {
        texto: 'Subir em uma árvore em família e tirar uma foto.',
        pme_numero: 1,
        resultado: 'RECEBIDO',
      },
      { texto: 'Visitar um asilo e conversar com alguém.', pme_numero: 3, resultado: 'PLANEJADO' },
      {
        texto: 'Passar 24 horas em jejum, só com água. (Mande uma foto no grupo.)',
        pme_numero: 1,
        resultado: 'RECEBIDO',
      },
      { texto: 'O PACTO', pme_numero: 1, resultado: 'RECEBIDO' },
      { texto: 'Em busca de um sentido', pme_numero: null, resultado: 'JA_TINHA' },
      { texto: 'O Homem Mais Rico da Babilônia', pme_numero: 1, resultado: 'RECEBIDO' },
      {
        texto: 'EAP 01 - Como começar https://www.youtube.com/watch?v=ficticio01',
        pme_numero: 1,
        resultado: 'RECEBIDO',
      },
    ]);
    // Sem ciclo aberto, tudo é histórico: o RDV escolhido pela Admin recebe o 12º mês.
    expect((await anteriores(insc.i306r)).map((a) => [a.pme_numero, a.resultado])).toEqual([
      [12, 'RECEBIDO'],
      [4, 'RECEBIDO'],
      [5, 'RECEBIDO'],
      [1, 'RECEBIDO'],
      [null, 'JA_TINHA'],
    ]);
    expect(await anteriores(insc.i306d)).toEqual([]);
    // Itens novos no fim de cada bloco, na ordem do arquivo; o que já existia fica como estava.
    const filmes = await owner<{ texto: string; ordem: number }[]>`
      select texto, ordem from mentoria_cronograma_itens where bloco = 'FILME' order by ordem`;
    expect(filmes).toEqual([
      { texto: 'O PACTO', ordem: 1 },
      { texto: 'Pra Sempre Vencedor', ordem: 2 },
      { texto: 'À Procura da Felicidade', ordem: 3 },
    ]);
    const [audit] = await owner<{ data: Record<string, number>; entity_id: string | null }[]>`
      select data, entity_id from audit_log where action = 'mentoria.cronograma_importado'`;
    expect(audit!.data).toEqual(r);
    expect(JSON.stringify(audit)).not.toContain('Fictíci');

    // Ponto de atenção 4: a segunda importação (mesmo arquivo, mesmas decisões) não muda nada.
    const p2 = await previa(s, { decisoes: { 5: insc.i306r } });
    expect(p2.itens.every((i) => i.novos === 0)).toBe(true);
    expect([p2.tarefas, p2.recebidos, p2.planejados, p2.jaTinha, p2.naoFez]).toEqual([
      0, 0, 0, 0, 0,
    ]);
    const r2 = await importar(s, { decisoes: { 5: insc.i306r } });
    expect(r2).toEqual({
      itens: 0,
      colunas: 0,
      tarefas: 0,
      recebidos: 0,
      planejados: 0,
      jaTinha: 0,
      naoFez: 0,
    });
    expect(await contagens()).toEqual(depois);
  });

  it('o importado aparece no cronograma da ficha e o planejado vai para a sugestão do 3º PME', async () => {
    const s = await h.signIn('diretor@npac.com.br');
    await importar(s);
    const r = await h.get(`/api/mentoria/inscricoes/${insc.i301}/cronograma`, s);
    expect(r.status, r.text).toBe(200);
    const c = r.body as CronogramaDTO;
    expect(c.recebidos.filter((x) => x.resultado === 'PENDENTE')).toHaveLength(6);
    expect(c.recebidos.filter((x) => x.resultado === 'RECEBIDO')).toHaveLength(5);
    const planejado = c.recebidos.find((x) => x.resultado === 'PLANEJADO')!;
    expect(planejado).toMatchObject({ pmeNumero: 3, propria: true });
    expect(c.proximo).toBe(3);
    expect(c.sugestao.EXPERIENCIA.map((i) => i.id)).toContain(planejado.itemId);
  });
});
