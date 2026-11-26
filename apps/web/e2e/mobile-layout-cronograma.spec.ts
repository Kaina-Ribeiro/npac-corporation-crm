import { expect, test, type Locator, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

// NPAC-60 no celular (projeto 'iphone', WebKit, tela de toque): a janela "Enviar o 2º PME" cabe na tela,
// a troca abre como tela própria com "Voltar" (sem caixa suspensa), linhas e botões com 44 px e a busca
// com 16 px (sem zoom ao tocar).
const owner = ownerSql(E2E_DB);
const HOJE = `(now() at time zone 'America/Sao_Paulo')::date`;
const NOME = 'Mentorada Fictícia 162';
const PREFIXO = 'CR Celular';
const BLOCOS = ['EXPERIENCIA', 'DESAFIO', 'FILME', 'LIVRO', 'EAP'] as const;
let inscricao = '';

const norm = (t: string) =>
  t
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

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

/** Nada da janela passa da largura da tela. */
const sobraNaJanela = (page: Page) =>
  page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    return [...document.querySelectorAll('dialog[open] *')]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && (r.right > w + 1 || r.left < -1);
      })
      .map((el) => el.className || el.tagName)
      .slice(0, 5);
  });

test.beforeAll(async () => {
  await owner`delete from mentoria_cronograma_itens where texto like ${`${PREFIXO} %`}`;
  for (const b of BLOCOS)
    for (let n = 1; n <= 3; n++) {
      const t = `${PREFIXO} ${b.toLowerCase()} ${n}: um texto comprido para quebrar em duas linhas na tela`;
      await owner`insert into mentoria_cronograma_itens (bloco, texto, texto_norm, ordem)
        values (${b}, ${t}, ${norm(t)}, ${-900 + n})`;
    }
  const [i] = await owner.unsafe<{ id: string }[]>(
    `insert into mentoria_inscricoes (tipo, mentoria, status, inicio_jornada, data_idr, termino_previsto)
     values ('INDIVIDUAL', '2M', 'ATIVO', ${HOJE} - 60, ${HOJE} - 60, ${HOJE} + 305) returning id`,
  );
  inscricao = i!.id;
  await owner`insert into mentoria_pessoas (inscricao_id, ordem, nome, nome_norm)
    values (${inscricao}, 1, ${NOME}, ${norm(NOME)})`;
  await owner.unsafe(
    `insert into mentoria_ciclos (inscricao_id, numero, enviado_em, concluido_em)
     values ('${inscricao}', 1, ${HOJE} - 30, ${HOJE} - 2)`,
  );
});
test.beforeEach(async () => {
  await owner`truncate rate_limit`;
});
test.afterAll(async () => {
  if (inscricao) await owner`delete from mentoria_inscricoes where id = ${inscricao}`;
  await owner`delete from mentoria_cronograma_itens where texto like ${`${PREFIXO} %`}`;
  await closeTestConnections();
});

test('envio do PME no iPhone: janela na tela, troca em tela própria, toques de 44 px', async ({
  page,
}) => {
  await entrar(page, 'duda');
  for (const largura of [375, 390]) {
    await page.setViewportSize({ width: largura, height: 812 });
    await page.goto(`/acompanhamento/ficha/${inscricao}?aba=jornada`);
    await page
      .getByRole('region', { name: 'PME atual' })
      .getByRole('button', { name: 'Registrar envio do 2º PME' })
      .click();
    const janela = page.getByRole('dialog', { name: 'Enviar o 2º PME' });
    await expect(janela.getByText('8 itens do cronograma')).toBeVisible();
    // A janela entra com uma leve escala (.dlg): mede depois da entrada.
    await janela.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
    expect(await sobraNaJanela(page), `janela passa da tela em ${largura}px`).toEqual([]);

    const linhas = janela.locator('button.cr-row');
    const curtos: string[] = [];
    for (const alvo of [
      linhas.first(),
      janela.getByRole('button', { name: 'Adicionar desafio' }),
      janela.getByRole('button', { name: 'Cancelar' }),
      janela.getByRole('button', { name: 'Enviar o 2º PME' }),
    ]) {
      const curto = await alvoCurto(alvo);
      if (curto) curtos.push(curto);
    }
    expect(curtos, `toques curtos em ${largura}px`).toEqual([]);

    // A troca é uma tela própria (sem caixa suspensa), com "Voltar" e "No lugar de".
    await janela.getByRole('button', { name: /^Trocar: CR Celular desafio 1/ }).click();
    const tela = page.getByRole('dialog', { name: 'Trocar desafio' });
    await expect(tela.getByRole('button', { name: 'Voltar' })).toBeVisible();
    await expect(tela.getByText('No lugar de:')).toBeVisible();
    await expect(page.locator('.cr-pop')).toHaveCount(0);
    expect(await sobraNaJanela(page), `troca passa da tela em ${largura}px`).toEqual([]);
    const busca = tela.getByRole('searchbox', { name: 'Buscar desafio' });
    expect(await busca.evaluate((el) => getComputedStyle(el).fontSize)).toBe('16px');
    for (const alvo of [
      tela.getByRole('button', { name: 'Voltar' }),
      tela.getByRole('button', { name: /CR Celular desafio 2/ }),
      tela.getByRole('button', { name: 'Tirar do PME' }),
      tela.getByRole('button', { name: 'Escrever só para ele' }),
    ]) {
      const curto = await alvoCurto(alvo);
      if (curto) curtos.push(curto);
    }
    expect(curtos, `toques curtos na troca em ${largura}px`).toEqual([]);
    await tela.getByRole('button', { name: /CR Celular desafio 2/ }).click();
    await expect(tela).toBeHidden();
    await expect(
      janela.getByRole('button', { name: /^Trocar: CR Celular desafio 2/ }),
    ).toBeVisible();

    // Voltar fecha só a troca; Cancelar fecha a janela.
    await janela.getByRole('button', { name: 'Adicionar filme' }).click();
    await page
      .getByRole('dialog', { name: 'Adicionar filme' })
      .getByRole('button', { name: 'Voltar' })
      .click();
    await expect(page.getByRole('dialog', { name: 'Adicionar filme' })).toBeHidden();
    await janela.getByRole('button', { name: 'Cancelar' }).click();
    await expect(janela).toBeHidden();
  }
});
