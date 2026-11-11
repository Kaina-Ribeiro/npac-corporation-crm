'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BuscaModulo } from './busca-modulo';

/** Telas sem o topo, como no protótipo: formulário, Mais e Configurações. */
const SEM_TOPO = [
  '/acompanhamento/mentorados/nova',
  '/acompanhamento/mais',
  '/acompanhamento/configuracoes',
];

/** Topo do módulo: busca em todas as abas; no celular, o avatar leva ao Mais. */
export function BarraModulo({ inicial }: { inicial: string }) {
  const path = usePathname();
  if (SEM_TOPO.includes(path)) return null;
  return (
    <div className="top">
      <BuscaModulo />
      <Link className="ava me so-cel" href="/acompanhamento/mais" aria-label="Menu e conta">
        {inicial}
      </Link>
    </div>
  );
}
