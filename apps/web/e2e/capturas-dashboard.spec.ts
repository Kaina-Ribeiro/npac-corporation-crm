import { test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

// Capturas do Dashboard e do campo Engajamento da ficha (NPAC-75), para comparar com o protótipo na mesma largura.
// Só roda com CAPTURAS=<pasta>: CAPTURAS=<pasta> pnpm --filter @npac/web e2e e2e/capturas-dashboard.spec.ts
const PASTA = process.env.CAPTURAS;
test.skip(!PASTA, 'só com CAPTURAS=<pasta>');
const owner = ownerSql(E2E_DB);
const LARGURAS = [375, 768, 1024, 1440];
const HOJE = `(now() at time zone 'America/Sao_Paulo')::date`;
const ids: string[] = [];

// Nomes fictícios, como no protótipo.
const PESSOAS: [string[], string, string | null, string | null][] = [
  [['Rafael Teixeira', 'Camila Teixeira'], '2M', '2 encontros', 'ENGAJADO'],
  [['Bruno Saldanha'], 'RDV', null, 'ENGAJADO'],
  [['Patrícia Moura', 'Leandro Moura'], '2M', null, 'ENGAJADO'],
  [['Henrique Vasconcelos'], '6M', null, 'ENGAJADO'],
  [['Juliana Prado', 'Otávio Prado'], '2M', 'sem encontro', 'ENGAJADO'],
  [['Eduardo Lima', 'Priscila Lima'], '2M', 'sem encontro', 'EM_ATENCAO'],
  [['Vanessa Toledo'], '2M', null, 'EM_ATENCAO'],
  [['Márcia Peixoto'], '2M', '2 encontros', 'EM_ATENCAO'],
  [['Felipe Antunes', 'Daniela Antunes'], '2M', null, 'EM_RISCO'],
  [['Rogério Pacheco'], '2M', 'sem encontro', 'EM_RISCO'],
  [['Ricardo Menezes', 'Paula Menezes'], '2M', null, null],
  [['Adriana Lopes'], 'RDV', null, null],
  [['Hugo Moraes', 'Beatriz Moraes'], '2M', '6 meses', null],
];

async function entrar(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Usuário', { exact: true }).fill('duda');
  await page.getByLabel('Senha').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

test.beforeAll(async () => {
  await owner`truncate rate_limit`;
  for (const [nomes, mentoria, variante, eng] of PESSOAS) {
    const [i] = await owner.unsafe<{ id: string }[]>(
      `insert into mentoria_inscricoes (tipo, mentoria, mentoria_variante, status, inicio_jornada,
         termino_previsto, engajamento)
       values ($1, $2, $3, 'ATIVO', ${HOJE} - 40, ${HOJE} + 325, $4) returning id`,
      [nomes.length > 1 ? 'CASAL' : 'INDIVIDUAL', mentoria, variante, eng],
    );
    for (const [k, n] of nomes.entries())
      await owner`insert into mentoria_pessoas (inscricao_id, ordem, nome, nome_norm)
        values (${i!.id}, ${k + 1}, ${n}, ${n.toLowerCase()})`;
    ids.push(i!.id);
  }
});
test.afterAll(async () => {
  for (const id of ids) await owner`delete from mentoria_inscricoes where id = ${id}`;
  await closeTestConnections();
});

for (const largura of LARGURAS) {
  test(`dashboard e ficha em ${largura}`, async ({ page }) => {
    await page.setViewportSize({ width: largura, height: largura < 768 ? 812 : 1000 });
    await entrar(page);
    await page.goto('/acompanhamento/onboarding');
    await page.getByRole('heading', { name: 'Engajamento' }).waitFor();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${PASTA}/dashboard-${largura}.png`, fullPage: true });
    await page.goto(`/acompanhamento/ficha/${ids[0]}?aba=historico`);
    await page.getByRole('heading', { level: 1, name: /Rafael Teixeira/ }).waitFor();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${PASTA}/ficha-${largura}.png`, fullPage: largura >= 1024 });
  });
}
