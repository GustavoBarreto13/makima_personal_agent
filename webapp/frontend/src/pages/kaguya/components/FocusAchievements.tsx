// FocusAchievements — grid de conquistas de foco (spec 062). Nunca persistidas no
// backend: toda vez que a tela abre, o catálogo inteiro é reavaliado contra o
// histórico (GET /focus/achievements) — o que este componente recebe já vem
// pronto, com unlocked/progress/target calculados.

import type { FocusAchievement } from '../types'

interface FocusAchievementsProps {
  achievements: FocusAchievement[]
}

// pt-BR "27 jul 2026" a partir de "AAAA-MM-DD" — parsing local, nunca toISOString.
function fmtDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function FocusAchievements({ achievements }: FocusAchievementsProps) {
  const unlockedCount = achievements.filter((a) => a.unlocked).length

  return (
    <div className="kg-fach">
      <div className="kg-fach-summary">{unlockedCount}/{achievements.length} conquistadas</div>
      <div className="kg-fach-grid">
        {achievements.map((a) => (
          <div
            key={a.id}
            className={`kg-fach-badge${a.unlocked ? ' unlocked' : ' locked'}`}
            title={a.unlocked && a.unlocked_at ? `Desbloqueada em ${fmtDate(a.unlocked_at)}` : a.description}
          >
            <span className="kg-fach-icon">{a.icon}</span>
            <span className="kg-fach-name">{a.name}</span>
            <span className="kg-fach-desc">{a.description}</span>
            {!a.unlocked && (
              <div className="kg-fach-progress">
                <div className="kg-fach-progress-track">
                  <div
                    className="kg-fach-progress-fill"
                    style={{ width: `${Math.min(100, (a.progress / a.target) * 100)}%` }}
                  />
                </div>
                <span className="kg-fach-progress-label">{a.progress}/{a.target}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
