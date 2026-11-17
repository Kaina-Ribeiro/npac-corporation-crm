/**
 * Aviso curto de sucesso (D3, NPAC-47: o texto aprovado é "Salvo"). Um por vez: o novo substitui
 * o anterior e recomeça os 2,5 s. Erro não vem por aqui: a tela mostra a mensagem da API.
 *
 * Sem React: a região `role="status"` (`.toast-region`) vem pronta do layout de `(app)` e o aviso é
 * montado aqui direto no DOM, para não pesar no JS de toda tela (limite de 150 KB de `/leads`).
 */
let hide = 0;
let clear = 0;

export function showToast(text = 'Salvo') {
  const region = document.querySelector('.toast-region');
  if (!region) return;
  clearTimeout(hide);
  clearTimeout(clear);
  const toast = document.createElement('p');
  toast.className = 'toast';
  toast.dataset.on = '';
  toast.innerHTML =
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7"/></svg>';
  toast.append(text);
  region.replaceChildren(toast);
  hide = window.setTimeout(() => {
    delete toast.dataset.on;
    clear = window.setTimeout(() => toast.remove(), 200);
  }, 2500);
}
