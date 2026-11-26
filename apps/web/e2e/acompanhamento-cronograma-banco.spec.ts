import { expect, test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

// NPAC-60, tarefa 4: Configurações → Cronograma (o banco de itens), só a Admin, pelo caminho real
// (login → menu → aba). Acompanhamento sem o selo não abre Configurações.
const owner = ownerSql(E2E_DB);
const LARGURAS = [375, 768, 1024, 1440] as const;
const PREFIXO = 'Filme Fictício E2E';

test.describe.configure({ mode: 'serial' });

async function entrar(page: Page, usuario: string) {
  await page.context().clearCookies();
  await page.goto('/login');
  await page.getByLabel('Usuário', { exact: true }).fill(usuario);
  await page.getByLabel('Senha').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

const limpar = () => owner`delete from mentoria_cronograma_itens where texto like ${`${PREFIXO}%`}`;

test.beforeAll(limpar);
test.beforeEach(async () => {
  await owner`truncate rate_limit`;
});
test.afterAll(async () => {
  await limpar();
  await owner`delete from mentoria_perfis where user_id = (select id from "user" where username = 'carla')`;
  await closeTestConnections();
});

test('Admin: cria um filme, esconde e vê "Escondido · 0 envios"', async ({ page }) => {
  await entrar(page, 'duda');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page
    .getByRole('link', { name: 'Configurações', exact: true })
    .filter({ visible: true })
    .click();
  await page.waitForURL(/\/acompanhamento\/configuracoes/);
  await page.getByRole('link', { name: 'Cronograma', exact: true }).click();
  await page.waitForURL(/aba=cronograma/);
  await expect(
    page.getByText('Os itens que vão em cada PME. Item já enviado não se apaga'),
  ).toBeVisible();

  const blocos = page.getByRole('group', { name: 'Bloco do cronograma' });
  await blocos.getByRole('button', { name: /^Filmes/ }).click();
  await page.getByRole('button', { name: 'Novo filme' }).click();
  const janela = page.getByRole('dialog', { name: 'Novo filme' });
  await janela.getByLabel('Texto').fill(PREFIXO);
  await janela.getByRole('button', { name: 'Salvar' }).click();
  await expect(janela).toBeHidden();

  const linha = page.locator('.cr-banco .pl-mod').filter({ hasText: PREFIXO });
  await expect(linha).toContainText('Nunca enviado');
  // A busca acha pelo texto sem acento nem maiúscula.
  await page.getByLabel('Buscar filme').fill('filme ficticio e2e');
  await expect(page.locator('.cr-banco .pl-mod')).toHaveCount(1);

  for (const largura of LARGURAS) {
    await page.setViewportSize({ width: largura, height: 900 });
    const sobra = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(sobra, `rolagem lateral em ${largura}px`).toBeLessThanOrEqual(0);
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  await linha.click();
  const edicao = page.getByRole('dialog', { name: /^Filme/ });
  await edicao.getByRole('button', { name: 'Esconder' }).click();
  await expect(edicao).toBeHidden();
  await expect(linha).toContainText('Escondido · 0 envios');

  // Texto repetido no mesmo bloco: a API recusa e a janela mostra o motivo.
  await page.getByRole('button', { name: 'Novo filme' }).click();
  await page.getByRole('dialog', { name: 'Novo filme' }).getByLabel('Texto').fill(`${PREFIXO}!`);
  await page
    .getByRole('dialog', { name: 'Novo filme' })
    .getByRole('button', { name: 'Salvar' })
    .click();
  await expect(page.getByRole('dialog', { name: 'Novo filme' }).getByRole('alert')).toContainText(
    'Esse item já está no banco',
  );
});

test('Acompanhamento sem o selo não abre Configurações', async ({ page }) => {
  await owner`delete from mentoria_perfis where user_id = (select id from "user" where username = 'carla')`;
  await owner`insert into mentoria_perfis (user_id, perfil, admin)
    select id, 'ACOMPANHAMENTO', false from "user" where username = 'carla'`;
  await entrar(page, 'carla');
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(
    page.getByRole('link', { name: 'Configurações', exact: true }).filter({ visible: true }),
  ).toHaveCount(0);
  const r = await page.goto('/acompanhamento/configuracoes?aba=cronograma');
  expect(r?.status()).toBe(404);
});
