// "Novo momento" pedido de fora da tela de escrever (atalho do ícone do app, botão flutuante, tecla N).
//
// O pedido precisa sobreviver até a tela carregar o dia: se o editor abrisse enquanto o dia ainda carrega,
// o carregamento o fecharia em seguida. Por isso o pedido fica guardado aqui (`pending`) e quem escreve
// (Write.tsx) o consome só quando o dia já está pronto.

let pending = false

/** Pede um novo momento: guarda o pedido e avisa a tela de escrever, se ela já estiver aberta. */
export function requestNewMoment(): void {
  pending = true
  window.dispatchEvent(new CustomEvent('violet:new-moment'))
}

/** Consome o pedido. Devolve `true` se havia um pedido esperando. */
export function takePendingNewMoment(): boolean {
  const had = pending
  pending = false
  return had
}
