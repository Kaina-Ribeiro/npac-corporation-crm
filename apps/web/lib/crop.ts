/**
 * Recorte da foto do perfil (NPAC-53), feito no navegador. Palco quadrado de `STAGE` px com o
 * círculo de `HOLE` px no meio; a imagem cobre o círculo (`zoom` 1 = o lado menor encosta nele) e
 * anda por `x`/`y` (px do palco a partir do centro), sem nunca deixar sobra dentro do círculo.
 */
export const STAGE = 300;
export const HOLE = 260;
/** Lado da foto enviada à API. */
export const OUT = 256;
export const ZOOM_MAX = 4;

export type View = { x: number; y: number; zoom: number };

const escala = (w: number, h: number, zoom: number) => Math.max(HOLE / w, HOLE / h) * zoom;

/** Prende zoom (1 a `ZOOM_MAX`) e posição para a imagem sempre cobrir o círculo. */
export function clampView(v: View, w: number, h: number): View {
  const zoom = Math.min(ZOOM_MAX, Math.max(1, v.zoom));
  const s = escala(w, h, zoom);
  const mx = (w * s - HOLE) / 2;
  const my = (h * s - HOLE) / 2;
  return {
    zoom,
    x: Math.max(-mx, Math.min(mx, v.x)),
    y: Math.max(-my, Math.min(my, v.y)),
  };
}

/** Onde a imagem fica no palco (px). */
export function placement(v: View, w: number, h: number) {
  const s = escala(w, h, v.zoom);
  return {
    width: w * s,
    height: h * s,
    left: STAGE / 2 - (w * s) / 2 + v.x,
    top: STAGE / 2 - (h * s) / 2 + v.y,
  };
}

/** Quadrado da imagem original (px dela) que cai dentro do círculo. */
export function cropRect(v: View, w: number, h: number) {
  const s = escala(w, h, v.zoom);
  const p = placement(v, w, h);
  const borda = (STAGE - HOLE) / 2;
  return { sx: (borda - p.left) / s, sy: (borda - p.top) / s, size: HOLE / s };
}

const blob = (c: HTMLCanvasElement, type: string) =>
  new Promise<Blob | null>((ok) => c.toBlob(ok, type, 0.85));

/** Foto final de `OUT` px: WebP 0,85; JPEG 0,85 se o navegador não gerar WebP (Safari antigo). */
export async function cropToBlob(img: HTMLImageElement, v: View): Promise<Blob> {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const { sx, sy, size } = cropRect(v, w, h);
  const canvas = document.createElement('canvas');
  canvas.width = OUT;
  canvas.height = OUT;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, size, size, 0, 0, OUT, OUT);
  const webp = await blob(canvas, 'image/webp');
  if (webp?.type === 'image/webp') return webp;
  const jpeg = await blob(canvas, 'image/jpeg');
  if (!jpeg) throw new Error('Não deu para abrir essa imagem. Use JPG, PNG ou WebP.');
  return jpeg;
}
