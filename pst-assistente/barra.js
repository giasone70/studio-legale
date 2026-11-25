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
    ss.del('pstCassPassi');
    location.href = BASE + 'it/pst_2_9.wp';
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

  const bar = document.createElement('div');
  bar.style.cssText = 'position:fixed;left:50%;bottom:6px;transform:translateX(-50%);z-index:2147483646;' +
    'display:flex;gap:4px;padding:3px 6px;background:rgba(30,40,60,.85);border-radius:6px;font:12px sans-serif';
  for (const [testo, fn] of voci) {
    const b = document.createElement('button');
    b.textContent = testo;
    b.style.cssText = 'font:12px sans-serif;padding:3px 8px;cursor:pointer;border:0;border-radius:4px;background:#e8eef7';
    b.addEventListener('click', fn);
    bar.appendChild(b);
  }
  const ver = document.createElement('span');
  ver.textContent = 'v' + (window.__pstVersione || '?');
  ver.title = 'Versione degli script dell’estensione PST assistente';
  ver.style.cssText = 'color:#c9d3e6;align-self:center;padding:0 4px;font:11px sans-serif';
  bar.appendChild(ver);
  document.body.appendChild(bar);
})();
