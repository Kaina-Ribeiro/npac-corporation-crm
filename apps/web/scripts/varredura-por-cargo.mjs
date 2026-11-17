/* global URL, console, process, document, window, Element */
// Varredura por cargo num ambiente publicado (ITODEV): login → onde cai → cada item do menu, em
// 1440 / 1024 / 768 / 375 px. Para cada tela anota o título, erro na tela, erro de console, resposta
// 4xx/5xx da API, rolagem horizontal e a duração da entrada da página. Só lê: não grava nada.
//
//   VARREDURA_URL=https://crm-itodev… VARREDURA_SENHA=… VARREDURA_OUT=<pasta> \
//     node apps/web/scripts/varredura-por-cargo.mjs usuario1 usuario2 …
//
// Use contas de teste próprias (uma por cargo). O relatório sai em <pasta>/varredura.json e
// <pasta>/varredura.md, com uma captura por tela e largura.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const BASE = process.env.VARREDURA_URL;
const SENHA = process.env.VARREDURA_SENHA;
const OUT = process.env.VARREDURA_OUT ?? 'varredura';
const contas = process.argv.slice(2);
if (!BASE || !SENHA || contas.length === 0) {
  console.error('Uso: VARREDURA_URL=… VARREDURA_SENHA=… node varredura-por-cargo.mjs usuario…');
  process.exit(2);
}
const LARGURAS = [1440, 1024, 768, 375];
const ERROS_NA_TELA = [
  'Não foi possível carregar.',
  'Página não encontrada.',
  'Esta tela não faz parte do seu acesso.',
  'Application error',
  'Internal Server Error',
];

const slug = (p) => p.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '_') || 'raiz';

async function estado(page) {
  return page.evaluate((erros) => {
    const h1 = document.querySelector('main h1, h1');
    const texto = document.body.innerText;
    return {
      titulo: h1?.textContent?.trim() ?? null,
      erroNaTela: erros.find((e) => texto.includes(e)) ?? null,
      rolagemHorizontal: document.documentElement.scrollWidth > window.innerWidth + 1,
    };
  }, ERROS_NA_TELA);
}

/**
 * Animações finitas dentro do <main> em curso logo depois de a tela aparecer: a que termina por
 * último (ms desde agora) e o nome dela. Barra de progresso e esqueleto ficam de fora.
 */
async function entrada(page) {
  return page.evaluate(() => {
    const main = document.querySelector('main');
    let fim = 0;
    let nome = null;
    for (const a of document.getAnimations()) {
      const alvo = a.effect?.target;
      if (!main || !(alvo instanceof Element) || !main.contains(alvo)) continue;
      const t = a.effect.getComputedTiming();
      if (typeof t.endTime !== 'number' || !Number.isFinite(t.endTime)) continue;
      const restante = t.endTime - (Number(a.currentTime) || 0);
      if (restante > fim) {
        fim = restante;
        nome = a.animationName ?? a.id ?? null;
      }
    }
    return { ms: Math.round(fim), nome };
  });
}

const relatorio = [];
const browser = await chromium.launch();
try {
  for (const usuario of contas) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const problemas = [];
    page.on('console', (m) => {
      if (m.type() === 'error') problemas.push({ tipo: 'console', texto: m.text().slice(0, 200) });
    });
    page.on('pageerror', (e) =>
      problemas.push({ tipo: 'pageerror', texto: String(e).slice(0, 200) }),
    );
    page.on('response', (r) => {
      const u = new URL(r.url());
      if (u.origin === new URL(BASE).origin && r.status() >= 400 && u.pathname.startsWith('/api/'))
        problemas.push({
          tipo: 'api',
          texto: `${r.status()} ${r.request().method()} ${u.pathname}`,
        });
    });
    const pasta = join(OUT, usuario);
    mkdirSync(pasta, { recursive: true });

    await page.goto(`${BASE}/login`);
    await page.getByLabel('Usuário', { exact: true }).fill(usuario);
    await page.getByLabel('Senha').fill(SENHA);
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20_000 });
    await page.waitForLoadState('load');
    await page.waitForTimeout(800);
    const caiu = new URL(page.url()).pathname;
    const inicio = await estado(page);
    await page.screenshot({ path: join(pasta, `entrada-1440.png`) });

    const nav = page.getByRole('navigation', { name: 'Navegação lateral' });
    const links = await nav
      .locator('a[href^="/"]')
      .evaluateAll((as) =>
        as.map((a) => ({ href: a.getAttribute('href'), rotulo: a.textContent.trim() })),
      );
    const vistos = new Set();
    const itens = links.filter((l) => !vistos.has(l.href) && vistos.add(l.href));

    const telas = [];
    for (const { href, rotulo } of itens) {
      const antes = problemas.length;
      const alvo = nav.locator(`a[href="${href}"]`).first();
      let como = 'clique';
      const t0 = Date.now();
      if (await alvo.isVisible()) await alvo.click();
      else {
        como = 'endereço';
        await page.goto(`${BASE}${href}`);
      }
      await page
        .waitForURL((u) => u.pathname.startsWith(href.split('?')[0]), { timeout: 15_000 })
        .catch(() => {});
      await page
        .locator('main h1, h1')
        .first()
        .waitFor({ timeout: 15_000 })
        .catch(() => {});
      const ms = Date.now() - t0;
      const anim = await entrada(page);
      await page.waitForTimeout(500);
      const e = await estado(page);
      await page.screenshot({ path: join(pasta, `${slug(href)}-1440.png`) });
      telas.push({
        rotulo,
        href,
        como,
        url: new URL(page.url()).pathname,
        ms,
        entradaMs: anim.ms,
        animacao: anim.nome,
        ...e,
        problemas: problemas.slice(antes),
        larguras: {},
      });
    }
    // Mesmas telas nas outras larguras, por endereço (no celular o menu é a barra de baixo + Mais).
    for (const w of LARGURAS.slice(1)) {
      await page.setViewportSize({ width: w, height: w === 375 ? 812 : 1024 });
      for (const t of telas) {
        const antes = problemas.length;
        await page.goto(`${BASE}${t.href}`);
        await page
          .locator('main h1, h1')
          .first()
          .waitFor({ timeout: 15_000 })
          .catch(() => {});
        await page.waitForTimeout(400);
        const e = await estado(page);
        await page.screenshot({ path: join(pasta, `${slug(t.href)}-${w}.png`) });
        t.larguras[w] = { ...e, problemas: problemas.slice(antes) };
      }
      if (w === 375) {
        const baixo = await page
          .getByRole('navigation', { name: 'Navegação inferior' })
          .locator('a')
          .allTextContents()
          .catch(() => []);
        telas.barraInferior = baixo.map((s) => s.trim());
      }
    }
    relatorio.push({ usuario, caiu, inicio, barraInferior: telas.barraInferior, telas });
    await ctx.close();
    console.log(`${usuario}: caiu em ${caiu}, ${telas.length} telas`);
  }
} finally {
  await browser.close();
}

writeFileSync(join(OUT, 'varredura.json'), JSON.stringify(relatorio, null, 2));
const linhas = [
  '| Conta | Tela | URL | ms | entrada | 1440 | 1024 | 768 | 375 | Problemas |',
  '|---|---|---|---|---|---|---|---|---|---|',
];
const ok = (e) => (!e ? '—' : e.erroNaTela || e.rolagemHorizontal || !e.titulo ? '❌' : '✅');
for (const r of relatorio) {
  linhas.push(
    `| ${r.usuario} | (entrada) | ${r.caiu} | | | ${ok(r.inicio)} | | | | ${r.inicio.titulo ?? ''} |`,
  );
  for (const t of r.telas) {
    const todos = [...t.problemas, ...Object.values(t.larguras).flatMap((l) => l.problemas)];
    const marca = [t, ...Object.values(t.larguras)].map(ok);
    linhas.push(
      `| ${r.usuario} | ${t.rotulo} | ${t.url} | ${t.ms} | ${t.entradaMs}${t.animacao ? ` (${t.animacao})` : ''} | ${marca.join(' | ')} | ${[...new Set(todos.map((p) => p.texto))].join('; ').slice(0, 300)} ${t.erroNaTela ?? ''} |`,
    );
  }
}
writeFileSync(join(OUT, 'varredura.md'), linhas.join('\n') + '\n');
console.log(linhas.join('\n'));
