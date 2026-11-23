import { redirect } from 'next/navigation';
import { lerEu, soEnvios } from '@/lib/acompanhamento';

/** Entrada do módulo: a Fila do dia (§6); o cargo Envios cai em Envios físicos (NPAC-56, M6). */
export default async function AcompanhamentoPage() {
  redirect(soEnvios(await lerEu()) ? '/acompanhamento/envios' : '/acompanhamento/fila');
}
