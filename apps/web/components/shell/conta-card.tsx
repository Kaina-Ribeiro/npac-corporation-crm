import Link from 'next/link';
import { Avatar, AVATAR_EU } from '@/components/avatar';
import type { Me } from '@/lib/session';
import { SignOutButton } from './sign-out-button';
import { VersaoRodape } from './versao-rodape';

// Classes só do Tailwind (sem `.btn`): o módulo redefine `.btn` sob `.ac` e o cartão tem de sair
// igual nos dois Mais.
const ACAO =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-[background-color,scale] duration-150 active:scale-[.97] [&_svg]:size-[18px] [&_svg]:flex-none';

function Icone({ d }: { d: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

/**
 * Sua conta no celular, no topo do Mais do CRM e do Mais do Acompanhamento: o mesmo bloco do
 * rodapé da sidebar (foto, nome, cargo, Meu perfil, Sair), sempre à vista sem rolar. Foto e nome
 * também abrem o Meu perfil (NPAC-53). `children` = etiquetas do cargo, que cada Mais monta.
 */
export function ContaCard({
  me,
  titulo = false,
  children,
}: {
  /** Nome, foto e o que a linha da versão usa (NPAC-77). */
  me: Pick<Me, 'name' | 'photo' | 'versao' | 'novidadesVista' | 'mestre' | 'areas'>;
  /** h1 quando a tela não tem outro título (Mais do CRM). */
  titulo?: boolean;
  children: React.ReactNode;
}) {
  const Nome = titulo ? 'h1' : 'h2';
  const { name: nome, photo: foto } = me;
  return (
    <section aria-label="Sua conta" className="glass-card flex flex-col gap-4 p-4">
      <div className="flex items-center gap-3.5">
        <Link href="/conta/perfil" aria-label={`Meu perfil, ${nome}`} className="rounded-full">
          <Avatar
            name={nome}
            photo={foto}
            className={`${AVATAR_EU} size-14 text-xl font-bold shadow-[inset_0_1px_0_rgba(255,255,255,.28),0_10px_24px_-10px_rgba(30,158,112,.6)]`}
          />
        </Link>
        <div className="min-w-0">
          <Nome className="truncate text-xl leading-7 font-bold tracking-[-0.02em]">
            <Link href="/conta/perfil" className="hover:underline">
              {nome}
            </Link>
          </Nome>
          <div className="mt-1 flex flex-wrap gap-1.5">{children}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Link
          href="/conta/perfil"
          className={`${ACAO} bg-white/60 text-ink shadow-[inset_0_0_0_1px_var(--line)] hover:bg-black/5 dark:bg-white/[0.06] dark:hover:bg-white/10`}
        >
          <Icone d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0" />
          Meu perfil
        </Link>
        <SignOutButton
          className={`${ACAO} text-danger shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--danger)_40%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]`}
        >
          <Icone d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" />
          Sair
        </SignOutButton>
      </div>
      <VersaoRodape me={me} variante="mais" />
    </section>
  );
}
