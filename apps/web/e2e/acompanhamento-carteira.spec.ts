import { expect, test, type Browser, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

// NPAC-54, Fase 3B: "Acessos" com a tag "Carteira" no cargo Acompanhamento. A Duda convida pela aba
// Perfis com "Carteira"; a pessoa entra pelo caminho real e vê só os mentorados em que é a responsável:
// Fila sem "Equipe", Mentorados sem o filtro Responsável, ficha com o Responsável só para leitura,
// a ficha de outro mentorado dá 404 e o cadastro já vem com ela de responsável.
const owner = ownerSql(E2E_DB);
const USUARIO = 'carteira.fase3b';
const SENHA_NOVA = 'fase3b-nova-1';
const MINHA = 'Mentorado Fictício Carteira 1';
const OUTRA = 'Mentorado Fictício Carteira 2';

async function limparUmaVez() {
  await owner`delete from mentoria_inscricoes where id in (
    select inscricao_id from mentoria_pessoas where nome like 'Mentorado Fictício Carteira%')`;
  await owner`delete from session where user_id in (select id from "user" where email like '%@fase3b.test')`;
  await owner`delete from account where user_id in (select id from "user" where email like '%@fase3b.test')`;
  await owner`delete from "user" where email like '%@fase3b.test'`;
}

/** A API ainda pode estar gravando o "entrou há X" da conta do teste anterior: deadlock tenta de novo. */
async function limpar() {
  for (let i = 0; ; i++) {
    try {
      return await limparUmaVez();
    } catch (e) {
      if ((e as { code?: string }).code !== '40P01' || i >= 2) throw e;
    }
  }
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
  await page.goto('/login/acompanhamento');
  await page.getByLabel('Usuário', { exact: true }).fill(usuario);
  await page.getByLabel('Senha', { exact: true }).fill(senha);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

const lateral = (page: Page) => page.getByRole('navigation', { name: 'Navegação lateral' });

async function abrirPerfis(page: Page) {
  await entrar(page, 'duda');
  await page.waitForURL(/\/acompanhamento\/fila/);
  await lateral(page).getByRole('link', { name: 'Configurações', exact: true }).click();
  await page.waitForURL(/\/acompanhamento\/configuracoes/);
  await page.locator('.tabs').getByRole('link', { name: 'Perfis', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Equipe do Acompanhamento' })).toBeVisible();
}

/** Duda convida com o perfil Acompanhamento e o alcance escolhido; devolve a senha temporária. */
async function convidar(page: Page, alcance: 'Todos os mentorados' | 'Carteira') {
  await page.getByRole('button', { name: 'Convidar', exact: true }).click();
  const dlg = page.getByRole('dialog', { name: 'Convidar' });
  await dlg.getByLabel('Nome', { exact: true }).fill('Pessoa Carteira');
  await dlg.getByLabel('E-mail', { exact: true }).fill(`${USUARIO}@fase3b.test`);
  await dlg.getByLabel('Usuário', { exact: true }).fill(USUARIO);
  // Sem perfil escolhido não há o campo; em Operação também não.
  await expect(dlg.getByRole('radiogroup', { name: 'Acessos' })).toHaveCount(0);
  await dlg.getByLabel('Perfil', { exact: true }).selectOption('OPERACAO');
  await expect(dlg.getByRole('radiogroup', { name: 'Acessos' })).toHaveCount(0);
  await dlg.getByLabel('Perfil', { exact: true }).selectOption('ACOMPANHAMENTO');
  const campo = dlg.getByRole('radiogroup', { name: 'Acessos' });
  await expect(campo.getByRole('radio', { name: 'Todos os mentorados' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await campo.getByRole('radio', { name: alcance }).click();
  await dlg.getByRole('button', { name: 'Convidar', exact: true }).click();
  const aviso = page.getByRole('status').filter({ hasText: 'Senha temporária' });
  await expect(aviso).toBeVisible();
  return (await aviso.textContent())!.split(': ').at(-1)!.trim();
}

async function primeiroAcesso(browser: Browser, senha: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await entrar(page, USUARIO, senha);
  await page.waitForURL(/\/conta\/senha/);
  await page.getByLabel('Senha atual', { exact: true }).fill(senha);
  await page.getByLabel('Nova senha', { exact: true }).fill(SENHA_NOVA);
  await page.getByLabel('Confirme a nova senha').fill(SENHA_NOVA);
  await page.getByRole('button', { name: 'Salvar senha' }).click();
  return { ctx, page };
}

/** Uma inscrição ativa com a pessoa e o responsável dados (dados fictícios). */
async function inscricao(nome: string, responsavel: string) {
  const [i] = await owner<{ id: string }[]>`
    insert into mentoria_inscricoes (tipo, mentoria, status, inicio_jornada, termino_previsto, responsavel_id)
    values ('INDIVIDUAL', 'RDV', 'ATIVO', current_date - 40, current_date + 325, ${responsavel})
    returning id`;
  await owner`insert into mentoria_pessoas (inscricao_id, ordem, nome, nome_norm)
    values (${i!.id}, 1, ${nome}, ${nome.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')})`;
  return i!.id;
}

test('Duda dá a tag "Carteira"; a pessoa entra e vê só os mentorados dela', async ({
  page,
  browser,
}) => {
  await abrirPerfis(page);
  const senha = await convidar(page, 'Carteira');
  const linha = page.locator('.pf').filter({ hasText: 'Pessoa Carteira' });
  await expect(
    linha.getByRole('radio', { name: 'Carteira' }),
    'a linha mostra o alcance escolhido',
  ).toHaveAttribute('aria-checked', 'true');
  // A Duda tem o selo de Admin: a linha dela não tem alcance (só vale sem o selo).
  const minhaLinha = page.locator('.pf').filter({ hasText: '(você)' });
  await expect(minhaLinha.getByRole('radiogroup')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/fase3b-perfis.png', fullPage: true });

  const [eu] = await owner<{ id: string }[]>`select id from "user" where username = ${USUARIO}`;
  const [duda] = await owner<{ id: string }[]>`select id from "user" where username = 'duda'`;
  const minha = await inscricao(MINHA, eu!.id);
  const outra = await inscricao(OUTRA, duda!.id);

  const nova = await primeiroAcesso(browser, senha);
  const p = nova.page;
  // Entra direto na Fila, sem o botão Minha/Equipe (resposta b).
  await p.waitForURL(/\/acompanhamento\/fila/);
  await expect(p.getByRole('group', { name: 'De quem é a fila' })).toHaveCount(0);

  // Mentorados pelo menu: só a carteira, sem o filtro Responsável.
  await lateral(p).getByRole('link', { name: 'Mentorados', exact: true }).click();
  await p.waitForURL(/\/acompanhamento\/mentorados/);
  await expect(p.getByText(MINHA).first()).toBeVisible();
  await expect(p.getByText(OUTRA)).toHaveCount(0);
  await expect(p.getByLabel('Responsável', { exact: true })).toHaveCount(0);
  await p.screenshot({ path: 'test-results/fase3b-mentorados.png', fullPage: true });

  // Ficha da carteira: o Responsável fica só para leitura (resposta e).
  await p.getByText(MINHA).first().click();
  await p.waitForURL(new RegExp(`/acompanhamento/ficha/${minha}`));
  await expect(p.getByLabel('Responsável', { exact: true })).toBeDisabled();

  // Ficha de outro mentorado: não existe para ela.
  const r = await p.goto(`/acompanhamento/ficha/${outra}`);
  expect(r?.status()).toBe(404);

  // Cadastro: a responsável é ela, sem trocar (2A).
  await p.goto('/acompanhamento/mentorados/nova');
  await expect(p.getByRole('heading', { name: 'Nova inscrição', level: 1 })).toBeVisible();
  const resp = p.getByRole('combobox', { name: 'Responsável', exact: true });
  await expect(resp).toBeDisabled();
  await expect(resp.locator('option:checked')).toHaveText('Pessoa Carteira');
  await nova.ctx.close();

  // Celular (toque): na lista da Diretoria, tocar na tag "Carteira" abre a dica, inteira na tela.
  const cel = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true });
  const d = await cel.newPage();
  await entrar(d, 'diretor');
  await d.goto('/admin');
  const tag = d.locator('li').filter({ hasText: USUARIO }).first().locator('.role-TAG');
  await tag.scrollIntoViewIfNeeded();
  await tag.tap();
  const dica = d.getByRole('tooltip').filter({ hasText: 'Cadastra mentorados novos' });
  await expect(dica).toBeVisible();
  const caixa = (await dica.boundingBox())!;
  expect(caixa.x).toBeGreaterThanOrEqual(0);
  expect(caixa.x + caixa.width).toBeLessThanOrEqual(375);
  await cel.close();
});

test('Duda troca de "Carteira" para "Todos os mentorados" na linha', async ({ page }) => {
  await abrirPerfis(page);
  await convidar(page, 'Carteira');
  const linha = page.locator('.pf').filter({ hasText: 'Pessoa Carteira' });
  await linha.getByRole('radio', { name: 'Todos os mentorados' }).click();
  await expect(linha.getByRole('radio', { name: 'Todos os mentorados' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect
    .poll(
      async () =>
        (
          await owner<{ alcance: string }[]>`
          select m.alcance from area_membros m join "user" u on u.id = m.user_id
          where u.username = ${USUARIO} and m.area = 'ACOMPANHAMENTO'`
        )[0]?.alcance,
    )
    .toBe('TODOS');
  // Dica do acesso: no mouse e no foco do teclado, ligada à tag (aria-describedby).
  const todosTag = linha.getByRole('radio', { name: 'Todos os mentorados' });
  // O mouse ainda está sobre a tag depois do clique: sai e volta para o hover valer.
  await page.mouse.move(0, 0);
  await todosTag.hover();
  const dicaTodos = page
    .getByRole('tooltip')
    .filter({ hasText: 'Vê e cuida de todos os mentorados do Acompanhamento.' });
  await expect(dicaTodos).toBeVisible();
  await expect(todosTag).toHaveAccessibleDescription(
    'Vê e cuida de todos os mentorados do Acompanhamento.',
  );
  await page.mouse.move(0, 0);
  await expect(dicaTodos).toBeHidden();
  // Teclado: a marcada recebe o foco e as setas trocam (escolha única).
  await linha.getByRole('radio', { name: 'Todos os mentorados' }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(linha.getByRole('radio', { name: 'Carteira' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(linha.getByRole('radio', { name: 'Carteira' })).toBeFocused();
  await expect(
    page
      .getByRole('tooltip')
      .filter({ hasText: 'Vê e cuida só dos mentorados em que é a responsável.' }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('tooltip').filter({ hasText: 'Vê e cuida só' })).toBeHidden();
  // Em outro perfil o campo some.
  await page.getByLabel('Perfil de Pessoa Carteira').selectOption('OPERACAO');
  await expect(linha.getByRole('radiogroup')).toHaveCount(0);
});
