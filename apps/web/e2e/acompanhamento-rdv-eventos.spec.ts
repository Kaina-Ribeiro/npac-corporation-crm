import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

const owner = ownerSql(E2E_DB);
const PESSOA = '55555555-5555-4555-8555-555555555555';
const EVENTO = '66666666-6666-4666-8666-666666666666';

test.beforeEach(async () => {
  await owner`truncate rate_limit, audit_log`;
  await owner`truncate mentoria_mentorados, mentoria_fichas, mentoria_rdv_pessoas, mentoria_midia cascade`;
  await owner`update "user" set two_factor_enabled = false`;
  await owner`insert into mentoria_rdv_pessoas (id, nome, nome_norm)
    values (${PESSOA}, 'Casal Fictício 60', 'casal ficticio 60')`;
});
test.afterAll(async () => {
  await owner`truncate mentoria_mentorados, mentoria_fichas, mentoria_rdv_pessoas, mentoria_midia cascade`;
  await owner`update "user" set two_factor_enabled = false`;
  await closeTestConnections();
});

async function entrar(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Usuário', { exact: true }).fill('carla');
  await page.getByLabel('Senha').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL(/\/dashboard/);
  await owner`update "user" set two_factor_enabled = true where email = 'carla@npac.com.br'`;
  await page.goto(`/acompanhamento/rdv/${PESSOA}`);
}
const salvo = (page: Page) =>
  expect(page.getByRole('status').filter({ hasText: 'Tudo salvo' })).toBeVisible();
const eventos = (page: Page) => page.getByRole('region', { name: 'Eventos' });

test('adicionar evento não traz data fixa; o evento entra na ordem por data', async ({ page }) => {
  await entrar(page);
  await page.getByRole('button', { name: 'Adicionar um evento' }).click();
  const d = page.getByRole('dialog', { name: 'Adicionar um evento' });
  await expect(d.getByLabel('Data do evento')).toHaveValue('');
  await d.getByLabel('Descrição do evento').fill('Recebeu a caixa (fictício)');
  await d.getByRole('button', { name: 'Adicionar' }).click();
  await expect(d.getByText(/DD\/MM\/AAAA/)).toBeVisible();
  await d.getByLabel('Data do evento').fill('20/08/2026');
  await d.getByRole('button', { name: 'Adicionar' }).click();
  await expect(d).toHaveCount(0);
  await page.getByRole('button', { name: 'Adicionar um evento' }).click();
  await page.getByRole('dialog').getByLabel('Data do evento').fill('14/08/2026');
  await page.getByRole('dialog').getByLabel('Descrição do evento').fill('Iniciou (fictício)');
  await page.getByRole('dialog').getByRole('button', { name: 'Adicionar' }).click();
  const descricoes = eventos(page).getByRole('textbox', { name: 'Descrição do evento' });
  await expect(descricoes).toHaveCount(2);
  await expect(descricoes.nth(0)).toHaveValue('Iniciou (fictício)');
  await expect(descricoes.nth(1)).toHaveValue('Recebeu a caixa (fictício)');
});

test('editar a descrição do evento salva ao sair; remover pede confirmação; cancelar não grava', async ({
  page,
}) => {
  await owner`insert into mentoria_rdv_eventos (id, pessoa_id, data_texto, data, origem)
    values (${EVENTO}, ${PESSOA}, '01/08/2026', '2026-08-01', 'MANUAL')`;
  await entrar(page);
  const desc = eventos(page).getByRole('textbox', { name: 'Descrição do evento' });
  await desc.fill('Assinou o contrato (fictício)');
  await desc.blur();
  await salvo(page);
  await page.reload();
  await expect(eventos(page).getByRole('textbox', { name: 'Descrição do evento' })).toHaveValue(
    'Assinou o contrato (fictício)',
  );
  await eventos(page).getByRole('button', { name: 'Remover evento' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click();
  const conta = async () =>
    (await owner<{ n: number }[]>`select count(*)::int as n from mentoria_rdv_eventos`)[0]?.n;
  expect(await conta()).toBe(1);
  await eventos(page).getByRole('button', { name: 'Remover evento' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmar exclusão' }).click();
  await expect.poll(conta).toBe(0);
});

test('× da mídia do evento remove na hora; aceita foto e link de vídeo', async ({ page }) => {
  await owner`insert into mentoria_rdv_eventos (id, pessoa_id, data_texto, data, origem)
    values (${EVENTO}, ${PESSOA}, '01/08/2026', '2026-08-01', 'MANUAL')`;
  await entrar(page);
  const foto = join(tmpdir(), 'foto-ficticia-evento.png');
  writeFileSync(
    foto,
    Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4c50000000049454e44ae426082',
      'hex',
    ),
  );
  await eventos(page).getByLabel('Anexar foto, vídeo ou PDF').setInputFiles(foto);
  await expect(eventos(page).getByRole('button', { name: 'Remover anexo' })).toHaveCount(1);
  await eventos(page).getByRole('button', { name: 'Link de vídeo' }).click();
  const d = page.getByRole('dialog', { name: 'Link de vídeo' });
  await d.getByLabel('Endereço do vídeo').fill('https://www.youtube.com/watch?v=ficticio');
  await d.getByRole('button', { name: 'Anexar link' }).click();
  await expect(eventos(page).getByRole('button', { name: 'Remover anexo' })).toHaveCount(2);
  await eventos(page).getByRole('button', { name: 'Remover anexo' }).first().click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(eventos(page).getByRole('button', { name: 'Remover anexo' })).toHaveCount(1);
});

test('colar vários eventos: prévia por linha; "presencial" só sugere; dúvida não é gravada', async ({
  page,
}) => {
  await entrar(page);
  await page.getByRole('button', { name: 'Colar vários eventos' }).click();
  const d = page.getByRole('dialog', { name: 'Colar vários eventos' });
  await d
    .getByLabel('Eventos colados')
    .fill(
      '14/08/2026 - Iniciou a mentoria RDV\n12/09/2026 - Participou do evento presencial\nfalou que talvez compre um imóvel',
    );
  await d.getByRole('button', { name: 'Ver prévia' }).click();
  const tipos = d.getByRole('combobox', { name: /Tipo da linha/ });
  await expect(tipos).toHaveCount(3);
  await expect(tipos.nth(0)).toHaveValue('EVENTO');
  // Sugestão não muda o tipo: a equipe escolhe (D22).
  await expect(tipos.nth(1)).toHaveValue('EVENTO');
  await expect(d.getByText(/Sugestão: Eventos presenciais/)).toBeVisible();
  await expect(tipos.nth(2)).toHaveValue('DUVIDA');
  await tipos.nth(1).selectOption('QUADRO');
  await d.getByRole('button', { name: /Gravar/ }).click();
  await expect(d).toHaveCount(0);
  await expect(eventos(page).getByRole('textbox', { name: 'Descrição do evento' })).toHaveCount(1);
  await expect(
    page
      .getByRole('region', { name: 'Eventos presenciais que já participou' })
      .getByText('Participou do evento presencial'),
  ).toBeVisible();
  const [n] = await owner<{ n: number }[]>`select count(*)::int as n from mentoria_rdv_duvidas`;
  expect(n?.n).toBe(0);
});

test('quadro: Editar libera adicionar; data do item não tem campo depois de gravada; sem data vai para o fim', async ({
  page,
}) => {
  await entrar(page);
  const q = page.getByRole('region', { name: 'Imóvel de leilão' });
  await expect(q.getByRole('button', { name: 'Adicionar item' })).toHaveCount(0);
  await q.getByRole('button', { name: 'Editar' }).click();
  await q.getByRole('button', { name: 'Adicionar item' }).click();
  const d = page.getByRole('dialog', { name: /Adicionar em Imóvel de leilão/ });
  await d.getByLabel('Descrição do item').fill('Sem data (fictício)');
  await d.getByRole('button', { name: 'Adicionar' }).click();
  await q.getByRole('button', { name: 'Adicionar item' }).click();
  await page.getByRole('dialog').getByLabel('Data do item').fill('05/2026');
  await page.getByRole('dialog').getByLabel('Descrição do item').fill('Arrematou (fictício)');
  await page.getByRole('dialog').getByRole('button', { name: 'Adicionar' }).click();
  const itens = q.getByRole('listitem');
  await expect(itens).toHaveCount(2);
  await expect(itens.nth(0)).toContainText('Arrematou (fictício)');
  await expect(itens.nth(0)).toContainText('05/2026');
  await expect(itens.nth(1)).toContainText('Sem data (fictício)');
  await expect(q.getByRole('textbox', { name: /Data/ })).toHaveCount(0);
});

test('Exportar PDF do RDV mostra eventos e quadros e esconde botões', async ({ page }) => {
  await owner`insert into mentoria_rdv_eventos (id, pessoa_id, data_texto, data, origem)
    values (${EVENTO}, ${PESSOA}, '01/08/2026', '2026-08-01', 'MANUAL')`;
  await entrar(page);
  await page.evaluate(() => {
    window.print = () => {};
  });
  await page.getByRole('button', { name: 'Exportar PDF' }).click();
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('button', { name: 'Adicionar um evento' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Editar' }).first()).toBeHidden();
  await expect(eventos(page).getByText('01/08/2026').first()).toBeVisible();
});
