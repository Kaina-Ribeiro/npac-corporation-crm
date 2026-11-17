'use client';
import { brasiliaDay, readTabUrls, writeTabUrls } from '@npac/shared/screen-prefs';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { lembrarAc, type AcScreen } from '@/lib/acompanhamento-prefs';
import { readPreference } from '@/lib/user-cookie';

/** Valor do cookie: a consulta de cada aba vai codificada (o `cookies()` do Next decodifica). */
export function lerAbas(raw: string | undefined) {
  try {
    return raw ? decodeURIComponent(raw) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Telas com estado na URL (NPAC-46): grava a última consulta de cada aba. Aberta pelo menu (URL
 * sem chave da tela), confere o cookie: voltar do navegador ou o pré-carregamento do menu trazem a
 * página de antes, e aí a tela vai para a consulta mais nova.
 */
export function LembrarUrl({
  screen,
  cookie,
  valor,
  abas,
  aba,
  consulta,
  daily = [],
  doMenu,
}: {
  screen: AcScreen;
  cookie: string;
  /** O que o servidor leu do cookie (codificado). */
  valor: string;
  abas: readonly string[];
  aba: string;
  consulta: string;
  daily?: readonly string[];
  doMenu: boolean;
}) {
  const router = useRouter();
  const chaveAbas = abas.join(',');
  const chaveDaily = daily.join(',');
  useEffect(() => {
    const hoje = brasiliaDay();
    const salvas = readTabUrls(
      lerAbas(readPreference(cookie, valor)),
      chaveAbas.split(','),
      hoje,
      chaveDaily ? chaveDaily.split(',') : [],
    );
    const ultima = salvas.last ? salvas.tabs[salvas.last] : undefined;
    if (doMenu && ultima !== undefined && ultima !== consulta) {
      router.replace(`?${ultima}`);
      return;
    }
    lembrarAc(screen, cookie, encodeURIComponent(writeTabUrls(salvas, aba, consulta, hoje)));
  }, [screen, cookie, valor, chaveAbas, chaveDaily, aba, consulta, doMenu, router]);
  return null;
}
