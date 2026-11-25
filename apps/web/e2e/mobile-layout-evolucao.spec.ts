import { expect, test, type Locator, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

// NPAC-57 no celular (projeto 'iphone', WebKit, tela de toque): a aba Evolução não rola de lado em 375, a aba aberta
// aparece na fileira, os toques têm 44 px e as caixas de texto 16 px (sem zoom ao tocar).
const owner = ownerSql(E2E_DB);
const HOJE = `(now() at time zone 'America/Sao_Paulo')::date`;
let inscricao = '';

async function entrar(page: Page, usuario: string) {
  await page.goto('/login');
  await page.getByLabel('Usuário', { exact: true }).fill(usuario);
  await page.getByLabel('Senha').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

/** Toque de 44 px: a 21 px do centro, para os quatro lados, ainda acerta o controle. */
async function alvoCurto(alvo: Locator): Promise<string | null> {
  await alvo.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
  return alvo.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const [cx, cy] = [r.left + r.width / 2, r.top + r.height / 2];
    const acerta = (x: number, y: number) => {
      const h = document.elementFromPoint(x, y);
      return !!h && (h === el || el.contains(h));
    };
    const falha = [
      [0, -21],
      [0, 21],
      [-21, 0],
      [21, 0],
    ].some(([dx, dy]) => !acerta(cx + dx!, cy + dy!));
    return falha
      ? `${el.getAttribute('aria-label') ?? el.textContent?.trim()} ${Math.round(r.width)}×${Math.round(r.height)}`
      : null;
  });
}

test.beforeAll(async () => {
  const [i] = await owner.unsafe<{ id: string }[]>(
    `insert into mentoria_inscricoes (tipo, mentoria, status, inicio_jornada, data_idr, termino_previsto)
     values ('CASAL', 'RDV', 'ATIVO', ${HOJE} - 40, ${HOJE} - 40, ${HOJE} + 325)
     returning id`,
  );
  inscricao = i!.id;
  await owner`insert into mentoria_pessoas (inscricao_id, ordem, nome, nome_norm) values
    (${inscricao}, 1, 'Mentorada Fictícia 59', 'mentorada ficticia 59'),
    (${inscricao}, 2, 'Mentorado Fictício 60', 'mentorado ficticio 60')`;
});
test.beforeEach(async () => {
  await owner`truncate rate_limit`;
});
test.afterAll(async () => {
  if (inscricao) await owner`delete from mentoria_inscricoes where id = ${inscricao}`;
  await closeTestConnections();
});

test('aba Evolução no iPhone: sem rolagem lateral, aba à vista, toques de 44 px e campos de 16 px', async ({
  page,
}) => {
  await entrar(page, 'duda');
  const painel = page.getByRole('tabpanel', { name: 'Evolução' });
  for (const largura of [375, 390]) {
    await page.setViewportSize({ width: largura, height: 812 });
    await page.goto(`/acompanhamento/ficha/${inscricao}?aba=evolucao`);
    await expect(painel).toHaveAttribute('aria-busy', 'false');
    const sobra = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(sobra, `rolagem lateral em ${largura}px`).toBeLessThanOrEqual(0);
    // A fileira de abas rolou até a aberta (a Evolução fica depois da aba Pessoas).
    const fileira = await page.locator('.tabs').boundingBox();
    const ativa = await page.getByRole('tab', { name: 'Evolução' }).boundingBox();
    expect(ativa!.x).toBeGreaterThanOrEqual(fileira!.x - 1);
    expect(ativa!.x + ativa!.width).toBeLessThanOrEqual(fileira!.x + fileira!.width + 1);
  }
  // "Lado a lado | Linha do tempo" some abaixo de 768 px.
  await expect(painel.getByRole('group', { name: 'Como ver os dois momentos' })).toBeHidden();

  const curtos: string[] = [];
  for (const alvo of [
    painel.getByRole('link', { name: 'Baixar PDF' }),
    painel.getByRole('button', { name: 'Editar momento inicial' }),
    painel.getByRole('button', { name: 'Editar momento atual' }),
    painel.getByRole('link', { name: 'Ver a aba' }),
    painel.getByRole('button', { name: 'Editar evolução de renda' }),
    painel.getByRole('button', { name: 'Adicionar conquista' }),
    painel.locator('.foto-btn').first(),
  ]) {
    const r = await alvoCurto(alvo);
    if (r) curtos.push(r);
  }
  expect(curtos).toEqual([]);

  await painel.getByRole('button', { name: 'Editar evolução de renda' }).click();
  await painel.getByRole('button', { name: 'Editar momento atual' }).click();
  const letras = await painel
    .locator('textarea')
    .evaluateAll((els) => els.map((el) => parseFloat(getComputedStyle(el).fontSize)));
  expect(letras.length).toBeGreaterThan(0);
  for (const l of letras) expect(l).toBeGreaterThanOrEqual(16);
  await page.screenshot({ path: 'test-results/evolucao-iphone-375.png', fullPage: true });
});
