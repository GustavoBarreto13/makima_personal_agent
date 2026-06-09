// Barra de navegação inferior da tela Write — navega entre entries do diário.

interface WriteFooterProps {
  entryIdx: number
  totalEntries: number
  onNav: (action: 'prev' | 'next' | 'first' | 'latest' | 'today' | 'list') => void
}

export function WriteFooter({ entryIdx, totalEntries, onNav }: WriteFooterProps) {
  const isFirst  = entryIdx <= 0
  const isLatest = entryIdx >= totalEntries - 1

  return (
    <div className="w-foot">
      <button className="foot-btn" disabled={isFirst}  onClick={() => onNav('first')}>«</button>
      <button className="foot-btn" disabled={isFirst}  onClick={() => onNav('prev')}>‹</button>
      <button className="foot-btn" onClick={() => onNav('list')}>Lista</button>
      <button className="foot-btn today" onClick={() => onNav('today')}>●</button>
      <button className="foot-btn" disabled={isLatest} onClick={() => onNav('next')}>›</button>
      <button className="foot-btn" disabled={isLatest} onClick={() => onNav('latest')}>»</button>
    </div>
  )
}
