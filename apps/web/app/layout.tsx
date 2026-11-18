import type { Metadata, Viewport } from 'next';
import { Anton, Geist } from 'next/font/google';
import { headers } from 'next/headers';
import { ThemeProvider } from 'next-themes';
import './globals.css';

// Self-hosted no build pelo next/font: nenhuma chamada ao Google em runtime.
const geist = Geist({ subsets: ['latin'], variable: '--font-geist', display: 'swap' });
const anton = Anton({ subsets: ['latin'], weight: '400', variable: '--font-anton' });

export const metadata: Metadata = {
  title: { default: 'NPAC Corporation', template: '%s · NPAC Corporation' },
  applicationName: 'NPAC Corporation',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Tela inteira do iPhone: sem isso `env(safe-area-inset-*)` vale 0 e as barras de baixo encostam
  // na faixa do gesto de início (app na Tela de Início). Margens laterais em `.shell` (globals.css).
  viewportFit: 'cover',
  themeColor: '#e1e0e4',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    <html lang="pt-BR" suppressHydrationWarning className={`${geist.variable} ${anton.variable}`}>
      <body>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem nonce={nonce}>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
