'use client';

/** Requisições com contatos usam corpo, nunca query string ou storage persistente. */
export async function clientApi<T>(path: string, method = 'GET', body?: object): Promise<T> {
  const res = await fetch(path, {
    method,
    cache: 'no-store',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { code?: string };
    if (res.status === 401) {
      window.location.replace('/login');
      throw new Error('Sessão encerrada.');
    }
    if (res.status === 404) throw new Error('Registro indisponível. Atualize a página.');
    if (data.code === 'VERSION_CONFLICT')
      throw new Error(
        'Outra pessoa alterou este registro. Atualize a página antes de tentar novamente.',
      );
    if (data.code === 'DUPLICATE_LEAD') throw new Error('Já existe um lead com este contato.');
    if (data.code === 'ACTIVE_SALE')
      throw new Error('Estorne a venda ativa antes de excluir o lead.');
    if (res.status === 403) throw new Error('Seu acesso não permite esta ação.');
    throw new Error('Não foi possível salvar. Confira os campos e tente novamente.');
  }
  return res.json() as Promise<T>;
}

/** datetime-local deste CRM sempre representa o horário de Brasília (UTC-03). */
export function brasiliaInput(value: string): string | undefined {
  return value ? new Date(`${value}:00-03:00`).toISOString() : undefined;
}
