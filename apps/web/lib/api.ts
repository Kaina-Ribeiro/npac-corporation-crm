import 'server-only';
import { cookies } from 'next/headers';

const API = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code?: string,
  ) {
    super(`API ${status}${code ? ` ${code}` : ''}`);
  }
}

/** Chamada server-side à API repassando o cookie de sessão do usuário. Nunca em cache. */
export async function apiGet<T>(path: string): Promise<T> {
  const jar = await cookies();
  const res = await fetch(`${API}${path}`, {
    headers: { cookie: jar.toString() },
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { code?: string };
    throw new ApiError(res.status, body.code);
  }
  return (await res.json()) as T;
}
