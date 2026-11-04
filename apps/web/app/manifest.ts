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
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  };
}
