import type { PmeCicloLinha } from '@npac/shared/mentoria';
import { readPrefs, writePrefs } from '@npac/shared/screen-prefs';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { PmesCiclos } from '@/components/acompanhamento/pmes-ciclos';
import { lerEu, podeCadastrar, sessaoDoModulo } from '@/lib/acompanhamento';
import { acCookie, filtroDasPrefs, PMES_REGRAS } from '@/lib/acompanhamento-prefs';
import { apiPost } from '@/lib/api';

export const metadata = { title: 'PMEs e ciclos' };

/** Aba 7 (E22): Admin, Acompanhamento e Operação; a Especialista e o Mentor não gerem ciclos. */
export default async function PmesPage() {
  const me = await sessaoDoModulo();
  if (!me) return null;
  const [eu, jar] = await Promise.all([lerEu(), cookies()]);
  if (!podeCadastrar(eu)) notFound();
  const cookie = acCookie('pmes', me.id);
  const salvo = readPrefs(jar.get(cookie)?.value, PMES_REGRAS);
  const inicial = filtroDasPrefs(salvo);
  const linhas = await apiPost<PmeCicloLinha[]>('/api/mentoria/pmes-ciclos', inicial);
  return (
    <PmesCiclos
      linhas={linhas}
      inicial={inicial}
      lembrar={{ cookie, valor: writePrefs(salvo, PMES_REGRAS) }}
    />
  );
}
