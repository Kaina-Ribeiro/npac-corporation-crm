/**
 * Esqueleto da tela enquanto o servidor busca a próxima página: título e três blocos com o vidro
 * do CRM e um brilho suave em laço. Componente de servidor, sem texto e sem JS. Vem escondido na
 * casca (`.nav-skeleton`) e aparece no clique de um link para outra tela (`NavProgress` marca
 * `data-nav-pending` no `<html>`), sem `loading.tsx`: com ele, a carga direta respondia 200 em vez
 * de 404 e o `redirect()` do servidor virava redirecionamento no navegador. O brilho para com
 * `prefers-reduced-motion` (`.sk-*` em `globals.css`); `data-own-motion` tira os blocos da cascata
 * de entrada da página, que atrasaria o esqueleto.
 */
const LINHAS = [0, 1, 2, 3, 4];

export function PageSkeleton() {
  return (
    <div className="page-skeleton nav-skeleton" data-page-skeleton data-own-motion aria-busy="true">
      <div className="sk-head" data-own-motion>
        <span className="sk-bar sk-title" />
        <span className="sk-bar sk-sub" />
      </div>
      <div className="glass-card sk-block sk-toolbar" data-own-motion>
        <span className="sk-bar sk-search" />
        <span className="sk-bar sk-chip" />
        <span className="sk-bar sk-chip" />
      </div>
      <div className="glass-card sk-block sk-list" data-own-motion style={{ '--i': 1 } as never}>
        {LINHAS.map((n) => (
          <div key={n} className="sk-row">
            <span className="sk-dot" />
            <span className="sk-lines">
              <span className="sk-bar" style={{ width: `${62 - n * 6}%` }} />
              <span className="sk-bar sk-faint" style={{ width: `${38 + (n % 3) * 9}%` }} />
            </span>
            <span className="sk-bar sk-pill" />
          </div>
        ))}
      </div>
      <div className="glass-card sk-block sk-list" data-own-motion style={{ '--i': 2 } as never}>
        {LINHAS.slice(0, 2).map((n) => (
          <div key={n} className="sk-row">
            <span className="sk-lines">
              <span className="sk-bar" style={{ width: `${48 - n * 10}%` }} />
              <span className="sk-bar sk-faint" style={{ width: `${70 - n * 18}%` }} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
