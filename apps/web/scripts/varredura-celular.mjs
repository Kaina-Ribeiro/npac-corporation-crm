/* global URL, console, process, document, window, getComputedStyle, HTMLElement, HTMLDialogElement */
// Varredura do celular por cargo (Fase 1 de 18/11/2026): login → onde cai → cada aba da barra de
// baixo (375) ou da sidebar (768) pelo clique → cada item do "Mais" → as telas de detalhe achadas
// nelas (o primeiro link de cada padrão, ex.: /leads/:id). Motor do Safari (WebKit), tela de toque.
// Em cada tela anota: rolagem lateral, elemento fora da tela, texto cortado, toque < 44 px, campo com
// letra < 16 px (o iPhone dá zoom ao tocar), barra de baixo cobrindo conteúdo no fim da rolagem,
// janelinha maior que a tela, tabela mais larga que a tela, campo coberto com o teclado aberto,
// erro na tela, erro de console e 4xx/5xx da API. Só lê: clica em links, nunca em botões.
//
//   VARREDURA_URL=http://localhost:3150 VARREDURA_SENHA=… VARREDURA_OUT=<pasta> \
//     [VARREDURA_LARGURAS=375,768] [VARREDURA_TEMAS=claro,escuro] \
//     node apps/web/scripts/varredura-celular.mjs usuario1 usuario2 …
//
// Saída: <pasta>/celular.json, <pasta>/celular.md e uma captura (página inteira) por tela.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { webkit } from '@playwright/test';

const BASE = process.env.VARREDURA_URL;
const SENHA = process.env.VARREDURA_SENHA;
const OUT = process.env.VARREDURA_OUT ?? 'varredura-celular';
const LARGURAS = (process.env.VARREDURA_LARGURAS ?? '375,768').split(',').map(Number);
const TEMAS = (process.env.VARREDURA_TEMAS ?? 'claro,escuro').split(',');
const PROFUNDAS = Number(process.env.VARREDURA_PROFUNDAS ?? 20);
const contas = process.argv.slice(2);
if (!BASE || !SENHA || contas.length === 0) {
  console.error('Uso: VARREDURA_URL=… VARREDURA_SENHA=… node varredura-celular.mjs usuario…');
  process.exit(2);
}
const ALTURA = { 375: 812, 768: 1024 };
const TECLADO = 300; // px que o teclado do celular tira da altura
const ERROS_NA_TELA = [
  'Não foi possível carregar.',
  'Página não encontrada.',
  'Esta tela não faz parte do seu acesso.',
  'Application error',
  'Internal Server Error',
];

const slug = (p) =>
  p
    .replace(/^\//, '')
    .replace(/[^a-z0-9]+/gi, '_')
    .slice(0, 80) || 'raiz';
/** /leads/0b1c… → /leads/:id (um representante por padrão). */
const padrao = (href) =>
  href
    .split('?')[0]
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
    .replace(/\/\d+(?=\/|$)/g, '/:n');

/** Checagens dentro da página (roda no navegador). */
function medirNaPagina({ erros }) {
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const fechado = (el) => {
    const d = el.closest('details:not([open])');
    return !!d && !el.closest('summary');
  };
  const visivel = (el) => {
    if (fechado(el)) return false;
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const nome = (el) => {
    const t =
      el.getAttribute('aria-label') ||
      el.getAttribute('name') ||
      el.getAttribute('placeholder') ||
      (el.textContent || '').replace(/\s+/g, ' ').trim();
    const cls =
      typeof el.className === 'string' ? el.className.split(' ').slice(0, 3).join('.') : '';
    return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}[${t.slice(0, 40)}]`;
  };
  /** Ancestral que rola na horizontal (faixa de chips, tabela com rolagem própria). */
  const rolaDeLado = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const o = getComputedStyle(p).overflowX;
      if ((o === 'auto' || o === 'scroll') && p.scrollWidth > p.clientWidth + 1) return p;
    }
    return null;
  };
  const corta = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const o = getComputedStyle(p).overflowX;
      if (o === 'hidden' || o === 'clip') return p;
    }
    return null;
  };
  const main = document.querySelector('main') ?? document.body;
  const texto = document.body.innerText;
  const leitorDeTela = (el) => el.closest('.sr-only') || el.getBoundingClientRect().width <= 1;
  const todos = [...main.querySelectorAll('*')].filter(
    (el) =>
      el instanceof HTMLElement &&
      !el.closest('dialog:not([open])') &&
      !leitorDeTela(el) &&
      visivel(el),
  );
  /** Tamanho do alvo de toque: a caixa ou o ::before/::after absoluto que a aumenta (`.toque`). */
  const alvo = (el) => {
    const r = el.getBoundingClientRect();
    let w = r.width;
    let h = r.height;
    for (const pseudo of ['::before', '::after']) {
      const s = getComputedStyle(el, pseudo);
      if (s.content === 'none' || s.position !== 'absolute') continue;
      if (s.width === 'auto' && s.left === '0px' && s.right === '0px') return { w: 44, h: 44 };
      w = Math.max(w, parseFloat(s.width) || 0);
      h = Math.max(h, parseFloat(s.height) || 0);
    }
    return { w, h };
  };

  // Fora da tela: o elemento mais externo que passa da borda, fora de faixa com rolagem própria.
  const fora = [];
  for (const el of todos) {
    const r = el.getBoundingClientRect();
    if (r.right <= vw + 1 && r.left >= -1) continue;
    if (rolaDeLado(el)) continue;
    const pai = el.parentElement?.getBoundingClientRect();
    if (pai && (pai.right > vw + 1 || pai.left < -1) && !rolaDeLado(el.parentElement)) continue;
    if (getComputedStyle(el).position === 'fixed' && r.width <= 2) continue;
    fora.push(
      `${nome(el)} ${Math.round(r.left)}..${Math.round(r.right)}${corta(el) ? ' (cortado)' : ''}`,
    );
  }

  // Texto cortado: caixa com overflow escondido cujo texto não cabe.
  const cortado = [];
  const reticencias = [];
  for (const el of todos) {
    if (!el.childNodes.length || el.children.length > 2) continue;
    const t = (el.textContent || '').trim();
    if (!t) continue;
    const s = getComputedStyle(el);
    const escondeX = s.overflowX === 'hidden' || s.overflowX === 'clip';
    const escondeY = s.overflowY === 'hidden' || s.overflowY === 'clip';
    const naoCabeX = el.scrollWidth > el.clientWidth + 1;
    const naoCabeY = el.scrollHeight > el.clientHeight + 2;
    if (escondeX && naoCabeX) {
      if (s.textOverflow === 'ellipsis') reticencias.push(nome(el));
      else cortado.push(nome(el));
    } else if (escondeY && naoCabeY && s.webkitLineClamp === 'none') cortado.push(nome(el));
  }

  // Toque: alvo menor que 44 px (Apple). Link dentro de texto corrido fica de fora.
  const toque = [];
  const interativos = todos.filter((el) =>
    el.matches(
      'a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab], [role=switch], [role=checkbox], label:has(input[type=checkbox]), label:has(input[type=radio])',
    ),
  );
  for (const el of interativos) {
    if (el.matches('input[type=checkbox], input[type=radio]') && el.closest('label')) continue;
    if (el.closest('label') && !el.matches('label')) {
      if (el.matches('input[type=checkbox], input[type=radio]')) continue;
    }
    const s = getComputedStyle(el);
    if (s.display === 'inline' && el.matches('a') && el.parentElement?.closest('p, li')) continue;
    const r = alvo(el);
    const menor = Math.min(r.w, r.h);
    if (menor < 44) toque.push({ el: nome(el), w: Math.round(r.w), h: Math.round(r.h) });
  }
  toque.sort((a, b) => Math.min(a.w, a.h) - Math.min(b.w, b.h));

  // Campo com letra < 16 px: o Safari do iPhone dá zoom na página ao tocar.
  const zoom = [];
  for (const el of interativos.filter((e) => e.matches('input, select, textarea'))) {
    if (el.matches('[type=checkbox], [type=radio], [type=range], [type=file], [type=color]'))
      continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < 16) zoom.push(`${nome(el)} ${fs}px`);
  }

  const tabelas = [...main.querySelectorAll('table')]
    .filter(visivel)
    .filter((t) => t.getBoundingClientRect().width > vw + 1)
    .map((t) => `table ${Math.round(t.getBoundingClientRect().width)} px`);

  return {
    titulo: document.querySelector('main h1, h1')?.textContent?.trim() ?? null,
    erroNaTela: erros.find((e) => texto.includes(e)) ?? null,
    rolagemLateral:
      document.documentElement.scrollWidth > vw + 1
        ? `${document.documentElement.scrollWidth} > ${vw}: ${[
            ...document.body.querySelectorAll('*'),
          ]
            .filter((el) => {
              const r = el.getBoundingClientRect();
              const p = el.parentElement?.getBoundingClientRect();
              return r.width && r.right > vw + 1 && (!p || p.right <= vw + 1) && !rolaDeLado(el);
            })
            .slice(0, 4)
            .map(nome)
            .join(' · ')}`
        : null,
    fora: fora.slice(0, 12),
    cortado: [...new Set(cortado)].slice(0, 12),
    reticencias: [...new Set(reticencias)].slice(0, 12),
    toque: toque.slice(0, 15).map((t) => `${t.el} ${t.w}×${t.h}`),
    toqueTotal: toque.length,
    zoom: [...new Set(zoom)].slice(0, 10),
    tabelas,
    vh,
  };
}

/** No fim da rolagem: conteúdo do <main> por baixo de barra fixa (rodapé, ações em massa). */
function cobertoNaPagina() {
  window.scrollTo(0, document.documentElement.scrollHeight);
  const vh = window.innerHeight;
  const barras = [...document.querySelectorAll('body *')].filter((el) => {
    const s = getComputedStyle(el);
    if (s.position !== 'fixed' && s.position !== 'sticky') return false;
    if (s.display === 'none' || s.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect();
    return r.height > 20 && r.width > 100 && r.bottom >= vh - 120 && r.top > vh / 2;
  });
  const out = [];
  const main = document.querySelector('main');
  if (!main) return out;
  for (const b of barras) {
    const rb = b.getBoundingClientRect();
    for (const el of main.querySelectorAll(
      'a[href], button, input, select, textarea, p, h2, h3, li, td',
    )) {
      if (b.contains(el) || el.closest('dialog:not([open])')) continue;
      if (el.closest('details:not([open])') && !el.closest('summary')) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      if (getComputedStyle(el).position === 'fixed' || el.closest('[style*="position: fixed"]'))
        continue;
      // A própria barra pode estar dentro do main (ações em massa): ignore o que está dentro dela.
      const sobe = r.bottom > rb.top + 2 && r.top < rb.bottom - 2;
      if (!sobe) continue;
      const centro = document.elementFromPoint(
        r.left + r.width / 2,
        Math.min(r.bottom - 2, (Math.max(r.top, rb.top) + Math.min(r.bottom, rb.bottom)) / 2),
      );
      if (centro && b.contains(centro)) {
        const t = (el.getAttribute('aria-label') || el.textContent || '')
          .replace(/\s+/g, ' ')
          .trim();
        out.push(
          `${el.tagName.toLowerCase()}[${t.slice(0, 40)}] sob ${b.tagName.toLowerCase()}[${(b.getAttribute('aria-label') || '').slice(0, 30)}]`,
        );
      }
    }
  }
  return [...new Set(out)].slice(0, 8);
}

/** Abre cada <dialog> da página com showModal e mede se cabe na tela (fecha em seguida). */
function janelinhasNaPagina() {
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const out = [];
  for (const d of document.querySelectorAll('dialog')) {
    if (!(d instanceof HTMLDialogElement)) continue;
    const aberta = d.open;
    try {
      if (!aberta) d.showModal();
      const r = d.getBoundingClientRect();
      const s = getComputedStyle(d);
      const rola =
        (s.overflowY === 'auto' || s.overflowY === 'scroll') && d.scrollHeight > d.clientHeight;
      const nome =
        d.getAttribute('aria-label') ||
        d.querySelector('h2, h3')?.textContent?.trim() ||
        d.className;
      if (r.width > vw + 1 || r.left < -1)
        out.push(`${nome}: largura ${Math.round(r.width)} > ${vw}`);
      if (r.height > vh + 1 || r.top < -1 || r.bottom > vh + 1)
        out.push(
          `${nome}: altura ${Math.round(r.height)} (tela ${vh})${rola ? ', rola dentro' : ', NÃO rola'}`,
        );
    } catch {
      /* janela fora do documento */
    } finally {
      if (!aberta) d.close();
    }
  }
  return out;
}

/** Campos de texto: com o teclado aberto (tela mais baixa), o campo focado fica por baixo de barra fixa? */
async function teclado(page, largura) {
  const campos = page.locator(
    'main input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]):visible, main textarea:visible',
  );
  // O navegador rola o campo focado para a borda de baixo (o mínimo): é ali que a barra fixa fica.
  const n = Math.min(await campos.count(), 6);
  if (!n) return [];
  const alto = ALTURA[largura] ?? 812;
  await page.setViewportSize({ width: largura, height: alto - TECLADO });
  const out = [];
  try {
    for (let i = 0; i < n; i++) {
      const r = await campos
        .nth(i)
        .evaluate((el) => {
          el.focus({ preventScroll: true });
          el.scrollIntoView({ block: 'nearest', behavior: 'instant' });
          const c = el.getBoundingClientRect();
          const vh = window.innerHeight;
          const pts = [
            [c.left + 4, c.top + c.height / 2],
            [c.left + c.width / 2, c.top + c.height / 2],
          ];
          const tapa = pts
            .map(([x, y]) => document.elementFromPoint(x, Math.min(y, vh - 1)))
            .find((e) => e && e !== el && !el.contains(e) && !e.contains(el));
          const fora = c.bottom > vh + 2 || c.top < -2;
          const nome =
            el.getAttribute('aria-label') ||
            el.getAttribute('name') ||
            el.getAttribute('placeholder') ||
            el.id;
          if (!tapa && !fora) return null;
          const quem = tapa
            ? `${tapa.tagName.toLowerCase()}[${(tapa.closest('nav,[role=dialog],dialog,div')?.getAttribute('aria-label') || '').slice(0, 30)}]`
            : 'fora da tela';
          return `${nome}: coberto por ${quem}`;
        })
        .catch(() => null);
      if (r) out.push(r);
      await page.evaluate(() => document.activeElement?.blur?.());
    }
  } finally {
    await page.setViewportSize({ width: largura, height: alto });
  }
  return [...new Set(out)];
}

async function medir(page, largura) {
  await page.evaluate(() => window.scrollTo(0, 0));
  const m = await page.evaluate(medirNaPagina, { erros: ERROS_NA_TELA });
  m.coberto = await page.evaluate(cobertoNaPagina);
  m.janelinhas = await page.evaluate(janelinhasNaPagina);
  m.teclado = largura <= 768 ? await teclado(page, largura) : [];
  await page.evaluate(() => window.scrollTo(0, 0));
  return m;
}

const NAV = {
  375: ['Navegação inferior', 'Abas do acompanhamento'],
  768: ['Navegação lateral'],
};

async function linksDoMenu(page, largura) {
  for (const nome of NAV[largura] ?? NAV[768]) {
    const nav = page.getByRole('navigation', { name: nome });
    if (await nav.isVisible().catch(() => false)) {
      const links = await nav
        .locator('a[href^="/"]')
        .evaluateAll((as) =>
          as
            .filter((a) => a.getBoundingClientRect().width > 0)
            .map((a) => ({
              href: a.getAttribute('href'),
              rotulo: (a.getAttribute('aria-label') || a.textContent || '').trim(),
            })),
        );
      return { nav: nome, links };
    }
  }
  return { nav: null, links: [] };
}

async function esperarTela(page) {
  await page.waitForLoadState('load').catch(() => {});
  await page
    .locator('main h1, h1')
    .first()
    .waitFor({ timeout: 15_000 })
    .catch(() => {});
  await page.waitForTimeout(450);
}

async function varrer(browser, usuario, largura, tema, profundas) {
  const ctx = await browser.newContext({
    viewport: { width: largura, height: ALTURA[largura] ?? 812 },
    deviceScaleFactor: 2,
    isMobile: largura < 768,
    hasTouch: true,
    colorScheme: tema === 'escuro' ? 'dark' : 'light',
  });
  if (tema === 'escuro')
    await ctx.addInitScript(() => {
      try {
        window.localStorage.setItem('theme', 'dark');
      } catch {
        /* sem storage */
      }
    });
  const page = await ctx.newPage();
  const problemas = [];
  page.on('console', (m) => {
    if (m.type() === 'error') problemas.push(`console: ${m.text().slice(0, 160)}`);
  });
  page.on('pageerror', (e) => problemas.push(`pageerror: ${String(e).slice(0, 160)}`));
  page.on('response', (r) => {
    const u = new URL(r.url());
    if (r.status() >= 400 && u.pathname.startsWith('/api/'))
      problemas.push(`api: ${r.status()} ${r.request().method()} ${u.pathname}`);
  });
  const pasta = join(OUT, usuario, `${largura}-${tema}`);
  mkdirSync(pasta, { recursive: true });
  const telas = [];
  const vistos = new Set();

  const anotar = async (rotulo, como) => {
    const antes = problemas.length;
    await esperarTela(page);
    const url = new URL(page.url());
    const m = await medir(page, largura);
    const arquivo = `${String(telas.length).padStart(2, '0')}-${slug(url.pathname)}.png`;
    await page.screenshot({ path: join(pasta, arquivo), fullPage: true }).catch(() => {});
    telas.push({
      rotulo,
      como,
      url: url.pathname + url.search,
      captura: join(pasta, arquivo),
      ...m,
      problemas: problemas.slice(antes),
    });
    vistos.add(padrao(url.pathname));
  };

  await page.goto(`${BASE}/login`);
  await page.getByLabel('Usuário', { exact: true }).fill(usuario);
  await page.getByLabel('Senha').fill(SENHA);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 });
  await anotar('(entrada)', 'login');
  const entrada = new URL(page.url()).pathname;

  // Abas do menu, pelo clique.
  const { nav, links } = await linksDoMenu(page, largura);
  const filaMais = [];
  for (const { href, rotulo } of links) {
    if (!href || vistos.has(padrao(href))) continue;
    const alvo = page.getByRole('navigation', { name: nav }).locator(`a[href="${href}"]`).first();
    // Formulário sem barra de baixo (ex.: Nova inscrição): volta à entrada e clica de lá.
    if (!(await alvo.isVisible().catch(() => false))) {
      await page.goto(`${BASE}${entrada}`);
      await esperarTela(page);
    }
    if (!(await alvo.isVisible().catch(() => false))) continue;
    await alvo.click();
    await page
      .waitForURL((u) => u.pathname.startsWith(href.split('?')[0]), { timeout: 15_000 })
      .catch(() => {});
    await anotar(rotulo, `clique em ${nav}`);
    // "Mais" no celular: os itens dele também, pelo clique.
    if (/\/mais$/.test(href)) {
      const itens = await page
        .locator('main a[href^="/"]')
        .evaluateAll((as) =>
          as.map((a) => ({
            href: a.getAttribute('href'),
            rotulo: (a.textContent || '').replace(/\s+/g, ' ').trim(),
          })),
        );
      for (const it of itens)
        if (it.href && !it.href.startsWith('/login')) filaMais.push({ ...it, mais: href });
    }
  }
  for (const { href, rotulo, mais } of filaMais) {
    if (vistos.has(padrao(href))) continue;
    await page.goto(`${BASE}${mais}`);
    await esperarTela(page);
    const alvo = page.locator(`main a[href="${href}"]`).first();
    if (!(await alvo.isVisible().catch(() => false))) continue;
    await alvo.click();
    await page
      .waitForURL((u) => u.pathname.startsWith(href.split('?')[0]), { timeout: 15_000 })
      .catch(() => {});
    await anotar(rotulo, `Mais → ${rotulo}`);
  }

  // Telas de detalhe: o primeiro link de cada padrão novo achado nas telas visitadas.
  if (profundas) {
    const fila = [];
    for (const t of [...telas]) {
      if (fila.length >= PROFUNDAS) break;
      await page.goto(`${BASE}${t.url}`);
      await esperarTela(page);
      const hrefs = await page
        .locator('main a[href^="/"]')
        .evaluateAll((as) => as.map((a) => a.getAttribute('href')));
      for (const h of hrefs) {
        if (!h || h.startsWith('/login') || h.startsWith('/api')) continue;
        const p = padrao(h);
        if (vistos.has(p) || fila.some((f) => padrao(f) === p)) continue;
        fila.push(h);
      }
    }
    for (const href of fila.slice(0, PROFUNDAS)) {
      if (vistos.has(padrao(href))) continue;
      await page.goto(`${BASE}${href}`);
      await anotar(padrao(href), 'endereço (detalhe)');
    }
  }
  await ctx.close();
  return { usuario, largura, tema, telas };
}

const relatorio = [];
const browser = await webkit.launch();
try {
  const tarefas = [];
  for (const usuario of contas)
    for (const largura of LARGURAS)
      for (const tema of TEMAS)
        tarefas.push({ usuario, largura, tema, profundas: tema === TEMAS[0] });
  const CONC = Number(process.env.VARREDURA_PARALELO ?? 3);
  let i = 0;
  await Promise.all(
    Array.from({ length: CONC }, async () => {
      while (i < tarefas.length) {
        const t = tarefas[i++];
        try {
          const r = await varrer(browser, t.usuario, t.largura, t.tema, t.profundas);
          relatorio.push(r);
          console.log(`${t.usuario} ${t.largura} ${t.tema}: ${r.telas.length} telas`);
        } catch (e) {
          console.error(`${t.usuario} ${t.largura} ${t.tema}: falhou: ${String(e).slice(0, 200)}`);
          relatorio.push({ ...t, erro: String(e).slice(0, 300), telas: [] });
        }
      }
    }),
  );
} finally {
  await browser.close();
}

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'celular.json'), JSON.stringify(relatorio, null, 2));
const linhas = [];
const lista = (rot, xs) => (xs && xs.length ? [`  - ${rot}: ${xs.join(' · ')}`] : []);
for (const r of relatorio.sort((a, b) =>
  `${a.usuario}${a.largura}${a.tema}`.localeCompare(`${b.usuario}${b.largura}${b.tema}`),
)) {
  linhas.push(`## ${r.usuario} · ${r.largura} · ${r.tema}${r.erro ? ` · ERRO ${r.erro}` : ''}`);
  for (const t of r.telas) {
    const det = [
      ...lista('erro na tela', t.erroNaTela ? [t.erroNaTela] : []),
      ...lista('rolagem lateral', t.rolagemLateral ? [t.rolagemLateral] : []),
      ...lista('fora da tela', t.fora),
      ...lista('cortado', t.cortado),
      ...lista('zoom ao tocar (<16px)', t.zoom),
      ...lista('coberto pela barra', t.coberto),
      ...lista('janelinha', t.janelinhas),
      ...lista('teclado', t.teclado),
      ...lista('tabela larga', t.tabelas),
      ...lista(`toque <44 (${t.toqueTotal})`, t.toque.slice(0, 6)),
      ...lista('problemas', [...new Set(t.problemas)]),
    ];
    linhas.push(`- ${t.rotulo} \`${t.url}\` (${t.como})${det.length ? '' : ' ✅'}`, ...det);
  }
}
writeFileSync(join(OUT, 'celular.md'), linhas.join('\n') + '\n');
console.log(`relatório: ${join(OUT, 'celular.md')}`);
