/* Makima · Hub — ícones (stroke 1.6, currentColor). Exporta MkIcon p/ window. */
(function () {
  const P = {
    plus:    'M12 5v14M5 12h14',
    book:    'M4 5a2 2 0 0 1 2-2h11v16H6a2 2 0 0 0-2 2zM17 3v18',
    user:    'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M5 20a7 7 0 0 1 14 0',
    pen:     'M4 20h4L19 9a2 2 0 0 0-3-3L5 17zM14 7l3 3',
    check:   'M5 12.5 10 17l9-10',
    calendar:'M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 9h16M8 3v4M16 3v4',
    tv:      'M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM8 21h8',
    sparkle: 'M12 3l1.8 5.6L19.5 10l-5.7 1.4L12 17l-1.8-5.6L4.5 10l5.7-1.4z',
    film:    'M4 4h16v16H4zM4 9h16M4 15h16M9 4v16M15 4v16',
    arrow:   'M5 12h14M13 6l6 6-6 6',
    arrowUR: 'M7 17 17 7M9 7h8v8',
    grid:    'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
    chev:    'M9 6l6 6-6 6',
    moon:    'M20 14.5A8 8 0 0 1 9.5 4a6.5 6.5 0 1 0 10.5 10.5z',
  };
  function MkIcon({ name, size = 18, style, className }) {
    const d = P[name] || P.arrow;
    return React.createElement('svg', {
      width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
      stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round',
      strokeLinejoin: 'round', style, className, 'aria-hidden': true,
    }, React.createElement('path', { d }));
  }
  // marca: olho-espiral da Makima (anel + espiral)
  function MkSpiral({ size = 22, style }) {
    return React.createElement('svg', {
      width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
      stroke: 'currentColor', strokeWidth: 1.6, style, 'aria-hidden': true,
    },
      React.createElement('circle', { cx: 12, cy: 12, r: 9 }),
      React.createElement('path', {
        d: 'M12 12a2.4 2.4 0 1 1 2.4-2.4 4 4 0 1 1-4-4 5.6 5.6 0 1 1-5.6 5.6',
        strokeWidth: 1.4,
      }),
    );
  }
  window.MkIcon = MkIcon;
  window.MkSpiral = MkSpiral;
})();
