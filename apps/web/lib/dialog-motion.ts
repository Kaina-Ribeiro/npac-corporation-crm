/**
 * Fecha um `<dialog>` com a saída animada (`.dlg[data-closing]` em `globals.css`). A janela segue
 * modal durante a saída (140 ms), então nada abre por cima nem a desmontagem corta o movimento;
 * depois `close()` e `done` (quem abriu desmonta). Movimento reduzido: a saída dura 0 e fecha já.
 */
export function closeWithMotion(el: HTMLDialogElement | null, done?: () => void): void {
  if (!el?.open) {
    done?.();
    return;
  }
  if (el.dataset.closing !== undefined) return;
  el.dataset.closing = '';
  const finish = () => {
    el.close();
    delete el.dataset.closing;
    done?.();
  };
  // `getAnimations()` recalcula o estilo: a transição de saída já existe aqui.
  const running = el.getAnimations();
  if (!running.length) return finish();
  void Promise.all(running.map((a) => a.finished)).then(finish, finish);
}
