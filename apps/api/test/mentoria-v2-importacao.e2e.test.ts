import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import ExcelJS from 'exceljs';
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { MentoriaCrypto, aad } from '../src/mentoria/mentoria-crypto.js';
import { ENV, type Env } from '../src/config/env.js';
import { api, closeTestApp, createTestApp, ORIGIN, owner, resetAuthState } from './helpers.js';

let app: NestFastifyApplication;
let h: ReturnType<typeof api>;
let carlaId: string;
let crypto: MentoriaCrypto;

const PREVIA = '/api/mentoria/carteira/importar/previa';
const IMPORTAR = '/api/mentoria/carteira/importar';

const comoPerfil = async (perfil: string | null, admin = false) => {
  await owner`delete from mentoria_perfis where user_id = ${carlaId}`;
  if (perfil)
    await owner`insert into mentoria_perfis (user_id, perfil, admin)
      values (${carlaId}, ${perfil}, ${admin})`;
  return h.signIn('carla@npac.com.br');
};
const duda = () => comoPerfil('ACOMPANHAMENTO', true);

const CPF = '987.654.321-00';

async function planilha(): Promise<string> {
  const wb = new ExcelJS.Workbook();
  const forms = wb.addWorksheet('RESPOSTASFORMS');
  forms.addRow([
    'Carimbo de data/hora',
    'Nome completo',
    'Telefone',
    'E-mail',
    'CPF',
    'Endereço',
    'Nome do cônjuge',
    'Cônjuge participa?',
    'Maior sonho',
    'Maior medo',
    'Tamanho da pulseira',
    'Motivação',
  ]);
  forms.addRow([
    new Date(Date.UTC(2026, 0, 2)),
    'Fictícia Ana',
    '11 90000-0001',
    'Ana@Exemplo.com',
    CPF,
    'Rua Fictícia, 1, CEP 01234-000',
    'Fictício Bruno',
    'Sim',
    'Sonho fictício',
    'Medo fictício',
    'M',
    'Motivo fictício',
  ]);
  forms.addRow([
    new Date(Date.UTC(2026, 0, 3)),
    'Fictício Bruno',
    '11 90000-0002',
    null,
    CPF,
    null,
    'Fictícia Ana',
    'Sim',
    null,
    null,
    'G',
    null,
  ]);
  forms.addRow([new Date(Date.UTC(2026, 0, 4)), 'Fictício Carlos', null, null, CPF]);
  const proc = wb.addWorksheet('PROCESSOS 2M6M');
  proc.addRow(['Nome', 'Mentoria', 'Data de início', 'Status']);
  proc.addRow([
    'Fictícia Ana e Fictício Bruno',
    '6M CASAL',
    new Date(Date.UTC(2026, 1, 10)),
    'verde',
  ]);
  proc.addRow(['Fictício Carlos', '2M / 2 ENCONTROS', new Date(Date.UTC(2026, 2, 5)), null]);
  const canc = wb.addWorksheet('CANCELAMENTOS');
  canc.addRow(['Nome', 'Mentoria']);
  canc.addRow(['Fictícia Dora', '2M']);
  return Buffer.from(await wb.xlsx.writeBuffer()).toString('base64');
}

const GERENCIADOR = {
  dashboard: [
    {
      nome: 'Fictício Eduardo',
      tipo: 'Individual',
      tipoMentoria: 'RDV',
      dataEntrada: '2026-03',
      status: 'risco',
    },
  ],
  linhaDoTempo: [{ nome: 'Fictício Eduardo', pilares: { fe: '7' } }],
  rdv: [
    {
      nome: 'Fictício Eduardo',
      planilhaLink: 'https://drive.google.com/fict',
      diagnostico: { rendaAtual: 'uns 8 ou 10', dinheiroGuardado: 'R$ 2 mil', sonhos: 'Ir longe' },
    },
  ],
};

type Previa = {
  totais: { novos: number; casais: number; cancelados: number; ignorados: number };
  novos: { chave: string; nome: string; status: string; mentoria: string | null }[];
  rotulosSemMentoria: { rotulo: string; total: number }[];
};

beforeAll(async () => {
  app = await createTestApp();
  h = api(app);
  crypto = new MentoriaCrypto(app.get<Env>(ENV).MENTORADO_ENCRYPTION_KEY);
  const [c] = await owner<
    { id: string }[]
  >`select id from "user" where email = 'carla@npac.com.br'`;
  carlaId = c!.id;
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

const importar = async (s: string, corpo: object) => {
  const r = await h.post(IMPORTAR, corpo, s);
  expect(r.status, r.text).toBe(200);
  return r.body as { importados: number; ignorados: number };
};

describe('acesso', () => {
  it('só admin importa; demais 404', async () => {
    const corpo = { gerenciador: GERENCIADOR };
    for (const perfil of ['ACOMPANHAMENTO', 'OPERACAO', 'ESPECIALISTA', 'MENTOR', null]) {
      const s = await comoPerfil(perfil);
      expect((await h.post(PREVIA, corpo, s)).status).toBe(404);
      expect((await h.post(IMPORTAR, corpo, s)).status).toBe(404);
    }
    const dir = await h.signIn('diretor@npac.com.br');
    expect((await h.post(PREVIA, corpo, dir)).status).toBe(200);
    const com = await h.signIn('ale@npac.com.br');
    expect((await h.post(PREVIA, corpo, com)).status).toBe(404);
  });

  it('corpo acima de 1 MB passa', async () => {
    const s = await duda();
    const grande = randomBytes(1_200_000).toString('base64');
    const r = await request(app.getHttpServer())
      .post(PREVIA)
      .set('Origin', ORIGIN)
      .set('Cookie', s)
      .send({
        gerenciador: {
          dashboard: [{ nome: 'Fictício Grande', tipoMentoria: 'RDV', status: grande }],
        },
      });
    expect(r.status, r.text.slice(0, 200)).toBe(200);
  });

  it('sem nenhum arquivo dá 400', async () => {
    const s = await duda();
    expect((await h.post(PREVIA, {}, s)).status).toBe(400);
  });

  it('planilha inválida dá 400 com mensagem', async () => {
    const s = await duda();
    const r = await h.post(PREVIA, { planilhaBase64: Buffer.from('nada').toString('base64') }, s);
    expect(r.status).toBe(400);
    expect((r.body as { message: string }).message).toMatch(/planilha/);
  });
});

describe('prévia', () => {
  it('não grava nada e não devolve contato', async () => {
    const s = await duda();
    const r = await h.post(PREVIA, { planilhaBase64: await planilha() }, s);
    expect(r.status, r.text).toBe(200);
    const p = r.body as Previa;
    expect(p.totais).toMatchObject({ novos: 3, casais: 1, cancelados: 1 });
    expect(r.text).not.toContain('Ana@Exemplo');
    expect(r.text).not.toContain('90000');
    expect(r.text).not.toContain('Rua Fictícia');
    expect(r.text).not.toContain('987');
    const [q] = await owner<{ n: number }[]>`select count(*)::int as n from mentoria_inscricoes`;
    expect(q!.n).toBe(0);
  });

  it('agrupa rótulos sem mentoria', async () => {
    const s = await duda();
    const r = await h.post(
      PREVIA,
      {
        gerenciador: {
          dashboard: [
            { nome: 'Fictício A', tipoMentoria: 'IDR', status: 'engajado' },
            { nome: 'Fictício B', tipoMentoria: 'IDR', status: 'engajado' },
          ],
        },
      },
      s,
    );
    expect((r.body as Previa).rotulosSemMentoria).toEqual([{ rotulo: 'IDR', total: 2 }]);
  });
});

describe('importar', () => {
  it('etapas nascem ANTERIOR_AO_SISTEMA e a Fila não ganha item de boas-vindas', async () => {
    const s = await duda();
    await importar(s, { gerenciador: GERENCIADOR });
    const etapas = await owner<{ status: string }[]>`
      select distinct status from mentoria_onboarding_etapas`;
    expect(etapas).toEqual([{ status: 'ANTERIOR_AO_SISTEMA' }]);
    const [c] = await owner<{ n: number }[]>`
      select count(*)::int as n from mentoria_onboarding_etapas`;
    expect(c!.n).toBe(6);
    const painel = await h.post('/api/mentoria/onboarding/painel', {}, s);
    expect((painel.body as { total: number }).total).toBe(0);
  });

  it('status ATIVO, exceto cancelados', async () => {
    const s = await duda();
    await importar(s, { planilhaBase64: await planilha() });
    const rows = await owner<{ nome: string; status: string; importada: boolean }[]>`
      select p.nome, i.status, i.importada from mentoria_inscricoes i
      join mentoria_pessoas p on p.inscricao_id = i.id and p.ordem = 1 order by p.nome`;
    expect(rows).toEqual([
      { nome: 'Fictícia Ana', status: 'ATIVO', importada: true },
      { nome: 'Fictícia Dora', status: 'CANCELADO', importada: true },
      { nome: 'Fictício Carlos', status: 'ATIVO', importada: true },
    ]);
  });

  it('importação da planilha nunca grava CPF e pareia casal', async () => {
    const s = await duda();
    await importar(s, { planilhaBase64: await planilha() });
    const [casal] = await owner<{ id: string; tipo: string; mentoria: string; pessoas: number }[]>`
      select i.id, i.tipo, i.mentoria,
        (select count(*)::int from mentoria_pessoas p where p.inscricao_id = i.id) as pessoas
      from mentoria_inscricoes i where i.tipo = 'CASAL'`;
    expect(casal).toMatchObject({ tipo: 'CASAL', mentoria: '6M', pessoas: 2 });

    const legados = await owner<{ inscricao_id: string; dados: string }[]>`
      select inscricao_id, dados from mentoria_legado`;
    for (const l of legados) {
      const claro = crypto.decifrarTexto(l.dados, aad('mentoria_legado', 'dados', l.inscricao_id));
      expect(claro).not.toContain('987');
      expect(claro.toLowerCase()).not.toContain('cpf');
    }
    const pessoas = await owner<Record<string, unknown>[]>`select * from mentoria_pessoas`;
    expect(JSON.stringify(pessoas)).not.toContain('987.654');
  });

  it('contato cifrado, com índice cego, e endereço do formulário', async () => {
    const s = await duda();
    await importar(s, { planilhaBase64: await planilha() });
    const [p] = await owner<{ whatsapp: string; email: string }[]>`
      select whatsapp, email from mentoria_pessoas where nome = 'Fictícia Ana'`;
    expect(p!.whatsapp).not.toContain('90000');
    expect(p!.email).not.toContain('@');
    const achou = await h.post('/api/mentoria/busca', { termo: '11900000001' }, s);
    expect((achou.body as { itens: unknown[] }).itens).toHaveLength(1);
    const achou2 = await h.post('/api/mentoria/busca', { termo: 'ana@exemplo.com' }, s);
    expect((achou2.body as { itens: unknown[] }).itens).toHaveLength(1);
    const [e] = await owner<{ origem: string; cep: string }[]>`
      select origem, cep from mentoria_enderecos`;
    expect(e).toEqual({ origem: 'FORMULARIO_CAIXA', cep: '01234000' });
  });

  it('2M e 6M têm início e término; RDV não', async () => {
    const s = await duda();
    await importar(s, { planilhaBase64: await planilha(), gerenciador: GERENCIADOR });
    const rows = await owner<
      {
        nome: string;
        inicio: string | null;
        termino: string | null;
        variante: string | null;
        compra: string | null;
      }[]
    >`select p.nome, to_char(i.inicio_jornada, 'YYYY-MM-DD') as inicio,
        to_char(i.termino_previsto, 'YYYY-MM-DD') as termino,
        i.mentoria_variante as variante, to_char(i.data_compra, 'YYYY-MM-DD') as compra
      from mentoria_inscricoes i join mentoria_pessoas p on p.inscricao_id = i.id and p.ordem = 1
      where p.nome in ('Fictício Carlos', 'Fictício Eduardo') order by p.nome`;
    expect(rows).toEqual([
      {
        nome: 'Fictício Carlos',
        inicio: '2026-03-05',
        termino: '2027-03-05',
        variante: '2 encontros',
        compra: '2026-03-05',
      },
      {
        nome: 'Fictício Eduardo',
        inicio: null,
        termino: null,
        variante: null,
        compra: '2026-03-01',
      },
    ]);
  });

  it('valor ambíguo fica nulo, vai para legado e marca "completar"', async () => {
    const s = await duda();
    await importar(s, { gerenciador: GERENCIADOR });
    const [i] = await owner<{ id: string; campos: string[] }[]>`
      select id, completar_campos as campos from mentoria_inscricoes`;
    expect(i!.campos).toEqual(['recebeCentavos']);
    const [m] = await owner<{ recebe: string | null; guardado: string }[]>`
      select recebe_centavos as recebe, guardado_centavos as guardado from mentoria_momento_inicial`;
    expect(m!.recebe).toBeNull();
    expect(Number(m!.guardado)).toBe(200000);
    const [l] = await owner<{ dados: string }[]>`select dados from mentoria_legado`;
    const legado = JSON.parse(
      crypto.decifrarTexto(l!.dados, aad('mentoria_legado', 'dados', i!.id)),
    ) as { valoresOriginais: Record<string, string>; statusEngajamento: string };
    expect(legado.valoresOriginais).toEqual({ recebeCentavos: 'uns 8 ou 10' });
    expect(legado.statusEngajamento).toBe('risco');
    const lista = await h.post('/api/mentoria/inscricoes/lista', { completar: true }, s);
    expect((lista.body as { total: number }).total).toBe(1);
  });

  it('preencher o campo tira da lista completar', async () => {
    const s = await duda();
    await importar(s, {
      gerenciador: {
        dashboard: [{ nome: 'Fictício Um', tipoMentoria: '2M', status: 'engajado' }],
        rdv: [{ nome: 'Fictício Um', diagnostico: { rendaAtual: 'uns 8 ou 10' } }],
      },
    });
    const [i] = await owner<{ id: string }[]>`select id from mentoria_inscricoes`;
    let lista = await h.post('/api/mentoria/inscricoes/lista', { completar: true }, s);
    expect((lista.body as { total: number }).total).toBe(1);
    const f = await h.get(`/api/mentoria/inscricoes/${i!.id}`, s);
    const version = (f.body as { momento: { version: number } }).momento.version;
    const r = await request(app.getHttpServer())
      .put(`/api/mentoria/inscricoes/${i!.id}/momento`)
      .set('Origin', ORIGIN)
      .set('Cookie', s)
      .send({ version, recebeCentavos: 800000 });
    expect(r.status, r.text).toBe(200);
    lista = await h.post('/api/mentoria/inscricoes/lista', { completar: true }, s);
    expect((lista.body as { total: number }).total).toBe(1);
    const depois = await h.get(`/api/mentoria/inscricoes/${i!.id}`, s);
    const r2 = await request(app.getHttpServer())
      .patch(`/api/mentoria/inscricoes/${i!.id}`)
      .set('Origin', ORIGIN)
      .set('Cookie', s)
      .send({ version: (depois.body as { version: number }).version, inicioJornada: '2026-03-01' });
    expect(r2.status, r2.text).toBe(200);
    lista = await h.post('/api/mentoria/inscricoes/lista', { completar: true }, s);
    expect((lista.body as { total: number }).total).toBe(0);
  });

  it('juntar nomes parecidos e reimportar sem a decisão não duplica', async () => {
    const s = await duda();
    const gerenciador = {
      dashboard: [
        { nome: 'João Carlos Fictício', tipoMentoria: 'RDV', status: 'engajado' },
        { nome: 'João Fictício', tipoMentoria: 'RDV', status: 'engajado' },
      ],
    };
    const k = ['joao carlos ficticio', 'joao ficticio'].sort().join('|');
    const primeiro = await importar(s, { gerenciador, decisoes: { parecidos: { [k]: 'JUNTAR' } } });
    expect(primeiro.importados).toBe(1);
    expect(await importar(s, { gerenciador })).toEqual({ importados: 0, ignorados: 2 });
  });

  it('momento inicial com campo faltando nasce destravado', async () => {
    const s = await duda();
    await importar(s, { gerenciador: GERENCIADOR });
    const [m] = await owner<{ travado_em: Date | null }[]>`
      select travado_em from mentoria_momento_inicial`;
    expect(m!.travado_em).toBeNull();
  });

  it('importar o mesmo arquivo duas vezes não duplica nem altera o que foi editado', async () => {
    const s = await duda();
    const corpo = { planilhaBase64: await planilha(), gerenciador: GERENCIADOR };
    const primeiro = await importar(s, corpo);
    expect(primeiro.importados).toBe(4);

    const [i] = await owner<{ id: string; pessoa: string; version: number }[]>`
      select i.id, p.id as pessoa, p.version from mentoria_inscricoes i
      join mentoria_pessoas p on p.inscricao_id = i.id and p.ordem = 1
      where p.nome = 'Fictício Carlos'`;
    const r = await request(app.getHttpServer())
      .patch(`/api/mentoria/pessoas/${i!.pessoa}`)
      .set('Origin', ORIGIN)
      .set('Cookie', s)
      .send({ version: i!.version, nome: 'Fictício Carlos Renomeado', cidade: 'Cidade Fictícia' });
    expect(r.status, r.text).toBe(200);

    const segundo = await importar(s, corpo);
    expect(segundo).toEqual({ importados: 0, ignorados: 4 });
    const [q] = await owner<{ n: number }[]>`select count(*)::int as n from mentoria_inscricoes`;
    expect(q!.n).toBe(4);
    const [p] = await owner<{ nome: string; cidade: string }[]>`
      select nome, cidade from mentoria_pessoas where id = ${i!.pessoa}`;
    expect(p).toEqual({ nome: 'Fictício Carlos Renomeado', cidade: 'Cidade Fictícia' });
  });

  it('importar só a planilha e depois só o .json não duplica quem está nos dois', async () => {
    const s = await duda();
    await importar(s, { planilhaBase64: await planilha() });
    const r = await importar(s, {
      gerenciador: {
        dashboard: [
          { nome: 'Fictício Carlos', tipoMentoria: '2M', status: 'engajado' },
          { nome: 'Fictício Novo', tipoMentoria: 'RDV', status: 'engajado' },
        ],
      },
    });
    expect(r).toEqual({ importados: 1, ignorados: 1 });
  });

  it('só a planilha, sem .json, importa', async () => {
    const s = await duda();
    expect((await importar(s, { planilhaBase64: await planilha() })).importados).toBe(3);
  });

  it('só o .json, sem planilha, importa', async () => {
    const s = await duda();
    expect((await importar(s, { gerenciador: GERENCIADOR })).importados).toBe(1);
  });

  it('rótulo sem mentoria exige decisão na confirmação', async () => {
    const s = await duda();
    const gerenciador = {
      dashboard: [{ nome: 'Fictício A', tipoMentoria: 'NOVO FORMATO', status: 'engajado' }],
    };
    const r = await h.post(IMPORTAR, { gerenciador }, s);
    expect(r.status).toBe(400);
    expect((r.body as { message: string }).message).toContain('NOVO FORMATO');
    const [q] = await owner<{ n: number }[]>`select count(*)::int as n from mentoria_inscricoes`;
    expect(q!.n).toBe(0);
    const ok = await importar(s, {
      gerenciador,
      decisoes: { rotulos: { 'NOVO FORMATO': '6M' } },
    });
    expect(ok.importados).toBe(1);
  });

  it('decisão troca o status do cancelado', async () => {
    const s = await duda();
    await importar(s, {
      planilhaBase64: await planilha(),
      decisoes: { status: { 'ficticia dora': 'CONCLUIDO' } },
    });
    const [r] = await owner<{ status: string }[]>`
      select i.status from mentoria_inscricoes i
      join mentoria_pessoas p on p.inscricao_id = i.id where p.nome = 'Fictícia Dora'`;
    expect(r!.status).toBe('CONCLUIDO');
  });

  it('arquivo com registro inválido não grava nada', async () => {
    const s = await duda();
    const r = await h.post(
      IMPORTAR,
      {
        gerenciador: {
          dashboard: [
            { nome: 'Fictício A', tipoMentoria: 'RDV', status: 'engajado' },
            { nome: 'x'.repeat(300), tipoMentoria: 'RDV', status: 'engajado' },
          ],
          rdv: [{ diagnostico: {} }],
        },
      },
      s,
    );
    expect(r.status).toBe(400);
    const [q] = await owner<{ n: number }[]>`select count(*)::int as n from mentoria_inscricoes`;
    expect(q!.n).toBe(0);
  });
});
