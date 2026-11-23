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

/**
 * Topo do módulo: busca em todas as abas; no celular, o avatar leva ao Mais. O cargo Envios não busca
 * mentorados (NPAC-56): fica só o avatar.
 */
export function BarraModulo({
  inicial,
  foto,
  busca = true,
}: {
  inicial: string;
  foto: string | null;
  busca?: boolean;
}) {
  const path = usePathname();
  if (SEM_TOPO.includes(path)) return null;
  if (!busca)
    return (
      <div className="top so-cel">
        <span className="flex-1" />
        <Link className="ava me" href="/acompanhamento/mais" aria-label="Menu e conta">
          {foto ? <img src={foto} alt="" /> : inicial}
        </Link>
      </div>
    );
  return (
    <div className="top">
      <BuscaModulo />
      <Link className="ava me so-cel" href="/acompanhamento/mais" aria-label="Menu e conta">
        {/* Foto do perfil (NPAC-53): `.ava img` já cobre o círculo. */}
        {foto ? <img src={foto} alt="" /> : inicial}
      </Link>
    </div>
  );
}
