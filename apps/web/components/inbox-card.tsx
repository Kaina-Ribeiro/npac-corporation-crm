'use client';
import Link from 'next/link';
import { Badge, bell, usePending } from './inbox';

/**
 * Cartão "Avisos" da tela Mais. Arquivo à parte: no `inbox.tsx` ele ia no JS de toda tela (o
 * empacotador não separa exportações de um mesmo arquivo; teto do `/leads`).
 */
export function InboxCard() {
  const n = usePending();
  return (
    <Link
      href="/avisos"
      className="glass-card flex min-h-12 items-center gap-3 px-4 text-sm font-medium [&_svg]:size-5"
    >
      {bell}
      <span className="flex-1">Avisos</span>
      <Badge n={n} />
    </Link>
  );
}
