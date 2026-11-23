import { Aviso404 } from '@/components/shell/aviso-404';
import { getSession } from '@/lib/session';

export const metadata = { title: 'Página não encontrada' };

/**
 * 404 de dentro da casca (`notFound()` numa tela ou layout de `(app)`): o layout já mostra a barra
 * lateral e o `<main>`, então aqui vai só o aviso. O `app/not-found.tsx` cobre o endereço solto.
 */
export default async function NotFoundNaCasca() {
  return <Aviso404 me={await getSession().catch(() => null)} />;
}
