import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

// NPAC-76: capturas da aba Pessoas com o diagnóstico em 375, 768, 1024 e 1440, claro e escuro.
// Só roda com CAPTURAS=<pasta>: CAPTURAS=<pasta> pnpm --filter @npac/web e2e e2e/capturas-diagnostico.spec.ts
const PASTA = process.env.CAPTURAS;
test.skip(!PASTA, 'só com CAPTURAS=<pasta>');

const owner = ownerSql(E2E_DB);
let casal = '';

async function entrar(page: Page, usuario: string) {
  await page.goto('/login');
  await page.getByLabel('Usuário', { exact: true }).fill(usuario);
  await page.getByLabel('Senha').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

test.beforeAll(async () => {
  await owner`truncate rate_limit`;
  const [c] = await owner<{ id: string }[]>`
    insert into mentoria_inscricoes (tipo, mentoria, status) values ('CASAL', 'RDV', 'ONBOARDING')
    returning id`;
  casal = c!.id;
  await owner`insert into mentoria_pessoas (inscricao_id, ordem, nome, nome_norm, cidade) values
    (${casal}, 1, 'Ana Exemplo', 'ana exemplo', 'Campinas'),
    (${casal}, 2, 'Carlos Exemplo', 'carlos exemplo', null)`;
});

test.afterAll(async () => {
  if (casal) await owner`delete from mentoria_inscricoes where id = ${casal}`;
  await closeTestConnections();
});

test('capturas da aba Pessoas', async ({ page }) => {
  mkdirSync(PASTA!, { recursive: true });
  await entrar(page, 'duda');
  const r = await page.request.put(`/api/mentoria/inscricoes/${casal}/momento`, {
    data: {
      version: 0,
      idade: '38 e 40',
      filho1: 'Pedro, 8',
      trabalho: 'Ela é professora; ele, motorista de aplicativo.',
      recebeCentavos: 650000,
      guardadoCentavos: 120000,
      bem1: 'Carro, R$ 40 mil',
      custoCentavos: 580000,
      divida1: 'Cartão de crédito',
      divida1Centavos: 300000,
      divida2: 'Empréstimo',
      divida2Centavos: 150000,
      sonho: 'Casa própria e viajar com os filhos.',
      buscouAjuda: 'Não, primeira vez.',
    },
  });
  expect(r.ok(), await r.text()).toBe(true);
  for (const tema of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: tema });
    for (const largura of [375, 768, 1024, 1440]) {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.goto(`/acompanhamento/ficha/${casal}?aba=pessoas`);
      await expect(page.getByText('Total das dívidas: R$ 4.500,00')).toBeVisible();
      const sobra = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(sobra, `rolagem lateral em ${largura}`).toBeLessThanOrEqual(0);
      await page.screenshot({
        path: join(PASTA!, `pessoas-${largura}-${tema}.png`),
        fullPage: true,
      });
    }
  }
});
