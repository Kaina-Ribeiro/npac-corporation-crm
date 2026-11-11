import type { PainelOnboarding } from '@npac/shared/mentoria';
import { OnboardingFunil } from '@/components/acompanhamento/onboarding-funil';
import { lerEu, podeCadastrar, sessaoDoModulo } from '@/lib/acompanhamento';
import { apiPost } from '@/lib/api';

export const metadata = { title: 'Onboarding' };

export default async function OnboardingPage() {
  if (!(await sessaoDoModulo())) return null;
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
  const painel = await apiPost<PainelOnboarding>('/api/mentoria/onboarding/painel', {});
  return <OnboardingFunil painel={painel} />;
}
