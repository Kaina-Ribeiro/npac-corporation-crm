import 'server-only';
import { brasiliaDay, pickTabUrl, readTabUrls, tabQuery } from '@npac/shared/screen-prefs';
import { cookies } from 'next/headers';
import { AC_PREFS, acCookie, type AcScreen } from './acompanhamento-prefs';

/**
 * Telas do Acompanhamento com estado na URL (NPAC-46): última consulta de cada aba no cookie da
 * pessoa. URL com chave da tela vence; sem nenhuma (menu), vale a última aba. O `cookies()` do Next
 * já decodifica o valor, que o navegador grava codificado.
 */
export async function abasLembradas<A extends string>(
  screen: AcScreen,
  userId: string,
  url: Record<string, string | undefined>,
  o: {
    abas: readonly A[];
    padrao: A;
    chaves: Record<A, readonly string[]>;
    daily?: readonly string[];
  },
) {
  const cookie = acCookie(screen, userId);
  const bruto = (await cookies()).get(cookie)?.value;
  const salvas = readTabUrls(bruto, o.abas, brasiliaDay(), o.daily ?? []);
  const todas = ['aba', ...new Set(o.abas.flatMap((a) => o.chaves[a]))];
  const { fromMenu, params } = pickTabUrl(url, todas, salvas);
  const aba = o.abas.includes(params.aba as A) ? (params.aba as A) : o.padrao;
  // Só as chaves da aba aberta: o filtro de uma aba não vaza para outra.
  const consulta = tabQuery({ ...params, aba }, ['aba', ...o.chaves[aba]]);
  const q: Record<string, string | undefined> = Object.fromEntries(
    consulta.split('&').map((par) => par.split('=').map(decodeURIComponent)),
  );
  const raiz = AC_PREFS[screen].path;
  return {
    cookie,
    /** O valor como o navegador o gravou (semente da memória da aba, `readPreference`). */
    valor: bruto ? encodeURIComponent(bruto) : '',
    aba,
    q,
    consulta,
    doMenu: fromMenu,
    /** Link da aba: a consulta atual na aba aberta; nas outras, a última salva. */
    href: (id: A) => `${raiz}?${id === aba ? consulta : (salvas.tabs[id] ?? `aba=${id}`)}`,
  };
}
