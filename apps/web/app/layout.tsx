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
  themeColor: '#f2f2f7',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    <html lang="pt-BR" suppressHydrationWarning className={`${geist.variable} ${anton.variable}`}>
      <body>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} nonce={nonce}>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
