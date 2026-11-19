import { expect, test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

// Capturas da Fase 3B (NPAC-54): aba Perfis com o campo Alcance (Duda) e as telas de quem tem
// "Só a carteira" (Fila, Mentorados, Nova inscrição), em 375 / 768 / 1024 / 1440. Confere também
// que nada passa da largura da tela. Só roda com CAPTURAS=<pasta>.
const PASTA = process.env.CAPTURAS;
test.skip(!PASTA, 'só com CAPTURAS=<pasta>');
const owner = ownerSql(E2E_DB);
const LARGURAS = [375, 768, 1024, 1440];
const USUARIO = 'carteira.captura';

test.beforeAll(async () => {
  await owner`truncate rate_limit`;
  await owner`delete from "user" where username = ${USUARIO}`;
  await owner`insert into "user" (id, name, email, username, display_username, role, can_prospect,
      can_close, must_change_password)
    values ('cap-carteira', 'Maria Carteira', 'carteira.captura@fase3b.test', ${USUARIO}, ${USUARIO},
      'ACOMPANHAMENTO', false, false, false)`;
  await owner`insert into account (id, account_id, provider_id, user_id, password)
    select 'cap-carteira-acc', 'cap-carteira', 'credential', 'cap-carteira', a.password
    from account a join "user" u on u.id = a.user_id where u.username = 'duda'`;
  await owner`insert into mentoria_perfis (user_id, perfil, admin) values ('cap-carteira', 'ACOMPANHAMENTO', false)`;
  await owner`update area_membros set alcance = 'CARTEIRA' where user_id = 'cap-carteira'`;
  for (const n of [1, 2]) {
    const [i] = await owner<{ id: string }[]>`
      insert into mentoria_inscricoes (tipo, mentoria, status, inicio_jornada, termino_previsto, responsavel_id)
      values ('INDIVIDUAL', 'RDV', 'ATIVO', current_date - 40, current_date + 325, 'cap-carteira')
      returning id`;
    await owner`insert into mentoria_pessoas (inscricao_id, ordem, nome, nome_norm)
      values (${i!.id}, 1, ${`Mentorado Fictício Captura ${n}`}, ${`mentorado ficticio captura ${n}`})`;
  }
});
test.afterAll(async () => {
  await owner`delete from mentoria_inscricoes where id in (
    select inscricao_id from mentoria_pessoas where nome like 'Mentorado Fictício Captura%')`;
  await owner`delete from session where user_id = 'cap-carteira'`;
  await owner`delete from "user" where id = 'cap-carteira'`;
  await closeTestConnections();
});

async function entrar(page: Page, usuario: string) {
  await page.goto('/login/acompanhamento');
  await page.getByLabel('Usuário', { exact: true }).fill(usuario);
  await page.getByLabel('Senha', { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL(/\/acompanhamento\/fila/);
}

async function foto(page: Page, nome: string, largura: number) {
  const larga = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(larga, `${nome} em ${largura}: rolagem lateral`).toBeLessThanOrEqual(0);
  // A entrada da página anima por 280 ms (opacidade): espera terminar.
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${PASTA}/${nome}-${largura}.png`, fullPage: true });
}

for (const largura of LARGURAS) {
  test(`Fase 3B em ${largura}`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: largura, height: 900 } });
    const page = await ctx.newPage();
    await entrar(page, 'duda');
    await page.goto('/acompanhamento/configuracoes');
    await page.locator('.tabs').getByRole('link', { name: 'Perfis', exact: true }).click();
    await expect(page.getByRole('radiogroup', { name: 'Alcance de Maria Carteira' })).toBeVisible();
    await foto(page, 'perfis', largura);
    await page.getByRole('button', { name: 'Convidar', exact: true }).first().click();
    const dlg = page.getByRole('dialog', { name: 'Convidar' });
    await dlg.getByLabel('Perfil', { exact: true }).selectOption('ACOMPANHAMENTO');
    await expect(dlg.getByRole('radiogroup', { name: 'Alcance' })).toBeVisible();
    await foto(page, 'convidar', largura);
    await ctx.close();

    const ctx2 = await browser.newContext({ viewport: { width: largura, height: 900 } });
    const p = await ctx2.newPage();
    await entrar(p, USUARIO);
    await foto(p, 'fila-carteira', largura);
    await p.goto('/acompanhamento/mentorados');
    await expect(p.getByText('Mentorado Fictício Captura 1').first()).toBeVisible();
    await foto(p, 'mentorados-carteira', largura);
    await p.goto('/acompanhamento/mentorados/nova');
    await foto(p, 'nova-carteira', largura);
    await ctx2.close();
  });
}
