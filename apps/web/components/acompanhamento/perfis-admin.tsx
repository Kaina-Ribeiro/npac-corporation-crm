'use client';
import { entrouHa } from '@npac/shared/acessos';
import { MOTIVO, podeGerenciar, type ContaAreas } from '@npac/shared/areas';
import {
  ALCANCE_DICA,
  ALCANCE_LABEL,
  ALCANCE_TITULO,
  ALCANCES_NA_TELA,
  type Alcance,
} from '@npac/shared/alcance';
import { CARGO_INFO, MODULO_ADMIN_LABEL, type Cargo } from '@npac/shared/cargos';
import { PERFIL_LABEL, PERFIS, type Perfil } from '@npac/shared/mentoria';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { CargoDica } from '@/components/cargo-field';
import { ComDica } from '@/components/dica';
import { control, Field, FormError } from '@/components/crm-ui';
import { showToast } from '@/components/toast';
import { clientApi } from '@/lib/client-api';
import { contaDaRegra, convitePorEmail, type ContaEquipe } from '@/lib/equipe';
import type { AccessRequest } from '@/components/access-requests';
import { Dialogo } from './dialogo';
import { Rostos } from './ui';
import { button, quietButton } from '@/lib/button';

/** O botão "Convidar" fica no cabeçalho da página; a janelinha mora na lista (evento da janela). */
const ABRIR_CONVITE = 'npac:perfis-convidar';

export function ConvidarBotao() {
  return (
    <button
      type="button"
      className={button}
      onClick={() => window.dispatchEvent(new Event(ABRIR_CONVITE))}
    >
      Convidar
    </button>
  );
}

const doModulo = (c: ContaEquipe) => c.areas.some((a) => a.area === 'ACOMPANHAMENTO');
const ordem = (a: ContaEquipe, b: ContaEquipe) =>
  Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'pt-BR');
const ago = (at: string) => {
  const days = Math.floor((Date.now() - new Date(at).getTime()) / 86_400_000);
  return days === 0 ? 'hoje' : days === 1 ? 'há 1 dia' : `há ${days} dias`;
};
const temp = (r: unknown) =>
  `Senha temporária (mostrada uma única vez): ${(r as { temporaryPassword: string }).temporaryPassword}`;

type Confirmar = { titulo: string; texto: string; rotulo: string; acao: () => Promise<unknown> };

/** O alcance só vale no perfil Acompanhamento sem o selo (Fase 3B). */
const temAlcance = (perfil: Perfil | '' | null, admin: boolean) =>
  perfil === 'ACOMPANHAMENTO' && !admin;

/**
 * "Acessos" com as tags "Carteira" e "Todos os mentorados" (Fase 3B, desenho A aprovado em 19/11): uma
 * escolha única (`radiogroup`: setas trocam, Tab entra na marcada), no visual de tag; a marcada tem ✓ e
 * o fundo de seleção, a outra só a borda.
 */
function AlcanceCampo({
  value,
  onChange,
  nome,
  disabled,
  title,
}: {
  value: Alcance;
  onChange: (a: Alcance) => void;
  nome?: string;
  disabled?: boolean;
  title?: string;
}) {
  const botoes = useRef<(HTMLButtonElement | null)[]>([]);
  const escolher = (a: Alcance) => value !== a && onChange(a);
  function teclas(e: KeyboardEvent, i: number) {
    const passo = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!passo) return;
    e.preventDefault();
    const n = ALCANCES_NA_TELA.length;
    const j = (i + passo + n) % n;
    botoes.current[j]?.focus();
    escolher(ALCANCES_NA_TELA[j]!);
  }
  return (
    <div className="pf-alcance" title={title}>
      <span aria-hidden="true">{ALCANCE_TITULO}</span>
      <div
        className="acessos"
        role="radiogroup"
        aria-label={nome ? `${ALCANCE_TITULO} de ${nome}` : ALCANCE_TITULO}
      >
        {ALCANCES_NA_TELA.map((a, i) => (
          <ComDica key={a} texto={ALCANCE_DICA[a]}>
            {(alvo) => (
              <button
                {...alvo}
                ref={(b) => {
                  botoes.current[i] = b;
                }}
                type="button"
                role="radio"
                aria-checked={value === a}
                tabIndex={value === a ? 0 : -1}
                className="acesso-tag toque"
                disabled={disabled}
                onClick={() => escolher(a)}
                onKeyDown={(e) => teclas(e, i)}
              >
                {value === a && (
                  <svg viewBox="0 0 12 12" aria-hidden="true">
                    <path d="M2.5 6.4 4.9 8.7 9.5 3.6" />
                  </svg>
                )}
                {ALCANCE_LABEL[a]}
              </button>
            )}
          </ComDica>
        ))}
      </div>
    </div>
  );
}

/**
 * Configurações > Perfis (NPAC-54, Fase 3; opção 1A aprovada em 19/11): a equipe do
 * Acompanhamento. O Admin do módulo (Head da área) convida, aprova pedidos do Acompanhamento, troca
 * perfil, gera nova senha e desativa; a Diretoria também dá e tira o selo de Admin. A regra única
 * (`podeGerenciar`) só esconde o que a API recusaria; quem decide é a API.
 */
export function PerfisAdmin({
  contas,
  pedidos,
  euId,
  eu,
  agora,
}: {
  contas: ContaEquipe[];
  pedidos: AccessRequest[];
  euId: string;
  eu: ContaAreas;
  /** Hora do servidor: "entrou há X" sai igual no servidor e no navegador. */
  agora: string;
}) {
  const diretoria = eu.mestre;
  const [linhas, setLinhas] = useState(() => contas.filter(doModulo).sort(ordem));
  const [fila, setFila] = useState(() => pedidos.filter((p) => p.area === 'ACOMPANHAMENTO'));
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [avisoEmail, setAvisoEmail] = useState('');
  const [convidando, setConvidando] = useState(false);
  const [confirmar, setConfirmar] = useState<Confirmar | null>(null);
  const hora = new Date(agora);

  useEffect(() => {
    const abrir = () => setConvidando(true);
    window.addEventListener(ABRIR_CONVITE, abrir);
    return () => window.removeEventListener(ABRIR_CONVITE, abrir);
  }, []);

  async function recarregar() {
    const [us, rs] = await Promise.all([
      clientApi<ContaEquipe[]>('/api/admin/users'),
      clientApi<AccessRequest[]>('/api/admin/access-requests'),
    ]);
    setLinhas(us.filter(doModulo).sort(ordem));
    setFila(rs.filter((p) => p.area === 'ACOMPANHAMENTO'));
  }

  /** Ação que muda a lista: mostra o aviso e recarrega; o erro da API aparece no topo. */
  async function rodar(fn: () => Promise<unknown>, feito?: (r: unknown) => string) {
    setErro('');
    setAviso('');
    setAvisoEmail('');
    try {
      const r = await fn();
      await recarregar();
      if (feito) setAviso(feito(r));
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  async function definirPerfil(u: ContaEquipe, perfil: Perfil, admin: boolean, alcance?: Alcance) {
    const antes = linhas;
    // Fora do perfil Acompanhamento sem o selo, o alcance volta a todos (a API faz o mesmo).
    const novo: Alcance = temAlcance(perfil, admin) ? (alcance ?? u.alcance ?? 'TODOS') : 'TODOS';
    setErro('');
    setLinhas((ls) =>
      ls.map((l) =>
        l.id === u.id
          ? {
              ...l,
              perfil,
              moduloAdmin: admin,
              alcance: novo,
              areas: l.areas.map((a) =>
                a.area === 'ACOMPANHAMENTO'
                  ? { ...a, cargo: perfil, head: admin, alcance: novo }
                  : a,
              ),
            }
          : l,
      ),
    );
    try {
      await clientApi('/api/mentoria/perfis', 'PUT', {
        userId: u.id,
        perfil,
        admin,
        ...(alcance ? { alcance } : {}),
      });
      showToast();
    } catch (e) {
      setLinhas(antes);
      setErro((e as Error).message);
    }
  }

  return (
    <>
      {aviso && (
        <p role="status" className="pf-aviso">
          {aviso}
        </p>
      )}
      {aviso && avisoEmail && <p className="pf-aviso-email">{avisoEmail}</p>}
      <FormError message={erro} />

      {fila.length > 0 && (
        <section className="card sec pf-pedidos" aria-labelledby="pf-pedidos">
          <header>
            <h2 id="pf-pedidos">
              Pedidos de acesso <span className="tag gold">{fila.length}</span>
            </h2>
          </header>
          <ul>
            {fila.map((r) => (
              <Pedido
                key={r.id}
                pedido={r}
                onAprovar={(perfil, alcance) =>
                  rodar(
                    () =>
                      clientApi(`/api/admin/access-requests/${r.id}/approve`, 'POST', {
                        role: 'ACOMPANHAMENTO',
                        perfil,
                        moduloAdmin: false,
                        ...(temAlcance(perfil, false) ? { alcance } : {}),
                      }),
                    () => `${r.name} aprovado como ${CARGO_INFO[perfil as Cargo].label}.`,
                  )
                }
                onRecusar={() =>
                  setConfirmar({
                    titulo: `Recusar o pedido de ${r.name}?`,
                    texto: '',
                    rotulo: 'Recusar',
                    acao: () =>
                      rodar(
                        () => clientApi(`/api/admin/access-requests/${r.id}`, 'DELETE'),
                        () => `Pedido de ${r.name} recusado.`,
                      ),
                  })
                }
              />
            ))}
          </ul>
        </section>
      )}

      <section className="card overflow-hidden" aria-label="Equipe do Acompanhamento">
        {linhas.length > 0 && (
          <div className="pf pf-cab" aria-hidden="true">
            <span className="pf-cab-pessoa">Pessoa</span>
            <span className="pf-cab-perfil">Perfil</span>
            {diretoria && <span className="pf-cab-admin">{MODULO_ADMIN_LABEL}</span>}
          </div>
        )}
        {linhas.map((u) => {
          const voce = u.id === euId;
          const alvo = contaDaRegra(u);
          const base = { ator: eu, alvo, proprio: voce };
          const cargo = podeGerenciar({
            ...base,
            acao: 'CARGO',
            area: 'ACOMPANHAMENTO',
            cargo: u.perfil ?? 'ACOMPANHAMENTO',
            head: !!u.moduloAdmin,
          });
          const conta = podeGerenciar({ ...base, acao: u.active ? 'DESATIVAR' : 'CONTA' });
          const motivo = !conta.ok && !voce ? conta.motivo : null;
          const outra = u.outraArea || u.areas.some((a) => a.area === 'COMERCIAL');
          return (
            <div className={`pf ${diretoria ? 'pf-dir' : ''}`} key={u.id}>
              <Rostos pessoas={[{ nome: u.name, fotoMidiaId: null }]} />
              <div className="nm">
                <b>
                  {u.name}
                  {voce && <span className="pf-voce"> (você)</span>}
                  {u.moduloAdmin && !diretoria && (
                    <span className="tag gold">{MODULO_ADMIN_LABEL}</span>
                  )}
                  {!u.perfil && <span className="tag canc">falta perfil</span>}
                  {outra && <span className="tag">também no Comercial</span>}
                  {!u.active && <span className="tag canc">inativo</span>}
                </b>
                {u.active && <span>{entrouHa(u.ultimoUso, hora)}</span>}
              </div>
              <select
                className={control}
                aria-label={`Perfil de ${u.name}`}
                value={u.perfil ?? ''}
                disabled={voce || !u.active || !cargo.ok}
                title={!voce && !cargo.ok ? cargo.motivo : undefined}
                onChange={(e) => void definirPerfil(u, e.target.value as Perfil, !!u.moduloAdmin)}
              >
                {/* Só conta antiga sem perfil: pede a escolha, sem voltar a "sem perfil". */}
                {!u.perfil && (
                  <option value="" disabled>
                    Escolha o perfil
                  </option>
                )}
                {PERFIS.map((p) => (
                  <option key={p} value={p}>
                    {PERFIL_LABEL[p]}
                  </option>
                ))}
              </select>
              {temAlcance(u.perfil, !!u.moduloAdmin) && (
                <AlcanceCampo
                  value={u.alcance ?? 'TODOS'}
                  nome={u.name}
                  disabled={voce || !u.active || !cargo.ok}
                  title={!voce && !cargo.ok ? cargo.motivo : undefined}
                  onChange={(a) => u.perfil && void definirPerfil(u, u.perfil, false, a)}
                />
              )}
              <div className="pf-acoes">
                {motivo ? (
                  <small>{motivo}</small>
                ) : (
                  !voce && (
                    <>
                      {u.active && (
                        <button
                          type="button"
                          className={`${quietButton} sm`}
                          aria-label={`Nova senha para ${u.name}`}
                          onClick={() =>
                            setConfirmar({
                              titulo: `Gerar nova senha para ${u.name}?`,
                              texto: 'A senha atual deixa de valer.',
                              rotulo: 'Nova senha',
                              acao: () =>
                                rodar(
                                  () =>
                                    clientApi(
                                      `/api/admin/users/${u.id}/reset-password`,
                                      'POST',
                                      {},
                                    ),
                                  temp,
                                ),
                            })
                          }
                        >
                          Nova senha
                        </button>
                      )}
                      <button
                        type="button"
                        className={`${quietButton} sm`}
                        aria-label={`${u.active ? 'Desativar' : 'Reativar'} ${u.name}`}
                        onClick={() => {
                          const acao = () =>
                            rodar(
                              () =>
                                clientApi(`/api/admin/users/${u.id}`, 'PATCH', {
                                  active: !u.active,
                                }),
                              () => (u.active ? `${u.name} desativado` : `${u.name} reativado`),
                            );
                          if (!u.active) return void acao();
                          setConfirmar({
                            titulo: `Desativar ${u.name}?`,
                            texto: 'A pessoa sai na hora.',
                            rotulo: 'Desativar',
                            acao,
                          });
                        }}
                      >
                        {u.active ? 'Desativar' : 'Reativar'}
                      </button>
                    </>
                  )
                )}
              </div>
              {diretoria && (
                <div className="pf-admin">
                  <button
                    type="button"
                    className={`sw ${u.moduloAdmin ? 'on' : ''}`}
                    role="switch"
                    aria-checked={!!u.moduloAdmin}
                    aria-label={`${MODULO_ADMIN_LABEL} para ${u.name}`}
                    disabled={!u.perfil || !u.active}
                    title={u.perfil ? undefined : 'Defina um perfil antes'}
                    onClick={() => u.perfil && void definirPerfil(u, u.perfil, !u.moduloAdmin)}
                  >
                    <i />
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {linhas.length === 0 && (
          <div className="vazio">
            <h2>Ninguém com o cargo Acompanhamento</h2>
          </div>
        )}
      </section>
      <p className="pf-nota">
        A Diretoria é Admin automaticamente. {MOTIVO.DAR_HEAD_ACOMPANHAMENTO}.
      </p>

      {convidando && (
        <Convite
          diretoria={diretoria}
          onFechar={() => setConvidando(false)}
          onConvidar={async (corpo) => {
            setErro('');
            setAviso('');
            setAvisoEmail('');
            const r = await clientApi('/api/admin/users', 'POST', corpo);
            await recarregar();
            setAviso(temp(r));
            setAvisoEmail(convitePorEmail(r));
          }}
        />
      )}
      {confirmar && (
        <Dialogo
          titulo={confirmar.titulo}
          texto={confirmar.texto || undefined}
          rotulo={confirmar.rotulo}
          perigo={confirmar.rotulo !== 'Nova senha'}
          onConfirmar={async () => {
            await confirmar.acao();
          }}
          onFechar={() => setConfirmar(null)}
        />
      )}
    </>
  );
}

function Pedido({
  pedido: r,
  onAprovar,
  onRecusar,
}: {
  pedido: AccessRequest;
  onAprovar: (perfil: Perfil, alcance: Alcance) => void;
  onRecusar: () => void;
}) {
  const [perfil, setPerfil] = useState<Perfil | ''>('');
  const [alcance, setAlcance] = useState<Alcance>('TODOS');
  return (
    <li className="pf-pedido">
      <Rostos pessoas={[{ nome: r.name, fotoMidiaId: null }]} />
      <div className="nm">
        <b>{r.name}</b>
        <span>
          {r.username} · {r.email} · {ago(r.createdAt)}
        </span>
      </div>
      <select
        className={control}
        aria-label={`Perfil de ${r.name}`}
        value={perfil}
        onChange={(e) => setPerfil(e.target.value as Perfil)}
      >
        <option value="" disabled>
          Escolha o perfil
        </option>
        {PERFIS.map((p) => (
          <option key={p} value={p}>
            {PERFIL_LABEL[p]}
          </option>
        ))}
      </select>
      <div className="pf-pedido-bt">
        <button
          type="button"
          className={button}
          disabled={!perfil}
          onClick={() => perfil && onAprovar(perfil, alcance)}
        >
          Aprovar
        </button>
        <button type="button" className={quietButton} onClick={onRecusar}>
          Recusar
        </button>
      </div>
      {temAlcance(perfil, false) && (
        <AlcanceCampo value={alcance} nome={r.name} onChange={setAlcance} />
      )}
    </li>
  );
}

/** Janelinha "Convidar": cargos só do Acompanhamento; o selo de Admin, só para a Diretoria. */
function Convite({
  diretoria,
  onFechar,
  onConvidar,
}: {
  diretoria: boolean;
  onFechar: () => void;
  onConvidar: (corpo: object) => Promise<void>;
}) {
  const [f, setF] = useState({ name: '', email: '', username: '', perfil: '' as Perfil | '' });
  const [admin, setAdmin] = useState(false);
  const [alcance, setAlcance] = useState<Alcance>('TODOS');
  const comAlcance = temAlcance(f.perfil, diretoria && admin);
  return (
    <Dialogo
      titulo="Convidar"
      rotulo="Convidar"
      onFechar={onFechar}
      onConfirmar={() =>
        onConvidar({
          name: f.name.trim(),
          email: f.email.trim(),
          username: f.username.trim().toLowerCase(),
          role: 'ACOMPANHAMENTO',
          perfil: f.perfil,
          moduloAdmin: diretoria && admin,
          ...(comAlcance ? { alcance } : {}),
        })
      }
    >
      <div className="grid gap-3">
        <Field label="Nome">
          <input
            className={control}
            required
            maxLength={120}
            value={f.name}
            onChange={(e) => setF({ ...f, name: e.target.value })}
          />
        </Field>
        <Field label="E-mail">
          <input
            className={control}
            type="email"
            required
            value={f.email}
            onChange={(e) => setF({ ...f, email: e.target.value })}
          />
        </Field>
        <Field label="Usuário">
          <input
            className={control}
            required
            minLength={3}
            maxLength={30}
            pattern="[a-zA-Z0-9_.]+"
            title="3 a 30 letras, números, ponto ou _"
            placeholder="ex.: maria.silva"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={f.username}
            onChange={(e) => setF({ ...f, username: e.target.value })}
          />
        </Field>
        <Field label="Perfil">
          <select
            className={control}
            required
            value={f.perfil}
            onChange={(e) => setF({ ...f, perfil: e.target.value as Perfil })}
          >
            <option value="" disabled>
              Escolha o perfil
            </option>
            {PERFIS.map((p) => (
              <option key={p} value={p}>
                {PERFIL_LABEL[p]}
              </option>
            ))}
          </select>
        </Field>
        {f.perfil && <CargoDica cargo={f.perfil as Cargo} />}
        {diretoria && f.perfil && (
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              role="switch"
              className="size-4 accent-[var(--ink)]"
              checked={admin}
              onChange={(e) => setAdmin(e.target.checked)}
            />
            {MODULO_ADMIN_LABEL}
          </label>
        )}
        {comAlcance && <AlcanceCampo value={alcance} onChange={setAlcance} />}
      </div>
    </Dialogo>
  );
}
