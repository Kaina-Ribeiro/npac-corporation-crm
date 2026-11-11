import { redirect } from 'next/navigation';

/** Entrada do módulo. A Parte 5 troca o destino pela Fila do dia. */
export default function AcompanhamentoPage() {
  redirect('/acompanhamento/mentorados');
}
