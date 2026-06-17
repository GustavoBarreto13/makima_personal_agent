/* ─────────────────────────────────────────────────────────────────────────
   Komi · Pessoas — primitivos (ícones, avatar)
   ───────────────────────────────────────────────────────────────────────── */

const ICONS = {
  /* nav / views */
  users:    'M16 19a4 4 0 0 0-8 0M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM20 19a3 3 0 0 0-4-2.8M17.5 10a2.5 2.5 0 0 0 0-4',
  user:     'M19 20a7 7 0 0 0-14 0M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  cake:     'M5 21h14M6 21v-8h12v8M5 13a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2M12 11V7M12 7c-1.1 0-1.6-1.7 0-2.5 1.6.8 1.1 2.5 0 2.5z',
  heart:    'M12 20s-7-4.5-9.5-9C1 8 2.5 4.5 6 4.5c2 0 3.2 1.2 4 2.3.8-1.1 2-2.3 4-2.3 3.5 0 5 3.5 3.5 6.5C19 15.5 12 20 12 20z',
  briefcase:'M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18',
  /* domínios */
  wallet:   'M3 7a2 2 0 0 1 2-2h13v4M3 7v10a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-3M3 7h16M17 13h4v-3h-4a1.5 1.5 0 0 0 0 3z',
  checks:   'M3 12l3 3 5-6M9 16l1 1 6-7M16 6h0',
  book:     'M4 5.5C6 4 9 4 11 5.5v13C9 17 6 17 4 18.5zM20 5.5C18 4 15 4 13 5.5v13c2-1.5 5-1.5 7 0z',
  feather:  'M20 4C12 4 7 9 5 16l-2 5M8 16h8a4 4 0 0 0 4-4M13 11l-7 7',
  /* contatos */
  phone:    'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z',
  mail:     'M3 6.5h18v11H3zM3 7l9 6 9-6',
  at:       'M16 12a4 4 0 1 0-1.2 2.9M16 8v5a2.5 2.5 0 0 0 5 0v-1a9 9 0 1 0-3.5 7.1',
  send:     'M21 4 3 11l6 2.5L11 21l4-7 6-10zM9 13.5 21 4',
  pin:      'M12 21s-6.5-5.5-6.5-11A6.5 6.5 0 0 1 12 3.5 6.5 6.5 0 0 1 18.5 10C18.5 15.5 12 21 12 21zM12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  /* utilitários */
  plus:     'M12 5v14M5 12h14',
  check:    'M20 6 9 17l-5-5',
  x:        'M18 6 6 18M6 6l12 12',
  search:   'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  chevL:    'M15 18l-6-6 6-6',
  grid2x2:  'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  list:     'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  edit:     'M14 4l6 6-10 10H4v-6zM13 5l6 6',
  trash:    'M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M10 11v6M14 11v6',
  camera:   'M3 8a2 2 0 0 1 2-2h2l1.5-2h7L17 6h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM12 16a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  sparkles: 'M12 3l1.8 4.7L18.5 9.5 13.8 11.3 12 16l-1.8-4.7L5.5 9.5l4.7-1.8z',
  calendar: 'M7 3v4M17 3v4M3.5 9h17M5 5h14a1.5 1.5 0 0 1 1.5 1.5V19A1.5 1.5 0 0 1 19 20.5H5A1.5 1.5 0 0 1 3.5 19V6.5A1.5 1.5 0 0 1 5 5z',
  gift:     'M20 12v9H4v-9M2 7h20v5H2zM12 22V7M12 7C12 7 12 3 9 3a2.5 2.5 0 0 0 0 5h3zM12 7c0 0 0-4 3-4a2.5 2.5 0 0 1 0 5h-3z',
  clock:    'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 8v4l3 2',
  inbox:    'M3 13h5l2 3h4l2-3h5M4 6h16l1 7v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-5z',
};

function Icon({ name, style, className }) {
  const d = ICONS[name] || ICONS.user;
  return (
    <svg viewBox="0 0 24 24" fill="none" style={style} className={className}
         stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {d.split('M').filter(Boolean).map((seg, i) => <path key={i} d={'M' + seg} />)}
    </svg>
  );
}

/* Avatar — foto (se houver) ou iniciais com cor determinística */
function Avatar({ person, size = 40 }) {
  const cls = 'avatar a-' + size;
  if (person.avatar) {
    return <div className={cls}><img src={person.avatar} alt={person.name} /></div>;
  }
  return (
    <div className={cls} style={{ background: avatarColor(person.name) }}>
      {initials(person.name)}
    </div>
  );
}

Object.assign(window, { ICONS, Icon, Avatar });
