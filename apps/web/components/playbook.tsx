'use client';
import { useMemo, useState, type FormEvent } from 'react';
import { keep, recall } from '@/lib/screen-memory';
import { clientApi } from '@/lib/client-api';
import { button, control, Field, FormError, quietButton } from './crm-ui';

export type Script = { id: string; topic: string; title: string; body: string; version: number };

const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/** Scripts de objeção: busca local (conteúdo não é pessoal), copiar e edição pelos HEADs. */
export function Playbook({
  initial,
  head,
  memoryKey,
}: {
  initial: Script[];
  head: boolean;
  /** Chave da busca na memória da aba (NPAC-46): volta ao trocar de tela, some no F5. */
  memoryKey: string;
}) {
  const [scripts, setScripts] = useState(initial);
  // Navegação no app renderiza só no navegador; no F5 a memória está vazia (sem divergir do HTML).
  const [query, setQueryState] = useState(() => recall<string>(memoryKey) ?? '');
  const setQuery = (q: string) => {
    setQueryState(q);
    keep(memoryKey, q || undefined);
  };
  const [editing, setEditing] = useState<Script | 'new' | null>(null);
  const [error, setError] = useState<string>();
  const [copied, setCopied] = useState<string>();

  const topics = useMemo(() => {
    const q = normalize(query.trim());
    const hit = scripts.filter(
      (s) => !q || normalize(`${s.topic} ${s.title} ${s.body}`).includes(q),
    );
    return [...new Set(hit.map((s) => s.topic))].map((t) => ({
      topic: t,
      items: hit.filter((s) => s.topic === t),
    }));
  }, [scripts, query]);

  const reload = async () => setScripts(await clientApi<Script[]>('/api/playbook'));

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const data = {
      topic: String(f.get('topic') ?? ''),
      title: String(f.get('title') ?? ''),
      body: String(f.get('body') ?? ''),
    };
    try {
      if (editing === 'new') await clientApi('/api/playbook', 'POST', data);
      else if (editing)
        await clientApi(`/api/playbook/${editing.id}`, 'PATCH', {
          ...data,
          version: editing.version,
        });
      setEditing(null);
      setError(undefined);
      await reload();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function remove(s: Script) {
    if (!window.confirm(`Excluir "${s.title}"?`)) return;
    try {
      await clientApi(`/api/playbook/${s.id}`, 'DELETE', { version: s.version });
      await reload();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="flex w-full flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="mt-1.5 text-[34px] leading-tight font-bold tracking-[-0.04em]">Playbook</h1>
        {head && (
          <button type="button" className={button} onClick={() => setEditing('new')}>
            Novo script
          </button>
        )}
      </div>
      <input
        type="search"
        className={`${control} max-w-xl`}
        placeholder="Buscar objeção ou palavra"
        aria-label="Buscar no playbook"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <FormError message={error} />
      {editing && (
        <form
          onSubmit={save}
          className="glass-card flex w-full max-w-3xl flex-col gap-3 p-5"
          aria-label="Editar script"
        >
          <Field label="Tema">
            <input
              name="topic"
              className={control}
              required
              maxLength={80}
              defaultValue={editing === 'new' ? '' : editing.topic}
            />
          </Field>
          <Field label="Objeção">
            <input
              name="title"
              className={control}
              required
              maxLength={200}
              defaultValue={editing === 'new' ? '' : editing.title}
            />
          </Field>
          <Field label="Resposta">
            <textarea
              name="body"
              rows={5}
              className={control}
              required
              maxLength={10000}
              defaultValue={editing === 'new' ? '' : editing.body}
            />
          </Field>
          <div className="flex gap-2">
            <button className={button}>Salvar</button>
            <button type="button" className={quietButton} onClick={() => setEditing(null)}>
              Cancelar
            </button>
          </div>
        </form>
      )}
      {topics.length === 0 && <p className="text-sm text-ink2">Nada encontrado.</p>}
      {/* Um tema por coluna nas telas largas: a leitura de cada resposta fica estreita. */}
      <div className="grid items-start gap-x-5 gap-y-6 lg:grid-cols-2 3xl:grid-cols-3 4xl:grid-cols-4">
        {topics.map(({ topic, items }) => (
          <section key={topic} className="flex min-w-0 flex-col gap-3">
            <h2 className="text-lg font-bold tracking-[-0.03em]">{topic}</h2>
            {items.map((s) => (
              <article key={s.id} className="glass-card flex flex-col gap-2 p-5">
                <h3 className="font-semibold">“{s.title}”</h3>
                <p className="text-[15px] whitespace-pre-wrap text-ink2">{s.body}</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={quietButton}
                    onClick={async () => {
                      await navigator.clipboard.writeText(s.body).catch(() => {});
                      setCopied(s.id);
                    }}
                  >
                    {copied === s.id ? 'Copiado' : 'Copiar'}
                  </button>
                  {head && (
                    <>
                      <button type="button" className={quietButton} onClick={() => setEditing(s)}>
                        Editar
                      </button>
                      <button type="button" className={quietButton} onClick={() => void remove(s)}>
                        Excluir
                      </button>
                    </>
                  )}
                </div>
              </article>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
