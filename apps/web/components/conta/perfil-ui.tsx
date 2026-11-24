/** Peças do Meu perfil (NPAC-53), também usadas pela seção do Telegram (NPAC-74). */
export function Icone({ d, className = 'size-4' }: { d: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`flex-none ${className}`}
    >
      <path d={d} />
    </svg>
  );
}

export const ICONE = {
  cadeado: 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z',
  email: 'M3 6h18v12H3zM3 7l9 6 9-6',
  sino: 'M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10 20a2 2 0 0 0 4 0',
  seta: 'M9 6l6 6-6 6',
  alerta: 'M12 8v5M12 16.5v.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
};

/** Erro de um campo: vermelho único (`--danger`), lido pelo leitor de tela. */
export function Erro({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <p
      id={id}
      role="alert"
      className="flex items-start gap-1.5 text-[13px] font-medium text-danger"
    >
      <Icone d={ICONE.alerta} className="mt-px size-4" />
      {children}
    </p>
  );
}

/** Uma seção do perfil: título e explicação à esquerda (desktop), conteúdo à direita. */
export function Secao({
  titulo,
  texto,
  children,
}: {
  titulo: string;
  texto: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={titulo}
      className="glass-card grid gap-3 p-[18px] md:px-7 md:py-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-8 lg:py-[26px]"
    >
      <div>
        <h2 className="text-[15px] font-bold tracking-[-0.01em]">{titulo}</h2>
        <p className="mt-0.5 text-[12.5px] leading-[18px] text-ink2 lg:mt-1.5 lg:text-[13px] lg:leading-[19px]">
          {texto}
        </p>
      </div>
      <div className="flex min-w-0 flex-col gap-4">{children}</div>
    </section>
  );
}

/** Valor só de leitura: texto com ícone, sem caixa de campo (não parece editável). */
export function Valor({ icone, children }: { icone: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2 text-[15px] [overflow-wrap:anywhere]">
      <Icone d={icone} className="size-4 text-ink3" />
      {children}
    </span>
  );
}
