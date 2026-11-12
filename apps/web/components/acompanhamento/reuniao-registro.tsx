'use client';
import {
  CAMPOS_REUNIAO,
  PLATAFORMA_LABEL,
  PLATAFORMAS,
  proximosEstados,
  REUNIAO_STATUS_LABEL,
  REUNIAO_TIPO_LABEL,
  REUNIAO_TIPOS,
  type Condutor,
  type EuMentoria,
  type ReuniaoDTO,
  type ReuniaoStatus,
  type ReuniaoTexto,
  type ReuniaoTipo,
} from '@npac/shared/mentoria';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { button, control, FormError, quietButton } from '@/components/crm-ui';
import { clientApi } from '@/lib/client-api';
import { filaDeSalvamento, registrarVersion } from '@/lib/acompanhamento-saver';
import { CampoPr, INTEIRO, useCampo } from './campo';
import { Dialogo } from './dialogo';
import { IndicadorSalvo } from './indicador-salvo';
import { Metas } from './metas';
import { CobrancaAnterior, TarefasSemana } from './tarefas-reuniao';
import { diaHoraBR, ICONES, Icone, paraCampoBR, TagInterno, TagReuniao } from './ui';

const ROTULO_ESTADO: Partial<Record<ReuniaoStatus, string>> = {
  CONFIRMADA: 'Confirmar',
  LINK_ENVIADO: 'Link enviado',
  REALIZADA: 'Realizada',
  FALTOU: 'Faltou',
};

function Texto({
  chave,
  campo,
  rotulo,
  interno,
  valor,
  editavel,
}: {
  chave: string;
  campo: ReuniaoTexto;
  rotulo: string;
  interno: boolean;
  valor: string | null;
  editavel: boolean;
}) {
  const c = useCampo(chave, campo, valor);
  return (
    <label className="rn-tx">
      <small>
        {rotulo}
        {interno && <TagInterno />}
      </small>
      <textarea
        value={c.texto}
        readOnly={!editavel}
        rows={campo === 'resumo' ? 4 : 2}
        onChange={(e) => c.setTexto(e.target.value)}
        onFocus={c.aoFocar}
        onBlur={(e) => editavel && c.aoSair(e.target.value)}
      />
    </label>
  );
}

/** Versão atual da reunião: a da fila, que acompanha cada campo salvo. */
async function versaoAtual(chave: string, inicial: number) {
  const q = filaDeSalvamento();
  await q.idle();
  return q.version(chave) ?? inicial;
}

/** A reunião aberta: página própria, com a agenda, o resultado e o registro (§6). */
export function ReuniaoRegistro({
  reuniao: r,
  condutores,
  eu,
}: {
  reuniao: ReuniaoDTO;
  condutores: Condutor[];
  eu: EuMentoria | null;
}) {
  const router = useRouter();
  const chave = `reuniao:${r.inscricaoId}:${r.id}`;
  const ed = r.podeEditar;
  const equipe = !!eu && (eu.admin || eu.perfil === 'ACOMPANHAMENTO' || eu.perfil === 'OPERACAO');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [dialogo, setDialogo] = useState<'remarcar' | 'excluir' | null>(null);
  const [novoInicio, setNovoInicio] = useState('');
  const [proxima, setProxima] = useState({ inicio: '', tipo: r.tipo as ReuniaoTipo });

  useEffect(() => {
    registrarVersion(chave, r.version);
  }, [chave, r.version]);

  const atualizar = () =>
    void filaDeSalvamento()
      .idle()
      .then(() => router.refresh());

  async function enviar(corpo: object) {
    setErro('');
    setOcupado(true);
    try {
      const version = await versaoAtual(chave, r.version);
      const res = await clientApi<{ version: number; proximaId?: string }>(
        `/api/mentoria/reunioes/${r.id}`,
        'PATCH',
        { version, ...corpo },
      );
      registrarVersion(chave, res.version);
      router.refresh();
      return res;
    } catch (e) {
      setErro((e as Error).message);
      return null;
    } finally {
      setOcupado(false);
    }
  }

  const estados = proximosEstados(r.status, r.jaComecou);
  const aberta = ['AGENDADA', 'CONFIRMADA', 'LINK_ENVIADO'].includes(r.status);
  const tiposProxima = REUNIAO_TIPOS.filter((t) => equipe || t !== 'IDR');

  return (
    <section className="view pl-acao">
      <Link className="back" href="/acompanhamento/reunioes">
        <Icone d={ICONES.voltar} />
        Reuniões
      </Link>
      <div>
        <h1 className="h1">{REUNIAO_TIPO_LABEL[r.tipo]}</h1>
        <p className="sub">
          {diaHoraBR(r.inicio)} com{' '}
          <Link className="underline" href={`/acompanhamento/ficha/${r.inscricaoId}?aba=historico`}>
            {r.nome}
          </Link>
        </p>
        <div className="fh-tags">
          <span className="tag gold">{r.mentoria}</span>
          <TagReuniao status={r.status} />
          <IndicadorSalvo />
        </div>
      </div>

      <div className="pl-a-corpo">
        <section className="card pa">
          <h3>Agenda</h3>
          <div className="pr">
            <span>Data e hora</span>
            <span className="pv-fixo">{diaHoraBR(r.inicio)}</span>
          </div>
          {r.tipo === 'MENTORADO_EXPERIENTE' && r.condutorInscricao ? (
            <div className="pr">
              <span>Quem conduz</span>
              <Link
                className="pv-fixo underline"
                href={`/acompanhamento/ficha/${r.condutorInscricao.id}`}
              >
                {r.condutorInscricao.nome}
              </Link>
            </div>
          ) : (
            <CampoPr
              chave={chave}
              rotulo="Quem conduz"
              campo="conduzidaPor"
              valor={r.conduzidaPor?.id ?? ''}
              tipo="select"
              semVazio
              editavel={ed && equipe}
              opcoes={condutores.map((c) => ({ valor: c.id, rotulo: c.nome }))}
              aoSalvar={atualizar}
            />
          )}
          <CampoPr
            chave={chave}
            rotulo="Duração (min)"
            campo="duracaoMin"
            valor={r.duracaoMin}
            editavel={ed}
            inputMode="numeric"
            conversao={INTEIRO}
          />
          <CampoPr
            chave={chave}
            rotulo="Plataforma"
            campo="plataforma"
            valor={r.plataforma ?? ''}
            tipo="select"
            editavel={ed}
            opcoes={PLATAFORMAS.map((p) => ({ valor: p, rotulo: PLATAFORMA_LABEL[p] }))}
          />
          <CampoPr
            chave={chave}
            rotulo="Link"
            campo="link"
            valor={r.link}
            editavel={ed}
            inputMode="url"
            placeholder="https://"
            aoSalvar={atualizar}
          />
          {r.link && (
            <a className="rn-abrir" href={r.link} target="_blank" rel="noopener noreferrer">
              Abrir o link da reunião
            </a>
          )}
          <div className="pr">
            <span className="rn-rot">
              Status <TagInterno />
            </span>
            <span className="pv-fixo">{REUNIAO_STATUS_LABEL[r.status]}</span>
          </div>
          {!ed && <p className="ob-nota">Esta reunião é de outra pessoa: você só acompanha.</p>}
          {ed && aberta && (
            <>
              <div className="ob-acoes pl-a-acoes rn-acoes">
                {estados.map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={ocupado}
                    className={s === 'REALIZADA' ? button : quietButton}
                    onClick={() => void enviar({ status: s })}
                  >
                    {ROTULO_ESTADO[s]}
                  </button>
                ))}
                <button
                  type="button"
                  className={quietButton}
                  disabled={ocupado}
                  onClick={() => {
                    setNovoInicio('');
                    setDialogo('remarcar');
                  }}
                >
                  Remarcar
                </button>
                {r.podeExcluir && (
                  <button
                    type="button"
                    className={`${quietButton} rn-excluir`}
                    disabled={ocupado}
                    onClick={() => setDialogo('excluir')}
                  >
                    Excluir
                  </button>
                )}
              </div>
              {!r.jaComecou && (
                <p className="ob-nota">Realizada e Faltou liberam no horário da reunião.</p>
              )}
            </>
          )}
          {r.status === 'REMARCADA' && r.remarcadaParaId && (
            <Link className="rn-abrir" href={`/acompanhamento/reunioes/${r.remarcadaParaId}`}>
              Ver a reunião remarcada
            </Link>
          )}
          <FormError message={erro} />
        </section>

        <CobrancaAnterior r={r} atualizar={atualizar} />
        <TarefasSemana r={r} atualizar={atualizar} />
        {(r.podeMeta || r.metasInscricao.length > 0) && (
          <div className="card pa tr-bloco">
            <Metas
              inscricaoId={r.inscricaoId}
              metas={r.metasInscricao}
              pessoas={r.pessoasDaInscricao}
              podeCriar={r.podeMeta && r.status !== 'REMARCADA' && r.status !== 'FALTOU'}
              atualizar={atualizar}
              reuniaoId={r.id}
              titulo="Metas definidas ou ajustadas"
              vazio="Nenhuma meta em andamento. Defina as metas do mentorado aqui."
            />
          </div>
        )}

        <section className="card pa">
          <h3>Registro</h3>
          {CAMPOS_REUNIAO.filter((c) => c.campo !== 'status').map((c) => {
            if (c.campo === 'humor')
              return (
                <CampoPr
                  key={c.campo}
                  chave={chave}
                  rotulo="Humor"
                  campo="humor"
                  valor={r.humor}
                  tipo="select"
                  editavel={ed}
                  selo={<TagInterno />}
                  opcoes={[1, 2, 3, 4, 5].map((n) => ({ valor: String(n), rotulo: String(n) }))}
                  conversao={{ deTexto: (t) => (t ? Number(t) : null) }}
                />
              );
            if (c.campo === 'interesseRenovar')
              return r.tipo === 'RENOVACAO' ? (
                <CampoPr
                  key={c.campo}
                  chave={chave}
                  rotulo="Quer renovar?"
                  campo="interesseRenovar"
                  valor={r.interesseRenovar}
                  tipo="select"
                  editavel={ed}
                  selo={<TagInterno />}
                  opcoes={[
                    { valor: 'true', rotulo: 'Sim' },
                    { valor: 'false', rotulo: 'Não' },
                  ]}
                  conversao={{ deTexto: (t) => (t === '' ? null : t === 'true') }}
                />
              ) : null;
            return (
              <Texto
                key={c.campo}
                chave={chave}
                campo={c.campo as ReuniaoTexto}
                rotulo={c.rotulo}
                interno={c.interno}
                valor={r[c.campo as ReuniaoTexto]}
                editavel={ed}
              />
            );
          })}
          <p className="rn-legenda">
            Campos com <TagInterno /> nunca aparecem para o mentorado.
          </p>
        </section>

        {ed && r.status !== 'REMARCADA' && (
          <section className="card pa rn-proxima">
            <h3>Próxima reunião</h3>
            <label className="pr">
              <span>Tipo</span>
              <select
                className="pv"
                value={proxima.tipo}
                onChange={(e) => setProxima({ ...proxima, tipo: e.target.value as ReuniaoTipo })}
              >
                {tiposProxima.map((t) => (
                  <option key={t} value={t}>
                    {REUNIAO_TIPO_LABEL[t]}
                  </option>
                ))}
              </select>
            </label>
            <label className="pr">
              <span>Data e hora</span>
              <input
                className="pv"
                type="datetime-local"
                value={proxima.inicio}
                onChange={(e) => setProxima({ ...proxima, inicio: e.target.value })}
              />
            </label>
            <div className="ob-acoes pl-a-acoes">
              <button
                type="button"
                className={quietButton}
                disabled={ocupado || !proxima.inicio}
                onClick={async () => {
                  const res = await enviar({ proxima });
                  if (res?.proximaId) router.push(`/acompanhamento/reunioes/${res.proximaId}`);
                }}
              >
                Agendar a próxima
              </button>
            </div>
          </section>
        )}
      </div>

      {dialogo === 'remarcar' && (
        <Dialogo
          titulo="Remarcar reunião"
          texto="Esta fica como remarcada e nasce uma nova, agendada, com o mesmo condutor."
          rotulo="Remarcar"
          podeConfirmar={!!novoInicio}
          onConfirmar={async () => {
            const version = await versaoAtual(chave, r.version);
            const nova = await clientApi<{ id: string }>(
              `/api/mentoria/reunioes/${r.id}/remarcar`,
              'POST',
              { version, inicio: novoInicio },
            );
            router.push(`/acompanhamento/reunioes/${nova.id}`);
          }}
          onFechar={() => setDialogo(null)}
        >
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-ink2">Nova data e hora (Brasília)</span>
            <input
              className={control}
              type="datetime-local"
              min={paraCampoBR(new Date().toISOString())}
              value={novoInicio}
              onChange={(e) => setNovoInicio(e.target.value)}
            />
          </label>
        </Dialogo>
      )}
      {dialogo === 'excluir' && (
        <Dialogo
          titulo="Excluir reunião?"
          texto="Use só para reunião marcada por engano. Não dá para desfazer."
          rotulo="Excluir reunião"
          perigo
          onConfirmar={async () => {
            await filaDeSalvamento().idle();
            await clientApi(`/api/mentoria/reunioes/${r.id}`, 'DELETE');
            router.push('/acompanhamento/reunioes');
          }}
          onFechar={() => setDialogo(null)}
        />
      )}
    </section>
  );
}
