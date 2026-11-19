import type { AccessArea } from '@npac/shared/enums';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { LOGIN_AREA } from './area';
import { LiquidGold } from './liquid-gold';

/**
 * Aparência de cada tela (protótipo "Login da equipe", 18/11/2026): o CRM é noite (ouro sobre o
 * escuro) e o Acompanhamento é dia (marfim com veios dourados, título escuro, cartão mais opaco e
 * campos com contorno dourado: `.auth-dia` em globals.css). As duas ficam iguais no tema escuro.
 */
const LOOK = {
  COMERCIAL: {
    tom: 'noite',
    main: 'bg-[radial-gradient(60%_60%_at_70%_30%,#5a4210,#0a0805_70%)] text-white',
    overlay:
      'bg-[linear-gradient(180deg,rgba(6,5,3,.75),rgba(6,5,3,.35)_45%,rgba(6,5,3,.65))] lg:bg-[linear-gradient(90deg,rgba(6,5,3,.86)_0%,rgba(6,5,3,.55)_34%,rgba(6,5,3,.05)_62%,rgba(6,5,3,.25)_100%)]',
    sub: 'text-white/60',
    frase: 'text-white/75',
    rodape: 'text-white/55',
    outra: 'text-white/70',
    outraForte: 'text-white',
    ouro: 'bg-[linear-gradient(100deg,#b88a2a_0%,#f2d38a_25%,#fff6dc_45%,#f2d38a_60%,#a87818_100%)]',
    cartao:
      'bg-white/[.62] shadow-[inset_0_1.5px_0_#fff,inset_0_0_0_.5px_rgba(255,255,255,.8),0_40px_90px_-30px_rgba(0,0,0,.7)]',
  },
  ACOMPANHAMENTO: {
    tom: 'dia',
    main: 'bg-[#f7f2e8] text-[#232326]',
    overlay:
      'bg-[linear-gradient(180deg,rgba(250,246,238,.9),rgba(250,246,238,.5)_40%,rgba(250,246,238,.82))] lg:bg-[linear-gradient(0deg,rgba(250,246,238,.9),rgba(250,246,238,0)_20%),linear-gradient(90deg,rgba(250,246,238,.94)_0%,rgba(250,246,238,.66)_34%,rgba(250,246,238,.08)_62%,rgba(250,246,238,.3)_100%)]',
    sub: 'text-[#5f5f64]',
    frase: 'text-[#4f4f54]',
    rodape: 'text-[#5f5f64]',
    outra: 'text-[#4f4f54]',
    outraForte: 'text-[#232326]',
    ouro: 'bg-[linear-gradient(100deg,#7a560f_0%,#a8781e_40%,#7a560f_75%,#5e420b_100%)]',
    cartao:
      'auth-dia bg-white/[.76] shadow-[inset_0_1.5px_0_#fff,inset_0_0_0_.5px_rgba(255,255,255,.9),0_0_0_.5px_rgba(122,86,15,.14),0_40px_90px_-34px_rgba(94,66,11,.45)] lg:bg-white/[.74]',
  },
} as const;

/**
 * Fundo animado, marca e cartão de vidro das telas de entrada (login, pedir acesso, esqueci).
 * Celular: título menor e sem a frase, para o formulário caber sem rolar. Até 1023 px tudo fica em
 * coluna; a linha (texto à esquerda, cartão à direita) começa em 1024.
 */
export function AuthShell({
  area = 'COMERCIAL',
  outraTela = false,
  children,
}: {
  area?: AccessArea;
  /** Link para a tela da outra área embaixo do cartão (só nas telas de login). */
  outraTela?: boolean;
  children: ReactNode;
}) {
  const look = LOOK[area];
  const texto = LOGIN_AREA[area];
  return (
    <main
      data-area={area}
      className={`relative flex min-h-dvh flex-col overflow-hidden ${look.main}`}
    >
      <LiquidGold tom={look.tom} />
      <div aria-hidden="true" className={`pointer-events-none absolute inset-0 ${look.overlay}`} />

      <div className="relative z-10 mx-auto flex w-full max-w-[1440px] flex-1 flex-col gap-[18px] px-4 pt-7 pb-5 sm:items-center sm:justify-center sm:gap-10 sm:py-12 lg:flex-row lg:justify-between lg:gap-16 lg:px-12 xl:px-24">
        <section className="flex w-full flex-col gap-[18px] sm:max-w-[440px] sm:gap-6 lg:max-w-[660px] lg:gap-7">
          <div className="flex items-center gap-3 sm:gap-3.5">
            <span className="mark h-11 w-11 rounded-[13px] text-[25px] sm:h-14 sm:w-14 sm:rounded-2xl sm:text-[31px]">
              N
            </span>
            <span>
              <b className="block text-[15px] font-semibold sm:text-[17px]">NPAC Corporation</b>
              <small className={`text-[13px] sm:text-sm ${look.sub}`}>{texto.marca}</small>
            </span>
          </div>
          <h1 className="m-0 text-[40px] leading-none font-extrabold tracking-[-0.05em] sm:text-[64px] sm:leading-[0.95] sm:tracking-[-0.055em] xl:text-[92px]">
            Não paro <br className="max-sm:hidden" />
            até <span className={`${look.ouro} bg-clip-text text-transparent`}>conseguir.</span>
          </h1>
          <p
            className={`m-0 max-w-[44ch] text-[17px] leading-normal max-sm:hidden lg:text-[19px] ${look.frase}`}
          >
            {texto.frase}
          </p>
        </section>

        <div className="flex w-full flex-col items-center gap-3.5 sm:max-w-[440px] lg:flex-none">
          <div
            className={`auth-card w-full rounded-[28px] p-[22px] backdrop-blur-[40px] backdrop-saturate-200 sm:rounded-[32px] sm:p-[34px] ${look.cartao}`}
          >
            {children}
          </div>
          {outraTela && (
            <Link
              href={LOGIN_AREA[texto.outra.area].base}
              className={`inline-flex min-h-11 items-center gap-1.5 text-sm underline-offset-2 hover:underline ${look.outra}`}
            >
              {texto.outra.pergunta}{' '}
              <b className={`font-semibold ${look.outraForte}`}>{texto.outra.acao} →</b>
            </Link>
          )}
        </div>
      </div>

      <footer
        className={`relative z-10 flex justify-between gap-4 px-4 pb-4 text-xs lg:absolute lg:right-[72px] lg:bottom-7 lg:left-12 lg:p-0 xl:left-24 ${look.rodape}`}
      >
        <span>Uso restrito à equipe da NPAC</span>
        <span>© 2026 NPAC Corporation</span>
      </footer>
    </main>
  );
}
