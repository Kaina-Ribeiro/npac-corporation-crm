import type { EvolucaoDTO, FichaDTO } from '@npac/shared/mentoria';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { EvolucaoPdf } from '@/components/acompanhamento/evolucao-pdf';
import { ImprimirAoAbrir } from '@/components/acompanhamento/imprimir-ao-abrir';
import { diaBR } from '@/components/acompanhamento/ui';
import { sessaoDoModulo } from '@/lib/acompanhamento';
import { apiGet } from '@/lib/api';
import './evolucao-pdf.css';

/**
 * PDF da aba Evolução (NPAC-57, spec §5.7): folha A4 impressa pelo navegador ("Salvar como PDF"), fora da casca do
 * app (grupo `(impressao)`, sem sidebar nem barras). Mesmo acesso da aba: 404 para quem não vê. Nada da evolução na
 * URL; leitura, sem auditoria.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const carregar = cache(async (id: string) => {
  if (!UUID.test(id)) notFound();
  // Sem acesso ao módulo: 404 (`sessaoDoModulo`); com o MFA pendente, também nada.
  if (!(await sessaoDoModulo())) notFound();
  const [ficha, ev] = await Promise.all([
    apiGet<FichaDTO>(`/api/mentoria/inscricoes/${id}`),
    apiGet<EvolucaoDTO>(`/api/mentoria/inscricoes/${id}/evolucao`),
  ]);
  return { ficha, ev };
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { ficha } = await carregar((await params).id);
  // Vira o nome sugerido do arquivo na janela de imprimir.
  return { title: { absolute: `Evolução - ${ficha.nome}` } };
}

export default async function EvolucaoPdfPage({ params }: { params: Promise<{ id: string }> }) {
  const { ficha, ev } = await carregar((await params).id);
  return (
    <>
      <EvolucaoPdf ficha={ficha} ev={ev} hoje={diaBR(new Date().toISOString())} />
      <ImprimirAoAbrir />
    </>
  );
}
