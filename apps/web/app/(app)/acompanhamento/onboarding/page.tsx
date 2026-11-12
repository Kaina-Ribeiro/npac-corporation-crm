import type { PainelOnboarding } from '@npac/shared/mentoria';
import { readPrefs, writePrefs } from '@npac/shared/screen-prefs';
import { cookies } from 'next/headers';
import { OnboardingFunil } from '@/components/acompanhamento/onboarding-funil';
import { lerEu, podeCadastrar, sessaoDoModulo } from '@/lib/acompanhamento';
import { ONBOARDING_REGRAS, acCookie } from '@/lib/acompanhamento-prefs';
import { apiPost } from '@/lib/api';

export const metadata = { title: 'Onboarding' };

export default async function OnboardingPage() {
  const me = await sessaoDoModulo();
  if (!me) return null;
  // Admin, Acompanhamento e Operação: as mesmas pessoas que cadastram (§3). O menu não sabe do
  // perfil, então a Especialista chega aqui pelo link; a API segue dando 404 a ela.
  if (!podeCadastrar(await lerEu()))
    return (
      <section className="view">
        <h1 className="h1">Onboarding</h1>
        <div className="card vazio">
          <h2>Esta aba é da Operação e do Acompanhamento</h2>
          <p>Seus mentorados e reuniões ficam em Mentorados.</p>
        </div>
      </section>
    );
  const [painel, jar] = await Promise.all([
    apiPost<PainelOnboarding>('/api/mentoria/onboarding/painel', {}),
    cookies(),
  ]);
  // Etapa e painel lembrados (NPAC-46).
  const cookie = acCookie('onboarding', me.id);
  const valor = writePrefs(readPrefs(jar.get(cookie)?.value, ONBOARDING_REGRAS), ONBOARDING_REGRAS);
  return <OnboardingFunil painel={painel} lembrar={{ cookie, valor }} />;
}
