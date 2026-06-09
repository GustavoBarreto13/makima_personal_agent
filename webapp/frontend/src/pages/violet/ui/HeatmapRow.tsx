// HeatmapRow — uma linha de 7 células do heatmap de palavras escritas por dia.
// Cada célula é um quadrado 9×9px com cor variável conforme o volume de palavras.

interface HeatmapRowProps {
  // 7 valores de palavras (um por dia da semana, domingo a sábado)
  days: Array<{ date: string; words: number }>
}

// Converte contagem de palavras em nível de intensidade 0–4 para --heat-N
function heatLevel(words: number): number {
  if (words === 0)   return 0  // sem escrita — fundo vazio
  if (words < 50)    return 1  // escrita leve
  if (words < 100)   return 2  // escrita moderada
  if (words < 190)   return 3  // escrita intensa
  return 4                      // escrita muito intensa
}

export function HeatmapRow({ days }: HeatmapRowProps) {
  return (
    <div style={{ display: 'flex', gap: 3 }}>
      {days.map((day, i) => {
        const level = heatLevel(day.words)
        return (
          <div
            key={day.date || i}
            title={day.date ? `${day.date}: ${day.words} palavras` : ''}
            style={{
              width: 9,
              height: 9,
              borderRadius: 2,
              background: `var(--heat-${level})`,
              transition: 'background 0.2s',
            }}
          />
        )
      })}
    </div>
  )
}
