import { topicos, type EvolucaoDTO, type FichaDTO } from '@npac/shared/mentoria';
import { NotasPilares, NumerosPartida, temPartida } from './evolucao-partida';
import {
  CARTOES,
  inicioDaFicha,
  ListaTopicos,
  rotuloMesAtual,
  topicosDaAba,
} from './evolucao-topicos';
import { dataBR, diaBR } from './ui';

/**
 * Folha A4 da evolução (spec §5.7), só servidor: a página chama a impressão do navegador ao abrir. Sem botões,
 * sem foto vazia, sem cartão vazio; todas as conquistas, na folha seguinte.
 */

/** Nome da mentoria no cabeçalho (siglas do Gabriel, 04/11/2026; 6M ainda sem nome). */
const NOME_MENTORIA: Record<string, string> = { RDV: 'Rico de Verdade', '2M': 'Marco e Mudança' };

function Cabecalho({ ficha, curto = false }: { ficha: FichaDTO; curto?: boolean }) {
  const inicio = inicioDaFicha(ficha);
  return (
    <header className={`cab ${curto ? 'mini' : ''}`}>
      <div className="marca">
        <span className="mk" aria-hidden="true">
          N
        </span>
        <div>
          <b>NPAC</b>
          <span>{NOME_MENTORIA[ficha.mentoria] ?? ficha.mentoria}</span>
        </div>
      </div>
      <div>
        {!curto && <span className="eb">Evolução na mentoria</span>}
        <h1>{ficha.nome}</h1>
        {!curto && (
          <p>
            {rotuloMesAtual(ficha)}
            {inicio ? ` · início em ${dataBR(inicio)}` : ''}
          </p>
        )}
      </div>
    </header>
  );
}

function Rodape({ hoje }: { hoje: string }) {
  return (
    <footer className="rod">
      <span>Gerado pelo CRM NPAC em {dataBR(hoje)}</span>
    </footer>
  );
}

const SETA = 'M5 12h14M13 6l6 6-6 6';
const PLAY = 'M8 5v14l11-7z';

export function EvolucaoPdf({
  ficha,
  ev,
  hoje,
}: {
  ficha: FichaDTO;
  ev: EvolucaoDTO;
  /** `AAAA-MM-DD` de Brasília. */
  hoje: string;
}) {
  const c = ev.campos;
  const cartoes = CARTOES.filter((d) => d.campos.some((k) => c[k]));
  const inicial = [...topicosDaAba(ev.daAba), ...topicos(c.inicialNotas)];
  const atual = topicos(c.atualNotas);
  const inicio = inicioDaFicha(ficha);
  const dataAtual = ev.atualAtualizadoEm ?? ev.fotoAtual?.em ?? null;
  const casal = ficha.tipo === 'CASAL';
  return (
    <div className="ev-pdf">
      <section className="folha">
        <Cabecalho ficha={ficha} />
        {cartoes.length > 0 && (
          <div>
            <h2 className="st">
              Evolução<small>Antes e hoje</small>
            </h2>
            <div className="evo">
              {cartoes.map((d) => {
                const [a, b] = d.campos;
                return (
                  <div key={d.rotulo} className={`ec ${d.largo ? 'l' : ''}`}>
                    <small>{d.rotulo}</small>
                    {b ? (
                      <div className="cmp">
                        <p>
                          <span className="ld">Antes</span>
                          {c[a!] || 'não informado'}
                        </p>
                        <svg viewBox="0 0 24 24" className="ar" aria-hidden="true">
                          <path d={SETA} />
                        </svg>
                        <p className="dp">
                          <span className="ld">Hoje</span>
                          {c[b] || 'não informado'}
                        </p>
                      </div>
                    ) : (
                      <p>{c[a!]}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="mom">
          <div className="mc">
            <div className="mh">
              {ev.fotoInicial && (
                <img
                  className="ft"
                  src={`/api/mentoria/midia/${ev.fotoInicial.id}`}
                  alt="Foto de quando chegaram"
                />
              )}
              <div>
                <b>Momento inicial</b>
                {inicio && <span>Iniciou em {dataBR(inicio)}</span>}
              </div>
              <i aria-hidden="true">1</i>
            </div>
            {inicial.length > 0 && <ListaTopicos itens={inicial} />}
          </div>
          <div className="mc at">
            <div className="mh">
              {ev.fotoAtual && (
                <img
                  className="ft"
                  src={`/api/mentoria/midia/${ev.fotoAtual.id}`}
                  alt={casal ? 'Foto do casal no momento atual' : 'Foto do momento atual'}
                />
              )}
              <div>
                <b>Momento atual</b>
                <span>
                  {rotuloMesAtual(ficha)}
                  {dataAtual ? ` · ${dataBR(diaBR(dataAtual))}` : ''}
                </span>
              </div>
              <i aria-hidden="true">2</i>
            </div>
            {atual.length > 0 && <ListaTopicos itens={atual} />}
          </div>
        </div>

        {temPartida(ev) && (
          <div className="par-b">
            <h2 className="st">
              Pontos de partida<small>Números e notas de quando chegaram</small>
            </h2>
            <div className="par">
              <NumerosPartida e={ev} />
              <NotasPilares e={ev} barra={false} />
            </div>
          </div>
        )}
        <Rodape hoje={hoje} />
      </section>

      {ev.conquistas.length > 0 && (
        <section className="folha">
          <Cabecalho ficha={ficha} curto />
          <div>
            <h2 className="st">
              Conquistas<small>Da mais antiga à mais recente</small>
            </h2>
            <div className="gal">
              {ev.conquistas.map((q) => (
                <div key={q.id} className="cq">
                  {q.midia?.tipo === 'FOTO' && (
                    <img
                      className="im"
                      src={`/api/mentoria/midia/${q.midia.id}`}
                      alt={q.descricao ?? 'Foto da conquista'}
                    />
                  )}
                  {q.midia?.tipo === 'VIDEO' && (
                    <div className="im video">
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d={PLAY} />
                      </svg>
                    </div>
                  )}
                  <div className="t">
                    {q.data && <time dateTime={q.data}>{dataBR(q.data)}</time>}
                    {q.descricao && <b>{q.descricao}</b>}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <Rodape hoje={hoje} />
        </section>
      )}
    </div>
  );
}
