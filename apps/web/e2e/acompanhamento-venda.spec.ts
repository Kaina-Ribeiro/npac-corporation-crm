import { expect, test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

/**
 * NPAC-56, Parte 1 (Eduarda 1A e 3A): a venda de RDV registrada pela closer vira mentorado sozinha;
 * a inscrição entra sem responsável, como "Nova inscrição" na Fila da Admin, que escolhe quem
 * acompanha. A ficha mostra de que venda veio e a situação do pagamento só para leitura.
 */
const owner = ownerSql(E2E_DB);
const WIDTHS = [375, 768, 1024, 1440] as const;
const NOME = 'Comprador da Mentoria';
let produto = '';

test.beforeAll(async () => {
  // De novo no mesmo banco: o produto já tem venda (não se apaga), então volta a ficar ativo.
  const [p] = await owner<{ id: string }[]>`
    insert into products (code, name, closer_id, price_cents, mentoria)
    select 'E2E_V56_RDV', 'Mentoria RDV da Sônia', id, 1800000, 'RDV'
    from "user" where email = 'sonia@npac.com.br'
    on conflict (code) do update set active = true, mentoria = 'RDV' returning id`;
  produto = p!.id;
});
test.beforeEach(async () => {
  await owner`truncate rate_limit`;
});
test.afterAll(async () => {
  // A venda fica (deals não se apaga); a inscrição que ela criou sai, para não aparecer nos outros
  // testes do módulo, e o produto sai do catálogo da Sônia.
  await owner`delete from mentoria_inscricoes where deal_id in (
    select d.id from deals d join products p on p.id = d.product_id where p.code = 'E2E_V56_RDV')`;
  await owner`update products set active = false where code = 'E2E_V56_RDV'`;
  await closeTestConnections();
});

async function entrar(page: Page, usuario: string) {
  await page.goto('/login');
  await page.getByLabel('Usuário', { exact: true }).fill(usuario);
  await page.getByLabel('Senha').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

async function shots(page: Page, file: string) {
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      `${file} ${w}px sem rolagem lateral`,
    ).toBe(true);
    await page.screenshot({ path: `test-results/${file}-${w}.png`, animations: 'disabled' });
  }
  await page.setViewportSize({ width: 1280, height: 900 });
}

test('venda do closer vira nova inscrição na fila da duda', async ({ page, browser }) => {
  // Lead da Ale com a reunião da Sônia já realizada: a closer enxerga e registra a venda.
  await entrar(page, 'ale');
  const res = await page.request.post('/api/leads', {
    data: {
      name: NOME,
      instagram: `@comp.v56.${Date.now() % 1e8}`,
      incomeBand: 'R8_15K',
      source: 'BIO',
    },
  });
  expect(res.ok(), await res.text()).toBe(true);
  const leadId = ((await res.json()) as { id: string }).id;
  await owner`insert into meetings (lead_id, closer_id, scheduled_at, origin, outcome, outcome_at, created_by)
    select ${leadId}, c.id, now() - interval '2 hours', 'DIRETO', 'DONE', now() - interval '1 hour', s.id
    from "user" c, "user" s where c.email = 'sonia@npac.com.br' and s.email = 'ale@npac.com.br'`;

  const ctx = await browser.newContext();
  const closer = await ctx.newPage();
  await entrar(closer, 'sonia');
  await closer.goto(`/leads/${leadId}#vendas`);
  await closer.getByRole('button', { name: 'Registrar venda', exact: true }).click();
  const sale = closer.getByRole('form', { name: 'Registrar venda' });
  await sale.getByLabel('Produto da venda', { exact: true }).selectOption(produto);
  await sale.getByRole('button', { name: 'Continuar venda' }).click();
  await sale.getByLabel('Valor total (R$)', { exact: true }).fill('18000,00');
  await sale.getByLabel('Forma de pagamento', { exact: true }).selectOption('PIX');
  await sale.getByRole('button', { name: 'Continuar venda' }).click();
  await sale.getByRole('button', { name: 'Confirmar venda' }).click();
  await expect(sale).toHaveCount(0);
  const [insc] = await owner<{ id: string }[]>`
    select i.id from mentoria_inscricoes i join deals d on d.id = i.deal_id
    where d.lead_id = ${leadId}`;
  expect(insc?.id).toBeTruthy();
  await ctx.close();

  // A Duda (Admin do Acompanhamento) vê o item, escolhe a responsável e o item sai.
  const ctx2 = await browser.newContext();
  const duda = await ctx2.newPage();
  await entrar(duda, 'duda');
  await duda.goto('/acompanhamento/fila?ver=minha');
  const item = duda.locator('li.fr').filter({ hasText: NOME }).filter({ visible: true });
  await expect(item.getByText('Nova inscrição · RDV')).toBeVisible();
  await item.locator('.fr-hit').click();
  const painel = duda.getByRole('complementary', { name: 'Detalhe do item' });
  await expect(painel.getByRole('heading', { name: NOME })).toBeVisible();
  await shots(duda, 'venda-nova-inscricao');
  await painel.getByLabel('Responsável', { exact: true }).selectOption({ label: 'Duda' });
  await painel.getByRole('button', { name: 'Definir', exact: true }).click();
  await expect(duda.locator('li.fr').filter({ hasText: NOME })).toHaveCount(0);
  await expect
    .poll(
      async () =>
        (
          await owner<{ r: string | null }[]>`
            select u.username as r from mentoria_inscricoes i join "user" u on u.id = i.responsavel_id
            where i.id = ${insc!.id}`
        )[0]?.r ?? null,
    )
    .toBe('duda');

  // A ficha mostra de que venda veio; a situação do pagamento vem das parcelas e não se edita.
  await duda.goto(`/acompanhamento/ficha/${insc!.id}`);
  await expect(duda.getByText(/^Veio da venda de \d{2}\/\d{2}$/)).toBeVisible();
  const financeiro = duda.getByLabel('Financeiro', { exact: true }).filter({ visible: true });
  await expect(financeiro).toBeDisabled();
  await expect(financeiro.locator('option:checked')).toHaveText('Quitado');
  await shots(duda, 'venda-ficha');
  await ctx2.close();
});
