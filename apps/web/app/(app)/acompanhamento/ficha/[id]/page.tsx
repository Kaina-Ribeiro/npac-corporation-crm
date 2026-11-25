import type { FichaDTO, Responsavel } from '@npac/shared/mentoria';
import { readPrefs, writePrefs } from '@npac/shared/screen-prefs';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { Ficha } from '@/components/acompanhamento/ficha';
import { abaValida } from '@/components/acompanhamento/ui';
import { sessaoDoModulo } from '@/lib/acompanhamento';
import { FICHA_REGRAS, acCookie } from '@/lib/acompanhamento-prefs';
import { apiGet } from '@/lib/api';

export const metadata = { title: 'Ficha do mentorado' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function FichaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aba?: string }>;
}) {
  const me = await sessaoDoModulo();
  if (!me) return null;
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [ficha, responsaveis, { aba }, jar] = await Promise.all([
    apiGet<FichaDTO>(`/api/mentoria/inscricoes/${id}`),
    apiGet<Responsavel[]>('/api/mentoria/responsaveis'),
    searchParams,
    cookies(),
  ]);
  // Aba lembrada para qualquer ficha (NPAC-46); `?aba=` (Fila, Ctrl+K) vence e vira a lembrada.
  const cookie = acCookie('ficha', me.id);
  const salvo = readPrefs(jar.get(cookie)?.value, FICHA_REGRAS);
  // A aba Evolução só para quem a vê (spec §5.1): sem acesso, o link cai na aba padrão.
  const permitida = (a: string | undefined) =>
    a === 'evolucao' && !ficha.pode.verEvolucao ? undefined : a;
  // `?aba=momento` (links de antes da NPAC-76) conta como pedido da aba Pessoas.
  const abaDaUrl =
    permitida(aba) !== undefined && abaValida(aba) === (aba === 'momento' ? 'pessoas' : aba);
  return (
    <Ficha
      key={id}
      ficha={ficha}
      responsaveis={responsaveis}
      abaInicial={abaDaUrl ? abaValida(aba) : abaValida(permitida(salvo.aba))}
      lembrar={{ cookie, valor: writePrefs(salvo, FICHA_REGRAS), abaDaUrl }}
    />
  );
}
