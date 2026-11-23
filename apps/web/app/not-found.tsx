import { hasCommercialAccess, isLeader } from '@npac/shared/enums';
import { Sidebar } from '@/components/shell/sidebar';
import { SignOutButton } from '@/components/shell/sign-out-button';
import { RoleTag } from '@/components/role-tag';
import { Aviso404 } from '@/components/shell/aviso-404';
import { lerEu, podeCadastrar } from '@/lib/acompanhamento';
import { getSession } from '@/lib/session';

export const metadata = { title: 'Página não encontrada' };

/**
 * 404 do endereço solto (fora de qualquer layout). Logado, mantém a navegação do cargo (o
 * Acompanhamento vê só o módulo) e o caminho para o módulo. Dentro da casca vale `app/(app)/not-found.tsx`.
 */
export default async function NotFound() {
  const me = await getSession().catch(() => null);
  const aviso = <Aviso404 me={me} />;
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
        mentoriaCiclos={podeCadastrar(eu)}
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
