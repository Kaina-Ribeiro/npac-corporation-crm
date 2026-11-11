import type { Condutor, FichaDTO } from '@npac/shared/mentoria';
import { ReuniaoNova } from '@/components/acompanhamento/reuniao-nova';
import { lerEu, podeCadastrar, sessaoDoModulo } from '@/lib/acompanhamento';
import { apiGet } from '@/lib/api';

export const metadata = { title: 'Agendar reunião' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function NovaReuniaoPage({
  searchParams,
}: {
  searchParams: Promise<{ inscricao?: string }>;
}) {
  const me = await sessaoDoModulo();
  if (!me) return null;
  const { inscricao } = await searchParams;
  const [condutores, eu, ficha] = await Promise.all([
    apiGet<Condutor[]>('/api/mentoria/reunioes/condutores'),
    lerEu(),
    inscricao && UUID.test(inscricao)
      ? apiGet<FichaDTO>(`/api/mentoria/inscricoes/${inscricao}`)
      : Promise.resolve(null),
  ]);
  return (
    <ReuniaoNova
      inscricao={ficha ? { id: ficha.id, nome: ficha.nome, pessoas: ficha.pessoas } : null}
      condutores={condutores}
      euId={me.id}
      equipe={podeCadastrar(eu)}
    />
  );
}
