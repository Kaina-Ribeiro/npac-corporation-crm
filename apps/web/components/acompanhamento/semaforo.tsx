'use client';
import {
  rotuloSemana,
  SEMAFORO_COR_LABEL,
  SEMAFORO_MOTIVO_LABEL,
  type CheckinDTO,
  type FichaDTO,
  type SemaforoDTO,
} from '@npac/shared/mentoria';
import { useState } from 'react';
import { control, quietButton } from '@/components/crm-ui';
import { clientApi } from '@/lib/client-api';
import { Dialogo } from './dialogo';
import { ICONES, Icone } from './ui';

const sm = `${quietButton} sm`;
const CLASSE = { VERDE: 'verde', AMARELO: 'amarelo', VERMELHO: 'vermelho' } as const;

/** Selo do semáforo: bolinha + cor por extenso (a cor nunca é a única pista); motivos no título. */
export function SeloSemaforo({ s }: { s: SemaforoDTO }) {
  const motivos = s.motivos.map((m) => SEMAFORO_MOTIVO_LABEL[m]).join(', ');
  return (
    <span
      className={`tag sem ${CLASSE[s.cor]}`}
      title={motivos || undefined}
      aria-label={`Semáforo ${SEMAFORO_COR_LABEL[s.cor].toLowerCase()}${motivos ? `: ${motivos}` : ''}`}
    >
      <i aria-hidden />
      {SEMAFORO_COR_LABEL[s.cor]}
    </span>
  );
}

const HORA_BR = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});
const quando = (iso: string) => HORA_BR.format(new Date(iso)).replace(',', ' às');

/** Instante → valor do `datetime-local` em Brasília (`AAAA-MM-DDTHH:mm`). */
function paraCampo(iso?: string | null): string {
  const d = iso ? new Date(iso) : new Date();
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
    .format(d)
    .replace(' ', 'T');
}

type Form = {
  enviadoEm: string;
  respondeu: boolean;
  respondidoEm: string;
  avanco: string;
  travou: string;
  proximoPasso: string;
};
const formDe = (c: CheckinDTO | null): Form => ({
  enviadoEm: paraCampo(c?.enviadoEm),
  respondeu: c?.respondeu ?? false,
  respondidoEm: c?.respondidoEm ? paraCampo(c.respondidoEm) : '',
  avanco: c?.avanco ?? '',
  travou: c?.travou ?? '',
  proximoPasso: c?.proximoPasso ?? '',
});

/** Lançar ou editar o check-in da semana (E9): os campos do PDF. */
function JanelaCheckin({
  inscricaoId,
  checkin,
  onFechar,
  depois,
}: {
  inscricaoId: string;
  checkin: CheckinDTO | null;
  onFechar: () => void;
  depois: () => void;
}) {
  const [f, setF] = useState<Form>(() => formDe(checkin));
  const agora = paraCampo();
  const texto = (campo: 'avanco' | 'travou' | 'proximoPasso', rotulo: string) => (
    <label className="f">
      <span>{rotulo}</span>
      <textarea
        className={control}
        rows={2}
        maxLength={4000}
        value={f[campo]}
        onChange={(e) => setF({ ...f, [campo]: e.target.value })}
      />
    </label>
  );
  return (
    <Dialogo
      titulo={
        checkin ? `Check-in: ${rotuloSemana(checkin.semana).toLowerCase()}` : 'Lançar check-in'
      }
      texto="O check-in sai pelo WhatsApp; aqui fica o registro do envio e da resposta."
      rotulo="Salvar"
      podeConfirmar={!!f.enviadoEm && (!f.respondeu || !!f.respondidoEm)}
      onFechar={onFechar}
      onConfirmar={async () => {
        const corpo = {
          enviadoEm: f.enviadoEm,
          respondeu: f.respondeu,
          respondidoEm: f.respondeu ? f.respondidoEm : null,
          avanco: f.avanco,
          travou: f.travou,
          proximoPasso: f.proximoPasso,
        };
        if (checkin)
          await clientApi(`/api/mentoria/checkins/${checkin.id}`, 'PATCH', {
            version: checkin.version,
            ...corpo,
          });
        else await clientApi(`/api/mentoria/inscricoes/${inscricaoId}/checkins`, 'POST', corpo);
        depois();
      }}
    >
      <label className="f">
        <span>Enviado em</span>
        <input
          className={control}
          type="datetime-local"
          max={agora}
          value={f.enviadoEm}
          required
          onChange={(e) => setF({ ...f, enviadoEm: e.target.value })}
        />
      </label>
      <label className="ck-check">
        <input
          type="checkbox"
          checked={f.respondeu}
          onChange={(e) =>
            setF({
              ...f,
              respondeu: e.target.checked,
              respondidoEm: e.target.checked ? f.respondidoEm || agora : '',
            })
          }
        />
        <span>Respondeu</span>
      </label>
      {f.respondeu && (
        <label className="f">
          <span>Respondido em</span>
          <input
            className={control}
            type="datetime-local"
            min={f.enviadoEm}
            max={agora}
            value={f.respondidoEm}
            required
            onChange={(e) => setF({ ...f, respondidoEm: e.target.value })}
          />
        </label>
      )}
      {texto('avanco', 'Avanço')}
      {texto('travou', 'O que travou')}
      {texto('proximoPasso', 'Próximo passo')}
    </Dialogo>
  );
}

function ItemCheckin({ c, editar }: { c: CheckinDTO; editar: (c: CheckinDTO) => void }) {
  const textos: [string, string | null][] = [
    ['Avanço', c.avanco],
    ['O que travou', c.travou],
    ['Próximo passo', c.proximoPasso],
  ];
  return (
    <li className="ck-item">
      <div className="ck-topo">
        <b>{rotuloSemana(c.semana)}</b>
        <span className={`tag ${c.respondeu ? 'ativo' : ''}`}>
          {c.respondeu ? 'Respondeu' : 'Sem resposta'}
        </span>
        {c.podeEditar && (
          <button
            type="button"
            className={sm}
            aria-label={`Editar o check-in da ${rotuloSemana(c.semana).toLowerCase()}`}
            onClick={() => editar(c)}
          >
            Editar
          </button>
        )}
      </div>
      <p className="ck-datas">
        Enviado {quando(c.enviadoEm)}
        {c.respondidoEm ? `, respondido ${quando(c.respondidoEm)}` : ''}
      </p>
      {textos.some(([, v]) => v) && (
        <dl className="ck-textos">
          {textos
            .filter(([, v]) => v)
            .map(([r, v]) => (
              <div key={r}>
                <dt>{r}</dt>
                <dd>{v}</dd>
              </div>
            ))}
        </dl>
      )}
    </li>
  );
}

/**
 * Ficha > Jornada: semáforo de hoje com os motivos, histórico semana a semana, sequência de semanas
 * com check-in e os check-ins (Fase 2, Parte 3, §5 e §7). Só para quem vê (a Especialista não).
 */
export function SemaforoFicha({ ficha, atualizar }: { ficha: FichaDTO; atualizar: () => void }) {
  const [janela, setJanela] = useState<{ c: CheckinDTO | null } | null>(null);
  if (ficha.sequenciaCheckins === null) return null;
  const s = ficha.semaforo;
  const historico = [...ficha.semaforoHistorico].reverse();
  const seq = ficha.sequenciaCheckins;
  return (
    <section className="sem-card" aria-label="Semáforo e check-ins">
      <div className="sem-cab">
        <h3>Semáforo</h3>
        {s ? <SeloSemaforo s={s} /> : <span className="tag">Sem semáforo</span>}
      </div>
      {s ? (
        s.motivos.length > 0 ? (
          <ul className="sem-motivos">
            {s.motivos.map((m) => (
              <li key={m} className={m.endsWith('_2') || m === 'PME_15' ? 'grave' : ''}>
                {SEMAFORO_MOTIVO_LABEL[m]}
              </li>
            ))}
          </ul>
        ) : (
          <p className="sem-nota">Check-in, tarefas e PME em dia.</p>
        )
      ) : (
        <p className="sem-nota">Só mentorado ativo tem semáforo.</p>
      )}

      <div className="sem-linha">
        <div className="sem-seq">
          <b>{seq}</b>
          <span>{seq === 1 ? 'semana seguida' : 'semanas seguidas'} com check-in</span>
        </div>
        {historico.length > 0 && (
          <div className="sem-hist">
            <span className="sem-hist-rot">Semana a semana</span>
            <ol aria-label="Histórico do semáforo, da mais antiga à mais recente">
              {historico.slice(-12).map((h) => {
                const motivos = h.motivos.map((m) => SEMAFORO_MOTIVO_LABEL[m]).join(', ');
                const rotulo = `${rotuloSemana(h.semana)}: ${SEMAFORO_COR_LABEL[h.cor]}${motivos ? ` (${motivos})` : ''}`;
                return (
                  <li key={h.semana} className={CLASSE[h.cor]} title={rotulo}>
                    <span className="sr-only">{rotulo}</span>
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </div>

      <div className="ck">
        <div className="ck-cab">
          <h4>Check-ins</h4>
          {ficha.pode.checkin && (
            <button type="button" className={sm} onClick={() => setJanela({ c: null })}>
              <Icone d={ICONES.mais} largura={2.2} />
              Lançar check-in
            </button>
          )}
        </div>
        {ficha.checkins.length > 0 ? (
          <ul className="ck-lista">
            {ficha.checkins.slice(0, 6).map((c) => (
              <ItemCheckin key={c.id} c={c} editar={(x) => setJanela({ c: x })} />
            ))}
          </ul>
        ) : (
          <p className="sem-nota">Nenhum check-in lançado.</p>
        )}
        {ficha.checkins.length > 6 && (
          <details className="ck-mais">
            <summary>
              Check-ins anteriores <span>{ficha.checkins.length - 6}</span>
              <Icone d={ICONES.abaixo} />
            </summary>
            <ul className="ck-lista">
              {ficha.checkins.slice(6).map((c) => (
                <ItemCheckin key={c.id} c={c} editar={(x) => setJanela({ c: x })} />
              ))}
            </ul>
          </details>
        )}
      </div>

      {janela && (
        <JanelaCheckin
          inscricaoId={ficha.id}
          checkin={janela.c}
          onFechar={() => setJanela(null)}
          depois={() => {
            setJanela(null);
            atualizar();
          }}
        />
      )}
    </section>
  );
}
