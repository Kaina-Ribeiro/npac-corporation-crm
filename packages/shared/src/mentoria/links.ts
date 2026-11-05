/**
 * Links aceitos na pasta do RDV e em vídeo por link (D38): só https e host da allowlist
 * (YouTube, Vimeo e Google Drive; `docs.google.com` é o Drive das planilhas, P3: `planilhaLink`).
 * O host termina em "/" ou no fim: `youtube.com.evil` e `youtube.com@evil` não passam. A mesma regra vale no Zod e no CHECK do banco.
 */
export const LINK_PERMITIDO_SQL =
  '^https://((www|m)\\.)?(youtube\\.com|youtu\\.be|vimeo\\.com|player\\.vimeo\\.com|drive\\.google\\.com|docs\\.google\\.com)(/|$)';

export const LINK_PERMITIDO = new RegExp(LINK_PERMITIDO_SQL);

export const linkPermitido = (url: string) => LINK_PERMITIDO.test(url);
