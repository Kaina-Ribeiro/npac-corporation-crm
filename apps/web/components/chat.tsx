'use client';
import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from 'react';
import { readPrefs, writePrefs } from '@npac/shared/screen-prefs';
import { rememberPrefs } from '@/lib/screen-prefs';
import { useLatestPrefs } from '@/lib/use-latest-prefs';
import { clientApi } from '@/lib/client-api';
import { agrupar, hora, quandoNaLista } from '@/lib/chat-format';
import { FormError } from './crm-ui';
import { useCrmRefresh } from './shell/live-updates';
import { Avatar, AVATAR_OUTRO, SEM_FOTOS, type TeamPhotos } from './avatar';
import { PushInvite } from './push-invite';
import { NovaConversa, type ChatUser } from './chat-nova';
import {
  icBusca,
  icCadeado,
  icEscrever,
  icHash,
  icRelogio,
  icSeta,
  icSubir,
  icVoltar,
  icX,
} from './chat-icons';

export type { ChatUser };
export type Channel = {
  id: string;
  kind: 'GENERAL' | 'DM';
  name: string;
  unread: number;
  lastMessageAt: string | null;
  /** Começo da última mensagem (decisão 2A), só das conversas que a pessoa lê. */
  lastMessage?: { authorId: string; authorName: string; text: string } | null;
};
type Message = {
  id: number;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
  lead: { id: string; name: string | null } | null;
  failed?: boolean;
  /** Rascunho já gravado: o ID que a API devolveu (sai quando a mensagem real chega). */
  gravada?: number;
};
type LeadHit = { id: string; name: string };
type Pagina = { messages: Message[]; hasMore: boolean };

/** A partir daqui (o `md` do Tailwind) a lista e a conversa ficam lado a lado. */
const LADO_A_LADO = '(min-width: 48rem)';
const aoMudarLargura = (avisar: () => void) => {
  const media = window.matchMedia(LADO_A_LADO);
  media.addEventListener('change', avisar);
  return () => media.removeEventListener('change', avisar);
};
const ladoALado = () => window.matchMedia(LADO_A_LADO).matches;

/**
 * Marca do passo do histórico da conversa aberta no celular: o "voltar" do aparelho (gesto do
 * iPhone, botão do Android) fecha a conversa em vez de sair do Chat. Mesmo endereço, sem o canal.
 */
const PASSO_CONVERSA = 'npacChatConversa';
const noPassoDaConversa = () =>
  !!(window.history.state as Record<string, unknown> | null)?.[PASSO_CONVERSA];

/**
 * Rascunhos que ficam ao chegar a página do servidor: os que falharam, os que ainda estão indo e os
 * gravados que a página ainda não trouxe. Assim a mensagem enviada nunca some e volta.
 */
const rascunhosQueFicam = (prev: Message[], page: Message[]) =>
  prev.filter(
    (m) =>
      m.id < 0 && (m.failed || m.gravada === undefined || !page.some((p) => p.id === m.gravada)),
  );

/** Horário da mensagem mais nova da página: o mesmo valor que a lista traz em `lastMessageAt`. */
const maisNova = (list: Message[]) =>
  list.reduce<string | null>((at, m) => (at && at > m.createdAt ? at : m.createdAt), null);

/** Distância do fim (px) em que a conversa ainda "acompanha" as mensagens novas. */
const PERTO_DO_FIM = 120;
const VAZIA: Pagina = { messages: [], hasMore: false };

/** Trecho digitado em negrito no nome do lead (busca de menção). */
function destacar(nome: string, termo: string) {
  const i = termo ? nome.toLowerCase().indexOf(termo.toLowerCase()) : -1;
  if (i < 0) return nome;
  return (
    <>
      {nome.slice(0, i)}
      <mark>{nome.slice(i, i + termo.length)}</mark>
      {nome.slice(i + termo.length)}
    </>
  );
}

/**
 * Tocar num botão da cápsula ou da busca não tira o foco do campo: o teclado do celular fica
 * aberto e a cápsula não pula antes de o toque terminar (como no iMessage).
 */
const manterFoco = (e: { preventDefault: () => void }) => e.preventDefault();

/** Ícone do canal Geral e da menção: tinta com o # dourado. */
const Canal = ({ className = '' }: { className?: string }) => (
  <span aria-hidden="true" className={`ch-canal ${className}`}>
    #
  </span>
);

/**
 * Chat, redesign A1 (24/11/2026): Geral + DMs, com a cara do iMessage (CSS em
 * `app/(app)/(comercial)/chat/chat.css`). O stream só avisa que algo mudou; aqui refazemos as
 * consultas autorizadas.
 *
 * NPAC-72: a conversa só carrega e só marca como lida quando está na tela (no celular a lista e a
 * conversa são telas separadas). O aviso ao vivo vale para qualquer escrita do CRM, então ele
 * confere a lista de conversas e só busca as mensagens se a conversa aberta mudou.
 */
export function Chat({
  initial,
  users,
  meId,
  prefs,
  initialActive,
  photos = SEM_FOTOS,
}: {
  initial: Channel[];
  users: ChatUser[];
  meId: string;
  /** Conversa lembrada (NPAC-46): cookie da pessoa e o valor que o servidor usou. */
  prefs: { cookie: string; value: string };
  initialActive?: string;
  /** Fotos da equipe (NPAC-53): autores das mensagens e a pessoa de cada conversa. */
  photos?: TeamPhotos;
}) {
  const [channels, setChannels] = useState(initial);
  const [active, setActiveState] = useState<string | null>(initialActive ?? initial[0]?.id ?? null);
  /** Abre a conversa e lembra dela no aparelho (só o ID do canal). */
  const setActive = useCallback(
    (id: string) => {
      setActiveState(id);
      rememberPrefs('chat', prefs.cookie, writePrefs({ c: id }, { c: (v) => !!v }));
    },
    [prefs.cookie],
  );
  // Voltar do navegador reaproveita a página antiga: o cookie tem a conversa mais recente.
  // O Next pode reaproveitar a lista de canais do prefetch (sem uma DM nova): confere com a API.
  useLatestPrefs(prefs.cookie, prefs.value, (saved) => {
    const { c } = readPrefs(saved, { c: (v) => v.length <= 64 });
    if (!c) return;
    if (initial.some((ch) => ch.id === c)) setActiveState(c);
    else
      void clientApi<Channel[]>('/api/chat/channels')
        .then((list) => {
          setChannels(list);
          if (list.some((ch) => ch.id === c)) setActiveState(c);
        })
        .catch(() => undefined);
  });
  const [open, setOpen] = useState(false);
  const [pagina, setPagina] = useState<Pagina>(VAZIA);
  const messages = pagina.messages;
  const [carregandoAntigas, setCarregandoAntigas] = useState(false);
  const [error, setError] = useState<string>();
  const [texto, setTexto] = useState('');
  const [mention, setMention] = useState<LeadHit | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [hits, setHits] = useState<LeadHit[]>([]);
  const [query, setQuery] = useState('');
  const [foco, setFoco] = useState(0);
  const [searchNote, setSearchNote] = useState('');
  const [nova, setNova] = useState(false);
  const searchSeq = useRef(0);
  const conv = useRef<HTMLElement>(null);
  const rola = useRef<HTMLDivElement>(null);
  const escreve = useRef<HTMLFormElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  const antigas = useRef<HTMLButtonElement>(null);
  const current = channels.find((c) => c.id === active);

  // No celular a conversa só está na tela depois do toque; no computador, sempre.
  const largo = useSyncExternalStore(aoMudarLargura, ladoALado, () => false);
  const naTela = largo || open;
  /** Estado mais recente para o que roda depois de um `await`. */
  const agora = useRef({ active, channels, pagina });
  useEffect(() => {
    agora.current = { active, channels, pagina };
  });
  /** Por conversa: horário da mensagem mais nova já mostrada. */
  const vistoAte = useRef<Record<string, string | null>>({});
  /** A rolagem está no fim (segue as mensagens novas). */
  const colado = useRef(true);
  /** Antes de pôr as antigas em cima: quanto faltava para o fim (a tela não pula). */
  const restaurar = useRef<number | null>(null);
  const ultima = useRef<number | null>(null);
  /** Fechou a busca de menção: o foco volta para a caixa de texto. */
  const focarCampo = useRef(false);
  useLayoutEffect(() => {
    if (buscando || !focarCampo.current) return;
    focarCampo.current = false;
    campo.current?.focus();
  }, [buscando]);

  /** Abre a conversa; no celular, ganha um passo no histórico para o "voltar" do aparelho. */
  const abrirConversa = () => {
    setOpen(true);
    if (!ladoALado() && !noPassoDaConversa())
      window.history.pushState({ [PASSO_CONVERSA]: true }, '');
  };
  /** Botão de voltar da tela: desfaz o passo (o `popstate` fecha) ou só fecha. */
  const fecharConversa = () => {
    if (noPassoDaConversa()) window.history.back();
    else setOpen(false);
  };
  useEffect(() => {
    // Voltou para o Chat pelo histórico no passo da conversa: ela reabre (no celular).
    if (noPassoDaConversa() && !ladoALado()) setOpen(true);
    const aoVoltar = () => setOpen(noPassoDaConversa());
    window.addEventListener('popstate', aoVoltar);
    return () => window.removeEventListener('popstate', aoVoltar);
  }, []);

  const loadChannels = useCallback(async () => {
    const list = await clientApi<Channel[]>('/api/chat/channels');
    setChannels(list);
    return list;
  }, []);
  /** `marcar`: há não lidas nesta conversa, então grava o "lido até" (só com ela na tela). */
  const loadMessages = useCallback(async (id: string, marcar: boolean) => {
    const page = await clientApi<Pagina>(`/api/chat/channels/${id}/messages`);
    // Resposta de uma conversa que a pessoa já trocou não entra na que está aberta.
    if (agora.current.active !== id) return;
    setPagina((prev) => {
      // As antigas já carregadas ao rolar ficam; a página traz as 50 mais novas.
      const primeira = page.messages[0]?.id;
      const antes = primeira
        ? prev.messages.filter((m) => m.id > 0 && !m.failed && m.id < primeira)
        : [];
      return {
        messages: [...antes, ...page.messages, ...rascunhosQueFicam(prev.messages, page.messages)],
        hasMore: antes.length ? prev.hasMore : page.hasMore,
      };
    });
    vistoAte.current[id] = maisNova(page.messages);
    const last = page.messages.at(-1)?.id;
    if (marcar && last) {
      await clientApi(`/api/chat/channels/${id}/read`, 'POST', { lastReadId: last });
      setChannels((list) => list.map((c) => (c.id === id ? { ...c, unread: 0 } : c)));
    }
  }, []);

  /** Decisão 1A: as anteriores chegam sozinhas ao rolar até o topo, sem a tela pular. */
  const carregarAntigas = useCallback(async () => {
    const { active: id, pagina: atual } = agora.current;
    const primeira = atual.messages.find((m) => m.id > 0)?.id;
    if (!id || !atual.hasMore || !primeira || carregandoAntigas) return;
    setCarregandoAntigas(true);
    try {
      const page = await clientApi<Pagina>(`/api/chat/channels/${id}/messages?before=${primeira}`);
      if (agora.current.active !== id) return;
      const el = rola.current;
      if (el) restaurar.current = el.scrollHeight - el.scrollTop;
      setPagina((prev) => ({
        messages: [...page.messages.filter((m) => m.id < primeira), ...prev.messages],
        hasMore: page.hasMore,
      }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCarregandoAntigas(false);
    }
  }, [carregandoAntigas]);

  useEffect(() => {
    if (!active || !naTela) return;
    colado.current = true;
    const unread = agora.current.channels.find((c) => c.id === active)?.unread ?? 0;
    void loadMessages(active, unread > 0).catch((e: Error) => setError(e.message));
  }, [active, naTela, loadMessages]);

  // Rolagem: antigas em cima mantêm o ponto de leitura; mensagem nova desce ao fim se a pessoa
  // estava no fim ou se é dela.
  useLayoutEffect(() => {
    const el = rola.current;
    if (!el) return;
    if (restaurar.current !== null) {
      el.scrollTop = el.scrollHeight - restaurar.current;
      restaurar.current = null;
      return;
    }
    const nova = messages.at(-1);
    if ((nova?.id ?? null) === ultima.current) return;
    ultima.current = nova?.id ?? null;
    if (colado.current || nova?.authorId === meId) el.scrollTop = el.scrollHeight;
  }, [messages, meId]);

  // O botão "Ver mensagens anteriores" é a marca do topo: visível na rolagem, carrega.
  useEffect(() => {
    const alvo = antigas.current;
    if (!alvo || !pagina.hasMore || !naTela) return;
    const obs = new IntersectionObserver(
      (vistos) => {
        if (vistos.some((v) => v.isIntersecting)) void carregarAntigas();
      },
      { root: rola.current, rootMargin: '240px 0px 0px 0px' },
    );
    obs.observe(alvo);
    return () => obs.disconnect();
  }, [pagina.hasMore, naTela, carregarAntigas]);

  // Altura da caixa de escrever (cresce com o texto e a menção): o fim da lista fica acima dela.
  useEffect(() => {
    const form = escreve.current;
    const pane = conv.current;
    if (!form || !pane) return;
    const obs = new ResizeObserver(() => {
      pane.style.setProperty('--ch-escreve', `${form.offsetHeight}px`);
      if (colado.current && rola.current) rola.current.scrollTop = rola.current.scrollHeight;
    });
    obs.observe(form);
    return () => obs.disconnect();
  }, [naTela]);

  // Celular com o teclado aberto: a conversa ocupa só a área visível (iPhone não encolhe a tela).
  useEffect(() => {
    const vv = window.visualViewport;
    const pane = conv.current;
    if (largo || !open || !vv || !pane) return;
    const ajustar = () => {
      pane.style.top = `${vv.offsetTop}px`;
      pane.style.height = `${vv.height}px`;
      pane.style.bottom = 'auto';
      if (colado.current && rola.current) rola.current.scrollTop = rola.current.scrollHeight;
    };
    ajustar();
    vv.addEventListener('resize', ajustar);
    vv.addEventListener('scroll', ajustar);
    return () => {
      vv.removeEventListener('resize', ajustar);
      vv.removeEventListener('scroll', ajustar);
      pane.style.removeProperty('top');
      pane.style.removeProperty('height');
      pane.style.removeProperty('bottom');
    };
  }, [largo, open]);

  useCrmRefresh(async () => {
    const list = await loadChannels();
    if (!active || !naTela) return;
    const atual = list.find((c) => c.id === active);
    // Sem não lidas e com a mesma mensagem mais nova: a escrita foi em outro lugar do CRM.
    if (!atual || (atual.unread === 0 && atual.lastMessageAt === vistoAte.current[active])) return;
    await loadMessages(active, atual.unread > 0);
  });

  /** Caixa de texto de uma linha que cresce ao digitar (até ~6 linhas). */
  const ajustarAltura = () => {
    const el = campo.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  };

  async function send(e?: FormEvent<HTMLFormElement>) {
    e?.preventDefault();
    const body = texto.trim();
    if (!body || !active) return;
    const draft: Message = {
      id: -Date.now(),
      authorId: meId,
      authorName: 'Você',
      body,
      createdAt: new Date().toISOString(),
      lead: mention,
    };
    setPagina((p) => ({ ...p, messages: [...p.messages, draft] }));
    setTexto('');
    setMention(null);
    requestAnimationFrame(ajustarAltura);
    try {
      const { id } = await clientApi<{ id: number }>(
        `/api/chat/channels/${active}/messages`,
        'POST',
        {
          body,
          ...(draft.lead ? { leadId: draft.lead.id } : {}),
        },
      );
      // O rascunho fica na tela até a mensagem real chegar e tomar o lugar dele, na mesma troca
      // (antes ele saía aqui e a mensagem sumia até a busca voltar).
      setPagina((p) => ({
        ...p,
        messages: p.messages.map((x) => (x.id === draft.id ? { ...x, gravada: id } : x)),
      }));
      // O envio já grava o "lido até" no servidor.
      await loadMessages(active, false);
    } catch (err) {
      setPagina((p) => ({
        ...p,
        messages: p.messages.map((x) => (x.id === draft.id ? { ...x, failed: true } : x)),
      }));
      setError((err as Error).message);
    }
  }

  async function searchLeads(text: string) {
    setQuery(text);
    setFoco(0);
    // O campo aceita "#lead": o # é só a marca da menção, não faz parte do nome.
    const term = text.trim().replace(/^#+/, '').trim();
    const seq = ++searchSeq.current;
    if (term.length < 2) {
      setHits([]);
      setSearchNote('');
      return;
    }
    try {
      const page = await clientApi<{ items: LeadHit[] }>('/api/leads/search', 'POST', {
        search: term,
        pageSize: 5,
      });
      // Resposta de uma digitação antiga não apaga a mais recente.
      if (seq !== searchSeq.current) return;
      setHits(page.items.map(({ id, name }) => ({ id, name })));
      setSearchNote(page.items.length ? '' : 'Nenhum lead encontrado');
    } catch (err) {
      if (seq !== searchSeq.current) return;
      setHits([]);
      setSearchNote((err as Error).message);
    }
  }

  function fecharBusca() {
    searchSeq.current++;
    setBuscando(false);
    setQuery('');
    setHits([]);
    setSearchNote('');
    focarCampo.current = true;
  }
  function mencionar(l: LeadHit) {
    setMention(l);
    fecharBusca();
  }

  async function startDm(userId: string) {
    try {
      const { id } = await clientApi<{ id: string }>('/api/chat/dm', 'POST', { userId });
      await loadChannels();
      if (id !== active) setPagina(VAZIA);
      setActive(id);
      abrirConversa();
      setNova(false);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const termo = query.trim().replace(/^#+/, '').trim();
  const dias = agrupar(messages);
  const geral = current?.kind === 'GENERAL';
  const fotoConversa = current && !geral ? photos.names[current.name] : undefined;

  return (
    <div className="ch" data-conversa={open || undefined}>
      <section className="ch-lista" aria-label="Lista de conversas">
        <div className="ch-topo">
          <h1>Chat</h1>
          <button
            type="button"
            className="ch-circ ch-vidro"
            aria-label="Nova conversa"
            onClick={() => setNova(true)}
          >
            {icEscrever}
          </button>
        </div>
        <div className="ch-rolalista">
          <PushInvite variante="chat" className="ch-convite" />
          {!naTela && <FormError message={error} />}
          <nav aria-label="Conversas" className="ch-linhas">
            {channels.map((c) => {
              const ult = c.lastMessage;
              const autor = !ult
                ? ''
                : ult.authorId === meId
                  ? 'Você: '
                  : c.kind === 'GENERAL'
                    ? `${ult.authorName}: `
                    : '';
              return (
                <button
                  key={c.id}
                  type="button"
                  className="ch-linha"
                  data-nova={c.unread > 0 || undefined}
                  aria-current={c.id === active && largo ? 'true' : undefined}
                  onClick={() => {
                    // Só esvazia ao trocar de conversa: a mesma conversa não é buscada de novo
                    // pela troca, e ficava vazia no celular.
                    if (c.id !== active) setPagina(VAZIA);
                    setActive(c.id);
                    abrirConversa();
                  }}
                >
                  {c.kind === 'GENERAL' ? (
                    <Canal />
                  ) : (
                    <Avatar
                      name={c.name}
                      photo={photos.names[c.name]}
                      className={`${AVATAR_OUTRO} ch-av`}
                    />
                  )}
                  <span className="ch-meio">
                    <span className="ch-l1">
                      <span className="ch-nm">{c.name}</span>
                      {c.lastMessageAt && (
                        <span className="ch-qd">{quandoNaLista(c.lastMessageAt)}</span>
                      )}
                      {icSeta}
                    </span>
                    {(ult || c.unread > 0) && (
                      <span className="ch-l2">
                        <span className="ch-pv">
                          {autor}
                          {ult?.text}
                        </span>
                        {c.unread > 0 && (
                          <span className="ch-selo" aria-label={`${c.unread} não lidas`}>
                            {c.unread}
                          </span>
                        )}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </nav>
        </div>
      </section>

      <section
        ref={conv}
        className="ch-conv"
        data-own-motion
        aria-label={current ? `Conversa ${current.name}` : 'Conversa'}
      >
        <div
          ref={rola}
          className="ch-rola"
          onScroll={(e) => {
            const el = e.currentTarget;
            colado.current = el.scrollHeight - el.scrollTop - el.clientHeight < PERTO_DO_FIM;
          }}
        >
          <div className="ch-coluna">
            {pagina.hasMore && (
              <button
                ref={antigas}
                type="button"
                className="ch-antigas"
                aria-busy={carregandoAntigas}
                onClick={() => void carregarAntigas()}
              >
                {icRelogio}
                Ver mensagens anteriores
              </button>
            )}
            {dias.map((d) => (
              <div key={d.chave} className="contents">
                <p className="ch-dia">{d.rotulo}</p>
                {d.grupos.map((g) => {
                  const eu = g.autorId === meId;
                  const fim = g.mensagens.at(-1)!;
                  return (
                    <div key={g.mensagens[0]!.id} className="ch-grupo" data-eu={eu || undefined}>
                      {!eu && (
                        <Avatar
                          name={g.autor}
                          photo={photos.photos[g.autorId]}
                          className={`${AVATAR_OUTRO} ch-av`}
                        />
                      )}
                      <div className="ch-col">
                        {!eu && geral && <span className="ch-autor">{g.autor}</span>}
                        <ol>
                          {g.mensagens.map((m, i) => (
                            <li
                              key={m.id}
                              className={`ch-b ${i === g.mensagens.length - 1 ? 'cauda' : ''}`}
                            >
                              {m.body}
                              {m.lead &&
                                (m.lead.name ? (
                                  <Link href={`/leads/${m.lead.id}`} className="ch-cartao">
                                    <Canal />
                                    <span className="ch-tx">
                                      <b>{m.lead.name}</b>
                                      <span>Abrir ficha</span>
                                    </span>
                                    {icSeta}
                                  </Link>
                                ) : (
                                  <span className="ch-cartao restrito">
                                    <span aria-hidden="true" className="ch-canal">
                                      {icCadeado}
                                    </span>
                                    <span className="ch-tx">
                                      <b>lead restrito</b>
                                    </span>
                                  </span>
                                ))}
                            </li>
                          ))}
                        </ol>
                        {fim.failed ? (
                          <p className="ch-falhou">Não enviada</p>
                        ) : (
                          <span className="ch-hora">{hora(fim.createdAt)}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
            {naTela && <FormError message={error} />}
          </div>
        </div>
        <div aria-hidden="true" className="ch-borda topo" />
        <div aria-hidden="true" className="ch-borda base" />

        <header className="ch-cab">
          <button
            type="button"
            className="ch-circ ch-vidro ch-voltar"
            aria-label="Conversas"
            onClick={fecharConversa}
          >
            {icVoltar}
          </button>
          {/* Celular: foto em cima e o nome numa pílula de vidro; tablet e computador: uma pílula só. */}
          <div className="ch-quem ch-vidro">
            {geral ? (
              <Canal />
            ) : (
              current && (
                <Avatar
                  name={current.name}
                  photo={fotoConversa}
                  className={`${AVATAR_OUTRO} ch-av`}
                />
              )
            )}
            <h2 className="ch-nome ch-vidro">{current?.name ?? 'Conversa'}</h2>
          </div>
        </header>

        {buscando && (hits.length > 0 || searchNote) && (
          <div className="ch-menu ch-vidro">
            <h3>Mencionar lead</h3>
            {hits.length > 0 ? (
              <ul>
                {hits.map((l, i) => (
                  <li key={l.id}>
                    <button
                      type="button"
                      data-foco={i === foco || undefined}
                      onMouseDown={manterFoco}
                      onMouseEnter={() => setFoco(i)}
                      onClick={() => mencionar(l)}
                    >
                      <Canal />
                      <span>{destacar(l.name, termo)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p role="status">{searchNote}</p>
            )}
          </div>
        )}

        <form ref={escreve} onSubmit={(e) => void send(e)} className="ch-escreve">
          {buscando ? (
            <button
              type="button"
              className="ch-circ ch-vidro"
              aria-label="Fechar busca"
              onMouseDown={manterFoco}
              onClick={fecharBusca}
            >
              {icX}
            </button>
          ) : (
            <button
              type="button"
              className="ch-circ ch-vidro"
              aria-label="Mencionar lead"
              onClick={() => setBuscando(true)}
            >
              {icHash}
            </button>
          )}
          <div
            className="ch-capsula ch-vidro"
            data-anexo={(!buscando && mention) || undefined}
            data-texto={texto.trim() ? true : undefined}
          >
            {buscando ? (
              <div className="ch-lin">
                <span className="ch-lupa">{icBusca}</span>
                <input
                  className="ch-campo"
                  aria-label="Mencionar lead"
                  value={query}
                  autoComplete="off"
                  autoFocus
                  onChange={(e) => void searchLeads(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      fecharBusca();
                    } else if (e.key === 'ArrowDown' && hits.length) {
                      e.preventDefault();
                      setFoco((f) => (f + 1) % hits.length);
                    } else if (e.key === 'ArrowUp' && hits.length) {
                      e.preventDefault();
                      setFoco((f) => (f - 1 + hits.length) % hits.length);
                    } else if (e.key === 'Enter') {
                      e.preventDefault();
                      const l = hits[foco];
                      if (l) mencionar(l);
                    }
                  }}
                />
              </div>
            ) : (
              <>
                {mention && (
                  <div className="ch-anexo">
                    <Canal />
                    <b>{mention.name}</b>
                    <button
                      type="button"
                      className="toque"
                      aria-label="Remover menção"
                      onMouseDown={manterFoco}
                      onClick={() => setMention(null)}
                    >
                      {icX}
                    </button>
                  </div>
                )}
                <div className="ch-lin">
                  <textarea
                    ref={campo}
                    name="body"
                    className="ch-campo"
                    aria-label="Mensagem"
                    placeholder={largo && current ? `Mensagem para ${current.name}` : 'Mensagem'}
                    rows={1}
                    maxLength={2000}
                    value={texto}
                    onChange={(e) => {
                      setTexto(e.target.value);
                      ajustarAltura();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        void send();
                      }
                    }}
                  />
                  {texto.trim() ? (
                    <button
                      type="submit"
                      className="ch-enviar toque"
                      aria-label="Enviar"
                      onMouseDown={manterFoco}
                      disabled={!active}
                    >
                      {icSubir}
                    </button>
                  ) : (
                    <span className="ch-dica">Enter envia. Shift+Enter pula linha.</span>
                  )}
                </div>
              </>
            )}
          </div>
        </form>
      </section>

      {nova && (
        <NovaConversa
          users={users}
          photos={photos}
          onPick={(id) => void startDm(id)}
          onClose={() => setNova(false)}
        />
      )}
    </div>
  );
}
