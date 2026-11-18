import { crc32, deflateSync } from 'node:zlib';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { CAIXA_URL, E2E_DB, E2E_PASSWORD } from './env.js';

// NPAC-53 no celular (projeto 'iphone', WebKit, tela de toque): o Meu perfil, as duas janelinhas e
// as telas que ganharam foto não rolam de lado, nada sai da tela (nem dentro de `overflow: hidden`,
// que a varredura por `scrollWidth` não vê), os toques têm 44 px e os campos 16 px (sem zoom).
const owner = ownerSql(E2E_DB);
// Celular e tablet (768 e 1024 com a sidebar aberta: o perfil já quebrou em 768).
const LARGURAS = [375, 390, 768, 1024];
const RONALDO = 'ronaldo@npac.com.br';
const IGOR = 'igor@npac.com.br';

function png(lado = 600): Buffer {
  const linhas: Buffer[] = [];
  for (let y = 0; y < lado; y++) {
    const linha = Buffer.alloc(1 + lado * 3);
    for (let x = 0; x < lado; x++)
      linha.set(y < lado / 2 ? [200, 160, 90] : [40, 60, 90], 1 + x * 3);
    linhas.push(linha);
  }
  const bloco = (tipo: string, dados: Buffer) => {
    const t = Buffer.from(tipo, 'latin1');
    const len = Buffer.alloc(4);
    len.writeUInt32BE(dados.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([t, dados])));
    return Buffer.concat([len, t, dados, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(lado, 0);
  ihdr.writeUInt32BE(lado, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloco('IHDR', ihdr),
    bloco('IDAT', deflateSync(Buffer.concat(linhas))),
    bloco('IEND', Buffer.alloc(0)),
  ]);
}

async function entrar(page: Page, usuario: string) {
  await page.goto('/login');
  await page.getByLabel('Usuário', { exact: true }).fill(usuario);
  await page.getByLabel('Senha').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

/**
 * O que passa da borda da tela: rolagem lateral do documento e todo elemento visível cujo lado
 * passa da largura (fora dos que rolam de lado de propósito). Pega o que um `overflow: hidden`
 * esconderia da medida de `scrollWidth`.
 */
function foraDaTela(page: Page) {
  return page.evaluate(() => {
    const w = window.innerWidth;
    const fora: string[] = [];
    if (document.documentElement.scrollWidth > w + 1)
      fora.push(`documento ${document.documentElement.scrollWidth}px`);
    const rola = (el: Element | null): boolean => {
      for (let p = el?.parentElement; p; p = p.parentElement) {
        const ox = getComputedStyle(p).overflowX;
        if (ox === 'auto' || ox === 'scroll') return true;
      }
      return false;
    };
    for (const el of document.querySelectorAll<HTMLElement>('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      const s = getComputedStyle(el);
      if (s.visibility === 'hidden' || s.display === 'none' || s.opacity === '0') continue;
      if ((r.right > w + 1 || r.left < -1) && !rola(el)) {
        const nome =
          el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 30) ?? el.tagName;
        fora.push(
          `${el.tagName.toLowerCase()} "${nome}" ${Math.round(r.left)}…${Math.round(r.right)}`,
        );
      }
    }
    return fora.slice(0, 8);
  });
}

/** Campos visíveis com letra < 16 px: no iPhone o Safari dá zoom ao tocar. */
function camposComZoom(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('input, select, textarea')]
      .filter((el) => {
        if (el.matches('[type=checkbox], [type=radio], [type=range], [type=file], [type=hidden]'))
          return false;
        const r = el.getBoundingClientRect();
        return r.width > 1 && r.height > 1 && parseFloat(getComputedStyle(el).fontSize) < 16;
      })
      .map((el) => `${el.getAttribute('aria-label') ?? el.getAttribute('name')}`),
  );
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

async function conferir(page: Page, onde: string, larguras = LARGURAS) {
  for (const largura of larguras) {
    await page.setViewportSize({ width: largura, height: 812 });
    expect(await foraDaTela(page), `${onde} em ${largura}px`).toEqual([]);
  }
  // Volta ao celular: os toques de 44 px e o "‹ Mais" são medidos nele.
  await page.setViewportSize({ width: 390, height: 812 });
}

test.beforeAll(async () => {
  // Foto do Igor (Chat, Equipe, Admin, feed): bytes quaisquer servem, o teste mede o layout.
  const foto = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  await owner`insert into user_photos (user_id, bytes, mime, size)
    select id, ${foto}, 'image/png', ${foto.length} from "user" where email = ${IGOR}
    on conflict (user_id) do nothing`;
  await owner`update "user" set image = 'cel1' where email = ${IGOR}`;
});
test.beforeEach(async () => {
  await owner`truncate rate_limit, verification`;
});
test.afterAll(async () => {
  await owner`delete from user_photos where user_id in (select id from "user" where email in (${RONALDO}, ${IGOR}))`;
  await owner`update "user" set image = null where email in (${RONALDO}, ${IGOR})`;
  await owner`update "user" set email = ${RONALDO} where username = 'ronaldo'`;
  await owner`truncate chat_reads, chat_messages, chat_members`;
  await owner`delete from chat_channels where kind = 'DM'`;
  await closeTestConnections();
});

test('a medida pega o que um overflow: hidden esconderia', async ({ page }) => {
  await entrar(page, 'ronaldo');
  await page.goto('/conta/perfil');
  await page.setViewportSize({ width: 375, height: 812 });
  // Depois de o React montar a página (antes disso, a hidratação tiraria o elemento de teste).
  await expect(page.getByRole('button', { name: 'Trocar senha' })).toBeEnabled();
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const caixa = document.createElement('div');
    caixa.style.cssText = 'overflow:hidden;width:100%';
    caixa.innerHTML = '<div style="width:600px;height:20px;background:red">largo</div>';
    document.querySelector('h1')!.parentElement!.append(caixa);
  });
  expect((await foraDaTela(page)).join()).toContain('largo');
});

test('Meu perfil cabe no celular, com toques de 44 px e campos sem zoom', async ({ page }) => {
  await entrar(page, 'ronaldo');
  await page.goto('/conta/perfil');
  await conferir(page, 'perfil');
  const curtos: string[] = [];
  for (const nome of ['Adicionar foto', 'Trocar e-mail', 'Trocar senha'])
    curtos.push((await alvoCurto(page.getByRole('button', { name: nome }))) ?? '');
  curtos.push((await alvoCurto(page.locator('main').getByRole('link', { name: 'Mais' }))) ?? '');
  curtos.push((await alvoCurto(page.getByRole('link', { name: 'Avisos neste aparelho' }))) ?? '');
  await page.getByRole('button', { name: 'Trocar senha' }).click();
  await conferir(page, 'perfil com a senha aberta');
  expect(await camposComZoom(page)).toEqual([]);
  curtos.push((await alvoCurto(page.getByRole('button', { name: 'Cancelar' }))) ?? '');
  expect(curtos.filter(Boolean)).toEqual([]);
});

test('recorte da foto cabe no celular', async ({ page }) => {
  await entrar(page, 'ronaldo');
  await page.goto('/conta/perfil');
  await page.getByLabel('Escolher foto').setInputFiles({
    name: 'foto.png',
    mimeType: 'image/png',
    buffer: png(),
  });
  const janela = page.getByRole('dialog', { name: 'Ajustar foto' });
  await expect(janela).toBeVisible();
  await conferir(page, 'recorte');
  const curtos = await Promise.all(
    ['Fechar', 'Diminuir zoom', 'Aumentar zoom', 'Cancelar', 'Salvar foto'].map((n) =>
      alvoCurto(janela.getByRole('button', { name: n })),
    ),
  );
  expect(curtos.filter(Boolean)).toEqual([]);
  await janela.getByRole('button', { name: 'Salvar foto' }).click();
  await expect(janela).toBeHidden();
  await conferir(page, 'perfil com foto');
  await expect(page.getByRole('button', { name: 'Remover' })).toBeVisible();
  expect(await alvoCurto(page.getByRole('button', { name: 'Remover' }))).toBeNull();
});

test('troca de e-mail cabe no celular nos dois passos', async ({ page }) => {
  await fetch(CAIXA_URL, { method: 'DELETE' });
  await entrar(page, 'ronaldo');
  await page.goto('/conta/perfil');
  await page.getByRole('button', { name: 'Trocar e-mail' }).click();
  const janela = page.getByRole('dialog');
  await janela.getByLabel('Novo e-mail').fill('ronaldo.com.um.endereco.bem.comprido@exemplo.test');
  await conferir(page, 'e-mail, passo 1');
  expect(await camposComZoom(page)).toEqual([]);
  await janela.getByRole('button', { name: 'Enviar código' }).click();
  await expect(janela.getByRole('heading', { name: 'Confirme o novo e-mail' })).toBeVisible();
  await janela.getByLabel('Código de 6 dígitos').fill('000000');
  await expect(janela.getByRole('alert')).toBeVisible();
  await conferir(page, 'e-mail, passo 2 com erro');
  expect(await alvoCurto(janela.getByRole('button', { name: 'Usar outro endereço' }))).toBeNull();
});

test('telas com foto cabem no celular (CRM)', async ({ page }) => {
  await entrar(page, 'diretor');
  for (const tela of ['/mais', '/equipe', '/admin', '/hoje', '/dashboard']) {
    await page.goto(tela);
    await conferir(page, tela);
  }
  await page.goto('/chat');
  const [igor] = await owner<{ name: string }[]>`select name from "user" where email = ${IGOR}`;
  await page.getByLabel('Nova conversa').selectOption({ label: igor!.name });
  await conferir(page, 'chat');
});

test('telas com foto cabem no celular (Acompanhamento)', async ({ page }) => {
  await entrar(page, 'duda');
  for (const tela of ['/conta/perfil', '/acompanhamento/mais', '/acompanhamento/fila']) {
    await page.goto(tela);
    await conferir(page, tela);
  }
  // Mentorados em 1024 fica no teste abaixo (anterior ao NPAC-53).
  await page.goto('/acompanhamento/mentorados');
  await conferir(page, '/acompanhamento/mentorados', [375, 390, 768]);
  // O Meu perfil do cargo tem as abas do módulo e volta ao Mais do módulo.
  await page.goto('/conta/perfil');
  await expect(page.getByRole('navigation', { name: 'Abas do acompanhamento' })).toBeVisible();
  await expect(
    page.locator('main').getByRole('link', { name: 'Mais', exact: true }).first(),
  ).toHaveAttribute('href', '/acompanhamento/mais');
});

// Achado de 18/11/2026 (anterior ao NPAC-53): em 1024 com a sidebar aberta, a tabela de Mentorados
// pede ~858 px (colunas mínimas de `modulo.css`, `@media (min-width: 1024px)`) e sobram ~714:
// "Último contato" passa ~96 px da tela. Fica como pendência até o ajuste da tabela.
test.fixme('Mentorados em 1024 px com a sidebar aberta cabe na tela', async ({ page }) => {
  await entrar(page, 'duda');
  await page.goto('/acompanhamento/mentorados');
  await conferir(page, '/acompanhamento/mentorados', [1024]);
});
