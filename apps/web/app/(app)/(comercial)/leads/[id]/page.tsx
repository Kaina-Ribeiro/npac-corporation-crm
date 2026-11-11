import {
  can,
  type DealDTO,
  type FormResponseDTO,
  type ProductDTO,
  type LeadActivityDTO,
  type LeadCatalog,
  type LeadDTO,
  type MeetingDTO,
} from '@npac/shared';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { LeadDetail } from '@/components/lead-detail';
import { ApiError, apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';

export const metadata = { title: 'Ficha do lead' };
export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getSession();
  if (!me) redirect('/login');
  const { id } = await params;
  try {
    const lead = await apiGet<LeadDTO>(`/api/leads/${encodeURIComponent(id)}`);
    // Vendas e pagamentos: closer e liderança. O SDR só marca o resultado da reunião (04/11).
    const sells = can(me, 'sale:register');
    const [activity, formResponses, catalog, meetings, deals, products] = await Promise.all([
      apiGet<LeadActivityDTO>(`/api/leads/${id}/activity`),
      apiGet<FormResponseDTO[]>(`/api/leads/${id}/form-responses`),
      apiGet<LeadCatalog>('/api/leads/catalog'),
      apiGet<MeetingDTO[]>(`/api/meetings?leadId=${id}`),
      sells ? apiGet<DealDTO[]>(`/api/finance/leads/${id}`) : null,
      // Produtos para todos: Agendou Pagamento pede produto e valor (NPAC-38).
      apiGet<ProductDTO[]>('/api/finance/products'),
    ]);
    return (
      <div className="flex w-full flex-col gap-5">
        <Link href="/leads" className="text-sm text-ink2">
          ‹ Leads
        </Link>
        <LeadDetail
          lead={lead}
          activity={activity}
          formResponses={formResponses}
          catalog={catalog}
          meetings={meetings}
          deals={deals}
          products={products}
          me={me}
        />
      </div>
    );
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
}
