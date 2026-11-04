'use client';
import type { ModuloImport } from '@/components/acompanhamento/importar-gaveta';

/**
 * Baixa o `.json` de backup do módulo por fetch + blob (download autenticado, D6). O nome do
 * arquivo vem do servidor e leva só módulo e data.
 */
export async function baixarBackup(modulo: ModuloImport): Promise<void> {
  const res = await fetch(`/api/mentoria/${modulo}/exportar.json`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Não foi possível exportar agora. Tente de novo.');
  const nome =
    /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ??
    `acompanhamento-${modulo}.json`;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
