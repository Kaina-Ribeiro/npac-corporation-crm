'use client';

/** Mensagens padrão do Nest (em inglês) e da validação: trocadas pelas nossas. */
const GENERIC_MESSAGES = new Set([
  'Dados inválidos',
  'Bad Request',
  'Forbidden',
  'Conflict',
  'Not Found',
  'Unauthorized',
  'Internal server error',
]);

/** Requisições com contatos usam corpo, nunca query string ou storage persistente. */
export async function clientApi<T>(path: string, method = 'GET', body?: object): Promise<T> {
  const res = await fetch(path, {
    method,
    cache: 'no-store',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { code?: string; message?: unknown };
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
    if (res.status === 429) throw new Error('Muitas tentativas. Aguarde um minuto.');
    // A API explica o motivo em português (ex.: "Este lead já tem uma venda ativa"); mostra.
    if (typeof data.message === 'string' && !GENERIC_MESSAGES.has(data.message))
      throw new Error(data.message);
    if (res.status === 403) throw new Error('Seu acesso não permite esta ação.');
    throw new Error('Não foi possível salvar. Confira os campos e tente novamente.');
  }
  return res.json() as Promise<T>;
}

/** datetime-local deste CRM sempre representa o horário de Brasília (UTC-03). */
export function brasiliaInput(value: string): string | undefined {
  return value ? new Date(`${value}:00-03:00`).toISOString() : undefined;
}
