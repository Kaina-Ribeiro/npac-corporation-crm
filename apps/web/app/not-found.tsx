import Link from 'next/link';
import { hasCommercialAccess, isLeader } from '@npac/shared/enums';
import { Sidebar } from '@/components/shell/sidebar';
import { SignOutButton } from '@/components/shell/sign-out-button';
import { RoleTag } from '@/components/role-tag';
import { lerEu } from '@/lib/acompanhamento';
import { getSession } from '@/lib/session';

export const metadata = { title: 'Página não encontrada' };

/**
 * 404 do app. Logado, mantém a navegação do cargo (o Acompanhamento vê só o módulo) e o caminho
 * para o módulo.
 */
export default async function NotFound() {
  const me = await getSession().catch(() => null);
  const aviso = (
    <section className="glass-card mx-auto mt-10 flex max-w-xl flex-col gap-3 p-6">
      <h1 className="text-xl font-bold tracking-[-0.02em]">
        {me?.role === 'ACOMPANHAMENTO'
          ? 'Esta tela não faz parte do seu acesso.'
          : 'Página não encontrada.'}
      </h1>
      <p className="text-sm text-ink2">
        {me?.modules.mentoria
          ? 'Seu trabalho fica no Acompanhamento de mentorados.'
          : 'O endereço pode estar errado ou a página saiu do ar.'}
      </p>
      <div className="flex flex-wrap gap-2">
        {me?.modules.mentoria ? (
          <Link
            href="/acompanhamento"
            className="rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-[var(--bg)]"
          >
            Ir para o Acompanhamento
          </Link>
        ) : (
          <Link
            href="/"
            className="rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-[var(--bg)]"
          >
            Voltar ao início
          </Link>
        )}
      </div>
    </section>
  );
  if (!me) return <main className="px-4 py-8">{aviso}</main>;
  const eu = me.modules.mentoria ? await lerEu() : null;
  const usaModulo = !!eu && (eu.admin || (!!eu.perfil && eu.perfil !== 'MENTOR'));
  return (
    <div className="flex min-h-dvh">
      <Sidebar
        head={isLeader(me.role)}
        mentoria={usaModulo}
        commercial={hasCommercialAccess(me.role)}
        mentoriaAdmin={eu?.admin}
        footer={
          <div className="flex flex-col gap-2 px-1">
            <b className="truncate text-sm font-semibold">{me.name}</b>
            <RoleTag role={me.role} />
            <SignOutButton />
          </div>
        }
      />
      <main className="flex-1 px-4 pt-6 pb-32 md:px-8">{aviso}</main>
    </div>
  );
}
