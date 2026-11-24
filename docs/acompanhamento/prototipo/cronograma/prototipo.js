/*
 * Protótipo do NPAC-60 (cronograma do PME). Roda DENTRO da tela real do módulo (dev, conta duda) e encaixa
 * as partes novas com as classes do próprio sistema, para a captura sair com o visual de verdade.
 * Só para aprovação: não é código do produto. Nomes = mentorados fictícios do seed.
 */
(() => {
  const ICON = {
    EXPERIENCIA: 'M12 3l1.9 4.6 4.6 1.9-4.6 1.9L12 16l-1.9-4.6-4.6-1.9 4.6-1.9zM19 15l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8z',
    DESAFIO: 'M5 21V4m0 0h11l-1.6 4L16 12H5',
    FILME: 'M4 4h16v16H4zM8 4v16M16 4v16M4 9h4M4 15h4M16 9h4M16 15h4',
    LIVRO: 'M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5zM5 19.5A1.5 1.5 0 0 0 6.5 21H19',
    EAP: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM10 8.6l5 3.4-5 3.4z',
  };
  const NOME = { EXPERIENCIA: 'Experiência', DESAFIO: 'Desafio', FILME: 'Filme', LIVRO: 'Livro', EAP: 'EAP' };
  const PLURAL = { EXPERIENCIA: 'Experiências', DESAFIO: 'Desafios', FILME: 'Filmes', LIVRO: 'Livros', EAP: 'EAP' };
  const MODELO = { EAP: 3, EXPERIENCIA: 1, DESAFIO: 1, FILME: 2, LIVRO: 1 };
  const ORDEM = ['EXPERIENCIA', 'DESAFIO', 'FILME', 'LIVRO', 'EAP'];
  const svg = (d, cls = 'cr-i') =>
    `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
  const X = 'M6 6l12 12M18 6L6 18';
  const SETA = 'M7 17L17 7M9 7h8v8';
  const MAIS = 'M12 5v14M5 12h14';
  const TROCA = 'M7 7h11l-3-3M17 17H6l3 3';
  const BUSCA = 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4';
  const tagBloco = (b) => `<span class="cr-bloco">${svg(ICON[b])}${NOME[b]}</span>`;
  const link = (t) =>
    t.includes('youtube') ? `<span>${t.split(' https')[0]}</span> <a class="cr-link" href="#">youtube.com ${svg(SETA, 'cr-s')}</a>` : t;

  const css = `
  .ac{--cr-surf:#fff;--cr-bd:rgba(60,60,67,.2)}
  .dark .ac{--cr-surf:rgba(255,255,255,.07);--cr-bd:rgba(235,235,245,.2)}
  .ac .cr-i{width:15px;height:15px;flex:none}
  .ac .cr-s{width:12px;height:12px;flex:none}
  .ac .cr-bloco{display:inline-flex;align-items:center;gap:5px;height:22px;padding:0 8px;border-radius:7px;font-size:12px;font-weight:600;white-space:nowrap;background:rgba(120,120,128,.14);color:var(--tag-neutro)}
  .ac .cr-link{display:inline-flex;align-items:center;gap:3px;color:var(--tag-info);font-weight:600;font-size:12.5px;text-decoration:none}
  .ac .cr-sub{font-size:13px;color:var(--ink2);margin:2px 0 0}
  .ac .cr-modelo{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:12.5px;color:var(--ink2)}
  .ac .cr-sec{border-top:1px solid var(--line);padding-top:14px;display:grid;gap:12px}
  .ac .cr-sec-h{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:6px 12px}
  .ac .cr-sec-h h3{font-size:15px;font-weight:700;margin:0;letter-spacing:-.01em}
  .ac .cr-grupo{display:grid;gap:6px}
  .ac .cr-grupo-h{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--ink2)}
  .ac .cr-grupo-h .cr-ok{color:var(--gold-text);text-transform:none;letter-spacing:0;font-weight:600}
  .ac .cr-grupo-h .cr-falta{color:var(--ink3);text-transform:none;letter-spacing:0;font-weight:600}
  .ac .cr-item{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--cr-bd);border-radius:12px;background:var(--cr-surf);font-size:14px;line-height:1.4;color:var(--ink)}
  .ac .cr-item .cr-tx{flex:1;min-width:0}
  .ac .cr-item .cr-tx small{display:block;color:var(--ink2);font-size:12px;margin-top:2px}
  .ac .cr-item .cr-acts{display:flex;gap:4px;flex:none}
  .ac .cr-ib{display:inline-flex;align-items:center;justify-content:center;gap:4px;height:30px;min-width:30px;padding:0 8px;border-radius:9px;border:1px solid var(--line);background:transparent;color:var(--ink2);font-size:12.5px;font-weight:600;cursor:pointer}
  .ac .cr-add{display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 12px;border-radius:10px;border:1px dashed var(--line);background:transparent;color:var(--ink2);font-size:13px;font-weight:600;justify-self:start;cursor:pointer}
  .ac .cr-plan{display:inline-flex;white-space:nowrap;align-items:center;height:20px;padding:0 7px;border-radius:6px;font-size:11.5px;font-weight:600;background:var(--tag-info-bg);color:var(--tag-info);margin-left:6px;vertical-align:1px}
  .ac .cr-busca{border:1px solid var(--line);border-radius:12px;padding:8px;display:grid;gap:4px;background:var(--gl2, rgba(255,255,255,.6))}
  .ac .cr-busca .q{display:flex;align-items:center;gap:8px;height:36px;padding:0 10px;border-radius:9px;background:rgba(120,120,128,.1);color:var(--ink3);font-size:14px}
  .ac .cr-op{display:flex;justify-content:space-between;gap:10px;padding:8px 10px;border-radius:9px;font-size:13.5px}
  .ac .cr-op:hover{background:rgba(120,120,128,.08)}
  .ac .cr-op.off{color:var(--ink2)}
  .ac .cr-op.off small{color:var(--ink2)}
  .ac .cr-op.novo{border:0;background:transparent;font:inherit;font-weight:600;color:var(--ink);text-align:left;display:flex;align-items:center;gap:6px;justify-content:flex-start;border-top:1px solid var(--line);border-radius:0;margin-top:4px;padding-top:10px;cursor:pointer}
  .ac .cr-op.off small{white-space:nowrap}
  .ac .cr-op small{color:var(--ink3);font-size:12px}
  .ac .cr-st{display:inline-flex;align-items:center;height:24px;padding:0 9px;border-radius:8px;font-size:12px;font-weight:600;white-space:nowrap;background:rgba(120,120,128,.14);color:var(--tag-neutro)}
  .ac .cr-st.feita{background:var(--tag-ok-bg);color:var(--tag-ok)}
  .ac .cr-st.nao{background:var(--tag-bad-bg);color:var(--tag-bad)}
  .ac .cr-st.parcial{background:var(--tag-gold-bg);color:var(--tag-gold)}
  .ac .cr-resumo{display:grid;grid-template-columns:repeat(auto-fit,minmax(118px,1fr));gap:8px}
  .ac .cr-tile{border:1px solid var(--cr-bd);background:var(--cr-surf);border-radius:12px;padding:10px 12px;display:grid;gap:2px;align-content:start}
  .ac .cr-tile b{font-size:20px;letter-spacing:-.02em;color:var(--ink)}
  .ac .cr-tile span{font-size:12.5px;color:var(--ink2);display:flex;align-items:center;gap:5px}
  .ac .cr-tile small{font-size:12px;color:var(--ink2)}
  .ac .cr-pme{border:1px solid var(--cr-bd);background:var(--cr-surf);border-radius:14px;padding:12px;display:grid;gap:8px}
  .ac .cr-pme-h{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:6px 10px}
  .ac .cr-pme-h b{font-size:14.5px}
  .ac .cr-pme-h span{font-size:12.5px;color:var(--ink2)}
  .ac .cr-linha{display:flex;align-items:center;gap:10px;padding:7px 2px;border-top:1px solid var(--line);font-size:14px}
  .ac .cr-linha:first-of-type{border-top:0}
  .ac .cr-linha .cr-tx{flex:1;min-width:0;line-height:1.35}
  .ac .cr-chips{display:flex;flex-wrap:wrap;gap:6px}
  .ac .cr-chip{display:inline-flex;align-items:center;gap:6px;max-width:100%;padding:5px 9px;border-radius:9px;background:rgba(120,120,128,.1);font-size:13px;color:var(--ink)}
  .ac .cr-chip .cr-i{color:var(--ink3);width:13px;height:13px}
  .ac .cr-chip{text-align:left;line-height:1.35}
  .ac .cr-chip.nao{background:var(--tag-bad-bg);box-shadow:inset 0 0 0 1px var(--tag-bad)}
  .ac .cr-chip.nao em{font-style:normal;font-weight:700;color:var(--tag-bad);white-space:nowrap}
  .ac .cr-seg{display:flex;flex-wrap:wrap;gap:6px}
  .ac .cr-seg button{display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 12px;border-radius:10px;border:1px solid var(--line);background:transparent;font-size:13px;font-weight:600;color:var(--ink2)}
  .ac .cr-seg button.on{background:var(--ink);color:var(--bg, #fff);border-color:var(--ink)}
  .ac .cr-seg button em{font-style:normal;opacity:.7;font-weight:500}
  .ac .cr-barra{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between}
  .ac .cr-q{display:flex;align-items:center;gap:8px;height:38px;padding:0 12px;border-radius:11px;border:1px solid var(--line);color:var(--ink3);font-size:14px;min-width:0;flex:1;max-width:340px}
  .ac .cr-banco{display:grid}
  .ac .cr-bi{display:grid;grid-template-columns:28px 1fr auto;gap:4px 12px;align-items:start;padding:12px 4px;border-top:1px solid var(--line);font-size:14px;line-height:1.4}
  .ac .cr-bi:first-child{border-top:0}
  .ac .cr-bi .n{color:var(--ink2);font-size:12.5px;padding-top:2px;text-align:right}
  .ac .cr-bi small{display:block;color:var(--ink2);font-size:12.5px;margin-top:3px}
  .ac .cr-bi.esc .cr-tx{color:var(--ink2)}
  .ac .cr-bi .cr-acts{display:flex;gap:4px}
  .ac .cr-col{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.4fr);gap:8px 16px;align-items:center;padding:12px 0;border-top:1px solid var(--line)}
  .ac .cr-col:first-of-type{border-top:0}
  .ac .cr-col .nm b{display:block;font-size:14px}
  .ac .cr-col .nm small{color:var(--ink2);font-size:12.5px}
  .ac .cr-col .dica{grid-column:2;font-size:12.5px;color:var(--tag-info);margin-top:-2px}
  .ac .cr-arq{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 12px;border:1px solid var(--cr-bd);background:var(--cr-surf);border-radius:12px;font-size:14px}
  .ac .cr-arq b{font-weight:600}
  .ac .cr-nota{font-size:13px;color:var(--ink2);margin:0}
  .ac .cr-cta{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;padding:12px;border:1px dashed var(--line);border-radius:12px;font-size:13.5px;color:var(--ink2)}
  .ac .cr-x{width:34px;padding:0!important;justify-content:center}
  .ac .cr-acts .btn{gap:5px}
  .ac .cr-troca{border:1.5px solid var(--ink);border-radius:12px;background:var(--cr-surf);overflow:hidden}
  .ac .cr-troca-h{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px 6px;font-size:14px;font-weight:700}
  .ac .cr-troca-at{padding:0 12px 10px;font-size:12.5px;color:var(--ink2)}
  .ac .cr-troca .q{display:flex;align-items:center;gap:8px;height:40px;margin:0 12px 6px;padding:0 12px;border-radius:10px;border:1px solid var(--cr-bd);color:var(--ink2);font-size:14px}
  .ac .cr-troca .cr-op{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:11px 12px;border-top:1px solid var(--cr-bd);border-radius:0;font-size:14px;color:var(--ink)}
  .ac .cr-troca .cr-op:hover{background:transparent}
  .ac .cr-troca .cr-op .esc{font-size:12.5px;font-weight:700;color:var(--ink);white-space:nowrap}
  .ac .cr-troca .cr-op-sec{padding:10px 12px 4px;border-top:1px solid var(--cr-bd);font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--ink2)}
  .ac .cr-troca .cr-op.off{color:var(--ink2);border-top:0;padding-top:6px;flex-wrap:nowrap!important}
  .ac .cr-troca .cr-op .cr-st{flex:none}
  .ac .cr-troca .cr-op.novo{border-top:1px solid var(--cr-bd);margin:0;padding:12px;font-weight:700}
  .ac .cr-mais{display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:12px;border:1px solid var(--cr-bd);background:var(--cr-surf);color:var(--ink);font-size:20px;line-height:1}
  .ac .cr-seg.rola{flex-wrap:nowrap;overflow-x:auto;margin:0 -16px;padding:0 16px 2px;scrollbar-width:none}
  .ac .cr-seg.rola button{flex:none}
  .ac .cr-sel{width:100%;height:44px;border-radius:12px;border:1px solid var(--cr-bd);background:var(--cr-surf);padding:0 12px;font-size:16px;color:var(--ink);font-weight:600}
  .ac .cr-bm{display:grid;gap:2px;padding:12px 0 2px;border-top:1px solid var(--cr-bd);font-size:15px;line-height:1.4;color:var(--ink)}
  .ac .cr-bm:first-child{border-top:0}
  .ac .cr-bm .meta{display:flex;align-items:center;flex-wrap:wrap;gap:0 14px;font-size:13px;color:var(--ink2)}
  .ac .cr-bm .meta a{display:inline-flex;align-items:center;min-height:44px;font-weight:700;color:var(--ink);text-decoration:underline;text-underline-offset:2px}
  .ac .cr-bm.esc>span{color:var(--ink2)}
  .ac .cr-bm-a{display:grid;grid-template-columns:1fr 44px;gap:10px;align-items:start;padding:12px 0;border-top:1px solid var(--cr-bd);font-size:15px;line-height:1.4}
  .ac .cr-bm-a:first-child{border-top:0}
  .ac .cr-bm-a small{display:block;font-size:13px;color:var(--ink2);margin-top:4px}
  .ac .cr-bc{border:1px solid var(--cr-bd);background:var(--cr-surf);border-radius:14px;padding:12px;display:grid;gap:8px;font-size:15px;line-height:1.4}
  .ac .cr-bc-h{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:13px;color:var(--ink2)}
  .ac .cr-bc-h .ic{display:flex;gap:6px}
  .ac .cr-bc-h .ic button{width:44px;height:44px;border-radius:12px;border:1px solid var(--cr-bd);background:transparent;color:var(--ink);display:inline-flex;align-items:center;justify-content:center}
  .ac .cr-tA .btn,.ac .cr-tC .btn,.cr-sheet .btn{white-space:normal;text-align:left;height:auto;min-height:36px}
  .ac .cr-tA{min-width:0;border:1px solid var(--cr-bd);background:var(--cr-surf);border-radius:14px;padding:12px 16px 16px;display:grid;gap:10px}
  .ac .cr-tA-h{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:15px}
  .ac .cr-tA-at{font-size:13px;color:var(--ink2);margin:-4px 0 2px}
  .ac .cr-tA-op{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border-radius:12px;background:rgba(120,120,128,.07);font-size:14px;line-height:1.4;color:var(--ink)}
  .ac .cr-tA-op .btn{flex:none}
  .ac .cr-tsec{font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--ink2);padding-top:6px}
  .ac .cr-tja{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:4px 2px;font-size:14px;line-height:1.4;color:var(--ink2)}
  .ac .cr-tja .cr-st{flex:none}
  .ac .cr-tC{display:grid;gap:8px;padding:4px 0 0 14px;border-left:2px solid var(--gold-deep);margin-left:2px}
  .ac .cr-tC-at{box-shadow:inset 0 0 0 1.5px var(--gold-deep)}
  .ac .cr-tC-tag{display:block;font-size:11.5px!important;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--gold-text)!important;margin:0 0 2px!important}
  .ac-dialogo.cr-dlg{position:fixed}
  .ac .cr-sheet,.cr-sheet{position:absolute;inset:0;z-index:5;background:var(--gl-solid);padding:16px 20px 24px;overflow:auto;display:grid;gap:10px;align-content:start;border-radius:inherit}
  .cr-sheet-h{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:16px;padding-bottom:4px;border-bottom:1px solid var(--cr-bd, rgba(60,60,67,.2));margin:0 -20px 4px;padding:0 20px 10px}
  .cr-sD{padding:0!important;gap:0!important;display:flex!important;flex-direction:column}
  .cr-sD-h{position:sticky;top:0;z-index:2;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:8px;padding:12px 12px 12px 8px;border-bottom:1px solid var(--cr-bd);background:var(--gl-solid);font-size:16px}
  .cr-sD-h b{text-align:center;letter-spacing:-.01em}
  .cr-sD-v{display:inline-flex;align-items:center;gap:2px;justify-self:start;min-height:44px;padding:0 10px 0 4px;border:0;background:transparent;color:var(--ink);font-size:15px;font-weight:600;border-radius:12px;cursor:pointer}
  .cr-sD-c{flex:1 1 auto;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:8px;padding:16px 20px 20px}
  .cr-sD-c>*,.ac .cr-sD-c .cr-q{flex:none!important}
  .cr-sD-at{display:grid;gap:3px;padding:12px 14px;border-radius:14px;background:var(--tag-gold-bg);box-shadow:inset 0 0 0 1.5px var(--gold-deep);font-size:14.5px;line-height:1.4;color:var(--ink);margin-bottom:6px}
  .cr-sD-at small{font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--gold-text)}
  .cr-sD-op{display:flex;align-items:center;justify-content:space-between;gap:14px;width:100%;min-height:56px;padding:12px 14px;border-radius:14px;border:1px solid var(--cr-bd);background:var(--cr-surf);font:inherit;font-size:14.5px;line-height:1.4;color:var(--ink);text-align:left;cursor:pointer}
  .cr-sD-esc{flex:none;font-size:13px;font-weight:700;color:var(--ink);padding:7px 12px;border-radius:10px;border:1px solid var(--cr-bd)}
  .cr-sD-ja{display:grid;gap:2px;padding:4px 14px;border-radius:14px;background:rgba(120,120,128,.07)}
  .cr-sD-ja .cr-tja{padding:8px 0}
  .cr-sD-ja .cr-tja+.cr-tja{border-top:1px solid var(--cr-bd)}
  .cr-sD .cr-tsec{padding-top:10px}
  .cr-sD-f{position:sticky;bottom:0;padding:12px 20px 16px;border-top:1px solid var(--cr-bd);background:var(--gl-solid)}
  .cr-sD-f .btn{width:100%;justify-content:center;white-space:normal}
  .ac .cr-bd{border:1px solid var(--cr-bd);background:var(--cr-surf);border-radius:14px;padding:12px 14px 2px;display:grid;gap:2px;font-size:15px;line-height:1.4;color:var(--ink)}
  .ac .cr-bd .meta{display:flex;align-items:center;flex-wrap:nowrap;gap:0 16px;font-size:13px;color:var(--ink2);border-top:1px solid var(--cr-bd);margin-top:8px}
  .ac .cr-bd .meta .q{margin-right:auto}
  .ac .cr-bd .meta a{display:inline-flex;align-items:center;min-height:44px;font-weight:700;color:var(--ink);text-decoration:underline;text-underline-offset:2px}
  .ac .cr-bd.esc>span{color:var(--ink2)}
  .ac .cr-tile.cr-acao{box-shadow:inset 0 0 0 1.5px var(--ink)}
  .ac .cr-tile.cr-acao .rev{font-size:12.5px;font-weight:700;color:var(--ink);text-decoration:underline}
  .cr-dlg .cr-rodape{position:sticky;bottom:-24px;margin:4px -24px -24px;padding:12px 24px 16px;background:var(--gl-solid);border-top:1px solid var(--line);justify-content:space-between!important;align-items:center;z-index:2}
  .cr-dlg .cr-rodape .cr-cont{font-size:13px;color:var(--ink2);margin-right:auto}
  @media (max-width:640px),(pointer:coarse){.ac .cr-ib,.ac .cr-add,.ac .cr-seg button,.ac .cr-op.novo{min-height:44px}.ac .cr-ib{min-width:44px}}
  .ac-dialogo.cr-dlg{width:min(680px,calc(100vw - 24px));max-height:calc(100dvh - 32px)}
  .ac-dialogo.cr-dlg form{max-height:calc(100dvh - 32px);overflow:auto}
  @media (max-width:640px){
    .ac .cr-col{grid-template-columns:1fr}
    .ac .cr-col .dica{grid-column:1}
    .ac .cr-item{flex-wrap:wrap}
    .ac .cr-item .cr-acts{width:100%;justify-content:flex-end}
    .ac .cr-col select{font-size:16px}
    .ac .cr-op.off{flex-wrap:wrap}
    .ac .cr-op.off small{width:100%}
  }
  @media (max-width:640px){
    .cr-dlg .cr-rodape .cr-cont{width:100%}
    .cr-dlg .cr-rodape .btn{flex:1}
    .ac .cr-bi{grid-template-columns:22px 1fr}
    .ac .cr-bi .cr-acts{grid-column:2}
    .ac .cr-linha{display:grid;grid-template-columns:1fr auto;gap:6px 10px;align-items:center}
    .ac .cr-linha .cr-bloco{justify-self:start}
    .ac .cr-linha .cr-tx{grid-column:1 / -1;grid-row:2}
  }`;
  const estilo = () => {
    if (document.getElementById('cr-css')) return;
    const s = document.createElement('style');
    s.id = 'cr-css';
    s.textContent = css;
    document.head.appendChild(s);
  };

  /* Itens de exemplo: textos genéricos do banco da planilha (material do programa, sem dado pessoal). */
  const SUG = {
    EXPERIENCIA: ['Subir em uma árvore em família e tirar uma foto (mandar a foto no nosso grupo).'],
    DESAFIO: ['Passar 24 horas em jejum, ingerindo apenas água. (Ao iniciar e ao finalizar o jejum, envie uma foto com o horário no grupo.)'],
    FILME: ['O Pacto', 'Pra Sempre Vencedor'],
    LIVRO: ['Em busca de um sentido'],
    EAP: [
      'POR QUE É TÃO DIFÍCIL MUDAR https://www.youtube.com/watch?v=x',
      'INTELIGENCIA LTDA https://www.youtube.com/watch?v=x',
      'O QUE TODA PESSOA PRECISA APRENDER PARA CRESCER https://www.youtube.com/watch?v=x',
    ],
  };

  /* 1. Janela "Enviar o 2º PME" (ficha → card PME atual → Registrar envio). */
  function envio({ trocar = false } = {}) {
    estilo();
    const dl = document.querySelector('dialog[open]');
    dl.classList.add('cr-dlg');
    const form = dl.querySelector('form');
    form.querySelector('h2').textContent = 'Enviar o 2º PME';
    form.querySelector('h2 + p').textContent =
      'O ciclo nasce com as atividades extras do catálogo, os itens do cronograma abaixo e a tarefa de encerramento, com prazo de 30 dias.';
    form.querySelector('.flex.flex-wrap.justify-end button.btn-primary').textContent = 'Enviar o 2º PME';
    const blocos = ORDEM.map((b) => {
      const itens = SUG[b]
        .map(
          (t, i) => `<div class="cr-item"><div class="cr-tx">${link(t)}${
            b === 'FILME' && i === 0 ? '<span class="cr-plan">Estava na planilha para este PME</span>' : ''
          }</div><div class="cr-acts"><button type="button" class="btn btn-secondary sm">${svg(TROCA, 'cr-s')}Trocar</button><button type="button" class="btn btn-secondary sm cr-x" aria-label="Tirar">${svg(X, 'cr-s')}</button></div></div>`,
        )
        .join('');
      const troca = trocar && b === 'DESAFIO';
      const v = trocar === true ? 'A' : trocar === 'D' ? 'B' : trocar;
      const OPS = [
        'Durante 7 dias, beber pelo menos 3 litros de água por dia.',
        'Fazer 100 agachamentos em um único dia.',
        'Durante 7 dias, fazer pelo menos um elogio sincero por dia para alguém.',
      ];
      const JA = [
        ['Durante 3 dias colocar despertador no celular de uma em uma hora…', '1º PME'],
        ['Dormir no chão durante uma noite.', 'RDV'],
      ];
      const escolher = '<button type="button" class="btn btn-secondary sm">Escolher</button>';
      const novo = `<button type="button" class="btn btn-secondary sm" style="justify-self:start">${svg(MAIS, 'cr-s')}Escrever um desafio só para esta pessoa</button>`;
      const buscaQ = `<div class="cr-q" style="max-width:none;height:44px">${svg(BUSCA, 'cr-s')} Buscar desafio</div>`;
      const jaRec = `<div class="cr-tsec">Já recebeu · não dá para repetir</div>${JA.map(([t, q]) => `<div class="cr-tja"><span>${t}</span><span class="cr-st">${q}</span></div>`).join('')}`;
      let busca = '';
      if (troca && v === 'A') {
        busca = `<div class="cr-tA"><div class="cr-tA-h"><b>Trocar o desafio</b><button type="button" class="btn btn-ghost sm">Cancelar</button></div>
          <p class="cr-tA-at">No lugar de: Passar 24 horas em jejum, ingerindo apenas água.</p>
          ${buscaQ}
          ${OPS.map((t) => `<div class="cr-tA-op"><span>${t}</span>${escolher}</div>`).join('')}
          ${jaRec}
          ${novo}</div>`;
      } else if (troca && v === 'C') {
        busca = `<div class="cr-item cr-tC-at"><div class="cr-tx"><small class="cr-tC-tag">Trocando este</small>Passar 24 horas em jejum, ingerindo apenas água. (Ao iniciar e ao finalizar o jejum, envie uma foto com o horário no grupo.)</div><div class="cr-acts"><button type="button" class="btn btn-secondary sm">Cancelar</button></div></div>
          <div class="cr-tC"><span class="cr-tsec" style="padding:0">Escolha outro desafio</span>${buscaQ}
          ${OPS.map((t) => `<div class="cr-item"><div class="cr-tx">${t}</div><div class="cr-acts">${escolher}</div></div>`).join('')}
          ${jaRec}${novo}</div>`;
      }
      return `<div class="cr-grupo"><div class="cr-grupo-h"><span style="display:flex;align-items:center;gap:6px">${svg(ICON[b])}${PLURAL[b]}</span><span class="cr-ok">${SUG[b].length} de ${MODELO[b]}</span></div>${troca && v !== 'B' ? busca : itens}${
        troca && v !== 'B' ? '' : `<button type="button" class="btn btn-secondary sm" style="justify-self:start">${svg(MAIS, 'cr-s')}Adicionar ${b === 'EAP' ? 'EAP' : NOME[b].toLowerCase()}</button>`
      }</div>`;
    }).join('');
    const sec = document.createElement('div');
    sec.className = 'cr-sec';
    sec.innerHTML = `<div class="cr-sec-h"><h3>Cronograma deste PME</h3><span class="cr-modelo">Modelo da planilha: 3 EAP · 1 experiência · 1 desafio · 2 filmes · 1 livro</span></div>
      <p class="cr-nota">Sugerimos os primeiros itens que Mentorado Fictício 01 ainda não recebeu, nem no RDV. Troque o que quiser; em "Adicionar" dá para escrever um item só para esta pessoa.</p>
      ${blocos}`;
    const aviso = form.querySelector('.pme-aviso');
    const rodape = form.querySelector('.flex.flex-wrap.justify-end');
    (aviso || rodape).before(sec);
    rodape.classList.add('cr-rodape');
    rodape.insertAdjacentHTML('afterbegin', '<span class="cr-cont">8 itens do cronograma</span>');
    if (trocar === 'D') {
      const ops = [
        'Durante 7 dias, beber pelo menos 3 litros de água por dia.',
        'Fazer 100 agachamentos em um único dia.',
        'Durante 7 dias, fazer pelo menos um elogio sincero por dia para alguém.',
        'Ficar 12 horas sem utilizar cadeira.',
      ];
      const JA = [
        ['Durante 3 dias colocar despertador no celular de uma em uma hora…', '1º PME'],
        ['Dormir no chão durante uma noite.', 'RDV'],
      ];
      const sheet = document.createElement('div');
      sheet.className = 'cr-sheet cr-sD';
      sheet.innerHTML = `<div class="cr-sD-h"><button type="button" class="cr-sD-v" aria-label="Voltar">${svg('M15 18l-6-6 6-6', 'cr-i')}Voltar</button><b>Trocar desafio</b><span></span></div>
        <div class="cr-sD-c">
          <div class="cr-sD-at"><small>Trocando este</small><span>Passar 24 horas em jejum, ingerindo apenas água.</span></div>
          <div class="cr-q" style="max-width:none;height:44px">${svg(BUSCA, 'cr-s')} Buscar entre 89 desafios</div>
          <div class="cr-tsec">Ainda não recebeu</div>
          ${ops.map((t) => `<button type="button" class="cr-sD-op"><span>${t}</span><span class="cr-sD-esc">Escolher</span></button>`).join('')}
          <div class="cr-tsec">Já recebeu · não dá para repetir</div>
          <div class="cr-sD-ja">${JA.map(([t, q]) => `<div class="cr-tja"><span>${t}</span><span class="cr-st">${q}</span></div>`).join('')}</div>
        </div>
        <div class="cr-sD-f"><button type="button" class="btn btn-secondary">${svg(MAIS, 'cr-s')}Escrever um desafio só para esta pessoa</button></div>`;
      dl.appendChild(sheet);
    } else if (trocar === 'B') {
      const JA = [
        ['Durante 3 dias colocar despertador no celular de uma em uma hora…', '1º PME'],
        ['Dormir no chão durante uma noite.', 'RDV'],
      ];
      const ops = [
        'Durante 7 dias, beber pelo menos 3 litros de água por dia.',
        'Fazer 100 agachamentos em um único dia.',
        'Durante 7 dias, fazer pelo menos um elogio sincero por dia para alguém.',
      ];
      const sheet = document.createElement('div');
      sheet.className = 'cr-sheet';
      sheet.innerHTML = `<div class="cr-sheet-h"><button type="button" class="btn btn-ghost sm">‹ Voltar</button><b>Trocar o desafio</b><span style="width:64px"></span></div>
        <p class="cr-tA-at" style="margin:0">No lugar de: Passar 24 horas em jejum, ingerindo apenas água.</p>
        <div class="cr-q" style="max-width:none;height:44px">${svg(BUSCA, 'cr-s')} Buscar desafio</div>
        ${ops.map((t) => `<div class="cr-item"><div class="cr-tx">${t}</div><div class="cr-acts"><button type="button" class="btn btn-secondary sm">Escolher</button></div></div>`).join('')}
        <div class="cr-tsec">Já recebeu · não dá para repetir</div>${JA.map(([t, q]) => `<div class="cr-tja"><span>${t}</span><span class="cr-st">${q}</span></div>`).join('')}
        <button type="button" class="btn btn-secondary sm" style="justify-self:start">${svg(MAIS, 'cr-s')}Escrever um desafio só para esta pessoa</button>`;
      dl.appendChild(sheet);
    } else if (trocar) {
      const g = [...sec.querySelectorAll('.cr-grupo')][1];
      g.scrollIntoView({ block: 'start' });
    }
  }

  /* 2. Card "PME atual" com as tarefas do cronograma (Jornada). */
  function card() {
    estilo();
    const ul = document.querySelector('.pme-ciclo.atual ul.pme-tarefas');
    const modelo = ul.querySelector('li.pme-tarefa:not(.enc)');
    const enc = ul.querySelector('li.pme-tarefa.enc');
    const itens = [
      ['EXPERIENCIA', 'Subir em uma árvore em família e tirar uma foto (mandar a foto no nosso grupo).', 'feita'],
      ['DESAFIO', 'Passar 24 horas em jejum, ingerindo apenas água.', 'nao_feita'],
      ['FILME', 'O Pacto', 'feita'],
      ['FILME', 'Pra Sempre Vencedor', 'feita'],
      ['LIVRO', 'Em busca de um sentido', 'pendente'],
      ['EAP', 'POR QUE É TÃO DIFÍCIL MUDAR', 'pendente'],
      ['EAP', 'INTELIGENCIA LTDA', 'pendente'],
      ['EAP', 'O QUE TODA PESSOA PRECISA APRENDER PARA CRESCER', 'pendente'],
    ];
    const cab = document.createElement('li');
    cab.className = 'cr-grupo-h';
    cab.style.cssText = 'list-style:none;padding:14px 2px 4px';
    cab.innerHTML = `<span>Cronograma deste PME</span><span class="cr-ok">3 de 8 feitos</span>`;
    enc.before(cab);
    for (const [b, t, st] of itens) {
      const li = modelo.cloneNode(true);
      li.querySelector('.pme-orig').innerHTML = `${NOME[b]}`;
      li.querySelector('.pme-orig').style.cssText = 'display:inline-flex;align-items:center;gap:4px';
      li.querySelector('.pme-orig').insertAdjacentHTML('afterbegin', svg(ICON[b], 'cr-s'));
      li.querySelector('b').textContent = t;
      const meta = li.querySelector('.meta');
      const sel = li.querySelector('select');
      const check = li.querySelector('button.check');
      li.className = 'pme-tarefa ' + (st === 'feita' ? 'feita' : '');
      check.classList.toggle('done', st === 'feita');
      sel.className = 'pme-st ' + st;
      sel.value = st === 'feita' ? 'FEITA' : st === 'nao_feita' ? 'NAO_FEITA' : 'PENDENTE';
      [...sel.options].forEach((o, i) => (o.selected = i === (st === 'feita' ? 1 : st === 'nao_feita' ? 3 : 0)));
      meta.textContent =
        st === 'feita' ? 'Feita em 30/11/2026, Duda · prazo 24/12/2026' : st === 'nao_feita' ? 'Não feita: viajou a trabalho · prazo 24/12/2026' : 'Prazo 24/12/2026';
      if (st !== 'feita') li.querySelector('.pme-comp')?.remove();
      enc.before(li);
    }
    const ciclo = document.querySelector('.pme-ciclo.atual');
    ciclo.querySelector('.pme-nome').textContent = '2º PME';
    document.querySelectorAll('.pme-cab button').forEach((b) => b.lastChild && (b.lastChild.textContent = b.lastChild.textContent.replace('2º PME', '3º PME')));
    const dds = ciclo.querySelectorAll('dl.pme-datas dd');
    if (dds[0]) dds[0].firstChild.textContent = '24/11/2026 ';
    if (dds[1]) dds[1].firstChild.textContent = '24/12/2026 ';
    const extras = [...ul.querySelectorAll('li.pme-tarefa:not(.enc)')].slice(0, 2);
    const tx = ['Praticar um esporte diferente', 'Comer uma fruta nunca provada e enviar a foto no grupo'];
    extras.forEach((li, i) => (li.querySelector('b').textContent = tx[i]));
    enc.querySelector('b').textContent = 'Encerramento do 2º PME';
    ul.querySelectorAll('.meta').forEach((m) => (m.textContent = m.textContent.replace('03/12/2026', '24/12/2026').replace('17/11/2026', '28/11/2026')));
    const pct = document.querySelector('.pme-ciclo.atual .pme-barra-t b');
    if (pct) pct.textContent = '45%';
    const trilho = document.querySelector('.pme-ciclo.atual .pme-trilho span');
    if (trilho) trilho.style.width = '45%';
    document.querySelector('.pme-cab').scrollIntoView({ block: 'start' });
    window.scrollBy(0, -12);
  }

  /* 3. Aba "Cronograma" da ficha. */
  function aba() {
    estilo();
    const tabs = document.querySelector('.fc-main .tabs');
    tabs.querySelectorAll('button').forEach((b) => b.classList.remove('on'));
    const hist = [...tabs.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Histórico');
    const nova = hist.cloneNode(true);
    nova.textContent = 'Cronograma';
    nova.classList.add('on');
    hist.before(nova);
    document.querySelector('.fh-tags .tag').textContent = '2M';
    const ment = [...document.querySelectorAll('aside.fc-lado label.pr')].find((l) => l.textContent.includes('Mentoria'));
    if (ment) ment.querySelector('select').value = '2M';
    const painel = document.querySelector('.fc-main section[role=tabpanel]');
    const linha = (b, t, st, lbl) =>
      `<div class="cr-linha">${tagBloco(b)}<div class="cr-tx">${link(t)}</div><span class="cr-st ${st}">${lbl}</span></div>`;
    const chip = (b, t) => `<span class="cr-chip">${svg(ICON[b])}<span>${t}</span></span>`;
    const tiles = ORDEM.map(
      (b, i) =>
        `<div class="cr-tile"><span>${svg(ICON[b])}${PLURAL[b]}</span><b>${[14, 14, 28, 14, 42][i]}</b><small>recebidos</small><small>${[34, 89, 7, 13, 36][i]} novos para ele</small></div>`,
    ).join('');
    painel.innerHTML = `
      <div class="cr-sec-h" style="margin-bottom:4px"><h2 style="font-size:17px;font-weight:700;margin:0">Cronograma</h2><span class="cr-modelo">Nada se repete, nem da inscrição anterior</span></div>
      <p class="cr-sub" style="margin-bottom:14px">O que Mentorado Fictício 01 recebeu em cada PME, da mais recente para a mais antiga.</p>
      <div class="cr-resumo" style="margin-bottom:16px">${tiles}</div>
      <div style="display:grid;gap:12px">
        <div class="cr-pme"><div class="cr-pme-h"><b>2º PME</b><span>Enviado em 24/11/2026 · 3 de 8 feitos</span></div><div>
          ${linha('EXPERIENCIA', 'Subir em uma árvore em família e tirar uma foto (mandar a foto no nosso grupo).', 'feita', 'Feita')}
          ${linha('DESAFIO', 'Passar 24 horas em jejum, ingerindo apenas água.', 'nao', 'Não feita')}
          ${linha('FILME', 'O Pacto', 'feita', 'Feita')}
          ${linha('FILME', 'Pra Sempre Vencedor', 'feita', 'Feita')}
          ${linha('LIVRO', 'Em busca de um sentido', '', 'Pendente')}
          ${linha('EAP', 'POR QUE É TÃO DIFÍCIL MUDAR https://www.youtube.com/watch?v=x', '', 'Pendente')}
          ${linha('EAP', 'INTELIGENCIA LTDA https://www.youtube.com/watch?v=x', '', 'Pendente')}
          ${linha('EAP', 'O QUE TODA PESSOA PRECISA APRENDER PARA CRESCER https://www.youtube.com/watch?v=x', '', 'Pendente')}
        </div></div>
        <div class="cr-pme"><div class="cr-pme-h"><b>1º PME</b><span>Antes do sistema · da planilha</span></div>
          <div class="cr-chips"><span class="cr-chip nao">${svg(ICON.EXPERIENCIA)}<span>Fazer um quadro do sonhos com recortes de imagens em uma cartolina</span><em>Não fez</em></span>${chip('DESAFIO', 'Durante 3 dias colocar despertador no celular de uma em uma hora')}${chip('FILME', 'Um sonho possível')}${chip('FILME', 'Coach Carter')}${chip('LIVRO', 'Comece pelo Porquê')}${chip('EAP', 'É MELHOR SER CLT DO QUE EMPREENDER')}${chip('EAP', 'VENDER É MAIS IMPORTANTE QUE APRENDER A LER')}${chip('EAP', 'FÓRMULA DA RIQUEZA FINANCEIRA')}</div>
        </div>
        <div class="cr-pme"><div class="cr-pme-h"><b>No RDV</b><span>Outra inscrição · concluída em 10/2026 · 12 PMEs</span></div>
          <div class="cr-chips">${chip('EXPERIENCIA', 'A partir das 19h, apagar as luzes e deixá-las desligadas')}${chip('DESAFIO', 'Dormir no chão durante uma noite')}${chip('FILME', 'Até o Último Homem')}${chip('LIVRO', 'O Homem Mais Rico da Babilônia')}${chip('EAP', 'COLOQUE SEU TRABALHO ACIMA DO SEU RELACIONAMENTO')}<span class="cr-chip" style="background:transparent;border:1px dashed var(--line)"><span>e mais 91 itens</span></span></div>
        </div>
        <div class="cr-pme"><div class="cr-pme-h"><b>Já tinha antes</b><span>Leu ou viu antes da mentoria</span></div>
          <div class="cr-chips">${chip('LIVRO', 'Pai Rico, Pai Pobre')}${chip('LIVRO', 'Os Segredos da Mente Milionária')}</div>
        </div>
      </div>`;
  }

  /* 4. Configurações > Cronograma (banco, só Admin). */
  function banco(opcao) {
    estilo();
    const tabs = document.querySelector('.view .tabs');
    tabs.querySelectorAll('a').forEach((a) => a.classList.remove('on'));
    const pmes = [...tabs.querySelectorAll('a')].find((a) => a.textContent.trim() === 'PMEs');
    const nova = pmes.cloneNode(true);
    nova.textContent = 'Cronograma';
    nova.classList.add('on');
    pmes.after(nova);
    document.querySelector('.hrow p.sub').textContent =
      'Os itens que vão em cada PME: experiências, desafios, filmes, livros e EAP.';
    const corpo = tabs.nextElementSibling;
    [...document.querySelectorAll('.ac p')].filter((p) => p.textContent.includes('PME de Aquecimento')).forEach((p) => p.remove());
    const seg = ORDEM.map(
      (b, i) => `<button type="button" class="${i === 1 ? 'on' : ''}">${svg(ICON[b])}${PLURAL[b]} <em>${[48, 103, 35, 29, 78][i]}</em></button>`,
    ).join('');
    const dados = [
      ['Durante 3 dias colocar despertador no celular de uma em uma hora com a escrita: isso que estou prestes a fazer está me aproximando ou distanciando dos meus sonhos?', 'Enviado 43 vezes', false],
      ['Passar 24 horas em jejum, ingerindo apenas água. (Ao iniciar e ao finalizar o jejum, envie uma foto com o horário no grupo.)<small style="font-style:italic">“Grande parte do sofrimento vem da dificuldade em lidar com pequenos desconfortos…”</small>', 'Enviado 10 vezes', false],
      ['Fazer 100 agachamentos em um único dia. (Grave um pequeno vídeo realizando parte dos agachamentos ou envie uma foto ao concluir.)<small style="font-style:italic">“Seu corpo é capaz de muito mais do que você imagina…”</small>', 'Enviado 6 vezes', false],
      ['Guardar o máximo de dinheiro que conseguir', 'Enviado 8 vezes · não aparece nas sugestões', true],
      ['Dormir no chão durante uma noite. (Envie uma foto do local onde dormiu.)<small style="font-style:italic">“Quando escolhemos abrir mão do conforto por um curto período, passamos a valorizá-lo muito mais…”</small>', 'Enviado 5 vezes', false],
      ['Durante 7 dias, beber pelo menos 3 litros de água por dia. (Envie uma foto da garrafa utilizada ou um registro diário da quantidade consumida.)<small style="font-style:italic">“Disciplina também é cuidar do próprio corpo…”</small>', 'Nunca enviado', false],
      ['Durante 30 dias, manter sua cama arrumada antes de sair do quarto. (Envie uma foto da cama arrumada no primeiro e no último dia do desafio.)', 'Nunca enviado', false],
    ];
    const itens = dados
      .map(
        ([t, m, esc], i) => `<div class="cr-bi ${esc ? 'esc' : ''}"><span class="n">${i + 1}</span><div class="cr-tx">${t}<small>${esc ? '<span class="cr-st" style="height:20px;margin-right:6px">Escondido</span>' : ''}${m}</small></div><div class="cr-acts"><button type="button" class="btn btn-secondary sm">Editar</button><button type="button" class="btn btn-secondary sm">${esc ? 'Mostrar' : 'Esconder'}</button></div></div>`,
      )
      .join('');
    corpo.innerHTML = `<section class="card sec">
      <header style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><h2>Banco do cronograma</h2><button type="button" class="btn btn-primary sm">${svg(MAIS, 'cr-s')} Novo desafio</button></header>
      <p class="cr-nota" style="margin-bottom:12px">A Operação escolhe daqui no envio de cada PME. Item já enviado não se apaga: esconda para ele sair das sugestões. Corrigir o texto não muda o que já foi enviado.</p>
      <div class="cr-barra" style="margin-bottom:8px"><div class="cr-seg">${seg}</div><div class="cr-q">${svg(BUSCA, 'cr-s')} Buscar no banco</div></div>
      <div class="cr-banco">${itens}</div></section>`;
    if (!opcao) return;
    /* Opções só do celular (375 px), para escolher. */
    const texto = (t) => t.replace(/<small[^>]*>.*?<\/small>/, '');
    const segRola = `<div class="cr-seg rola" style="margin-bottom:10px">${seg}</div>`;
    const busca = `<div class="cr-q" style="max-width:none;height:44px;margin-bottom:6px">${svg(BUSCA, 'cr-s')} Buscar no banco</div>`;
    const OLHO = 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z';
    const LAPIS = 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4';
    const tagEsc = '<span class="cr-st" style="height:20px;margin-right:6px">Escondido</span>';
    let lista = '';
    let filtro = segRola + busca;
    if (opcao === 'A') {
      filtro = `<select class="cr-sel" style="margin-bottom:8px">${ORDEM.map((b, i) => `<option ${i === 1 ? 'selected' : ''}>${PLURAL[b]} · ${[48, 103, 35, 29, 78][i]}</option>`).join('')}</select>${busca}`;
      lista = dados
        .map(([t, m, esc]) => `<div class="cr-bm-a"><div style="color:var(${esc ? '--ink2' : '--ink'})">${texto(t)}<small>${esc ? tagEsc : ''}${m.split(' · ')[0]}</small></div><button type="button" class="cr-mais" aria-label="Opções">⋯</button></div>`)
        .join('');
    } else if (opcao === 'D') {
      lista = `<div style="display:grid;gap:8px">${dados
        .map(([t, m, esc]) => `<div class="cr-bd ${esc ? 'esc' : ''}">${esc ? `<span style="justify-self:start;margin-bottom:4px">${tagEsc}</span>` : ''}<span>${texto(t)}</span><div class="meta"><span class="q">${m.split(' · ')[0]}</span><a href="#">Editar</a><a href="#">${esc ? 'Mostrar' : 'Esconder'}</a></div></div>`)
        .join('')}</div>`;
    } else if (opcao === 'B') {
      lista = dados
        .map(([t, m, esc]) => `<div class="cr-bm ${esc ? 'esc' : ''}"><span>${texto(t)}</span><div class="meta">${esc ? tagEsc : ''}<span>${m.split(' · ')[0]}</span><a href="#">Editar</a><a href="#">${esc ? 'Mostrar' : 'Esconder'}</a></div></div>`)
        .join('');
    } else {
      lista = `<div style="display:grid;gap:8px">${dados
        .map(([t, m, esc]) => `<div class="cr-bc"><div class="cr-bc-h"><span>${esc ? tagEsc : ''}${m.split(' · ')[0]}</span><span class="ic"><button type="button" aria-label="Editar">${svg(LAPIS)}</button><button type="button" aria-label="${esc ? 'Mostrar' : 'Esconder'}">${svg(OLHO)}</button></span></div><div style="color:var(${esc ? '--ink2' : '--ink'})">${texto(t)}</div></div>`)
        .join('')}</div>`;
    }
    const sec = corpo.querySelector('section');
    sec.querySelector('.cr-barra').outerHTML = filtro;
    sec.querySelector('.cr-banco').innerHTML = lista;
    sec.querySelector('.cr-nota').textContent = 'Esconda o que não quer mais nas sugestões. Item já enviado não se apaga.';
  }

  /* 5. Configurações > Importação: card do cronograma com a prévia. */
  function importacao() {
    estilo();
    document.querySelector('.hrow p.sub').textContent =
      'Traga a carteira e a planilha do cronograma, sem redigitar.';
    const tabs = document.querySelector('.view .tabs');
    const pmes = [...tabs.querySelectorAll('a')].find((a) => a.textContent.trim() === 'PMEs');
    const nova = pmes.cloneNode(true);
    nova.textContent = 'Cronograma';
    nova.classList.remove('on');
    pmes.after(nova);
    const corpo = tabs.nextElementSibling;
    const col = (nome, sub, sel, dica = '') =>
      `<div class="cr-col"><div class="nm"><b>${nome}</b><small>${sub}</small></div><select class="pv field" style="height:38px;border-radius:10px;padding:0 10px">${sel
        .map((o, i) => `<option ${i === 0 ? 'selected' : ''}>${o}</option>`)
        .join('')}</select>${dica ? `<div class="dica">${dica}</div>` : ''}</div>`;
    const sec = document.createElement('section');
    sec.className = 'card sec';
    sec.innerHTML = `
      <header><h2>Planilha do cronograma</h2></header>
      <p class="cr-nota" style="margin-bottom:6px"><b>Depois da carteira:</b> cada coluna da planilha precisa achar a ficha do mentorado.</p>
      <p class="cr-nota" style="margin-bottom:12px">Baixe a aba CRONOGRAMA em <b>.csv</b> (Arquivo → Fazer download → Valores separados por vírgula). Rodar de novo não duplica nada: só entra o que falta.</p>
      <div class="cr-arq" style="margin-bottom:14px"><span style="flex:1;min-width:0"><b>CRONOGRAMA - CRONOGRAMA.csv</b> · 204 KB</span><button type="button" class="btn btn-secondary sm">Trocar arquivo</button></div>
      <div class="cr-resumo" style="margin-bottom:16px">
        <div class="cr-tile"><span>Itens do banco</span><b>293</b><small>5 blocos · 3 repetidos juntados</small></div>
        <div class="cr-tile"><span>Colunas ligadas</span><b>196</b><small>de 249 · 19 sem marcação</small></div>
        <div class="cr-tile cr-acao"><span>Para você decidir</span><b>34</b><small>25 em dúvida · 9 sem ficha</small><span class="rev">Revisar ↓</span></div>
        <div class="cr-tile"><span>Viram tarefa do PME aberto</span><b>312</b><small>o mês atual de cada um</small></div>
        <div class="cr-tile"><span>De PMEs antigos</span><b>7.640</b><small>+ 88 marcados para PMEs que ainda não saíram · 113 já tinha antes · 6 não fez</small></div>
      </div>
      <div class="cr-sec" style="margin-bottom:6px"><div class="cr-sec-h"><h3>Em dúvida (25)</h3><span class="cr-modelo">Escolha a ficha de cada coluna. Sem escolha, a coluna fica de fora.</span></div>
        <div>
          ${col('Mentorado Fictício 01', 'Coluna 4 · vai até o 12º mês · 61 itens', ['RDV · Concluído · 12º PME', '2M · Ativo · 2º PME', 'Ignorar esta coluna'], 'A coluna vai até o 12º mês: deve ser o RDV. O que ele recebeu lá também vale na 2M.')}
          ${col('Mentorada 04', 'Coluna 9 · vai até o 5º mês · 26 itens', ['Escolher a ficha…', 'Mentorada Fictícia 04 · RDV · Ativo · 5º PME', 'Mentorada Fictícia 06 · 6M · Ativo · 1º PME', 'Ignorar esta coluna'])}
          </div><button type="button" class="btn btn-secondary sm" style="margin-top:4px;justify-self:start">Ver as outras 23 colunas em dúvida</button></div>
      <div class="cr-sec"><div class="cr-sec-h"><h3>Sem ficha (9)</h3><span class="cr-modelo">Nome da planilha que não achei no sistema</span></div>
        <div>${col('Mentorados 08 e 09', 'Coluna 17 · vai até o 3º mês · 18 itens', ['Ignorar esta coluna', 'Mentorada Fictícia 08 e Mentorado Fictício 09 · RDV · Ativo', 'Buscar outra ficha…'])}</div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:space-between;align-items:center;margin-top:16px">
        <span class="cr-nota">Células ignoradas: 2 (nomes soltos na coluna, sem mês).</span>
        <div style="display:flex;gap:8px"><button type="button" class="btn btn-secondary sm">Cancelar</button><button type="button" class="btn btn-primary sm">Importar 196 colunas</button></div>
      </div>`;
    corpo.append(sec);
    sec.style.marginTop = '16px';
  }

  window.__cr = { envio, card, aba, banco, importacao };
})();
