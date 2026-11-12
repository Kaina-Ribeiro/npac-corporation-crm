'use client';
import {
  PLATAFORMA_LABEL,
  PLATAFORMAS,
  REUNIAO_TIPO_LABEL,
  REUNIAO_TIPOS,
  type Condutor,
  type InscricaoItem,
  type Plataforma,
  type ReuniaoTipo,
} from '@npac/shared/mentoria';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { button, control, FormError, quietButton } from '@/components/crm-ui';
import { clientApi } from '@/lib/client-api';
import { ICONES, Icone, Rostos } from './ui';

type Escolhido = { id: string; nome: string; pessoas: InscricaoItem['pessoas'] };

/**
 * Escolha de um mentorado pela busca do módulo (nome, ou fone/e-mail completos). Os resultados
 * ficam na própria página, logo abaixo do campo: nada por cima do formulário.
 */
function EscolherMentorado({
  rotulo,
  valor,
  aoEscolher,
  excluir,
}: {
  rotulo: string;
  valor: Escolhido | null;
  aoEscolher: (e: Escolhido | null) => void;
  excluir?: string;
}) {
  const [termo, setTermo] = useState('');
  const [itens, setItens] = useState<InscricaoItem[] | null>(null);
  const pedido = useRef(0);
  useEffect(() => {
    const t = termo.trim();
    const n = ++pedido.current;
    if (t.length < 2) {
      setItens(null);
      return;
    }
    const espera = setTimeout(() => {
      clientApi<{ itens: InscricaoItem[] }>('/api/mentoria/busca', 'POST', { termo: t })
        .then((r) => n === pedido.current && setItens(r.itens.filter((i) => i.id !== excluir)))
        .catch(() => n === pedido.current && setItens([]));
    }, 220);
    return () => clearTimeout(espera);
  }, [termo, excluir]);

  if (valor)
    return (
      <div className="f w">
        <span>{rotulo}</span>
        <div className="rn-escolhido">
          <Rostos pessoas={valor.pessoas} />
          <b>{valor.nome}</b>
          <button type="button" className={`${quietButton} sm`} onClick={() => aoEscolher(null)}>
            Trocar
          </button>
        </div>
      </div>
    );
  return (
    <div className="f w">
      <label className="contents">
        <span>{rotulo}</span>
        <input
          className={control}
          type="search"
          autoComplete="off"
          placeholder="Nome, fone com DDD ou e-mail"
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
        />
      </label>
      {itens && (
        <ul className="rn-opcoes" aria-label={`Resultados para ${rotulo.toLowerCase()}`}>
          {itens.length === 0 && (
            <li className="busca-vazia">Nada encontrado. Fone e e-mail só completos.</li>
          )}
          {itens.map((i) => (
            <li key={i.id}>
              <button
                type="button"
                className="busca-item"
                onClick={() => {
                  setTermo('');
                  aoEscolher({ id: i.id, nome: i.nome, pessoas: i.pessoas });
                }}
              >
                <Rostos pessoas={i.pessoas} />
                <span className="min-w-0">
                  <b className="truncate">{i.nome}</b>
                  <small>{i.mentoria}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Agendar uma reunião: página própria, como a Nova inscrição. */
export function ReuniaoNova({
  inscricao,
  condutores,
  euId,
  equipe,
}: {
  inscricao: Escolhido | null;
  condutores: Condutor[];
  euId: string;
  /** Admin, Acompanhamento e Operação; a Especialista marca só as dela e nunca a IDR. */
  equipe: boolean;
}) {
  const router = useRouter();
  const [mentorado, setMentorado] = useState<Escolhido | null>(inscricao);
  const [experiente, setExperiente] = useState<Escolhido | null>(null);
  const tipos = REUNIAO_TIPOS.filter(
    (t) => equipe || (t !== 'IDR' && t !== 'MENTORADO_EXPERIENTE'),
  );
  const [f, setF] = useState({
    tipo: tipos[0] as ReuniaoTipo,
    conduzidaPor: equipe ? '' : euId,
    inicio: '',
    duracao: '60',
    plataforma: '' as Plataforma | '',
    link: '',
  });
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const voltar = mentorado
    ? `/acompanhamento/ficha/${mentorado.id}?aba=historico`
    : '/acompanhamento/reunioes';
  const experienteTipo = f.tipo === 'MENTORADO_EXPERIENTE';

  async function agendar(e: FormEvent) {
    e.preventDefault();
    setErro('');
    if (!mentorado) return setErro('Escolha o mentorado.');
    setOcupado(true);
    try {
      const r = await clientApi<{ id: string }>('/api/mentoria/reunioes', 'POST', {
        inscricaoId: mentorado.id,
        tipo: f.tipo,
        inicio: f.inicio,
        conduzidaPor: f.conduzidaPor || null,
        ...(experienteTipo && experiente ? { condutorInscricaoId: experiente.id } : {}),
        duracaoMin: Number(f.duracao) || 60,
        plataforma: f.plataforma || null,
        link: f.link.trim() || null,
      });
      router.push(`/acompanhamento/reunioes/${r.id}`);
    } catch (err) {
      setErro((err as Error).message);
      setOcupado(false);
    }
  }

  return (
    <section className="view ac-sem-nav">
      <Link className="back" href={voltar}>
        <Icone d={ICONES.voltar} />
        {mentorado && inscricao ? inscricao.nome : 'Reuniões'}
      </Link>
      <div>
        <h1 className="h1">Agendar reunião</h1>
        <p className="sub">Data e hora de Brasília. Depois você confirma e envia o link.</p>
      </div>
      <form className="nf" onSubmit={(e) => void agendar(e)}>
        <section className="card sec">
          <div className="form">
            <EscolherMentorado rotulo="Mentorado" valor={mentorado} aoEscolher={setMentorado} />
            <label className="f w">
              <span>Tipo</span>
              <select
                className={control}
                aria-label="Tipo"
                value={f.tipo}
                onChange={(e) => setF({ ...f, tipo: e.target.value as ReuniaoTipo })}
              >
                {tipos.map((t) => (
                  <option key={t} value={t}>
                    {REUNIAO_TIPO_LABEL[t]}
                  </option>
                ))}
              </select>
            </label>
            {experienteTipo && (
              <EscolherMentorado
                rotulo="Mentorado experiente que conduz"
                valor={experiente}
                aoEscolher={setExperiente}
                excluir={mentorado?.id}
              />
            )}
            <label className="f w">
              <span>{experienteTipo ? 'Quem acompanha (opcional)' : 'Quem conduz'}</span>
              <select
                className={control}
                aria-label={experienteTipo ? 'Quem acompanha' : 'Quem conduz'}
                value={f.conduzidaPor}
                disabled={!equipe}
                onChange={(e) => setF({ ...f, conduzidaPor: e.target.value })}
              >
                <option value="">{experienteTipo ? 'Ninguém da equipe' : 'Selecione'}</option>
                {condutores.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </label>
            <label className="f">
              <span>Data e hora</span>
              <input
                className={control}
                type="datetime-local"
                required
                value={f.inicio}
                onChange={(e) => setF({ ...f, inicio: e.target.value })}
              />
            </label>
            <label className="f">
              <span>Duração (min)</span>
              <input
                className={control}
                inputMode="numeric"
                value={f.duracao}
                onChange={(e) => setF({ ...f, duracao: e.target.value.replace(/\D/g, '') })}
              />
            </label>
            <div className="f w">
              <span>Plataforma</span>
              <div className="seg" role="group" aria-label="Plataforma">
                {PLATAFORMAS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={f.plataforma === p ? 'on' : ''}
                    aria-pressed={f.plataforma === p}
                    onClick={() => setF({ ...f, plataforma: f.plataforma === p ? '' : p })}
                  >
                    {PLATAFORMA_LABEL[p]}
                  </button>
                ))}
              </div>
            </div>
            <label className="f w">
              <span>Link</span>
              <input
                className={control}
                inputMode="url"
                placeholder="https://"
                value={f.link}
                onChange={(e) => setF({ ...f, link: e.target.value })}
              />
            </label>
          </div>
        </section>
        <FormError message={erro} />
        <div className="nf-barra">
          <p className="nf-nota">A reunião nasce agendada e entra na agenda da semana.</p>
          <div className="nf-botoes">
            <Link className={quietButton} href={voltar}>
              Cancelar
            </Link>
            <button type="submit" className={button} disabled={ocupado}>
              Agendar reunião
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
