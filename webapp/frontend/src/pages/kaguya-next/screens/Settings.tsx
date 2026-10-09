// Ajustes da Kaguya: a página que a gaveta de Preferências aponta ("Mais ajustes"). A gaveta fica só com o rápido; aqui
// moram o que pede espaço — a agenda de trabalho (dias, expediente, almoço, sono e exceções), o menu lateral (o que
// mostrar e o que fixar) e as abas do celular. Tudo grava na hora, no navegador (preferências) ou no servidor (agenda).

import { Chip, Icon, IconButton, Page, SectionHeader, SegmentedControl, SettingRow, Toggle, toast } from '../../../design'
import { ScheduleSettings } from '../components/ScheduleSettings'
import { useKaguya, type KaguyaPrefs } from '../context'
import { DEFAULT_MOBILE_TABS, FIXED_NAV } from '../lib/nav'

export const SPACE_CHOICES = [{ value: 'all', label: 'Tudo' }, { value: 'work', label: 'Trabalho' }, { value: 'personal', label: 'Pessoal' }] as const

/** As linhas de exibição, usadas na página de Ajustes e (as rápidas) na gaveta de Preferências. */
export function DisplaySettings({ compact }: { compact?: boolean }) {
  const { prefs, setPrefs } = useKaguya()
  return (
    <>
      <SettingRow title="Espaço" help="Filtra todas as telas: o que é de Trabalho e o que é Pessoal. O espaço de uma lista vem dela (ou do grupo).">
        <SegmentedControl label="Espaço" value={prefs.space} options={[...SPACE_CHOICES]} onChange={(v) => setPrefs({ space: v })} />
      </SettingRow>
      <SettingRow title="Abrir a tarefa" help="Ao lado da lista ou centralizada na tela. Quadros e calendário sempre abrem no centro.">
        <SegmentedControl label="Abrir a tarefa" value={prefs.detailMode} options={[{ value: 'side', label: 'Ao lado' }, { value: 'center', label: 'No centro' }]} onChange={(v) => setPrefs({ detailMode: v })} />
      </SettingRow>
      <SettingRow title="Meu Dia" help="Com “Tudo”, divide em Trabalho e Pessoal ou mostra numa lista só.">
        <SegmentedControl label="Layout do Meu Dia" value={prefs.daySplit} options={[{ value: 'split', label: 'Dividido' }, { value: 'single', label: 'Único' }]} onChange={(v) => setPrefs({ daySplit: v })} />
      </SettingRow>
      <SettingRow title="Concluídas no fim da lista"><Toggle checked={prefs.showCompleted} onChange={(v) => setPrefs({ showCompleted: v })} label="Mostrar concluídas" /></SettingRow>
      <SettingRow title="Detalhes na linha" help="Notas e etiquetas ao lado do título."><Toggle checked={prefs.showDetails} onChange={(v) => setPrefs({ showDetails: v })} label="Mostrar detalhes" /></SettingRow>
      {!compact && (
        <>
          <SettingRow title="Estilo dos eventos no calendário" help="Suave (padrão), bloco sólido ou cartão editorial.">
            <SegmentedControl label="Estilo dos eventos" value={prefs.calVariant} options={[{ value: 'agora', label: 'Suave' }, { value: 'helvetico', label: 'Sólido' }, { value: 'editorial', label: 'Editorial' }]} onChange={(v) => setPrefs({ calVariant: v })} />
          </SettingRow>
          <SettingRow title="Lateral do calendário" help="Onde ficam o mini-mês e a lista de calendários.">
            <SegmentedControl label="Lateral do calendário" value={prefs.calSide} options={[{ value: 'left', label: 'Esquerda' }, { value: 'right', label: 'Direita' }]} onChange={(v) => setPrefs({ calSide: v })} />
          </SettingRow>
        </>
      )}
    </>
  )
}

const list = (cur: string[], id: string) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id])

export function Settings() {
  const { prefs, setPrefs } = useKaguya()
  const tabs = prefs.mobileTabs.length ? prefs.mobileTabs : DEFAULT_MOBILE_TABS
  const all = FIXED_NAV.flatMap((s) => s.items).filter((i) => i.id !== 'settings')

  const toggleTab = (id: string) => {
    if (tabs.includes(id)) { setPrefs({ mobileTabs: tabs.filter((t) => t !== id) }); return }
    if (tabs.length >= 3) { toast('A barra do celular tem até 3 abas. Tire uma para escolher outra.'); return }
    setPrefs({ mobileTabs: [...tabs, id] as KaguyaPrefs['mobileTabs'] })
  }

  return (
    <Page className="kn-page kn-settings">
      <section className="kn-card" aria-labelledby="st-view">
        <SectionHeader id="st-view" title="Exibição" />
        <DisplaySettings />
        <p className="ds-hint">Tema, densidade, largura do conteúdo e estilo de arte ficam em Preferências (tecla ?), e valem para todos os agentes.</p>
      </section>

      <section className="kn-card" aria-labelledby="st-agenda">
        <SectionHeader id="st-agenda" title="Agenda de trabalho" />
        <p className="ds-hint">Expediente, almoço e sono definem seu tempo livre (do trabalho e geral). O digest só fala de trabalho nos dias de trabalho.</p>
        <ScheduleSettings />
      </section>

      <section className="kn-card" aria-labelledby="st-menu">
        <SectionHeader id="st-menu" title="Menu lateral" />
        <p className="ds-hint">Esconda o que não usa e fixe no topo o que usa sempre. Vale para o desktop e para o celular. Para reordenar, arraste na própria barra lateral.</p>
        {FIXED_NAV.map((s) => (
          <div key={s.section} className="kn-set-group" role="group" aria-label={s.section}>
            <h3 className="kn-h3">{s.section}</h3>
            {s.items.map((i) => (
              <div key={i.id} className="kn-set-row">
                <Icon name={i.icon} size={18} />
                <span className="kn-set-name">{i.label}</span>
                <IconButton icon="pin" label={prefs.pinnedNav.includes(i.id) ? `Desafixar ${i.label}` : `Fixar ${i.label}`} aria-pressed={prefs.pinnedNav.includes(i.id)} className={prefs.pinnedNav.includes(i.id) ? 'kn-on' : undefined} onClick={() => setPrefs({ pinnedNav: list(prefs.pinnedNav, i.id) })} />
                <Toggle label={`Mostrar ${i.label}`} checked={!prefs.hiddenNav.includes(i.id)} onChange={() => setPrefs({ hiddenNav: list(prefs.hiddenNav, i.id) })} />
              </div>
            ))}
          </div>
        ))}
      </section>

      <section className="kn-card" aria-labelledby="st-tabs">
        <SectionHeader id="st-tabs" title="Barra do celular" mono={`${tabs.length}/3`} />
        <p className="ds-hint">Até 3 atalhos na barra de baixo; o resto fica no botão “Mais”.</p>
        <div className="kn-chips" role="group" aria-label="Abas do celular">
          {all.map((i) => <Chip key={i.id} on={tabs.includes(i.id)} aria-pressed={tabs.includes(i.id)} icon={i.icon} onClick={() => toggleTab(i.id)}>{i.label}</Chip>)}
        </div>
      </section>
    </Page>
  )
}
