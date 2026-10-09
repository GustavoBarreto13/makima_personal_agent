// Rede de segurança: se uma tela da Kaguya estourar ao renderizar (dado inesperado do servidor, por exemplo),
// mostra o estado de erro do padrão em vez de derrubar o app inteiro numa tela branca.
// Volta sozinha ao trocar de tela (`resetKey`).

import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button, ErrorState, Page } from '../../../design'

interface Props {
  /** Muda a cada navegação: limpa o erro e tenta de novo a tela nova. */
  resetKey: string
  onHome: () => void
  children: ReactNode
}

export class ScreenBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Kaguya: a tela falhou ao renderizar', error, info.componentStack)
  }

  componentDidUpdate(prev: Props) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false })
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <Page>
        <ErrorState
          title="Algo deu errado nesta tela"
          hint="Suas tarefas estão salvas. Tente de novo ou volte ao Meu Dia."
          onRetry={() => this.setState({ failed: false })}
        />
        <div><Button icon="home" onClick={this.props.onHome}>Voltar ao Meu Dia</Button></div>
      </Page>
    )
  }
}
