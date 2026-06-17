/* ═══ Direção A · "Sala de Controle" ═══════════════════════════════════════
   Editorial / dossiê. Preto profundo, fios vermelhos, amarelo nos detalhes.
   Hero com a Makima recortada à direita; agentes como fichas de um quadro de
   comando. Sóbrio, hierárquico, atmosférico. Prefixo de classe .mkA
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  const CSS = `
  .mkA{--bg:oklch(0.145 0.012 18);--bg2:oklch(0.185 0.016 18);--panel:oklch(0.205 0.018 18);
    --line:oklch(0.32 0.03 18);--red:oklch(0.585 0.205 24);--red-br:oklch(0.66 0.205 25);
    --gold:oklch(0.84 0.155 88);--ink:oklch(0.95 0.01 60);--ink2:oklch(0.74 0.014 40);--ink3:oklch(0.56 0.016 30);
    --serif:'Playfair Display',Georgia,serif;--sans:'DM Sans',system-ui,sans-serif;--mono:'DM Mono',monospace;
    --glow:0.30;
    width:100%;background:
      radial-gradient(1100px 620px at 78% 4%, oklch(0.40 0.16 22 / var(--glow)), transparent 60%),
      radial-gradient(700px 500px at 8% 96%, oklch(0.30 0.10 20 / calc(var(--glow) * 0.73)), transparent 60%),
      var(--bg);
    color:var(--ink);font-family:var(--sans);position:relative;overflow:hidden;}
  .mkA *{box-sizing:border-box;}
  .mkA::before{content:'';position:absolute;inset:0;pointer-events:none;
    background-image:linear-gradient(oklch(1 0 0 / 0.022) 1px,transparent 1px);background-size:100% 34px;mix-blend-mode:overlay;}
  .mkA .wrap{position:relative;max-width:1000px;margin:0 auto;padding:0 56px;}

  /* topbar */
  .mkA .top{display:flex;align-items:center;justify-content:space-between;height:56px;
    border-bottom:1px solid var(--line);font-family:var(--mono);font-size:11px;letter-spacing:0.18em;color:var(--ink3);text-transform:uppercase;}
  .mkA .top .b{display:flex;align-items:center;gap:9px;color:var(--ink2);}
  .mkA .top .dot{width:6px;height:6px;border-radius:50%;background:var(--red-br);box-shadow:0 0 10px var(--red-br);}
  .mkA .top .topr{display:flex;align-items:center;gap:16px;}
  .mkA .themetog{display:inline-flex;align-items:center;gap:6px;font-family:var(--mono);font-size:10px;letter-spacing:0.14em;
    text-transform:uppercase;color:var(--ink2);background:transparent;border:1px solid var(--line);border-radius:999px;
    padding:6px 11px;cursor:pointer;transition:border-color .15s,color .15s;}
  .mkA .themetog:hover{border-color:var(--gold);color:var(--gold);}

  /* hero */
  .mkA .hero{display:grid;grid-template-columns:1fr 360px;gap:24px;padding:64px 0 56px;align-items:center;position:relative;}
  .mkA .kick{font-family:var(--mono);font-size:12px;letter-spacing:0.34em;color:var(--gold);text-transform:uppercase;display:flex;align-items:center;gap:12px;}
  .mkA .kick::before{content:'';width:34px;height:1px;background:var(--gold);}
  .mkA .h1{font-family:var(--serif);font-weight:800;font-size:104px;line-height:0.92;letter-spacing:-0.02em;margin:18px 0 6px;color:var(--ink);}
  .mkA .h1 em{font-style:italic;color:var(--red-br);}
  .mkA .role{font-family:var(--mono);font-size:13px;letter-spacing:0.22em;color:var(--ink3);text-transform:uppercase;margin-bottom:26px;}
  .mkA .hello{font-family:var(--serif);font-style:italic;font-size:23px;color:var(--ink2);margin-bottom:14px;}
  .mkA .manifesto{font-size:16px;line-height:1.75;color:var(--ink2);max-width:30em;text-wrap:pretty;}
  .mkA .tagline{margin-top:22px;font-size:15px;color:var(--ink);border-left:2px solid var(--red);padding-left:14px;line-height:1.5;}
  .mkA .tagline b{color:var(--gold);font-weight:600;}
  .mkA .meta{display:flex;gap:30px;margin-top:30px;}
  .mkA .meta .n{font-family:var(--serif);font-size:30px;font-weight:700;color:var(--ink);line-height:1;}
  .mkA .meta .l{font-family:var(--mono);font-size:10.5px;letter-spacing:0.14em;color:var(--ink3);text-transform:uppercase;margin-top:6px;}

  .mkA .portrait{position:relative;height:430px;display:flex;align-items:flex-end;justify-content:center;}
  .mkA .portrait .halo{position:absolute;inset:auto 0 -10px 0;top:8%;border-radius:50%;
    background:radial-gradient(circle at 50% 42%, oklch(0.60 0.21 24 / 0.55), oklch(0.45 0.18 22 / 0.18) 46%, transparent 70%);filter:blur(6px);}
  .mkA .portrait .ring{position:absolute;width:300px;height:300px;top:6%;left:50%;transform:translateX(-50%);
    border:1px solid var(--gold);border-radius:50%;opacity:0.5;}
  .mkA .portrait .ring.r2{width:340px;height:340px;border-color:var(--red);opacity:0.4;border-style:dashed;}
  .mkA .portrait img{position:relative;height:430px;width:auto;object-fit:contain;object-position:bottom;
    filter:drop-shadow(0 18px 40px oklch(0 0 0 / 0.6)) drop-shadow(0 0 30px oklch(0.55 0.2 24 / 0.3));}

  /* section label */
  .mkA .seclbl{display:flex;align-items:center;gap:16px;margin:8px 0 26px;}
  .mkA .seclbl .t{font-family:var(--mono);font-size:12px;letter-spacing:0.28em;color:var(--ink2);text-transform:uppercase;}
  .mkA .seclbl .num{font-family:var(--mono);font-size:11px;color:var(--gold);}
  .mkA .seclbl .rule{flex:1;height:1px;background:var(--line);}

  /* roster */
  .mkA .roster{display:grid;grid-template-columns:1fr 1fr;gap:16px;padding-bottom:8px;}
  .mkA .card{position:relative;background:linear-gradient(160deg,var(--panel),var(--bg2));
    border:1px solid var(--line);border-radius:14px;overflow:hidden;min-height:212px;
    display:flex;flex-direction:column;transition:border-color .2s,transform .2s,box-shadow .2s;}
  .mkA .card::after{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--ac);box-shadow:0 0 18px var(--ac);}
  .mkA .card:hover{transform:translateY(-3px);border-color:color-mix(in oklab,var(--ac),transparent 55%);
    box-shadow:0 20px 44px oklch(0 0 0 / 0.5);}
  .mkA .card .body{padding:18px 20px;display:flex;flex-direction:column;gap:8px;width:64%;z-index:2;flex:1;}
  .mkA .card .idx{font-family:var(--mono);font-size:10px;letter-spacing:0.18em;color:var(--ink3);}
  .mkA .card .nm{font-family:var(--serif);font-size:30px;font-weight:700;line-height:0.95;color:var(--ink);}
  .mkA .card .rl{font-family:var(--mono);font-size:10.5px;letter-spacing:0.2em;text-transform:uppercase;color:var(--ac-t);margin-top:-2px;}
  .mkA .card .ds{font-size:12.5px;line-height:1.5;color:var(--ink2);text-wrap:pretty;margin-top:2px;}
  .mkA .card .stats{display:flex;gap:16px;margin-top:auto;padding-top:8px;}
  .mkA .card .stat{min-width:0;}
  .mkA .card .stat .v{font-family:var(--serif);font-size:16px;font-weight:700;color:var(--ink);line-height:1;white-space:nowrap;}
  .mkA .card .stat .v b{color:var(--ac-t);font-weight:700;}
  .mkA .card .stat .k{font-family:var(--mono);font-size:9px;letter-spacing:0.1em;color:var(--ink3);text-transform:uppercase;margin-top:5px;}
  .mkA .card .acts{display:flex;gap:8px;flex-wrap:wrap;margin-top:13px;}
  .mkA .btn{display:inline-flex;align-items:center;gap:7px;font-family:var(--sans);font-size:12.5px;font-weight:600;
    text-decoration:none;cursor:pointer;border-radius:9px;padding:9px 13px;border:1px solid transparent;transition:filter .15s,transform .1s;white-space:nowrap;}
  .mkA .btn:active{transform:translateY(1px);}
  .mkA .btn.primary{background:var(--ac);color:oklch(0.16 0.02 20);}
  .mkA .btn.primary:hover{filter:brightness(1.1);}
  .mkA .btn.ghost{background:transparent;border-color:var(--line);color:var(--ink2);}
  .mkA .btn.ghost:hover{border-color:var(--ac);color:var(--ink);}
  .mkA .card .ph{position:absolute;right:-6px;bottom:0;top:0;width:46%;display:flex;align-items:flex-end;justify-content:center;
    -webkit-mask-image:linear-gradient(90deg,transparent,#000 26%);mask-image:linear-gradient(90deg,transparent,#000 26%);}
  .mkA .card .ph .pg{position:absolute;width:200px;height:200px;bottom:-30px;right:-10px;border-radius:50%;
    background:radial-gradient(circle,var(--ac),transparent 65%);opacity:0.28;filter:blur(4px);}
  .mkA .card .ph img{position:relative;height:200px;width:auto;object-fit:contain;object-position:bottom;
    filter:drop-shadow(0 10px 22px oklch(0 0 0 / 0.55));}
  .mkA .card .open{position:absolute;top:16px;right:16px;width:30px;height:30px;border-radius:50%;
    border:1px solid var(--line);display:flex;align-items:center;justify-content:center;color:var(--ink2);
    background:oklch(0.14 0.01 20 / 0.6);z-index:3;transition:all .15s;text-decoration:none;}
  .mkA .card:hover .open{border-color:var(--ac);color:var(--ac-t);}

  /* footer */
  .mkA .foot{display:flex;align-items:center;justify-content:space-between;margin-top:34px;padding:22px 0 30px;border-top:1px solid var(--line);
    font-family:var(--mono);font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:var(--ink3);}
  .mkA .foot .r{color:var(--red-br);}

  /* ── intensidade do vermelho ── */
  .mkA[data-red="sobrio"]{--glow:0.13;--red:oklch(0.52 0.13 24);--red-br:oklch(0.60 0.14 25);}

  /* ── colunas do roster ── */
  .mkA[data-cols="1"] .roster{grid-template-columns:1fr;}

  /* ── tema claro ── */
  .mkA[data-theme="light"]{
    --bg:oklch(0.955 0.009 60);--bg2:oklch(0.988 0.005 60);--panel:oklch(0.997 0.003 60);
    --line:oklch(0.86 0.012 40);--red:oklch(0.53 0.215 26);--red-br:oklch(0.50 0.22 26);
    --gold:oklch(0.60 0.135 72);--ink:oklch(0.20 0.02 30);--ink2:oklch(0.40 0.02 30);--ink3:oklch(0.55 0.016 30);
    --glow:0.16;}
  .mkA[data-theme="light"]::before{display:none;}
  .mkA[data-theme="light"] .card{box-shadow:0 1px 2px oklch(0.4 0.05 30 / 0.05),0 8px 24px oklch(0.4 0.05 30 / 0.09);}
  .mkA[data-theme="light"] .card:hover{box-shadow:0 20px 44px oklch(0.4 0.05 30 / 0.16);}
  .mkA[data-theme="light"] .card .rl{color:color-mix(in oklab,var(--ac),black 34%);}
  .mkA[data-theme="light"] .card .stat .v b{color:color-mix(in oklab,var(--ac),black 34%);}
  .mkA[data-theme="light"] .card .open{background:oklch(0.99 0.004 60 / 0.7);}
  .mkA[data-theme="light"] .portrait img{filter:drop-shadow(0 18px 36px oklch(0.4 0.06 30 / 0.28)) drop-shadow(0 0 24px oklch(0.6 0.18 24 / 0.18));}

  /* ── responsivo ── */
  @media (max-width:1040px){.mkA .wrap{padding:0 40px;} .mkA .h1{font-size:88px;}}
  @media (max-width:900px){
    .mkA .hero{grid-template-columns:1fr;gap:6px;padding:44px 0 36px;}
    .mkA .portrait{order:-1;height:300px;align-self:center;}
    .mkA .portrait img{height:300px;} .mkA .portrait .ring{width:230px;height:230px;} .mkA .portrait .ring.r2{width:262px;height:262px;}
    .mkA .h1{font-size:80px;}
  }
  @media (max-width:680px){
    .mkA .wrap{padding:0 22px;} .mkA .h1{font-size:56px;} .mkA .roster{grid-template-columns:1fr;}
    .mkA .top{font-size:10px;} .mkA .top .topr{gap:10px;} .mkA .meta{gap:20px;}
    .mkA .card .body{width:58%;} .mkA .hero{padding-top:32px;}
  }
  `;
  if (!document.getElementById('mkA-css')) {
    const s = document.createElement('style'); s.id = 'mkA-css'; s.textContent = CSS; document.head.appendChild(s);
  }

  function DirA() {
    const M = window.MAKIMA, C = M.copy, A = M.agents;
    return (
      <div className="mkA">
        <div className="wrap">
          <div className="top">
            <span className="b"><span className="dot"></span>{C.kicker}</span>
            <div className="topr">
              <span>Hub · {A.length} agentes · 9 domínios</span>
              <button className="themetog" title="Alternar tema claro / escuro" aria-label="Alternar tema"
                onClick={() => window.dispatchEvent(new CustomEvent('makima:toggletheme'))}>
                <MkIcon name="moon" size={13} /> Tema
              </button>
            </div>
          </div>

          <div className="hero">
            <div>
              <div className="kick">{C.role}</div>
              <h1 className="h1">Mak<em>i</em>ma</h1>
              <div className="role">{C.role} · Sistema de Vida</div>
              <p className="hello">{C.hello}</p>
              <p className="manifesto">{C.manifesto}</p>
              <p className="tagline"><b>{C.lead}</b> {C.tagline}</p>
              <div className="meta">
                <div><div className="n">8</div><div className="l">Agentes</div></div>
                <div><div className="n">9</div><div className="l">Domínios</div></div>
                <div><div className="n">1</div><div className="l">No comando</div></div>
              </div>
            </div>
            <div className="portrait">
              <div className="halo"></div>
              <div className="ring r2"></div>
              <div className="ring"></div>
              <img src={M.makimaImg} alt="Makima" />
            </div>
          </div>

          <div className="seclbl">
            <span className="t">Os domínios</span>
            <span className="rule"></span>
            <span className="num">/ 09</span>
          </div>

          <div className="roster">
            {A.map((a, i) => (
              <div className="card" key={a.id}
                   style={{ '--ac': a.accent, '--ac-t': a.accentText }}>
                <a className="open" href={a.href} title={'Abrir ' + a.name}><MkIcon name="arrowUR" size={14} /></a>
                <div className="body">
                  <span className="idx">{String(i + 1).padStart(2, '0')}</span>
                  <span className="nm">{a.name}</span>
                  <span className="rl">{a.role}</span>
                  <span className="ds">{a.does}</span>
                  <div className="stats">
                    <div className="stat"><div className="v"><b>{a.stat.v}</b></div><div className="k">{a.stat.k}</div></div>
                    <div className="stat"><div className="v">{a.stat2.v}</div><div className="k">{a.stat2.k}</div></div>
                  </div>
                  <div className="acts">
                    <a className="btn primary" href={a.action.href}><MkIcon name={a.action.icon} size={15} />{a.action.label}</a>
                    {a.action2 && <a className="btn ghost" href={a.action2.href}><MkIcon name={a.action2.icon} size={15} />{a.action2.label}</a>}
                  </div>
                </div>
                <div className="ph">
                  <div className="pg"></div>
                  <img src={a.img} alt={a.name} style={{ objectPosition: 'bottom' }} />
                </div>
              </div>
            ))}
          </div>

          <div className="foot">
            <span>Makima · Centro de Controle</span>
            <span className="r">{C.footer}</span>
          </div>
        </div>
      </div>
    );
  }
  window.DirA = DirA;
})();
