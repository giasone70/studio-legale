(() => {
  const BASE = 'https://servizipst.giustizia.it/PST/it/';
  const percorso = location.pathname;
  const ss = {
    get: k => { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) {} },
    del: k => { try { sessionStorage.removeItem(k); } catch (e) {} }
  };
  // le preferenze stanno in localStorage del portale (origine servizipst.giustizia.it)
  const leggi = k => new Promise(r => { try { const v = localStorage.getItem('pstExt_' + k); r(v == null ? undefined : JSON.parse(v)); } catch (e) { r(undefined); } });
  const scrivi = (k, v) => new Promise(r => { try { localStorage.setItem('pstExt_' + k, JSON.stringify(v)); } catch (e) {} r(); });
  const att = ms => new Promise(r => setTimeout(r, ms));
  const trova = id => document.getElementById(id) || document.querySelector('select[name="' + id + '"]');
  const finche = async (cond, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (cond()) return true; await att(150); } return false; };
  const norm = s => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const pagina = () => location.pathname.split('/').pop() + (location.search ? '?' + [...new URLSearchParams(location.search).keys()].join('&') : '');

  // ---------- registro dei passaggi: resta in sessionStorage e si rivede a ogni caricamento ----------
  const LOG = 'pstCassLog';
  const registro = () => { try { return JSON.parse(ss.get(LOG) || '[]'); } catch (e) { return []; } };
  function log(t, x) {
    const l = registro();
    l.push({ ora: new Date().toLocaleTimeString('it-IT'), pag: pagina(), t, x: x || null });
    ss.set(LOG, JSON.stringify(l.slice(-60)));
  }
  // fotografia della pagina: solo elementi del modulo, voci delle tendine e messaggi del portale (nessun dato dei ricorsi)
  function fotografia() {
    const f = { pagina: pagina() };
    f.tendine = [...document.querySelectorAll('select')].map(s => ({
      id: s.id || s.name, scelta: s.selectedIndex >= 0 && s.options[s.selectedIndex] ? s.options[s.selectedIndex].textContent.trim() : '(nessuna)',
      indice: s.selectedIndex, voci: [...s.options].slice(0, 25).map(o => o.textContent.trim())
    }));
    f.pulsanti = [...document.querySelectorAll('input[type="submit"], input[type="button"], button')].map(b => (b.name || b.id || '') + '=' + (b.value || b.textContent || '').trim().slice(0, 40)).filter(x => x !== '=').slice(0, 20);
    f.moduli = [...document.forms].map(m => (m.method || 'get') + ' ' + (m.getAttribute('action') || '').split('?')[0].split('/').pop());
    f.collegamenti = [...document.querySelectorAll('a[href*="pst_2_9"]')].map(a => { try { const u = new URL(a.href); return u.pathname.split('/').pop() + (u.search ? '?' + [...u.searchParams.keys()].join('&') : '') + ' «' + a.textContent.trim().slice(0, 30) + '»'; } catch (e) { return '?'; } }).slice(0, 15);
    f.messaggi = [...document.querySelectorAll('.portlet-msg-error, .portlet-msg-alert, .portlet-msg-info, .alert, .error, .errore, .errorMessage, .actionError, .actionMessage, [class*="messagg"], [class*="Error"], [role="alert"]')]
      .map(e => e.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean).map(s => s.slice(0, 200)).slice(0, 5);
    f.titoli = [...document.querySelectorAll('h1, h2, h3, legend')].map(e => e.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 6);
    return f;
  }
  function testoDiagnostica() {
    const righe = ['PST assistente ' + (window.__pstVersione || '?') + ' · Cassazione · ' + new Date().toLocaleString('it-IT'), ''];
    for (const v of registro()) righe.push(v.ora + ' [' + v.pag + '] ' + v.t + (v.x ? '\n    ' + JSON.stringify(v.x) : ''));
    righe.push('', 'Pagina attuale: ' + JSON.stringify(fotografia()));
    return righe.join('\n');
  }
  async function copia(testo, bt) {
    let ok = false;
    try { await navigator.clipboard.writeText(testo); ok = true; } catch (e) {
      const ta = document.createElement('textarea'); ta.value = testo; ta.style.cssText = 'position:fixed;left:-9999px';
      document.documentElement.appendChild(ta); ta.select(); try { ok = document.execCommand('copy'); } catch (e2) {} ta.remove();
    }
    if (bt) bt.textContent = ok ? 'Copiata' : 'Copia non riuscita';
  }

  // riquadro: agganciato a <html>, si rimette al suo posto se il portale ricostruisce la pagina
  let banda = null, testoBanda = '', fisso = false;
  function disegnaBanda() {
    if (!banda) {
      banda = document.createElement('div'); banda.id = 'pstBanda';
      banda.style.cssText = 'position:fixed;left:8px;top:8px;z-index:2147483646;background:#fff6d6;border:1px solid #d9c36b;padding:6px 10px;font:12px sans-serif;max-width:70%;max-height:60vh;overflow:auto;box-shadow:0 2px 10px rgba(0,0,0,.25);color:#222';
      setInterval(() => { if (banda && !banda.isConnected) document.documentElement.appendChild(banda); }, 400);
    }
    banda.innerHTML = '';
    const t = document.createElement('div'); t.style.fontWeight = '600'; t.textContent = 'PST assistente · ' + testoBanda; banda.appendChild(t);
    const l = registro().slice(-8);
    if (l.length) {
      const d = document.createElement('div'); d.style.cssText = 'margin-top:4px;color:#555;white-space:pre-wrap;font:11px monospace';
      d.textContent = l.map(v => v.ora + ' [' + v.pag.split('?')[0] + '] ' + v.t).join('\n'); banda.appendChild(d);
    }
    const az = document.createElement('div'); az.style.cssText = 'margin-top:5px;display:flex;gap:6px;flex-wrap:wrap';
    const b1 = document.createElement('button'); b1.type = 'button'; b1.textContent = 'Copia diagnostica'; b1.addEventListener('click', () => copia(testoDiagnostica(), b1));
    az.appendChild(b1);
    if (fisso) {
      const b2 = document.createElement('button'); b2.type = 'button'; b2.textContent = 'Chiudi';
      b2.addEventListener('click', () => { ss.del('pstCassEsito'); banda.remove(); banda = null; });
      az.appendChild(b2);
    }
    banda.appendChild(az);
    if (!banda.isConnected) document.documentElement.appendChild(banda);
    return banda;
  }
  function mostra(t) { testoBanda = t; return disegnaBanda(); }
  // fine della procedura automatica: il messaggio resta finché non si chiude, anche dopo un ricaricamento
  function ferma(t, x) {
    log('FERMO: ' + t, x || fotografia());
    ss.del('pstCassAuto'); ss.del('pstCassPassi'); ss.del('pstCassConfermato');
    ss.set('pstCassEsito', t);
    fisso = true; mostra(t);
  }

  // ---------- indirizzo diretto della scheda “Ricorsi” (ufficio, registro e ruolo già scelti) ----------
  const conParametri = h => ['ufficioRicerca', 'registroRicerca', 'ruoloRicerca'].every(n => new RegExp('[?&]' + n + '=[^&]+').test(h));
  const linkRicorsi = () => [...document.querySelectorAll('a[href*="pst_2_9_1_2.wp"]')].map(a => a.href);
  async function impara() {
    let url = linkRicorsi().find(conParametri);
    if (!url && /pst_2_9_1_2\.wp$/.test(percorso) && conParametri(location.search)) url = location.href;
    if (!url) {
      const v = n => { const e = document.querySelector('[name="' + n + '"]'); return e && e.value; };
      if (v('ufficioRicerca') && v('registroRicerca') && v('ruoloRicerca') && /pst_2_9_1/.test(percorso)) {
        url = BASE + 'pst_2_9_1_2.wp?ufficioRicerca=' + encodeURIComponent(v('ufficioRicerca')) +
          '&registroRicerca=' + encodeURIComponent(v('registroRicerca')) + '&ruoloRicerca=' + encodeURIComponent(v('ruoloRicerca'));
      }
    }
    if (url) await scrivi('cassUrl', url);
    return url;
  }

  // ---------- pagina di scelta ufficio / registro / ruolo ----------
  const scelto = id => { const s = trova(id); return s && s.selectedIndex >= 0 && s.options[s.selectedIndex] ? norm(s.options[s.selectedIndex].textContent) : ''; };
  // si cerca la voce con un confronto che ignora maiuscole e spazi; prima la corrispondenza esatta, poi quella parziale
  const opzione = (id, esatta, parziale) => {
    const s = trova(id); if (!s) return null;
    const o = [...s.options];
    return o.find(x => norm(x.textContent) === esatta) || o.find(x => parziale.test(norm(x.textContent)) && x.value) || null;
  };
  const VOCI = {
    ufficioRicerca: ['corte suprema di cassazione', /^corte (suprema )?di cassazione/],
    registroRicerca: ['cassazione penale', /penal/],
    ruoloRicerca: ['avvocato', /^avvocat/]
  };
  const giusto = id => { const v = VOCI[id], t = scelto(id); return t === v[0] || (v[1].test(t) && t !== '' && !/^-|selez|scegli/.test(t)); };
  const metti = id => {
    const sel = trova(id), o = opzione(id, VOCI[id][0], VOCI[id][1]);
    if (!sel || !o) return false;
    sel.value = o.value;
    return true;
  };
  const cambia = id => { const s = trova(id); s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); };
  let uscita = false;
  window.addEventListener('pagehide', () => { uscita = true; });
  window.addEventListener('beforeunload', () => { uscita = true; });

  // Ogni passo è un invio del modulo del portale con lo stesso pulsante che il portale usa (“aggiorna”, “scegliRegistroInit”, “scegliRegistro”).
  // Se il portale aggiorna la pagina senza ricaricarla, lo script resta in esecuzione e prosegue da sé con il passo successivo.
  async function automatico() {
    const n = Number(ss.get('pstCassPassi') || 0) + 1, tot = Number(ss.get('pstCassTot') || 0) + 1;
    ss.set('pstCassPassi', String(n)); ss.set('pstCassTot', String(tot));
    if (n > 8 || tot > 14) { ferma('interrotto dopo ' + (n > 8 ? n - 1 : tot - 1) + ' caricamenti: completa a mano la scelta e premi “Copia diagnostica”'); return; }

    // il portale, dopo la conferma, può mostrare le schede Notifiche/Ricorsi sullo stesso indirizzo: se c’è il collegamento ai ricorsi si va lì
    const vaiRicorsi = () => {
      const l = linkRicorsi(), u = l.find(conParametri) || l[0];
      if (!u) return false;
      log('collegamento ai ricorsi presente: lo apro'); mostra('apro i ricorsi');
      ss.del('pstCassPassi'); location.href = u; return true;
    };
    if (vaiRicorsi()) return;

    if (!(await finche(() => trova('ufficioRicerca') && trova('registroRicerca') && trova('ruoloRicerca'), 6000))) {
      if (vaiRicorsi()) return;
      const nt = [...document.querySelectorAll('a[href*="pst_2_9_1_1.wp"]')].map(a => a.href)[0];
      if (nt) { log('collegamento alle notifiche presente: lo apro'); location.href = nt; return; }
      if (!ss.get('pstCassRiparti')) { ss.set('pstCassRiparti', '1'); ss.del('pstCassPassi'); log('pagina senza i campi di scelta: riparto da capo', fotografia()); mostra('pagina senza scelta: riparto da capo'); location.href = BASE + 'pst_2_9.wp'; return; }
      ferma('campi di scelta non trovati dopo una ripartenza'); return;
    }
    ss.del('pstCassRiparti');

    // la conferma ha riportato alla stessa pagina con tutto già scelto: il portale non è andato avanti
    if (ss.get('pstCassConfermato') && giusto('ufficioRicerca') && giusto('registroRicerca') && giusto('ruoloRicerca')) {
      const c = Number(ss.get('pstCassConfermato'));
      if (c >= 2) { ferma('dopo la conferma il portale torna alla pagina di scelta', fotografia()); return; }
    }

    for (let giro = 0; giro < 8 && !uscita; giro++) {
      const form = trova('ufficioRicerca') && trova('ufficioRicerca').form;
      const premi = nome => { const bt = (form || document).querySelector('input[name="' + nome + '"], button[name="' + nome + '"]'); if (bt) { bt.click(); return true; } return false; };
      let passo;
      if (!giusto('ufficioRicerca')) {
        passo = 'passo 1: scelgo l’ufficio';
        if (!metti('ufficioRicerca')) { ferma('voce “Corte Suprema di Cassazione” non trovata', fotografia()); return; }
        log(passo + ' → ' + scelto('ufficioRicerca')); mostra(passo);
        if (!premi('action:aggiorna')) cambia('ufficioRicerca');
      } else if (!giusto('registroRicerca')) {
        passo = 'passo 2: scelgo il registro';
        if (!metti('registroRicerca')) {
          // le voci del registro possono arrivare con un attimo di ritardo
          if (await finche(() => opzione('registroRicerca', VOCI.registroRicerca[0], VOCI.registroRicerca[1]), 3000)) continue;
          ferma('voce “Cassazione Penale” non trovata', fotografia()); return;
        }
        log(passo + ' → ' + scelto('registroRicerca')); mostra(passo);
        if (!premi('action:scegliRegistroInit')) cambia('registroRicerca');
      } else if (!giusto('ruoloRicerca')) {
        passo = 'passo 3: scelgo il ruolo';
        if (!metti('ruoloRicerca')) {
          if (await finche(() => opzione('ruoloRicerca', VOCI.ruoloRicerca[0], VOCI.ruoloRicerca[1]), 3000)) continue;
          ferma('voce “Avvocato” non trovata', fotografia()); return;
        }
        log(passo + ' → ' + scelto('ruoloRicerca')); mostra(passo);
        cambia('ruoloRicerca');
        await att(400);
        continue;
      } else {
        passo = 'passo 4: confermo';
        ss.set('pstCassConfermato', String(Number(ss.get('pstCassConfermato') || 0) + 1));
        log(passo, { ufficio: scelto('ufficioRicerca'), registro: scelto('registroRicerca'), ruolo: scelto('ruoloRicerca') }); mostra(passo);
        if (!premi('action:scegliRegistro')) {
          const b = trova('submit') || (form && form.querySelector('input[type="submit"], button[type="submit"]'));
          if (b) b.click(); else { ferma('pulsante di conferma non trovato', fotografia()); return; }
        }
      }
      // si attende il ricaricamento; se non arriva, il portale ha aggiornato la pagina sul posto e si rivaluta
      const prima = [scelto('ufficioRicerca'), scelto('registroRicerca'), scelto('ruoloRicerca'), document.querySelectorAll('select option').length].join('|');
      await att(4000);
      if (uscita) return;
      if (vaiRicorsi()) return;
      const dopo = [scelto('ufficioRicerca'), scelto('registroRicerca'), scelto('ruoloRicerca'), document.querySelectorAll('select option').length].join('|');
      log('nessun ricaricamento dopo “' + passo + '”' + (prima === dopo ? ', pagina invariata' : ', pagina aggiornata sul posto'), prima === dopo ? fotografia() : null);
      if (prima === dopo && /passo 4/.test(passo)) { ferma('la conferma non ha avuto effetto', fotografia()); return; }
    }
    if (!uscita) ferma('la scelta non si è completata', fotografia());
  }

  async function paginaScelta() {
    if (ss.get('pstCassAuto') === '1') { automatico(); return; }
    const esito = ss.get('pstCassEsito');
    if (esito) { fisso = true; mostra(esito); return; }
    const u = await leggi('cassUrl');
    if (u) {
      const b = mostra('scelta automatica non attiva: usa il pulsante “Cassazione penale: ricorsi” della barra');
      const a = document.createElement('a'); a.href = u; a.textContent = 'vai ai ricorsi'; a.style.cssText = 'display:inline-block;margin-top:4px';
      b.insertBefore(a, b.lastChild);
    }
  }

  // ---------- scheda Notifiche: passa ai ricorsi ----------
  async function paginaNotifiche() {
    await impara();
    if (ss.get('pstCassAuto') !== '1') return;
    const l = linkRicorsi(), u = l.find(conParametri) || l[0];
    if (u) { log('notifiche: apro i ricorsi'); ss.del('pstCassAuto'); ss.del('pstCassPassi'); location.href = u; return; }
    ferma('collegamento “Ricorsi” non trovato nella pagina delle notifiche', fotografia());
  }

  // ---------- scheda Ricorsi ----------
  const criteriDaForm = f => {
    const o = {};
    f.querySelectorAll('input[type="text"], select').forEach(e => { if (e.name) o[e.name] = e.value; });
    return o;
  };

  function ordinamento(t) {
    const intest = [...t.tHead.rows[0].cells];
    const corpo = t.tBodies[0];
    const chiave = testo => {
      const s = testo.trim();
      let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (m) return Number(m[3] + m[2] + m[1]);
      m = s.match(/^(\d+)\/(\d{4})$/);
      if (m) return Number(m[2]) * 1e7 + Number(m[1]);
      return s.toLowerCase();
    };
    const applica = async (i, dir, salva) => {
      const righe = [...corpo.rows];
      righe.sort((a, b) => {
        const x = chiave(a.cells[i].textContent), y = chiave(b.cells[i].textContent);
        return (x < y ? -1 : x > y ? 1 : 0) * dir;
      });
      righe.forEach(r => corpo.appendChild(r));
      intest.forEach((h, k) => { h.dataset.ord = k === i ? (dir > 0 ? ' ▲' : ' ▼') : ''; h.textContent = h.textContent.replace(/ [▲▼]$/, '') + (h.dataset.ord || ''); });
      if (salva) await scrivi('cassOrdinamento', { i, dir });
    };
    intest.forEach((h, i) => {
      h.style.cursor = 'pointer';
      h.addEventListener('click', async () => {
        const o = (await leggi('cassOrdinamento')) || {};
        applica(i, o.i === i ? -o.dir : 1, true);
      });
    });
    leggi('cassOrdinamento').then(o => { if (o && o.i < intest.length) applica(o.i, o.dir, false); });
  }

  function barraRisultati(t) {
    const righe = () => [...t.tBodies[0].rows];
    const barra = document.createElement('div');
    barra.style.cssText = 'margin:8px 0;display:flex;gap:8px;align-items:center;flex-wrap:wrap';
    const filtro = document.createElement('input');
    filtro.type = 'search';
    filtro.placeholder = 'Filtra l’elenco (testo in qualsiasi colonna)';
    filtro.style.cssText = 'padding:3px 6px;min-width:280px';
    const conta = document.createElement('span');
    const csv = document.createElement('button');
    csv.type = 'button';
    csv.textContent = 'Esporta CSV';
    const nuova = document.createElement('button');
    nuova.type = 'button';
    nuova.textContent = 'Modifica la ricerca';
    barra.append(filtro, conta, csv, nuova);
    t.parentNode.insertBefore(barra, t);

    const aggiorna = () => {
      const q = filtro.value.trim().toLowerCase();
      let v = 0;
      righe().forEach(r => { const ok = !q || r.textContent.toLowerCase().includes(q); r.style.display = ok ? '' : 'none'; if (ok) v++; });
      conta.textContent = v + ' di ' + righe().length + ' ricorsi';
    };
    filtro.addEventListener('input', aggiorna);
    aggiorna();

    csv.addEventListener('click', () => {
      const celle = r => [...r.cells].map(c => '"' + c.textContent.trim().replace(/"/g, '""') + '"').join(';');
      const testo = [celle(t.tHead.rows[0])].concat(righe().filter(r => r.style.display !== 'none').map(celle)).join('\r\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob(['﻿' + testo], { type: 'text/csv;charset=utf-8' }));
      a.download = 'ricorsi_cassazione_' + new Date().toISOString().slice(0, 10) + '.csv';
      document.body.appendChild(a); a.click(); a.remove();
    });

    const campi = document.getElementById('campiRicerca');
    if (campi) {
      campi.style.display = 'none';
      nuova.addEventListener('click', () => { campi.style.display = campi.style.display === 'none' ? '' : 'none'; });
    } else nuova.remove();
  }

  async function paginaRicorsi() {
    const eraAuto = ss.get('pstCassAuto') === '1';
    ss.del('pstCassAuto'); ss.del('pstCassPassi'); ss.del('pstCassRiparti'); ss.del('pstCassConfermato'); ss.del('pstCassTot'); ss.del('pstCassEsito');
    if (eraAuto) log('arrivato ai ricorsi');
    await impara();
    const campi = document.getElementById('campiRicerca');
    const form = campi ? campi.querySelector('form') : document.querySelector('input[name="action:searchRicorsiCASSPE"]') && document.querySelector('input[name="action:searchRicorsiCASSPE"]').form;
    const pulsante = form && form.querySelector('input[name="action:searchRicorsiCASSPE"]');
    if (form) {
      form.addEventListener('submit', () => { scrivi('cassCriteri', criteriDaForm(form)); }, true);
      if (pulsante) pulsante.addEventListener('click', () => { scrivi('cassCriteri', criteriDaForm(form)); }, true);
    }

    const t = document.getElementById('resultTable');
    if (t && t.tBodies[0] && t.tBodies[0].rows.length) {
      ordinamento(t);
      barraRisultati(t);
      return;
    }
    if (!form) { if (eraAuto) ferma('pagina dei ricorsi senza modulo di ricerca né elenco', fotografia()); return; }
    // nessun elenco: ripristina gli ultimi criteri e avvia la ricerca
    const criteri = (await leggi('cassCriteri')) || {};
    for (const [nome, val] of Object.entries(criteri)) {
      const e = form.elements[nome];
      if (e && val && 'value' in e) e.value = val;
    }
    const ultima = Number(ss.get('cassCerca') || 0);
    if (pulsante && Date.now() - ultima > 10000) {
      ss.set('cassCerca', String(Date.now()));
      pulsante.click();
    }
  }

  if (/pst_2_9\.wp$/.test(percorso)) paginaScelta();
  else if (/pst_2_9_1_1\.wp$/.test(percorso)) paginaNotifiche();
  else if (/pst_2_9_1_2\.wp$/.test(percorso)) paginaRicorsi();
})();
