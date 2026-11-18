// Capturas das duas telas de entrada (NPAC-51) para comparar com o protótipo "Login da equipe".
// Só roda com CAPTURAS=<pasta>: pnpm --filter @npac/web e2e e2e/capturas-login.spec.ts
import { test } from '@playwright/test';

const PASTA = process.env.CAPTURAS;
test.skip(!PASTA, 'só com CAPTURAS=<pasta>');

const TAMANHOS = [
  [375, 812],
  [390, 844],
  [768, 1024],
  [1024, 768],
  [1440, 900],
] as const;

for (const [nome, tela] of [
  ['crm', '/login'],
  ['acompanhamento', '/login/acompanhamento'],
] as const) {
  for (const tema of ['light', 'dark'] as const) {
    test(`captura ${nome} ${tema}`, async ({ page }) => {
      // Movimento reduzido: o shader para num quadro fixo, igual em toda captura.
      await page.emulateMedia({ colorScheme: tema, reducedMotion: 'reduce' });
      for (const [w, h] of TAMANHOS) {
        await page.setViewportSize({ width: w, height: h });
        await page.goto(tela);
        await page.locator('canvas').waitFor({ state: 'attached' });
        await page.waitForTimeout(400);
        await page.screenshot({ path: `${PASTA}/${nome}-${tema}-${w}.png`, fullPage: true });
      }
    });
  }
}
