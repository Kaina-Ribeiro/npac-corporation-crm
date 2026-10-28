// Esqueletos de carregamento (loading.tsx). Só formas: o leitor de tela ouve "Carregando…".

export function Bone({ className = '' }: { className?: string }) {
  return <span aria-hidden="true" className={`skeleton block rounded-xl ${className}`} />;
}

/** Título + subtítulo da página. */
export function PageHeadSkeleton({ action = false }: { action?: boolean }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-2">
        <Bone className="h-9 w-56" />
        <Bone className="h-4 w-72 max-w-[70vw]" />
      </div>
      {action && <Bone className="h-11 w-60 rounded-full" />}
    </div>
  );
}

export function CardSkeleton({
  className = '',
  lines = 3,
}: {
  className?: string;
  lines?: number;
}) {
  return (
    <div className={`glass-card flex flex-col gap-3 p-5 ${className}`}>
      <Bone className="h-5 w-40" />
      {Array.from({ length: lines }, (_, i) => (
        <Bone key={i} className={`h-4 ${i % 3 === 2 ? 'w-2/3' : 'w-full'}`} />
      ))}
    </div>
  );
}

/** Linhas de lista (avatar + duas linhas de texto + selo). */
export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="glass-card flex flex-col divide-y divide-line px-5">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 py-4">
          <Bone className="size-9 flex-none rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Bone className="h-4 w-1/2" />
            <Bone className="h-3 w-1/3" />
          </div>
          <Bone className="h-6 w-10 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonPage({ children }: { children: React.ReactNode }) {
  return (
    <div role="status" aria-label="Carregando…" className="mx-auto flex max-w-6xl flex-col gap-5">
      {children}
    </div>
  );
}
