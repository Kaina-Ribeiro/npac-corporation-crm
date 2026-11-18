import { expect, test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { CAIXA_URL, E2E_DB, E2E_PASSWORD, WEB_ORIGIN } from './env.js';

// "Esqueci minha senha" por e-mail, de ponta a ponta: a API envia pelo SMTP para a caixa falsa
// (scripts/caixa-falsa.mts) e o teste lê o e-mail de lá.
const owner = ownerSql(E2E_DB);
const EMAIL = 'murilo@npac.com.br';
type Mensagem = { to: string[]; subject: string; text: string; html: string };

const caixa = async (): Promise<Mensagem[]> => (await fetch(CAIXA_URL)).json();

/** Espera o e-mail chegar (o envio sai depois da resposta) e devolve o link do botão. */
async function linkDoEmail(): Promise<string> {
  let link = '';
  await expect
    .poll(
      async () => {
        const m = (await caixa()).filter((x) => x.to.includes(EMAIL)).at(-1);
        link = /href="([^"]+)"/.exec(m?.html ?? '')?.[1] ?? '';
        return link;
      },
      { timeout: 10_000 },
    )
    .not.toBe('');
  return link;
}

async function pedirLink(page: Page, login: string) {
  await page.goto('/login');
  await page.getByRole('link', { name: 'Esqueci minha senha' }).click();
  await page.waitForURL(/\/login\/esqueci$/);
  await page.getByLabel('Usuário ou e-mail', { exact: true }).fill(login);
  await page.getByRole('button', { name: 'Enviar link' }).click();
  await expect(page.getByRole('heading', { name: 'Confira o seu e-mail' })).toBeVisible();
  // "Dá para pedir de novo em 1 minuto".
  await expect(page.getByRole('button', { name: 'Enviar de novo' })).toBeDisabled();
}

let originalHash = '';
test.beforeAll(async () => {
  const [row] = await owner<{ password: string }[]>`
    select a.password from account a join "user" u on u.id = a.user_id
    where u.email = ${EMAIL} and a.provider_id = 'credential'`;
  originalHash = row?.password ?? '';
});
test.beforeEach(async () => {
  await owner`truncate rate_limit, verification`;
  await fetch(CAIXA_URL, { method: 'DELETE' });
});
test.afterEach(async () => {
  await owner`
    update account set password = ${originalHash}
    where provider_id = 'credential' and user_id = (select id from "user" where email = ${EMAIL})`;
  await owner`update "user" set must_change_password = false where email = ${EMAIL}`;
});
test.afterAll(async () => closeTestConnections());

test('esqueci a senha: e-mail com o link, nova senha e já entra', async ({ page }) => {
  await pedirLink(page, 'murilo');
  await page.screenshot({ path: 'test-results/esqueci-senha.png' });

  const [m] = (await caixa()).filter((x) => x.to.includes(EMAIL));
  expect(m?.subject).toBe('Crie a sua senha nova');
  expect(m?.text).toContain('Oi, Murilo.');
  const link = await linkDoEmail();
  // Sem e-mail nem usuário no endereço; o token vai no fragmento, que não chega a servidor nenhum.
  expect(link).toMatch(new RegExp(`^${WEB_ORIGIN}/login/nova-senha#t=[A-Za-z0-9_-]+$`));
  expect(link).not.toContain('murilo');

  await page.goto(link);
  await expect(page.getByRole('heading', { name: 'Crie a sua senha nova' })).toBeVisible();
  await expect(page.getByText('Para o usuário murilo.')).toBeVisible();
  await page.screenshot({ path: 'test-results/nova-senha.png' });
  await page.getByLabel('Senha nova', { exact: true }).fill('senha-nova-do-e2e');
  await page.getByLabel('Confirme a senha', { exact: true }).fill('senha-nova-do-e2e');
  await page.getByRole('button', { name: 'Salvar e entrar' }).click();
  await page.waitForURL(/\/dashboard/);

  // A senha antiga não entra mais; o mesmo link não serve de novo. Sai do Dashboard antes de
  // limpar os cookies: sem sessão, a tela aberta redirecionaria no meio da próxima navegação.
  await page.goto('about:blank');
  await page.context().clearCookies();
  // Já usado: a tela confere ao abrir e nem mostra o formulário.
  await page.goto(link);
  await expect(page.getByRole('heading', { name: 'Link vencido' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Pedir outro link' })).toHaveAttribute(
    'href',
    '/login/esqueci',
  );

  await page.goto('/login');
  await page.getByLabel('Usuário', { exact: true }).fill('murilo');
  await page.getByLabel('Senha').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(
    page.getByRole('alert').and(page.getByText('Usuário ou senha inválidos')),
  ).toBeVisible();
});

test('usuário que não existe vê a mesma tela e nada é enviado', async ({ page }) => {
  await pedirLink(page, 'ninguem@npac.com.br');
  await expect(page.getByText('Se os dados estiverem certos')).toBeVisible();
  // Dá tempo para um envio que não deveria acontecer.
  await page.waitForTimeout(1_000);
  expect(await caixa()).toHaveLength(0);
});

test('link sem token ou inválido mostra "Link vencido" e o caminho para pedir outro', async ({
  page,
}) => {
  await page.goto('/login/nova-senha');
  await expect(page.getByRole('heading', { name: 'Link vencido' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Pedir outro link' })).toBeVisible();
  await page.goto(`/login/nova-senha#t=${'x'.repeat(43)}`);
  await expect(page.getByRole('heading', { name: 'Link vencido' })).toBeVisible();
});

test('senhas diferentes não saem da tela', async ({ page }) => {
  await pedirLink(page, 'murilo');
  await page.goto(await linkDoEmail());
  await page.getByLabel('Senha nova', { exact: true }).fill('senha-a-123');
  await page.getByLabel('Confirme a senha', { exact: true }).fill('senha-b-123');
  await page.getByRole('button', { name: 'Salvar e entrar' }).click();
  await expect(page.getByRole('alert').and(page.getByText('As senhas não conferem'))).toBeVisible();
  await expect(page).toHaveURL(/\/login\/nova-senha/);
});
