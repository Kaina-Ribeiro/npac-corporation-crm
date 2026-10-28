'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { clientApi } from '@/lib/client-api';
import { button, control, FormError, quietButton } from './crm-ui';
import { useCrmRefresh } from './shell/live-updates';

export type Channel = {
  id: string;
  kind: 'GENERAL' | 'DM';
  name: string;
  unread: number;
  lastMessageAt: string | null;
};
export type ChatUser = { id: string; name: string; role: string };
type Message = {
  id: number;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
  lead: { id: string; name: string | null } | null;
  failed?: boolean;
};
type LeadHit = { id: string; name: string };

const time = (at: string) =>
  new Date(at).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

/** Geral + DMs. O stream só avisa que algo mudou; aqui refazemos as consultas autorizadas. */
export function Chat({
  initial,
  users,
  meId,
}: {
  initial: Channel[];
  users: ChatUser[];
  meId: string;
}) {
  const [channels, setChannels] = useState(initial);
  const [active, setActive] = useState<string | null>(initial[0]?.id ?? null);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState<string>();
  const [mention, setMention] = useState<LeadHit | null>(null);
  const [hits, setHits] = useState<LeadHit[]>([]);
  const [query, setQuery] = useState('');
  const bottom = useRef<HTMLDivElement>(null);
  const current = channels.find((c) => c.id === active);

  const loadChannels = useCallback(
    async () => setChannels(await clientApi<Channel[]>('/api/chat/channels')),
    [],
  );
  const loadMessages = useCallback(async (id: string) => {
    const page = await clientApi<{ messages: Message[] }>(`/api/chat/channels/${id}/messages`);
    setMessages((prev) => [...page.messages, ...prev.filter((m) => m.failed)]);
    const last = page.messages.at(-1)?.id;
    if (last) {
      await clientApi(`/api/chat/channels/${id}/read`, 'POST', { lastReadId: last });
      setChannels((list) => list.map((c) => (c.id === id ? { ...c, unread: 0 } : c)));
    }
  }, []);

  useEffect(() => {
    if (active) void loadMessages(active).catch((e: Error) => setError(e.message));
  }, [active, loadMessages]);
  useEffect(() => {
    // Chromium devolve uma Promise aqui; não pode virar o cleanup do efeito.
    void bottom.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);
  useCrmRefresh(async () => {
    await loadChannels();
    if (active) await loadMessages(active);
  });

  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const body = String(new FormData(form).get('body') ?? '').trim();
    if (!body || !active) return;
    const draft: Message = {
      id: -Date.now(),
      authorId: meId,
      authorName: 'Você',
      body,
      createdAt: new Date().toISOString(),
      lead: mention,
    };
    setMessages((m) => [...m, draft]);
    form.reset();
    setMention(null);
    try {
      await clientApi(`/api/chat/channels/${active}/messages`, 'POST', {
        body,
        ...(draft.lead ? { leadId: draft.lead.id } : {}),
      });
      setMessages((m) => m.filter((x) => x.id !== draft.id));
      await loadMessages(active);
    } catch (err) {
      setMessages((m) => m.map((x) => (x.id === draft.id ? { ...x, failed: true } : x)));
      setError((err as Error).message);
    }
  }

  async function searchLeads(text: string) {
    setQuery(text);
    if (text.trim().length < 2) return setHits([]);
    const page = await clientApi<{ items: LeadHit[] }>('/api/leads/search', 'POST', {
      search: text.trim(),
      pageSize: 5,
    }).catch(() => ({ items: [] }));
    setHits(page.items.map(({ id, name }) => ({ id, name })));
  }

  async function startDm(userId: string) {
    if (!userId) return;
    try {
      const { id } = await clientApi<{ id: string }>('/api/chat/dm', 'POST', { userId });
      await loadChannels();
      setActive(id);
      setOpen(true);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <h1 className="mt-1.5 text-[34px] leading-tight font-bold tracking-[-0.04em]">Chat</h1>
      <FormError message={error} />
      <div className="grid gap-4 md:grid-cols-[260px_1fr]">
        <nav
          aria-label="Conversas"
          className={`glass-card flex flex-col gap-1 p-3 ${open ? 'hidden md:flex' : ''}`}
        >
          {channels.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-current={c.id === active ? 'true' : undefined}
              onClick={() => {
                setActive(c.id);
                setOpen(true);
                setMessages([]);
              }}
              className={`flex min-h-12 items-center justify-between rounded-xl px-3 text-left font-semibold ${
                c.id === active ? 'bg-black/5 dark:bg-white/10' : ''
              }`}
            >
              <span>{c.kind === 'GENERAL' ? '# Geral' : c.name}</span>
              {c.unread > 0 && (
                <span
                  aria-label={`${c.unread} não lidas`}
                  className="min-w-6 rounded-full bg-gold px-2 text-center text-xs leading-6 text-black"
                >
                  {c.unread}
                </span>
              )}
            </button>
          ))}
          <label className="mt-3 flex flex-col gap-1 text-xs font-semibold text-ink2">
            Nova conversa
            <select
              className={control}
              value=""
              onChange={(e) => void startDm(e.target.value)}
              aria-label="Nova conversa"
            >
              <option value="">Escolha uma pessoa</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
        </nav>
        <section
          aria-label={current ? `Conversa ${current.name}` : 'Conversa'}
          className={`glass-card flex min-h-[60vh] flex-col p-4 ${open ? '' : 'hidden md:flex'}`}
        >
          <div className="flex items-center gap-2 border-b border-line pb-3">
            <button
              type="button"
              className={`${quietButton} md:hidden`}
              onClick={() => setOpen(false)}
            >
              ‹ Conversas
            </button>
            <h2 className="text-lg font-bold">{current?.name ?? 'Conversa'}</h2>
          </div>
          <ol className="flex flex-1 flex-col gap-3 overflow-y-auto py-3">
            {messages.map((m) => (
              <li
                key={m.id}
                className={`max-w-[85%] rounded-2xl px-3 py-2 ${
                  m.authorId === meId
                    ? 'self-end bg-ink text-[var(--bg)]'
                    : 'self-start bg-black/5 dark:bg-white/10'
                }`}
              >
                <p className="text-xs opacity-70">
                  {m.authorId === meId ? 'Você' : m.authorName} · {time(m.createdAt)}
                </p>
                <p className="break-words whitespace-pre-wrap">{m.body}</p>
                {m.lead &&
                  (m.lead.name ? (
                    <Link href={`/leads/${m.lead.id}`} className="text-sm font-semibold underline">
                      #{m.lead.name}
                    </Link>
                  ) : (
                    <span className="text-sm italic opacity-70">#lead restrito</span>
                  ))}
                {m.failed && <p className="text-xs text-danger">Não enviada</p>}
              </li>
            ))}
            <div ref={bottom} />
          </ol>
          <form onSubmit={send} className="flex flex-col gap-2 border-t border-line pt-3">
            {mention ? (
              <p className="text-sm">
                Mencionando <strong>#{mention.name}</strong>{' '}
                <button type="button" className="underline" onClick={() => setMention(null)}>
                  remover
                </button>
              </p>
            ) : (
              <div className="relative">
                <input
                  className={control}
                  placeholder="#lead — buscar para mencionar"
                  aria-label="Mencionar lead"
                  value={query}
                  autoComplete="off"
                  onChange={(e) => void searchLeads(e.target.value)}
                />
                {hits.length > 0 && (
                  <ul className="glass-card absolute bottom-full z-10 mb-1 w-full p-1">
                    {hits.map((l) => (
                      <li key={l.id}>
                        <button
                          type="button"
                          className="w-full rounded-lg px-3 py-2 text-left hover:bg-black/5"
                          onClick={() => {
                            setMention(l);
                            setHits([]);
                            setQuery('');
                          }}
                        >
                          {l.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <div className="flex gap-2">
              <textarea
                name="body"
                aria-label="Mensagem"
                rows={2}
                maxLength={2000}
                required
                className={`${control} flex-1 resize-none`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    e.currentTarget.form?.requestSubmit();
                  }
                }}
              />
              <button className={button} disabled={!active}>
                Enviar
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
