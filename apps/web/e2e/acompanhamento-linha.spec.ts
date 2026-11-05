import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

const owner = ownerSql(E2E_DB);
const FICHA = '33333333-3333-4333-8333-333333333333';

test.beforeEach(async () => {
  await owner`truncate rate_limit`;
  await owner`truncate mentoria_mentorados, mentoria_fichas, mentoria_rdv_pessoas, mentoria_midia cascade`;
  await owner`update "user" set two_factor_enabled = false`;
  await owner`insert into mentoria_fichas (id, nome, nome_norm, data_inicio_texto, data_inicio)
    values (${FICHA}, 'Mentorado Fictício 30', 'mentorado ficticio 30', '01/02/2026', '2026-02-01')`;
  await owner`insert into mentoria_fichas (id, nome, nome_norm) values (gen_random_uuid(), 'Ágata Fictícia', 'agata ficticia')`;
});
test.afterAll(async () => {
  await owner`truncate mentoria_mentorados, mentoria_fichas, mentoria_rdv_pessoas, mentoria_midia cascade`;
  await owner`update "user" set two_factor_enabled = false`;
  await closeTestConnections();
});

async function entrar(page: Page, rota: string) {
  await page.goto('/login');
  await page.getByLabel('Usuário', { exact: true }).fill('carla');
  await page.getByLabel('Senha').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL(/\/dashboard/);
  await owner`update "user" set two_factor_enabled = true where email = 'carla@npac.com.br'`;
  await page.goto(rota);
}
const salvo = (page: Page) =>
  expect(page.getByRole('status').filter({ hasText: 'Tudo salvo' })).toBeVisible();

test('busca por nome na lista usa POST e a URL não traz o termo', async ({ page }) => {
  const urls: string[] = [];
  page.on('request', (r) => urls.push(r.url()));
  await entrar(page, '/acompanhamento/linha-do-tempo');
  await expect(page.getByRole('link', { name: /Mentorado Fictício 30/ })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Buscar fichas' }).fill('agata');
  await expect(page.getByRole('link', { name: /Ágata Fictícia/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Mentorado Fictício 30/ })).toHaveCount(0);
  for (const u of urls) expect(decodeURIComponent(u).toLowerCase()).not.toContain('agata');
});

test('criar ficha manual pede nome e data de início', async ({ page }) => {
  await entrar(page, '/acompanhamento/linha-do-tempo');
  await page.getByRole('button', { name: 'Nova ficha' }).click();
  const d = page.getByRole('dialog', { name: 'Nova ficha' });
  await d.getByRole('button', { name: 'Criar ficha' }).click();
  await expect(d.getByText('Informe o nome')).toBeVisible();
  await d.getByLabel('Nome do mentorado ou casal').fill('Mentorado Fictício 31');
  await d.getByLabel('Data de início').fill('05/03/2026');
  await d.getByRole('button', { name: 'Criar ficha' }).click();
  await page.waitForURL(/\/acompanhamento\/linha-do-tempo\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('textbox', { name: 'Nome da ficha' })).toHaveValue(
    'Mentorado Fictício 31',
  );
});

test('editar caixa de pilar e sair do campo grava (recarregar mantém); o nome da ficha também (D32)', async ({
  page,
}) => {
  await entrar(page, `/acompanhamento/linha-do-tempo/${FICHA}`);
  const fe = page.getByRole('textbox', { name: 'Fé antes' });
  await fe.fill('Não frequentava nenhuma comunidade');
  await fe.blur();
  await salvo(page);
  const nome = page.getByRole('textbox', { name: 'Nome da ficha' });
  await nome.fill('Mentorado Fictício 30 e Cônjuge');
  await nome.blur();
  await salvo(page);
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Fé antes' })).toHaveValue(
    'Não frequentava nenhuma comunidade',
  );
  await expect(page.getByRole('textbox', { name: 'Nome da ficha' })).toHaveValue(
    'Mentorado Fictício 30 e Cônjuge',
  );
});

test('remover ficha pede confirmação; sem confirmação não envia', async ({ page }) => {
  await entrar(page, `/acompanhamento/linha-do-tempo/${FICHA}`);
  await page.getByRole('button', { name: 'Remover ficha' }).click();
  const d = page.getByRole('dialog', { name: /Remover a ficha/ });
  await d.getByRole('button', { name: 'Cancelar' }).click();
  const [n] = await owner<
    { n: number }[]
  >`select count(*)::int as n from mentoria_fichas where id = ${FICHA}`;
  expect(n?.n).toBe(1);
  await page.getByRole('button', { name: 'Remover ficha' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmar exclusão' }).click();
  await page.waitForURL(/\/acompanhamento\/linha-do-tempo$/);
  const [m] = await owner<
    { n: number }[]
  >`select count(*)::int as n from mentoria_fichas where id = ${FICHA}`;
  expect(m?.n).toBe(0);
});

test('o × da foto de antes remove na hora, sem diálogo', async ({ page }) => {
  await entrar(page, `/acompanhamento/linha-do-tempo/${FICHA}`);
  const foto = join(tmpdir(), 'foto-ficticia.png');
  writeFileSync(
    foto,
    Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4c50000000049454e44ae426082',
      'hex',
    ),
  );
  await page.getByLabel('Enviar foto de antes').setInputFiles(foto);
  const remover = page.getByRole('button', { name: 'Remover foto de antes' });
  await expect(remover).toBeVisible();
  await remover.click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(remover).toHaveCount(0);
  await expect
    .poll(
      async () =>
        (await owner<{ n: number }[]>`select count(*)::int as n from mentoria_midia`)[0]?.n,
    )
    .toBe(0);
});

test('conquista: adicionar sem data padrão; remover pede confirmação; cancelar não grava', async ({
  page,
}) => {
  await entrar(page, `/acompanhamento/linha-do-tempo/${FICHA}`);
  await page.getByRole('button', { name: 'Adicionar conquista' }).click();
  const data = page.getByRole('textbox', { name: 'Data da conquista' });
  await expect(data).toHaveValue('');
  await data.fill('03/2026');
  await data.blur();
  const desc = page.getByRole('textbox', { name: 'Descrição da conquista' });
  await desc.fill('Primeira viagem fictícia');
  await desc.blur();
  await salvo(page);
  await page.getByRole('button', { name: 'Remover conquista' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click();
  expect(
    (await owner<{ n: number }[]>`select count(*)::int as n from mentoria_conquistas`)[0]?.n,
  ).toBe(1);
  await page.getByRole('button', { name: 'Remover conquista' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmar exclusão' }).click();
  await expect(page.getByRole('textbox', { name: 'Descrição da conquista' })).toHaveCount(0);
  expect(
    (await owner<{ n: number }[]>`select count(*)::int as n from mentoria_conquistas`)[0]?.n,
  ).toBe(0);
});

test('importar .json mostra prévia e exige confirmação', async ({ page }) => {
  await entrar(page, '/acompanhamento/linha-do-tempo');
  const arquivo = join(tmpdir(), `lt-ficticio-${Date.now()}.json`);
  writeFileSync(
    arquivo,
    JSON.stringify({
      formato: 'npac-acompanhamento',
      versao: 1,
      modulo: 'linha-do-tempo',
      exportadoEm: '2026-11-04T12:00:00.000Z',
      registros: [
        {
          id: '44444444-4444-4444-8444-444444444444',
          nome: 'Mentorado Fictício 40',
          campos: {},
          conquistas: [],
          midias: [],
        },
      ],
    }),
  );
  await page.getByRole('button', { name: 'Importar .json' }).click();
  const g = page.getByRole('dialog', { name: 'Importar na Linha do tempo' });
  await g.getByLabel('Arquivo .json').setInputFiles(arquivo);
  await g.getByRole('button', { name: 'Pré-visualizar' }).click();
  await expect(g.getByText('1 entram · 0 já existem')).toBeVisible();
  expect((await owner<{ n: number }[]>`select count(*)::int as n from mentoria_fichas`)[0]?.n).toBe(
    2,
  );
  await g.getByRole('button', { name: 'Confirmar importação' }).click();
  await expect(g.getByText('1 gravados · 0 ignorados')).toBeVisible();
  expect((await owner<{ n: number }[]>`select count(*)::int as n from mentoria_fichas`)[0]?.n).toBe(
    3,
  );
});
