import type { FastifyRequest } from 'fastify';

/** Headers web a partir da requisição Fastify; o IP do cliente é o que o Fastify resolveu. */
export function toHeaders(req: FastifyRequest): Headers {
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) v.forEach((item) => headers.append(k, item));
    else headers.set(k, String(v));
  }
  headers.set('x-forwarded-for', req.ip);
  return headers;
}
