import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

// NPAC-60, fase 3: a Admin importa a planilha do cronograma (Configurações → Importação, 3 passos), decide a
// dúvida do RDV × 2M, importa e vê os itens na aba "Cronograma" da ficha; importar de novo não muda nada.
// O CSV é a fixture fictícia do shared (o arquivo real da equipe nunca entra no repositório).
// Com CAPTURAS=<pasta>, também fotografa os passos 2 e 3 em 375/768/1024/1440, claro e escuro.
const owner = ownerSql(E2E_DB);
const CSV = fileURLToPath(
  new URL('../../../packages/shared/test/fixtures/cronograma-ficticio.csv', import.meta.url),
);
const PASTA = process.env.CAPTURAS;
const HOJE = `(now() at time zone 'America/Sao_Paulo')::date`;
const NOMES = /ficticio 30[1-7]$/;
const ITENS = [
  'Subir em uma árvore em família e tirar uma foto.',
  'Fazer um piquenique no parque.',
  'Visitar um asilo e conversar com alguém.',
  'Passar 24 horas em jejum, só com água. (Mande uma foto no grupo.)',
  'Vender um carro usado.',
  'Desafio nunca usado.',
  'Pra Sempre Vencedor',
  'À Procura da Felicidade',
  'O Homem Mais Rico da Babilônia',
  'EAP 01 - Como começar https://www.youtube.com/watch?v=ficticio01',
  'EAP 02 - Reserva de emergência https://www.youtube.com/watch?v=ficticio02',
  'EAP 03 - Investir no longo prazo https://www.youtube.com/watch?v=ficticio03',
];

test.describe.configure({ mode: 'serial' });

const norm = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const ids: Record<string, string> = {};

async function inscricao(mentoria: string, status: string, nomes: string[], whats: string | null) {
  const [i] = await owner.unsafe<{ id: string }[]>(
    `insert into mentoria_inscricoes (tipo, mentoria, status, inicio_jornada, data_idr,
       termino_previsto, responsavel_id)
     select '${nomes.length === 2 ? 'CASAL' : 'INDIVIDUAL'}', '${mentoria}', '${status}', ${HOJE} - 90,
       ${HOJE} - 90, ${HOJE} + 275, id
     from "user" where username = 'duda' returning id`,
  );
  for (const [k, nome] of nomes.entries())
    await owner`insert into mentoria_pessoas (inscricao_id, ordem, nome, nome_norm, whatsapp_idx)
      values (${i!.id}, ${k + 1}, ${nome}, ${norm(nome)}, ${k === 0 ? whats : null})`;
  return i!.id;
}

const limpar = async () => {
  const velhas = await owner<{ id: string }[]>`
    select distinct inscricao_id as id from mentoria_pessoas where nome_norm ~ ${NOMES.source}`;
  for (const v of velhas) await owner`delete from mentoria_inscricoes where id = ${v.id}`;
  await owner`delete from mentoria_cronograma_itens i where i.texto = any(${ITENS})
    and not exists (select 1 from mentoria_tarefas t where t.cronograma_item_id = i.id)
    and not exists (select 1 from mentoria_cronograma_anteriores x where x.item_id = i.id)`;
};

async function entrar(page: Page, tema = 'light') {
  await page.context().clearCookies();
  await page.addInitScript((t) => localStorage.setItem('theme', t), tema);
  await page.goto('/login');
  await page.getByLabel('Usuário', { exact: true }).fill('duda');
  await page.getByLabel('Senha').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

const card = (page: Page) => page.locator('section.cr-imp');

/** Sobe a fixture e decide a dúvida do 306 pelo RDV: fica no passo 2. */
async function subirEDecidir(page: Page) {
  const c = card(page);
  await c.getByLabel('Escolher o CSV do cronograma').setInputFiles(CSV);
  await expect(c.getByText('Para revisar')).toBeVisible();
  const linha = c.locator('.cr-col', { hasText: 'Mentorado Fictício 306' });
  await expect(
    linha.getByText('Vai até o 12º mês: deve ser o RDV. Vale também na 2M.'),
  ).toBeVisible();
  await linha.getByRole('combobox').selectOption({ label: 'RDV · Concluído · sem PME' });
  return c;
}

test.beforeAll(async () => {
  await owner`truncate rate_limit`;
  await limpar();
  ids.i301 = await inscricao('2M', 'ATIVO', ['Mentorado Fictício 301'], 'e2e-cr-imp-301');
  await owner.unsafe(
    `insert into mentoria_ciclos (inscricao_id, numero, enviado_em, concluido_em)
     values ('${ids.i301}', 1, ${HOJE} - 45, ${HOJE} - 20)`,
  );
  await owner.unsafe(
    `insert into mentoria_ciclos (inscricao_id, numero, enviado_em)
     values ('${ids.i301}', 2, ${HOJE} - 10)`,
  );
  ids.i302 = await inscricao(
    'RDV',
    'ATIVO',
    ['Mentorada Fictícia 302', 'Mentorado Fictício 303'],
    'e2e-cr-imp-302',
  );
  ids.i306r = await inscricao('RDV', 'CONCLUIDO', ['Mentorado Fictício 306'], 'e2e-cr-imp-306');
  ids.i306d = await inscricao('2M', 'ATIVO', ['Mentorado Fictício 306'], 'e2e-cr-imp-306');
});
test.afterAll(async () => {
  await limpar();
  await closeTestConnections();
});

test('.xlsx no lugar do CSV: o card pede o CSV da aba', async ({ page }) => {
  await entrar(page);
  await page.goto('/acompanhamento/configuracoes?aba=importacao');
  await card(page)
    .getByLabel('Escolher o CSV do cronograma')
    .setInputFiles({
      name: 'CRONOGRAMA.xlsx',
      mimeType: 'application/zip',
      buffer: Buffer.from('PK'),
    });
  await expect(card(page).getByText('Baixe a aba CRONOGRAMA em CSV')).toBeVisible();
});

test('a Admin importa pelo caminho real, decide a dúvida e vê os itens na ficha; de novo, nada muda', async ({
  page,
}) => {
  await entrar(page);
  await page.getByRole('link', { name: 'Configurações' }).filter({ visible: true }).first().click();
  await page.getByRole('link', { name: 'Importação', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Planilha do cronograma' })).toBeVisible();

  const c = await subirEDecidir(page);
  await expect(c.getByText(/^Coluna 6 · vai até o 12º mês · 5 itens$/)).toBeVisible();
  await c.getByRole('button', { name: 'Continuar' }).click();
  await expect(c.getByText('O que entra')).toBeVisible();
  const numero = (rotulo: string) =>
    c.locator('.pl-mod', { hasText: rotulo }).first().locator('.cr-num');
  await expect(numero('Tarefas do PME em andamento')).toHaveText('6');
  await expect(numero('Planejados na planilha')).toHaveText('1');
  await expect(
    c.getByText('As colunas 3 e 11 vão para a mesma ficha (Mentorado Fictício 301)', {
      exact: false,
    }),
  ).toBeVisible();
  await c.getByRole('button', { name: 'Importar', exact: true }).click();
  await expect(c.getByRole('heading', { name: 'Importado' })).toBeVisible();
  await expect(numero('Tarefas do PME em andamento')).toHaveText('6');

  const [conta] = await owner<{ anteriores: number; tarefas: number }[]>`
    select (select count(*)::int from mentoria_cronograma_anteriores
        where inscricao_id = any(${Object.values(ids)})) as anteriores,
      (select count(*)::int from mentoria_tarefas
        where inscricao_id = any(${Object.values(ids)}) and origem = 'PME') as tarefas`;
  expect(conta).toEqual({ anteriores: 17, tarefas: 6 });

  // A ficha mostra o que veio: o 2º PME com as 6 tarefas e o 1º PME da planilha.
  await page.goto(`/acompanhamento/ficha/${ids.i301}?aba=cronograma`);
  const aba = page.getByRole('tabpanel', { name: 'Cronograma' });
  await expect(aba).toHaveAttribute('aria-busy', 'false');
  await expect(aba.getByText('Fazer um piquenique no parque.')).toBeVisible();
  await expect(aba.getByText('Subir em uma árvore em família e tirar uma foto.')).toBeVisible();
  await expect(aba.getByRole('heading', { name: /^2º PME\s*0 de 6 feitos/ })).toBeVisible();
  await expect(aba.getByRole('heading', { name: /^1º PME/ })).toBeVisible();

  // Rodar de novo: nada a entrar e o banco igual.
  await page.goto('/acompanhamento/configuracoes?aba=importacao');
  const c2 = await subirEDecidir(page);
  await c2.getByRole('button', { name: 'Continuar' }).click();
  for (const r of ['Tarefas do PME em andamento', 'Recebidos antes do sistema', 'Já tinham antes'])
    await expect(numero(r)).toHaveText('0');
  await c2.getByRole('button', { name: 'Importar', exact: true }).click();
  await expect(c2.getByText('Nada novo: tudo já estava no sistema.')).toBeVisible();
  const [de_novo] = await owner<{ anteriores: number; tarefas: number }[]>`
    select (select count(*)::int from mentoria_cronograma_anteriores
        where inscricao_id = any(${Object.values(ids)})) as anteriores,
      (select count(*)::int from mentoria_tarefas
        where inscricao_id = any(${Object.values(ids)}) and origem = 'PME') as tarefas`;
  expect(de_novo).toEqual(conta);
});

test('celular: os 3 passos cabem na tela, select com 16 px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await entrar(page);
  await page.goto('/acompanhamento/configuracoes?aba=importacao');
  const c = await subirEDecidir(page);
  const cabe = () =>
    page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  expect(await cabe()).toBe(true);
  const largura = await c.evaluate((el) => el.getBoundingClientRect().right);
  expect(largura).toBeLessThanOrEqual(375);
  await c.getByRole('button', { name: 'Continuar' }).click();
  await expect(c.getByText('O que entra')).toBeVisible();
  expect(await cabe()).toBe(true);
});

const LARGURAS = [375, 768, 1024, 1440] as const;
for (const [tema, nome] of [
  ['light', 'claro'],
  ['dark', 'escuro'],
] as const)
  test(`capturas da importação, ${nome}`, async ({ page }) => {
    test.skip(!PASTA, 'só com CAPTURAS=<pasta>');
    await entrar(page, tema);
    for (const largura of LARGURAS) {
      await page.setViewportSize({ width: largura, height: largura < 768 ? 812 : 1000 });
      await page.goto('/acompanhamento/configuracoes?aba=importacao');
      const c = await subirEDecidir(page);
      await c.evaluate((el) => el.scrollIntoView({ block: 'start' }));
      await page.waitForTimeout(200);
      await page.screenshot({
        path: `${PASTA}/importacao-${largura}-${nome}.png`,
        fullPage: true,
        animations: 'disabled',
      });
      await c.getByRole('button', { name: 'Continuar' }).click();
      await expect(c.getByText('O que entra')).toBeVisible();
      await page.waitForTimeout(200);
      await page.screenshot({
        path: `${PASTA}/importacao-passo3-${largura}-${nome}.png`,
        fullPage: true,
        animations: 'disabled',
      });
    }
  });
