import { expect, test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

const owner = ownerSql(E2E_DB);

test.beforeEach(async () => {
  await owner`truncate rate_limit`;
});
test.afterEach(async () => {
  await owner`update mentoria_mensagens_modelo set texto_individual = '', texto_casal = ''`;
});
test.afterAll(async () => {
  await closeTestConnections();
});

async function entrar(page: Page, usuario: string) {
  await page.goto('/login');
  await page.getByLabel('Usuário', { exact: true }).fill(usuario);
  await page.getByLabel('Senha').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

const lateral = (page: Page) => page.getByRole('navigation', { name: 'Navegação lateral' });
/** Pelo menu, como a pessoa faz: o login cai na Fila, e o item "Fila do dia" volta a ela. */
async function abrirFila(page: Page) {
  await page.waitForURL(/\/acompanhamento\/fila/);
  await lateral(page).getByRole('link', { name: 'Fila do dia', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Fila do dia', level: 1 })).toBeVisible();
}
const linha = (page: Page, nome: string) =>
  page.locator('li.fr').filter({ hasText: nome }).filter({ visible: true });

type Pessoa = { nome: string; whatsapp?: string };
/** Inscrição nova pela API (cifra o WhatsApp): nasce com o item de boas-vindas. */
async function criar(page: Page, pessoas: Pessoa[], linkGrupo?: string) {
  const r = await page.request.post('/api/mentoria/inscricoes', {
    data: {
      tipo: pessoas.length === 2 ? 'CASAL' : 'INDIVIDUAL',
      mentoria: 'RDV',
      ...(linkGrupo ? { linkGrupo } : {}),
      pessoas,
    },
  });
  expect(r.status(), await r.text()).toBe(201);
  return (await r.json()) as { id: string };
}

async function modelo(individual: string, casal = '') {
  await owner`update mentoria_mensagens_modelo
    set texto_individual = ${individual}, texto_casal = ${casal} where momento = 'BOAS_VINDAS'`;
}

test('Operação conclui um item e ele some da Fila', async ({ page }) => {
  await entrar(page, 'operacao');
  const nome = 'Mentorado Fictício 91';
  await criar(page, [{ nome }]);
  await abrirFila(page);
  await expect(linha(page, nome)).toHaveCount(1);
  await expect(linha(page, nome)).toContainText('Criar o grupo e enviar as boas-vindas');
  await linha(page, nome).getByRole('button', { name: 'Marcar enviada' }).click();
  await expect(linha(page, nome)).toHaveCount(0);
});

test('WhatsApp copia o texto e o link não contém o texto', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  // A conversa abriria fora do teste: o endereço basta.
  await context.route(/wa\.me|chat\.whatsapp\.com/, (r) => r.abort());
  await modelo('Oi {nome}, boas-vindas!');
  await entrar(page, 'operacao');
  const nome = 'Mentorado Fictício 92';
  await criar(
    page,
    [{ nome, whatsapp: '(11) 99999-0092' }],
    'https://chat.whatsapp.com/ficticio92',
  );
  await abrirFila(page);
  await linha(page, nome)
    .getByRole('button', { name: new RegExp(`^Abrir ${nome}`) })
    .click();
  const painel = page.getByRole('complementary', { name: 'Detalhe do item' });
  await expect(painel.getByText('Oi Mentorado, boas-vindas!')).toBeVisible();
  const conversa = painel.getByRole('link', { name: 'Mentorado', exact: true });
  await expect(conversa).toHaveAttribute('href', 'https://wa.me/5511999990092');
  const grupo = painel.getByRole('link', { name: 'Grupo', exact: true });
  await expect(grupo).toHaveAttribute('href', 'https://chat.whatsapp.com/ficticio92');
  for (const l of [conversa, grupo])
    expect(await l.getAttribute('href')).not.toMatch(/text=|boas-vindas/i);
  await page.evaluate(() => navigator.clipboard.writeText(''));
  const popup = page.waitForEvent('popup');
  await conversa.click();
  await (await popup).close();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    'Oi Mentorado, boas-vindas!',
  );
});

test('casal: mensagem usa a versão casal', async ({ page }) => {
  await modelo('Oi {nome}!', 'Oi {nomes}, casal!');
  await entrar(page, 'operacao');
  await criar(page, [
    { nome: 'Ana Fictícia 93', whatsapp: '11999990093' },
    { nome: 'Bia Fictícia 93', whatsapp: '11999990094' },
  ]);
  await abrirFila(page);
  await linha(page, 'Ana Fictícia 93')
    .getByRole('button', { name: /^Abrir Ana Fictícia 93/ })
    .click();
  const painel = page.getByRole('complementary', { name: 'Detalhe do item' });
  await expect(painel.getByText('Oi Ana e Bia, casal!')).toBeVisible();
  await expect(painel.getByRole('link', { name: 'Ana', exact: true })).toBeVisible();
  await expect(painel.getByRole('link', { name: 'Bia', exact: true })).toBeVisible();
});

test('pessoa sem WhatsApp não mostra botão; sem link do grupo não mostra "Grupo"', async ({
  page,
}) => {
  await modelo('Oi {nomes}!');
  await entrar(page, 'operacao');
  await criar(page, [
    { nome: 'Caio Fictício 95', whatsapp: '11999990095' },
    { nome: 'Davi Fictício 95' },
  ]);
  await abrirFila(page);
  await linha(page, 'Caio Fictício 95')
    .getByRole('button', { name: /^Abrir Caio Fictício 95/ })
    .click();
  const painel = page.getByRole('complementary', { name: 'Detalhe do item' });
  await expect(painel.getByRole('link', { name: 'Caio', exact: true })).toBeVisible();
  await expect(painel.getByRole('link', { name: 'Davi', exact: true })).toHaveCount(0);
  await expect(painel.getByRole('link', { name: 'Grupo', exact: true })).toHaveCount(0);
  await expect(painel.getByText('Davi não tem WhatsApp cadastrado.')).toBeVisible();
  await expect(painel.locator('a[href="https://wa.me/"]')).toHaveCount(0);
});

test('Manu vê só os itens dela', async ({ page }) => {
  const [manu] = await owner<{ id: string }[]>`select id from "user" where username = 'manu'`;
  const [i] = await owner<{ id: string }[]>`
    insert into mentoria_inscricoes (tipo, mentoria, status, inicio_jornada, termino_previsto)
    values ('INDIVIDUAL', 'RDV', 'ATIVO', current_date - 130, current_date + 235) returning id`;
  await owner`insert into mentoria_pessoas (inscricao_id, ordem, nome, nome_norm)
    values (${i!.id}, 1, 'Mentorado Fictício 96', 'mentorado ficticio 96')`;
  await owner`insert into mentoria_reunioes (inscricao_id, tipo, conduzida_por, inicio)
    values (${i!.id}, 'POSICIONAMENTO', ${manu!.id},
      ((now() at time zone 'America/Sao_Paulo')::date + time '23:00') at time zone 'America/Sao_Paulo')`;
  await entrar(page, 'operacao');
  await criar(page, [{ nome: 'Mentorado Fictício 97' }]);
  await page.context().clearCookies();
  await entrar(page, 'manu');
  await abrirFila(page);
  await expect(linha(page, 'Mentorado Fictício 96')).toHaveCount(1);
  await expect(linha(page, 'Mentorado Fictício 97')).toHaveCount(0);
  await page.getByRole('link', { name: 'Equipe', exact: true }).click();
  await expect(linha(page, 'Mentorado Fictício 97')).toHaveCount(0);
});

test('Leo não tem Fila', async ({ page }) => {
  await entrar(page, 'leo');
  await page.goto('/acompanhamento/fila');
  await expect(page.getByRole('heading', { name: 'Fila do dia' })).toHaveCount(0);
  const r = await page.request.post('/api/mentoria/fila', { data: {} });
  expect(r.status()).toBe(404);
});

for (const [largura, altura] of [
  [375, 812],
  [768, 1024],
  [1024, 768],
  [1440, 900],
] as const)
  test(`capturas da Fila em ${largura} px, sem overflow`, async ({ page }) => {
    await modelo('Oi {nome}, boas-vindas!', 'Oi {nomes}, boas-vindas!');
    await page.setViewportSize({ width: largura, height: altura });
    await entrar(page, 'duda');
    await page.waitForURL(/\/acompanhamento\/fila/);
    await page.getByRole('link', { name: 'Equipe', exact: true }).click();
    await page.waitForURL(/ver=equipe/);
    await expect(page.locator('li.fr').first()).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `test-results/fila-${largura}.png`, fullPage: true });
    await page.locator('li.fr').first().locator('.fr-hit').click();
    await expect(page.getByRole('complementary', { name: 'Detalhe do item' })).toBeVisible();
    await page.screenshot({ path: `test-results/fila-${largura}-item.png`, fullPage: true });
  });
