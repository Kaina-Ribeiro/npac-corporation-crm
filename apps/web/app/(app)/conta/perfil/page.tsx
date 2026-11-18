import { hasCommercialAccess } from '@npac/shared/enums';
import type { ProfileDTO } from '@npac/shared/profile';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AbasMobile } from '@/components/acompanhamento/abas-mobile';
import { Perfil } from '@/components/conta/perfil';
import { RoleTag } from '@/components/role-tag';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Meu perfil' };

/** Meu perfil (NPAC-53): a própria foto, nome, e-mail e senha, para todos os cargos. */
export default async function MeuPerfilPage() {
  const me = await getSession();
  if (!me) redirect('/login');
  const commercial = hasCommercialAccess(me.role);
  const profile = await apiGet<ProfileDTO>('/api/me/profile');
  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-col gap-4">
      <div className="mb-1">
        {/* Celular: volta ao Mais de quem abriu (o do CRM ou o do módulo). */}
        <Link
          href={commercial ? '/mais' : '/acompanhamento/mais'}
          className="-ml-1.5 inline-flex min-h-11 items-center gap-0.5 text-[15px] font-semibold text-ink2 hover:text-ink md:hidden"
        >
          <svg
            viewBox="0 0 24 24"
            className="size-[18px]"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M15 6l-6 6 6 6" />
          </svg>
          Mais
        </Link>
        <h1 className="mt-1.5 text-[34px] leading-tight font-bold tracking-[-0.04em]">
          Meu perfil
        </h1>
        <p className="text-sm text-ink2">Sua foto e seu nome aparecem para a equipe.</p>
      </div>
      <Perfil profile={profile} cargo={<RoleTag role={me.role} />} />
      {/* O cargo Acompanhamento não tem a barra do CRM: as abas do módulo, como no Mais dele. */}
      {!commercial && <AbasMobile />}
    </div>
  );
}
