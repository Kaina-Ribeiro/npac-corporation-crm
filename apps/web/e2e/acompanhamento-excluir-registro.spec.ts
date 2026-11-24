import { expect, test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

// NPAC-70 (Duda, 24/11/2026, "1A, 2C"): na ficha > Histórico, a Admin exclui contato e anotação; os demais perfis não
// veem o botão. O histórico mostra "Contato excluído" / "Anotação excluída", sem o texto.
const owner = ownerSql(E2E_DB);

test.describe.configure({ mode: 'serial' });
test.beforeEach(async () => {
  await owner`truncate rate_limit`;
});
test.afterAll(async () => {
  if (inscricao) await owner`delete from mentoria_inscricoes where id = ${inscricao}`;
  await closeTestConnections();
});

async function entrar(page: Page, usuario: string) {
  await page.context().clearCookies();
  await page.goto('/login');
  await page.getByLabel('Usuário', { exact: true }).fill(usuario);
  await page.getByLabel('Senha').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

const HOJE = `(now() at time zone 'America/Sao_Paulo')::date`;
let inscricao = '';
const painel = (page: Page) => page.getByRole('tabpanel', { name: 'Histórico' });

async function abrir(page: Page) {
  await page.goto(`/acompanhamento/ficha/${inscricao}?aba=historico`);
  await expect(painel(page).getByText('Inscrição criada', { exact: false }).first()).toBeVisible();
}

test.beforeAll(async () => {
  const [i] = await owner.unsafe<{ id: string }[]>(
    `insert into mentoria_inscricoes (tipo, mentoria, status, inicio_jornada, data_idr, termino_previsto)
     values ('INDIVIDUAL', 'RDV', 'ATIVO', ${HOJE} - 40, ${HOJE} - 40, ${HOJE} + 325)
     returning id`,
  );
  inscricao = i!.id;
  await owner`insert into mentoria_pessoas (inscricao_id, ordem, nome, nome_norm)
    values (${inscricao}, 1, 'Mentorada Fictícia 70', 'mentorada ficticia 70')`;
  // O Histórico abre com algo para esperar.
  const [duda] = await owner<{ id: string }[]>`select id from "user" where username = 'duda'`;
  await owner`insert into mentoria_historico (inscricao_id, ator_id, tipo, campos)
    values (${inscricao}, ${duda!.id}, 'inscricao.criada', '{}')`;
});

test('a Admin registra e exclui contato e anotação; o histórico guarda só o tipo', async ({
  page,
}) => {
  await entrar(page, 'duda');
  await abrir(page);
  const p = painel(page);

  await p.getByRole('button', { name: 'Registrar contato' }).click();
  const dlgContato = page.getByRole('dialog', { name: 'Registrar contato' });
  await dlgContato.getByRole('button', { name: 'Reunião', exact: true }).click();
  await dlgContato.getByLabel('Motivo').fill('ACM');
  await dlgContato.getByLabel('Observação').fill('Contato de teste 70');
  await dlgContato.getByRole('button', { name: 'Registrar contato' }).click();
  await expect(p.getByText('Contato de teste 70')).toBeVisible();

  await p.getByRole('button', { name: 'Nova anotação' }).click();
  const dlgAnot = page.getByRole('dialog', { name: 'Nova anotação' });
  await dlgAnot.getByLabel('Anotação').fill('Anotação de teste 70');
  await dlgAnot.getByRole('button', { name: 'Salvar anotação' }).click();
  await expect(p.getByText('Anotação de teste 70')).toBeVisible();

  await page.screenshot({ path: 'test-results/npac-70-historico-admin.png', fullPage: true });

  // Cancelar não exclui.
  await p.getByRole('button', { name: 'Excluir contato' }).click();
  const dlgExcluir = page.getByRole('dialog', { name: 'Excluir contato?' });
  await expect(dlgExcluir.getByText('Não dá para desfazer.', { exact: false })).toBeVisible();
  await page.screenshot({ path: 'test-results/npac-70-confirmar.png' });
  await dlgExcluir.getByRole('button', { name: 'Cancelar' }).click();
  await expect(p.getByText('Contato de teste 70')).toBeVisible();

  await p.getByRole('button', { name: 'Excluir contato' }).click();
  await page
    .getByRole('dialog', { name: 'Excluir contato?' })
    .getByRole('button', { name: 'Excluir contato' })
    .click();
  await expect(p.getByText('Contato de teste 70')).toHaveCount(0);
  await expect(p.getByText('Contato excluído por', { exact: false })).toBeVisible();

  await p.getByRole('button', { name: 'Excluir anotação' }).click();
  await page
    .getByRole('dialog', { name: 'Excluir anotação?' })
    .getByRole('button', { name: 'Excluir anotação' })
    .click();
  await expect(p.getByText('Anotação de teste 70')).toHaveCount(0);
  await expect(p.getByText('Anotação excluída por', { exact: false })).toBeVisible();

  // Depois de recarregar, continuam fora.
  await abrir(page);
  await expect(p.getByText('Contato de teste 70')).toHaveCount(0);
  await expect(p.getByText('Anotação de teste 70')).toHaveCount(0);
});

test('Operação vê o contato e a anotação, mas não o botão Excluir', async ({ page }) => {
  const [duda] = await owner<{ id: string }[]>`select id from "user" where username = 'duda'`;
  await owner`insert into mentoria_contatos (inscricao_id, feito_por, quando, canal)
    values (${inscricao}, ${duda!.id}, now() - interval '1 hour', 'LIGACAO')`;
  await entrar(page, 'operacao');
  await abrir(page);
  const p = painel(page);
  await expect(p.getByText('Ligação por', { exact: false }).first()).toBeVisible();
  await expect(p.getByRole('button', { name: /^Excluir/ })).toHaveCount(0);
});
