import type { LeadCatalog, ProductDTO } from '@npac/shared';
import { isLeader } from '@npac/shared/enums';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LeadForm } from '@/components/lead-form';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';

export const metadata = { title: 'Novo lead' };
export default async function NewLeadPage() {
  const me = await getSession();
  if (!me) redirect('/login');
  // Cadastrar é de quem prospecta (dado), não do cargo.
  if (!isLeader(me.role) && !me.canProspect) redirect('/leads');
  const [catalog, products] = await Promise.all([
    apiGet<LeadCatalog>('/api/leads/catalog'),
    // Agendou Pagamento pede produto e valor (NPAC-38).
    apiGet<ProductDTO[]>('/api/finance/products'),
  ]);
  return (
    <div className="flex w-full flex-col gap-5">
      <Link href="/leads" className="text-sm text-ink2">
        ‹ Leads
      </Link>
      <h1 className="text-3xl font-bold tracking-tight">Novo lead</h1>
      <section className="glass-card w-full p-5 md:p-7">
        <LeadForm catalog={catalog} me={me} products={products} />
      </section>
    </div>
  );
}
