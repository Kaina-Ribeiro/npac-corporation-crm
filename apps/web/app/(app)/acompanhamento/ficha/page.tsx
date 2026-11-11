import { redirect } from 'next/navigation';
import { sessaoDoModulo, ultimaFicha } from '@/lib/acompanhamento';

/** Item "Ficha do mentorado": volta à última ficha aberta; sem nenhuma, vai escolher na lista. */
export default async function FichaEntradaPage() {
  if (!(await sessaoDoModulo())) return null;
  const ultima = await ultimaFicha();
  redirect(ultima ? `/acompanhamento/ficha/${ultima.id}` : '/acompanhamento/mentorados');
}
