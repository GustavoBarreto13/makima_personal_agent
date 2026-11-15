// Linhas para escolher, ocultar e reordenar os "Seus números". Usada no editor da tela Hoje e em Preferências.

import { IconButton, SettingRow, Toggle } from '../../../design'
import { moveWidget, visibleWidgets, WIDGETS, type HomePrefs } from '../lib'

export function WidgetRows({ prefs, setPrefs }: { prefs: HomePrefs; setPrefs: (p: Partial<HomePrefs>) => void }) {
  const shown = new Set(visibleWidgets(prefs).map((w) => w.id))
  const ordered = [...prefs.order.filter((id) => WIDGETS.some((w) => w.id === id)), ...WIDGETS.map((w) => w.id).filter((id) => !prefs.order.includes(id))]

  const toggle = (id: string, on: boolean) =>
    setPrefs({ hidden: on ? prefs.hidden.filter((x) => x !== id) : [...prefs.hidden.filter((x) => x !== id), id] })

  return (
    <>
      {ordered.map((id, i) => {
        const w = WIDGETS.find((x) => x.id === id)!
        return (
          <SettingRow key={id} title={w.label}>
            <div className="mk-wedit">
              <IconButton icon="up" label={`Subir ${w.label}`} size={16} disabled={i === 0} onClick={() => setPrefs({ order: moveWidget(prefs, id, -1) })} />
              <IconButton icon="down" label={`Descer ${w.label}`} size={16} disabled={i === ordered.length - 1} onClick={() => setPrefs({ order: moveWidget(prefs, id, 1) })} />
              <Toggle label={`Mostrar ${w.label}`} checked={shown.has(id)} onChange={(on) => toggle(id, on)} />
            </div>
          </SettingRow>
        )
      })}
    </>
  )
}
