import { SignOutButton } from '@/components/shell/sign-out-button';
import { quietButton } from '@/lib/button';

/**
 * Tela solta de quem entra com o cargo Acompanhamento e ainda não usa o módulo (conta antiga sem
 * perfil, rede de segurança desde os cargos em um passo, ou Mentor até o painel existir, D14). Sem menu e só com utilitários: o layout de `(app)` a importa,
 * e o CSS do módulo não deve pesar no comercial.
 */
export function SemAcesso({ mentor }: { mentor: boolean }) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <section className="glass-card flex w-full max-w-[440px] flex-col items-center gap-2.5 px-6 py-14 text-center">
        <span className="mark size-8 rounded-[9px] text-[17px]">N</span>
        <h1 className="text-xl leading-[26px] font-bold tracking-[-0.025em]">
          {mentor ? 'Seu painel chega em breve' : 'Peça ao Admin para definir seu perfil'}
        </h1>
        <p className="max-w-[380px] text-sm text-ink2">
          {mentor
            ? 'Você já aparece como condutor das reuniões. O painel entra numa próxima etapa do sistema.'
            : 'Seu login funciona, mas falta o perfil no Acompanhamento. A Diretoria ou um Admin do Acompanhamento define isso.'}
        </p>
        <SignOutButton className={quietButton} />
      </section>
    </main>
  );
}
