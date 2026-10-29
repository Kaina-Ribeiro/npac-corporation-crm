import type { ReactNode } from 'react';
import { LiquidGold } from './liquid-gold';

/** Fundo dourado, marca e cartão de vidro das telas de entrada (login, pedir acesso). */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="relative flex min-h-dvh items-center overflow-hidden bg-[radial-gradient(60%_60%_at_70%_30%,#5a4210,#0a0805_70%)] text-ink">
      <LiquidGold />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(6,5,3,.86)_0%,rgba(6,5,3,.55)_34%,rgba(6,5,3,.05)_62%,rgba(6,5,3,.25)_100%)] max-md:bg-[linear-gradient(180deg,rgba(6,5,3,.75),rgba(6,5,3,.35)_45%,rgba(6,5,3,.65))]"
      />

      <div className="relative z-10 mx-auto flex w-full max-w-[1440px] flex-col items-center gap-10 px-4 py-10 md:flex-row md:items-center md:justify-between md:px-24">
        <section className="flex flex-col gap-6 text-white md:gap-7">
          <div className="flex items-center gap-3.5">
            <span className="mark h-14 w-14 rounded-2xl text-[31px]">N</span>
            <span>
              <b className="block text-[17px] font-semibold">NPAC Corporation</b>
              <small className="text-sm text-white/60">Área comercial</small>
            </span>
          </div>
          <h1 className="m-0 text-5xl leading-[0.95] font-extrabold tracking-[-0.055em] md:text-[92px]">
            Não paro
            <br />
            até{' '}
            <span className="bg-[linear-gradient(100deg,#b88a2a_0%,#f2d38a_25%,#fff6dc_45%,#f2d38a_60%,#a87818_100%)] bg-clip-text text-transparent">
              conseguir.
            </span>
          </h1>
          <p className="m-0 max-w-[44ch] text-[17px] leading-normal text-white/75 md:text-[19px]">
            O pipeline, a agenda dos closers e cada venda do time em um só lugar.
          </p>
        </section>

        <div className="w-full max-w-[440px] rounded-[32px] bg-white/[.62] p-6 shadow-[inset_0_1.5px_0_#fff,inset_0_0_0_.5px_rgba(255,255,255,.8),0_40px_90px_-30px_rgba(0,0,0,.7)] backdrop-blur-[40px] backdrop-saturate-200 md:p-[34px]">
          {children}
        </div>
      </div>

      <footer className="absolute right-4 bottom-4 left-4 z-10 flex justify-between text-xs text-white/55 md:right-[72px] md:bottom-7 md:left-24">
        <span>Uso restrito à equipe comercial da NPAC</span>
        <span>© 2026 NPAC Corporation</span>
      </footer>
    </main>
  );
}
