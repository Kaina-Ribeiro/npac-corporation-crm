'use client';

export type DonoUrl = 'pessoa-foto' | 'foto-familia';

const LIMITE = 20 * 1024 * 1024;

/** Envia uma foto (até 20 MB); o servidor confere o tipo pela assinatura e troca a anterior. */
export async function enviarFoto(dono: DonoUrl, donoId: string, arquivo: File): Promise<void> {
  if (arquivo.size > LIMITE) throw new Error('Arquivo acima de 20 MB.');
  const corpo = new FormData();
  corpo.append('arquivo', arquivo);
  const res = await fetch(`/api/mentoria/${dono}/${donoId}/midia`, { method: 'POST', body: corpo });
  if (res.ok) return;
  const data = (await res.json().catch(() => ({}))) as { message?: unknown };
  throw new Error(
    typeof data.message === 'string' ? data.message : 'Não foi possível enviar o arquivo.',
  );
}
