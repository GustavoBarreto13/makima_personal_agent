/* ─────────────────────────────────────────────────────────────────────────
   Kaguya · Tarefas — Hábitos (força que perdoa falhas + heatmap)
   Força calculada com decaimento suave; check-in num toque (ou stepper).
   ───────────────────────────────────────────────────────────────────────── */

function freqLabel(h) {
  if (h.freqNum === 7 && h.freqDen === 7) return 'todo dia';
  return `${h.freqNum}× por semana`;
}

function HabitCard({ habit, onCheckin }) {
  const today = habit.log[TODAY];
  const done = !!today;
  const strength = habitStrength(habit);
  const streak = habitStreak(habit);
  const week = habitWeekDone(habit);
  const months = logToMonths(habit.log, 6);

  const stepDelta = habit.target ? Math.max(1, Math.round(habit.target / 4)) : 1;
  const val = today || 0;

  return (
    <div className="habit-card">
      <div className="habit-top">
        <StrengthRing value={strength} color={habit.color} />
        <div className="habit-icon" style={{ background: habit.color.replace(')', ' / 0.14)'), color: habit.color }}><Icon name={habit.icon} /></div>
        <div className="habit-info">
          <div className="habit-name">{habit.name}</div>
          <div className="habit-freq">{freqLabel(habit)}{habit.target ? ` · meta ${habit.target}${habit.unit}` : ''}</div>
        </div>
        {habit.target ? (
          <div className="checkin-stepper">
            <button className="stepper-btn" onClick={() => onCheckin(habit, Math.max(0, val - stepDelta))}><Icon name="minus" /></button>
            <span className="checkin-val" style={done && val >= habit.target ? { color: habit.color } : null}>{val}<span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-4)' }}>{habit.unit}</span></span>
            <button className="stepper-btn" onClick={() => onCheckin(habit, val + stepDelta)}><Icon name="plus" /></button>
          </div>
        ) : (
          <button className={'checkin-btn' + (done ? ' done' : '')} style={{ '--hb-color': habit.color }} onClick={() => onCheckin(habit, done ? 0 : 1)}>
            <Icon name="check" />
          </button>
        )}
      </div>

      <div className="habit-heat">
        <Heatmap months={months} color={habit.color} target={habit.target} />
      </div>

      <div className="habit-foot">
        <span className="hf-stat">Força <b>{Math.round(strength * 100)}%</b></span>
        <span className="hf-stat">Sequência <b>{streak}</b> dia{streak === 1 ? '' : 's'}</span>
        <span className="hf-stat">Esta semana <b>{week}</b>/{habit.freqNum}</span>
      </div>
    </div>
  );
}

function HabitsScreen({ onCheckin, onToast }) {
  const avg = HABITS.reduce((a, h) => a + habitStrength(h), 0) / HABITS.length;
  return (
    <div className="page">
      <div className="page-head">
        <div><div className="page-title">Hábitos</div><div className="page-sub">força média da rotina <b style={{ color: 'var(--kg-deep)' }}>{Math.round(avg * 100)}%</b> · a força perdoa falhas pontuais, não zera num dia ruim</div></div>
      </div>
      <div className="habit-list">
        {HABITS.map(h => <HabitCard key={h.id} habit={h} onCheckin={onCheckin} />)}
      </div>
    </div>
  );
}

Object.assign(window, { HabitsScreen, HabitCard, freqLabel });
