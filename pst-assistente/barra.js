(() => {
  if (window.top !== window || window.__pstBarra) return;
  window.__pstBarra = true;
  const BASE = 'https://servizipst.giustizia.it/PST/';
  const ss = {
    get: k => { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) {} },
    del: k => { try { sessionStorage.removeItem(k); } catch (e) {} }
  };

  // la scelta di ufficio, registro e ruolo si rifà a ogni accesso: la esegue lo script nella pagina di scelta
  function vaiCassazione() {
    ss.set('pstCassAuto', '1');
    ['pstCassPassi', 'pstCassRiparti', 'pstCassTot', 'pstCassConfermato', 'pstCassEsito', 'pstCassLog'].forEach(ss.del);
    // se l’indirizzo diretto dei ricorsi è già noto (imparato una volta), si va lì; altrimenti si ripete la scelta
    let u = null; try { u = JSON.parse(localStorage.getItem('pstExt_cassUrl')); } catch (e) {}
    location.href = (u && /pst_2_9_1_2\.wp\?/.test(u)) ? u : BASE + 'it/pst_2_9.wp';
  }

  // Il PDP è un’applicazione a pagina unica: si entra dalla home e poi si usa il suo menu.
  function cliccaMenuPdp(fine) {
    let n = 0;
    const t = setInterval(() => {
      const a = document.querySelector('a[href$="' + fine + '"]');
      if (a) { clearInterval(t); a.click(); }
      else if (++n > 80) clearInterval(t);
    }, 250);
  }
  function vaiPdp(fine) {
    if (location.pathname.indexOf('/PST/PAVVP/') === 0) { cliccaMenuPdp(fine); return; }
    ss.set('pstPdpDopo', fine);
    location.href = BASE + 'PAVVP/home';
  }
  if (location.pathname === '/PST/PAVVP/home' && ss.get('pstPdpDopo')) {
    const fine = ss.get('pstPdpDopo');
    ss.del('pstPdpDopo');
    cliccaMenuPdp(fine);
  }

  const registra = (() => { try { return localStorage.getItem('pstRete') === '1'; } catch (e) { return false; } })();
  const voci = [
    ['Cassazione penale: ricorsi', vaiCassazione],
    ['PDP: procedimenti', () => vaiPdp('/consultazioni/procedimenti-autorizzati')],
    ['PDP: depositi', () => vaiPdp('/consultazioni/depositi')],
    ['Salva struttura pagina', () => {
      const c = document.body.cloneNode(true);
      c.querySelectorAll('script,style,svg,noscript,link').forEach(e => e.remove());
      const w = document.createTreeWalker(c, NodeFilter.SHOW_TEXT);
      const nodi = []; while (w.nextNode()) nodi.push(w.currentNode);
      for (const n of nodi) { const t = n.nodeValue.trim(); if (!t) continue; n.nodeValue = '[' + t.length + ' car.]'; }
      for (const e of c.querySelectorAll('*')) {
        for (const a of Array.from(e.attributes)) {
          let v = a.value;
          if (a.name === 'class' || a.name === 'role' || a.name === 'type' || a.name === 'tabindex') continue;
          v = v.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '{uuid}');
          if (/^(title|aria-label|placeholder|alt|value|data-.*)$/.test(a.name) && !/^[a-z-]{1,25}$/.test(v)) v = '[' + v.length + ' car.]';
          e.setAttribute(a.name, v.slice(0, 120));
        }
      }
      const out = JSON.stringify({ pagina: location.pathname.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, '{uuid}'), html: c.innerHTML.slice(0, 600000) });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([out], { type: 'application/json' }));
      a.download = 'struttura_' + Date.now() + '.json';
      a.click();
    }],
    ['Registra rete PDP: ' + (registra ? 'sì' : 'no'), () => {
      try { localStorage.setItem('pstRete', registra ? '0' : '1'); } catch (e) {}
      location.reload();
    }]
  ];

  // Diagnostica della Cassazione: indipendente da cassazione.js, così funziona anche se quello script non parte
  function diagnosticaCassazione() {
    const chiavi = n => { try { return [...new URLSearchParams(n).keys()].join('&'); } catch (e) { return ''; } };
    const rel = u => { try { const x = new URL(u, location.href); return x.host + x.pathname + (x.search ? '?' + chiavi(x.search) : ''); } catch (e) { return String(u).slice(0, 80); } };
    let log = []; try { log = JSON.parse(ss.get('pstCassLog') || '[]'); } catch (e) {}
    const stato = {}; for (const k of ['pstCassAuto', 'pstCassPassi', 'pstCassTot', 'pstCassRiparti', 'pstCassConfermato', 'pstCassEsito']) stato[k] = ss.get(k);
    let url = null; try { url = JSON.parse(localStorage.getItem('pstExt_cassUrl')); } catch (e) {}
    const foto = {
      pagina: rel(location.href), titolo: document.title,
      scriptCassazione: window.__pstCass ? 'attivo (' + window.__pstCass + ')' : 'NON attivo in questa pagina',
      riquadroGiallo: document.getElementById('pstBanda') ? 'presente' : 'assente',
      riquadriInterni: [...document.querySelectorAll('iframe, frame')].map(f => rel(f.getAttribute('src') || '(senza indirizzo)')),
      tendine: [...document.querySelectorAll('select')].map(s => (s.id || s.name) + ' = «' + (s.options[s.selectedIndex] ? s.options[s.selectedIndex].textContent.trim() : '') + '» su ' + s.options.length + ' voci: ' + [...s.options].slice(0, 12).map(o => o.textContent.trim()).join(' / ')),
      pulsanti: [...document.querySelectorAll('input[type="submit"], input[type="button"], button')].filter(b => !bar.contains(b)).map(b => (b.name || b.id || '') + '=' + (b.value || b.textContent || '').trim().slice(0, 40)).slice(0, 20),
      moduli: [...document.forms].map(m => (m.method || 'get') + ' ' + rel(m.getAttribute('action') || '')),
      collegamenti: [...document.querySelectorAll('a[href*="pst_2_9"]')].map(a => rel(a.href) + ' «' + a.textContent.trim().slice(0, 30) + '»').slice(0, 15),
      messaggi: [...document.querySelectorAll('.portlet-msg-error, .portlet-msg-alert, .portlet-msg-info, .alert, .error, .errore, .errorMessage, .actionError, .actionMessage, [role="alert"]')].map(e => e.textContent.replace(/\s+/g, ' ').trim().slice(0, 200)).filter(Boolean).slice(0, 5),
      memoria: stato, indirizzoRicorsiImparato: url ? rel(url) : null
    };
    const testo = 'PST assistente v' + (window.__pstVersione || '?') + ' · diagnostica Cassazione · ' + new Date().toLocaleString('it-IT') + '\n\n' +
      (log.length ? log.map(v => v.ora + ' [' + v.pag + '] ' + v.t + (v.x ? '\n    ' + JSON.stringify(v.x) : '')).join('\n') : '(registro dei passaggi vuoto)') +
      '\n\n' + JSON.stringify(foto, null, 1);
    let p = document.getElementById('pstDiagCass'); if (p && p.parentNode) p.parentNode.removeChild(p);
    p = document.createElement('div'); p.id = 'pstDiagCass';
    p.style.cssText = 'position:fixed;left:8px;right:8px;bottom:44px;max-height:60vh;z-index:2147483647;background:#fffbe6;border:1px solid #d9c36b;box-shadow:0 3px 14px rgba(0,0,0,.3);padding:8px;font:12px sans-serif;display:flex;flex-direction:column;gap:6px';
    const ta = document.createElement('textarea'); ta.value = testo; ta.readOnly = true; ta.style.cssText = 'width:100%;height:40vh;font:11px monospace';
    const az = document.createElement('div'); az.style.cssText = 'display:flex;gap:6px';
    const c = document.createElement('button'); c.type = 'button'; c.textContent = 'Copia negli appunti';
    c.addEventListener('click', async () => { let ok = false; try { await navigator.clipboard.writeText(testo); ok = true; } catch (e) { ta.select(); try { ok = document.execCommand('copy'); } catch (e2) {} } c.textContent = ok ? 'Copiata' : 'Seleziona il testo e copialo a mano'; });
    const d = document.createElement('button'); d.type = 'button'; d.textContent = 'Scarica come file';
    d.addEventListener('click', () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([testo], { type: 'text/plain;charset=utf-8' })); a.download = 'diagnostica_cassazione_' + Date.now() + '.txt'; (document.body || document.documentElement).appendChild(a); a.click(); a.parentNode.removeChild(a); });
    const x = document.createElement('button'); x.type = 'button'; x.textContent = 'Chiudi'; x.addEventListener('click', () => p.parentNode && p.parentNode.removeChild(p));
    az.appendChild(c); az.appendChild(d); az.appendChild(x); p.appendChild(az); p.appendChild(ta);
    (document.body || document.documentElement).appendChild(p);
  }
  if (location.pathname.indexOf('/PST/it/') === 0) voci.splice(1, 0, ['Diagnostica Cassazione', diagnosticaCassazione]);

  const bar = document.createElement('div');
  bar.style.cssText = 'position:fixed;left:50%;bottom:6px;transform:translateX(-50%);z-index:2147483646;' +
    'display:flex;gap:4px;padding:3px 6px;background:rgba(30,40,60,.85);border-radius:6px;font:12px sans-serif';
  for (const [testo, fn] of voci) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = testo;
    b.style.cssText = 'font:12px sans-serif;padding:3px 8px;cursor:pointer;border:0;border-radius:4px;background:#e8eef7';
    // un errore si legge sul pulsante stesso, invece di non vedere nulla
    b.addEventListener('click', ev => { ev.preventDefault(); ev.stopPropagation(); try { const r = fn(); if (r && r.catch) r.catch(e => { b.textContent = testo + ' · errore: ' + (e && e.message || e); }); } catch (e) { b.textContent = testo + ' · errore: ' + (e && e.message || e); } });
    bar.appendChild(b);
  }
  const ver = document.createElement('span');
  ver.textContent = 'v' + (window.__pstVersione || '?');
  ver.title = 'Versione degli script dell’estensione PST assistente';
  ver.style.cssText = 'color:#c9d3e6;align-self:center;padding:0 4px;font:11px sans-serif';
  bar.appendChild(ver);
  document.body.appendChild(bar);
})();
