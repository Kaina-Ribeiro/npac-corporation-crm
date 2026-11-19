import type { MetadataRoute } from 'next';

/** Permite adicionar o CRM à tela inicial (no iPhone, condição para receber avisos). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'NPAC CRM',
    short_name: 'NPAC',
    start_url: '/hoje',
    display: 'standalone',
    background_color: '#e1e0e4',
    theme_color: '#e1e0e4',
    lang: 'pt-BR',
    // Ícone C (NPAC-55, Gabriel 19/11): PNG para o Android e a versão "maskable", com o N e o contorno
    // dentro da área que o Android não corta. Aba do navegador: `app/icon.png` e `app/favicon.ico`.
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
