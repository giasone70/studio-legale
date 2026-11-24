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
  const attendi = ms => new Promise(r => setTimeout(r, ms));

  // Impara l’indirizzo diretto della scheda “Ricorsi” (ufficio, registro e ruolo già scelti).
  async function impara() {
    const ok = h => ['ufficioRicerca', 'registroRicerca', 'ruoloRicerca']
      .every(n => new RegExp('[?&]' + n + '=[^&]+').test(h));
    let url = [...document.querySelectorAll('a[href*="pst_2_9_1_2.wp?"]')].map(a => a.href).find(ok);
    if (!url && /pst_2_9_1_2\.wp$/.test(percorso) && ok(location.search)) url = location.href;
    if (!url) {
      const v = n => (document.querySelector('input[name="' + n + '"]') || {}).value;
      if (v('ufficioRicerca') && v('registroRicerca') && v('ruoloRicerca')) {
        url = BASE + 'pst_2_9_1_2.wp?ufficioRicerca=' + encodeURIComponent(v('ufficioRicerca')) +
          '&registroRicerca=' + encodeURIComponent(v('registroRicerca')) +
          '&ruoloRicerca=' + encodeURIComponent(v('ruoloRicerca'));
      }
    }
    if (url) await scrivi('cassUrl', url);
    return url;
  }

  // ---------- pagina di scelta ufficio / registro / ruolo ----------
  // Ripete i clic dell’utente passo per passo, come fa il portale: ufficio, registro, ruolo.
  const click = nome => { const e = document.querySelector('input[name="' + nome + '"]'); if (e) e.click(); return !!e; };
  const scegli = (s, testo) => {
    const o = [...s.options].find(x => x.textContent.trim() === testo);
    if (!o) return false;
    s.value = o.value;
    return true;
  };
  function automatico() {
    const n = Number(ss.get('pstCassPassi') || 0) + 1;
    ss.set('pstCassPassi', String(n));
    if (n > 6) { ss.del('pstCassAuto'); return; }
    const uff = document.getElementById('ufficioRicerca'), reg = document.getElementById('registroRicerca'), ruo = document.getElementById('ruoloRicerca');
    if (!uff || !reg || !ruo) { ss.del('pstCassAuto'); return; }
    const testo = s => (s.selectedIndex > 0 ? s.options[s.selectedIndex].textContent.trim() : '');
    if (testo(uff) !== 'Corte Suprema di Cassazione') { if (scegli(uff, 'Corte Suprema di Cassazione') && click('action:aggiorna')) return; ss.del('pstCassAuto'); return; }
    if (testo(reg) !== 'Cassazione Penale') { if (scegli(reg, 'Cassazione Penale') && click('action:scegliRegistroInit')) return; ss.del('pstCassAuto'); return; }
    scegli(ruo, 'Avvocato');
    if (!click('action:scegliRegistro')) ss.del('pstCassAuto');
  }
  async function paginaScelta() {
    if (ss.get('pstCassAuto') === '1') automatico();
  }

  // ---------- scheda Notifiche: passa ai ricorsi ----------
  async function paginaNotifiche() {
    if (ss.get('pstCassAuto') !== '1') { await impara(); return; }
    ss.del('pstCassAuto'); ss.del('pstCassPassi');
    const ok = h => ['ufficioRicerca', 'registroRicerca', 'ruoloRicerca'].every(n => new RegExp('[?&]' + n + '=[^&]+').test(h));
    const a = [...document.querySelectorAll('a[href*="pst_2_9_1_2.wp?"]')].find(x => ok(x.href));
    if (a) location.href = a.href;
  }

  // ---------- scheda Ricorsi ----------
  const criteriDaForm = f => {
    const o = {};
    f.querySelectorAll('input[type="text"], select').forEach(e => { if (e.name) o[e.name] = e.value; });
    return o;
  };

  function ordinamento(t, tab) {
    const intest = [...t.tHead.rows[0].cells];
    const corpo = t.tBodies[0];
    const chiave = (testo, i) => {
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
        const x = chiave(a.cells[i].textContent, i), y = chiave(b.cells[i].textContent, i);
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
    campi.style.display = 'none';
    nuova.addEventListener('click', () => { campi.style.display = campi.style.display === 'none' ? '' : 'none'; });
  }

  async function paginaRicorsi() {
    await impara();
    const campi = document.getElementById('campiRicerca');
    if (!campi) return;
    const form = campi.querySelector('form');
    const pulsante = form && form.querySelector('input[name="action:searchRicorsiCASSPE"]');
    form.addEventListener('submit', () => { scrivi('cassCriteri', criteriDaForm(form)); }, true);
    if (pulsante) pulsante.addEventListener('click', () => { scrivi('cassCriteri', criteriDaForm(form)); }, true);

    const t = document.getElementById('resultTable');
    if (t && t.tBodies[0] && t.tBodies[0].rows.length) {
      ordinamento(t);
      barraRisultati(t);
      return;
    }
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
