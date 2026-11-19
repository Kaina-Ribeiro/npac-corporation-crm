import { expect, test, type Browser, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

// Acesso por área, Fase 3 (NPAC-54): a Duda (Admin do Acompanhamento) cuida da equipe pela aba
// Perfis do módulo; a Diretoria vê o quadro "Acessos", o filtro por área e o "entrou há X" em
// Admin → Usuários; o Head do Comercial só vê o Comercial. Sempre pelo caminho real (login → menu).
const owner = ownerSql(E2E_DB);

async function limpar() {
  await owner`truncate access_requests`;
  await owner`delete from session where user_id in (select id from "user" where email like '%@fase3.test')`;
  await owner`delete from account where user_id in (select id from "user" where email like '%@fase3.test')`;
  await owner`delete from "user" where email like '%@fase3.test'`;
}

test.beforeEach(async () => {
  await owner`truncate rate_limit`;
  await limpar();
});
test.afterAll(async () => {
  await limpar();
  await closeTestConnections();
});

async function entrar(page: Page, usuario: string, senha = E2E_PASSWORD) {
  await page.goto('/login');
  await page.getByLabel('Usuário', { exact: true }).fill(usuario);
  await page.getByLabel('Senha', { exact: true }).fill(senha);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

const lateral = (page: Page) => page.getByRole('navigation', { name: 'Navegação lateral' });

/** Duda: login → Fila → menu Configurações (a aba Perfis é a padrão). */
async function abrirPerfis(page: Page) {
  await entrar(page, 'duda');
  await page.waitForURL(/\/acompanhamento\/fila/);
  await lateral(page).getByRole('link', { name: 'Configurações', exact: true }).click();
  await page.waitForURL(/\/acompanhamento\/configuracoes/);
  await page.locator('.tabs').getByRole('link', { name: 'Perfis', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Equipe do Acompanhamento' })).toBeVisible();
}

/** Convida pela aba Perfis e devolve a senha temporária. */
async function convidar(page: Page, usuario: string, perfil: string) {
  await page.getByRole('button', { name: 'Convidar', exact: true }).click();
  const dlg = page.getByRole('dialog', { name: 'Convidar' });
  await dlg.getByLabel('Nome', { exact: true }).fill(`Pessoa ${usuario}`);
  await dlg.getByLabel('E-mail', { exact: true }).fill(`${usuario}@fase3.test`);
  await dlg.getByLabel('Usuário', { exact: true }).fill(usuario);
  await dlg.getByLabel('Perfil', { exact: true }).selectOption(perfil);
  await dlg.getByRole('button', { name: 'Convidar', exact: true }).click();
  const aviso = page.getByRole('status').filter({ hasText: 'Senha temporária' });
  await expect(aviso).toBeVisible();
  return (await aviso.textContent())!.split(': ').at(-1)!.trim();
}

async function primeiroAcesso(browser: Browser, usuario: string, senha: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await entrar(page, usuario, senha);
  await page.waitForURL(/\/conta\/senha/);
  await page.getByLabel('Senha atual', { exact: true }).fill(senha);
  await page.getByLabel('Nova senha', { exact: true }).fill('fase3-nova-1');
  await page.getByLabel('Confirme a nova senha').fill('fase3-nova-1');
  await page.getByRole('button', { name: 'Salvar senha' }).click();
  return { ctx, page };
}

test('Duda convida uma Operação, que entra direto no módulo, e não vê o interruptor de Admin', async ({
  page,
  browser,
}) => {
  await abrirPerfis(page);
  // O selo de Admin é só da Diretoria (D9): a Duda vê a etiqueta, nunca o interruptor.
  await expect(page.getByRole('switch')).toHaveCount(0);
  await expect(page.getByText('Só a Diretoria dá o selo de Admin do Acompanhamento')).toBeVisible();
  await expect(page.getByText('Conta nova: a Diretoria cria o login')).toHaveCount(0);

  await page.getByRole('button', { name: 'Convidar', exact: true }).click();
  const dlg = page.getByRole('dialog', { name: 'Convidar' });
  await expect(
    dlg.getByLabel('Perfil', { exact: true }).locator('option:not([disabled])'),
  ).toHaveText(['Acompanhamento', 'Operação', 'Especialista', 'Mentor']);
  await expect(dlg.getByRole('switch')).toHaveCount(0);
  await dlg.getByRole('button', { name: 'Cancelar' }).click();
  await expect(dlg).toBeHidden();

  const senha = await convidar(page, 'operacao.fase3', 'OPERACAO');
  const linha = page.locator('.pf').filter({ hasText: 'Pessoa operacao.fase3' });
  await expect(linha.getByText('nunca entrou')).toBeVisible();
  await expect(page.getByLabel('Perfil de Pessoa operacao.fase3')).toHaveValue('OPERACAO');
  await page.screenshot({ path: 'test-results/fase3-perfis-convite.png', fullPage: true });

  const nova = await primeiroAcesso(browser, 'operacao.fase3', senha);
  await nova.page.waitForURL(/\/acompanhamento\/fila/);
  await expect(lateral(nova.page).getByRole('link', { name: 'Leads' })).toHaveCount(0);
  await nova.ctx.close();

  // Depois de usar o sistema, a Duda vê "entrou agora".
  await page.reload();
  await expect(
    page.locator('.pf').filter({ hasText: 'Pessoa operacao.fase3' }).getByText('entrou agora'),
  ).toBeVisible();
});

test('Duda aprova um pedido do Acompanhamento e não vê o do Comercial', async ({ page }) => {
  for (const [tela, usuario] of [
    ['/login/acompanhamento/solicitar', 'pedido.acomp'],
    ['/login/solicitar', 'pedido.comercial'],
  ] as const) {
    await page.goto(tela);
    await page.getByLabel('Nome', { exact: true }).fill(`Pessoa ${usuario}`);
    await page.getByLabel('Usuário', { exact: true }).fill(usuario);
    await page.getByLabel('E-mail', { exact: true }).fill(`${usuario}@fase3.test`);
    await page.getByLabel('Senha', { exact: true }).fill('minha-senha');
    await page.getByLabel('Confirme a senha', { exact: true }).fill('minha-senha');
    await page.getByRole('button', { name: 'Pedir acesso' }).click();
    await expect(page.getByText('Pedido enviado.')).toBeVisible();
  }

  await abrirPerfis(page);
  const pedidos = page.getByRole('region', { name: /Pedidos de acesso/ });
  await expect(pedidos.getByText('Pessoa pedido.acomp')).toBeVisible();
  await expect(pedidos.getByText('Pessoa pedido.comercial')).toHaveCount(0);
  // Sem perfil escolhido não aprova.
  await expect(pedidos.getByRole('button', { name: 'Aprovar' })).toBeDisabled();
  await pedidos.getByLabel('Perfil de Pessoa pedido.acomp').selectOption('ESPECIALISTA');
  await pedidos.getByRole('button', { name: 'Aprovar' }).click();
  await expect(page.getByText('Pessoa pedido.acomp aprovado como Especialista.')).toBeVisible();
  await expect(page.getByRole('region', { name: /Pedidos de acesso/ })).toHaveCount(0);
  await expect(page.getByLabel('Perfil de Pessoa pedido.acomp')).toHaveValue('ESPECIALISTA');
});

test('Duda gera nova senha e desativa e reativa uma conta da área', async ({ page }) => {
  await abrirPerfis(page);
  await convidar(page, 'mentor.fase3', 'MENTOR');
  const nome = 'Pessoa mentor.fase3';
  await page.getByRole('button', { name: `Nova senha para ${nome}` }).click();
  await page
    .getByRole('dialog', { name: `Gerar nova senha para ${nome}?` })
    .getByRole('button', { name: 'Nova senha' })
    .click();
  await expect(page.getByRole('status').filter({ hasText: 'Senha temporária' })).toBeVisible();
  await page.getByRole('button', { name: `Desativar ${nome}` }).click();
  await page
    .getByRole('dialog', { name: `Desativar ${nome}?` })
    .getByRole('button', { name: 'Desativar' })
    .click();
  await expect(page.getByText(`${nome} desativado`)).toBeVisible();
  await page.getByRole('button', { name: `Reativar ${nome}` }).click();
  await expect(page.getByText(`${nome} reativado`)).toBeVisible();
});

test('Ana (Head do Comercial) não vê contas do Acompanhamento nem o quadro Acessos', async ({
  page,
}) => {
  await owner`update "user" set two_factor_enabled=false where email='ana@npac.com.br'`;
  await entrar(page, 'ana');
  await page.waitForURL(/\/dashboard/);
  await lateral(page).getByRole('link', { name: 'Admin' }).click();
  await page.waitForURL(/\/admin/);
  await expect(page.getByRole('heading', { name: 'Equipe' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Acessos' })).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Área' })).toHaveCount(0);
  for (const email of ['duda@npac.com.br', 'carla@npac.com.br', 'operacao@npac.com.br'])
    await expect(page.getByText(email)).toHaveCount(0);
  await expect(page.getByText('ale@npac.com.br')).toBeVisible();
});

test('Diretoria filtra por área, vê no quadro a conta que a Duda criou e o "entrou há"', async ({
  page,
  browser,
}) => {
  // A Duda cria uma conta pela aba Perfis.
  const ctx = await browser.newContext();
  const duda = await ctx.newPage();
  await abrirPerfis(duda);
  await convidar(duda, 'nova.fase3', 'OPERACAO');
  await ctx.close();

  // Igor acabou de usar o sistema.
  const ctxIgor = await browser.newContext();
  await entrar(await ctxIgor.newPage(), 'igor');
  await ctxIgor.close();

  await entrar(page, 'diretor');
  await lateral(page).getByRole('link', { name: 'Admin' }).click();
  await page.waitForURL(/\/admin/);
  const quadro = page.getByRole('region', { name: 'Acessos' });
  const linha = quadro
    .getByRole('listitem')
    .filter({ hasText: 'Duda criou a conta de Pessoa nova.fase3 · Acompanhamento, Operação' });
  await expect(linha).toBeVisible();
  await expect(linha.getByText('novo')).toBeVisible();
  await page.screenshot({ path: 'test-results/fase3-admin-diretoria.png' });

  const equipe = page.getByRole('listitem').filter({ hasText: 'nova.fase3@fase3.test' });
  await expect(equipe).toContainText('nunca entrou');
  await expect(page.getByRole('listitem').filter({ hasText: 'igor@npac.com.br' })).toContainText(
    /entrou (agora|há \d+ minutos?)/,
  );

  // Filtro por área (lembrado ao recarregar).
  const filtro = page.getByRole('group', { name: 'Área' });
  await filtro.getByRole('button', { name: 'Acompanhamento' }).click();
  await expect(page.getByText('duda@npac.com.br')).toBeVisible();
  await expect(page.getByText('ale@npac.com.br')).toHaveCount(0);
  await filtro.getByRole('button', { name: 'Comercial' }).click();
  await expect(page.getByText('ale@npac.com.br')).toBeVisible();
  await expect(page.getByText('duda@npac.com.br')).toHaveCount(0);

  // Reabriu: o que já foi visto deixa de ser "novo"; o filtro volta como estava.
  await page.reload();
  await expect(
    page.getByRole('group', { name: 'Área' }).getByRole('button', { name: 'Comercial' }),
  ).toHaveAttribute('aria-pressed', 'true');
  const deNovo = page
    .getByRole('region', { name: 'Acessos' })
    .getByRole('listitem')
    .filter({ hasText: 'criou a conta de Pessoa nova.fase3' });
  await expect(deNovo).toBeVisible();
  await expect(deNovo.getByText('novo')).toHaveCount(0);

  // "Ver tudo" abre a lista inteira.
  await page.getByRole('button', { name: 'Ver tudo' }).click();
  const dlg = page.getByRole('dialog', { name: 'Acessos' });
  await expect(dlg.getByText('criou a conta de Pessoa nova.fase3')).toBeVisible();
  await dlg.getByRole('button', { name: 'Fechar' }).click();
  await expect(dlg).toBeHidden();
  await page.getByRole('group', { name: 'Área' }).getByRole('button', { name: 'Todas' }).click();
});
