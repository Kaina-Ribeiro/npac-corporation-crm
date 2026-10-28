import Link from 'next/link';
export default function LeadNotFound() {
  return (
    <section className="glass-card mx-auto max-w-xl p-8">
      <h1 className="text-2xl font-bold">Lead indisponível</h1>
      <p className="my-3 text-sm text-ink2">Ele não existe ou você não tem acesso.</p>
      <Link className="text-sm font-semibold" href="/leads">
        Voltar para leads
      </Link>
    </section>
  );
}
