// Capturas do protótipo do NPAC-60 sobre o dev local (conta duda do seed).
// Uso (na raiz do repositório, com o dev no ar): node docs/acompanhamento/prototipo/cronograma/capturar.mjs [tela…]
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(aqui, '../../../../apps/web/package.json'));
const { chromium } = require('@playwright/test');

const BASE = process.env.PROTO_URL ?? 'http://localhost:3000';
const USUARIO = process.env.PROTO_USUARIO ?? 'duda';
const SENHA = process.env.PROTO_SENHA ?? '123';
const OUT = process.env.PROTO_OUT ?? aqui;
const FICHA = '/acompanhamento/ficha/00000000-0000-4000-8000-000000000001';
const script = readFileSync(join(aqui, 'prototipo.js'), 'utf8');

const TELAS = {
  envio: { url: `${FICHA}?aba=jornada`, abrir: 'Registrar envio do 2º PME', rodar: '__cr.envio()', inteira: false },
  'envio-trocar': {
    url: `${FICHA}?aba=jornada`,
    abrir: 'Registrar envio do 2º PME',
    rodar: '__cr.envio({ trocar: true })',
    inteira: false,
  },
  'troca-a': { url: `${FICHA}?aba=jornada`, abrir: 'Registrar envio do 2º PME', rodar: "__cr.envio({ trocar: 'A' })", inteira: false, larguras: [375, 1440] },
  'troca-b': { url: `${FICHA}?aba=jornada`, abrir: 'Registrar envio do 2º PME', rodar: "__cr.envio({ trocar: 'B' })", inteira: false, larguras: [375, 1440] },
  'troca-c': { url: `${FICHA}?aba=jornada`, abrir: 'Registrar envio do 2º PME', rodar: "__cr.envio({ trocar: 'C' })", inteira: false, larguras: [375, 1440] },
  card: { url: `${FICHA}?aba=jornada`, rodar: '__cr.card()', inteira: false },
  aba: { url: `${FICHA}?aba=historico`, rodar: '__cr.aba()', inteira: true },
  banco: { url: '/acompanhamento/configuracoes?aba=pmes', rodar: '__cr.banco()', inteira: true, larguras: [1440, 1024, 768] },
  'banco-a': { url: '/acompanhamento/configuracoes?aba=pmes', rodar: "__cr.banco('A')", inteira: true, larguras: [375] },
  'banco-b': { url: '/acompanhamento/configuracoes?aba=pmes', rodar: "__cr.banco('B')", inteira: true, larguras: [375] },
  'banco-c': { url: '/acompanhamento/configuracoes?aba=pmes', rodar: "__cr.banco('C')", inteira: true, larguras: [375] },
  importacao: { url: '/acompanhamento/configuracoes?aba=importacao', rodar: '__cr.importacao()', inteira: true },
};
const LARGURAS = [
  [1440, 1000],
  [1024, 900],
  [768, 1024],
  [375, 812],
];
const ESCURO = new Set(['envio', 'aba', 'card']);

const pedidas = process.argv.slice(2);
const telas = Object.entries(TELAS).filter(([n]) => !pedidas.length || pedidas.includes(n));
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ['--lang=pt-BR'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'pt-BR' });
const page = await ctx.newPage();
page.setDefaultTimeout(60_000);
await page.goto(`${BASE}/login/acompanhamento`);
await page.locator('input[name=username]').fill(USUARIO);
await page.locator('input[name=password]').fill(SENHA);
await page.keyboard.press('Enter');
await page.waitForURL((u) => !u.pathname.startsWith('/login'));
await page.waitForLoadState('load');

for (const [nome, t] of telas) {
  for (const [w, h] of LARGURAS.filter(([lw]) => !t.larguras || t.larguras.includes(lw))) {
    for (const tema of ESCURO.has(nome) && (w === 1440 || w === 375) ? ['claro', 'escuro'] : ['claro']) {
      await page.setViewportSize({ width: w, height: h });
      await page.goto(`${BASE}${t.url}`, { waitUntil: 'load' });
      await page.waitForTimeout(1200);
      await page.evaluate((escuro) => document.documentElement.classList.toggle('dark', escuro), tema === 'escuro');
      if (t.abrir) {
        await page.getByRole('button', { name: t.abrir }).filter({ visible: true }).first().click();
        await page.locator('dialog[open]').waitFor();
      }
      await page.addStyleTag({
        content: `nextjs-portal{display:none!important}${t.inteira ? 'nav.barra-celular{display:none!important}' : ''}`,
      });
      await page.evaluate(script);
      await page.evaluate(t.rodar);
      await page.evaluate(() => document.activeElement?.blur?.());
      await page.waitForTimeout(400);
      const arquivo = join(OUT, `${nome}-${w}-${tema}.png`);
      await page.screenshot({ path: arquivo, fullPage: t.inteira });
      console.log('ok', arquivo.split(/[\\/]/).pop());
    }
  }
}
await browser.close();
