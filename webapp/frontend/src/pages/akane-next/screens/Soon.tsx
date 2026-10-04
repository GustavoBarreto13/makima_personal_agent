// Telas que ainda estão só no visual antigo (a prévia /movies-next as recebe na próxima etapa da migração).

import { EmptyState, Page } from '../../../design'

export function Soon({ title }: { title: string }) {
  return (
    <Page>
      <EmptyState
        icon="sparkles"
        title={`${title}: chega na próxima etapa`}
        hint="Esta é a prévia do novo visual da Akane. Essa tela ainda vive no visual antigo, que continua funcionando."
        action={<a className="ds-btn ds-primary" href="/movies">Abrir no visual antigo</a>}
      />
    </Page>
  )
}
