import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

const API = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code?: string,
  ) {
    super(`API ${status}${code ? ` ${code}` : ''}`);
  }
}

async function fail(path: string, res: Response): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as { code?: string };
  if (body.code === 'PASSWORD_CHANGE_REQUIRED') redirect('/conta/senha');
  if (res.status === 401 && path !== '/api/me') redirect('/login');
  throw new ApiError(res.status, body.code);
}

/** Chamada server-side à API repassando o cookie de sessão do usuário. Nunca em cache. */
export async function apiGet<T>(path: string): Promise<T> {
  const jar = await cookies();
  const res = await fetch(`${API}${path}`, {
    headers: { cookie: jar.toString() },
    cache: 'no-store',
  });
  if (!res.ok) {
    return fail(path, res);
  }
  return (await res.json()) as T;
}

export async function apiPost<T>(path: string, body: object): Promise<T> {
  const jar = await cookies();
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { cookie: jar.toString(), 'content-type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (!res.ok) {
    return fail(path, res);
  }
  return res.json() as Promise<T>;
}
