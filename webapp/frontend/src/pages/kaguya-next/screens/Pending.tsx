// Tela ainda não migrada para o novo padrão. Durante a convivência (/tasks-next ao lado de /tasks) leva à versão atual;
// some quando o shell novo assume /tasks (todas as telas migradas).

import { Button, EmptyState, Page } from '../../../design'

export function Pending({ name }: { name: string }) {
  return (
    <Page>
      <EmptyState
        icon="sparkles"
        title={`${name} ainda está na versão atual`}
        hint="Esta tela será migrada para o novo padrão antes da troca. Enquanto isso, abra-a na versão atual — nada se perde."
        action={<Button icon="forward" onClick={() => window.location.assign('/tasks')}>Abrir na versão atual</Button>}
      />
    </Page>
  )
}
