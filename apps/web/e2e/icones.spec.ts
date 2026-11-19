import { expect, test } from '@playwright/test';

// Ícone do sistema (NPAC-55, opção C do Gabriel, 19/11): aba do navegador, Tela de Início do iPhone
// e Android (manifesto com a versão "maskable"). Sem login: a tela de entrada já declara tudo.
test('aba, iPhone e Android têm o ícone da marca', async ({ page, request }) => {
  await page.goto('/login');
  const href = async (rel: string) =>
    page.locator(`link[rel="${rel}"]`).evaluateAll((ls) => ls.map((l) => l.getAttribute('href')!));
  const icones = await href('icon');
  expect(icones.some((h) => h.startsWith('/favicon.ico'))).toBe(true);
  expect(icones.some((h) => h.startsWith('/icon.png'))).toBe(true);
  const apple = await href('apple-touch-icon');
  expect(apple).toHaveLength(1);

  const manifesto = (await (await request.get('/manifest.webmanifest')).json()) as {
    icons: { src: string; sizes: string; purpose: string }[];
  };
  expect(manifesto.icons.map((i) => `${i.sizes} ${i.purpose}`)).toEqual([
    '192x192 any',
    '512x512 any',
    '512x512 maskable',
  ]);
  for (const src of [...icones, ...apple, ...manifesto.icons.map((i) => i.src)]) {
    const r = await request.get(src);
    expect(r.status(), src).toBe(200);
    expect(r.headers()['content-type'], src).toMatch(/^image\//);
  }
});
