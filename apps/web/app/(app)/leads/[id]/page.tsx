import {
  can,
  type DealDTO,
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
    const [activity, catalog, meetings, deals, products] = await Promise.all([
      apiGet<LeadActivityDTO>(`/api/leads/${id}/activity`),
      apiGet<LeadCatalog>('/api/leads/catalog'),
      apiGet<MeetingDTO[]>(`/api/meetings?leadId=${id}`),
      sells ? apiGet<DealDTO[]>(`/api/finance/leads/${id}`) : null,
      sells ? apiGet<ProductDTO[]>('/api/finance/products') : [],
    ]);
    return (
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        <Link href="/leads" className="text-sm text-ink2">
          ‹ Leads
        </Link>
        <LeadDetail
          lead={lead}
          activity={activity}
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
