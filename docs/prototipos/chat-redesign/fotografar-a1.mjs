// Fotografa a opção A1 (prototipo-a1.html) no celular, tablet e computador, mais A2 e A3 para comparar.
// Uso: PLAYWRIGHT=<pasta do pacote playwright> node docs/prototipos/chat-redesign/fotografar-a1.mjs [filtro]
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT ?? 'playwright');
const base = pathToFileURL(path.join(aqui, 'prototipo-a1.html')).href;

const TAM = { 375: [375, 812], 768: [768, 1024], 1024: [1024, 768], 1440: [1440, 900] };
const fotos = [];
for (const tema of ['claro', 'escuro']) {
  for (const tela of ['lista', 'conversa', 'teclado', 'mencao', 'nova']) fotos.push(['A1', tela, tema, 375]);
  for (const w of [768, 1024, 1440]) fotos.push(['A1', 'mesa', tema, w]);
}
for (const v of ['A2', 'A3']) {
  fotos.push([v, 'conversa', 'claro', 375]);
  fotos.push([v, 'mesa', 'claro', 1440]);
}
const filtro = process.argv[2];

const browser = await chromium.launch();
for (const [v, tela, tema, w] of fotos) {
  const nome = `${v}-${tela === 'mesa' ? 'conversa' : tela}-${w}${tema === 'escuro' ? '-escuro' : ''}.png`;
  if (filtro && !nome.includes(filtro)) continue;
  const [width, height] = TAM[w];
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
  await page.goto(`${base}?v=${v}&tela=${tela}&tema=${tema}`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(aqui, nome) });
  await page.close();
  console.log(nome);
}
await browser.close();
