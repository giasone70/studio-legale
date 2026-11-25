// Elenco locale dei procedimenti del PDP: raccoglie le risposte che l’applicazione già riceve
// e le mostra in un pannello ricercabile, raggiungibile anche dal dettaglio di un procedimento.
(() => {
  if (window.__pstPdp) return;
  window.__pstPdp = true;
  const API = '/PST/PAVVP/consultazioni/_ws/api/fascicoli/autorizzati';
  const PERC = '/PST/PAVVP/consultazioni/';
  const arch = s => ({
    get: k => { try { return JSON.parse(s.getItem(k)); } catch (e) { return null; } },
    set: (k, v) => { try { s.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del: k => { try { s.removeItem(k); } catch (e) {} }
  });
  const LS = arch(localStorage);     // solo preferenze e modelli di richiesta, senza dati dei procedimenti
  const SS = arch(sessionStorage);   // elenco dei procedimenti: scompare alla chiusura della scheda

  let pannello = null, aperto = false;
  // l’elenco sta anche in memoria: il portale potrebbe svuotare sessionStorage
  const MEM = window.__pstPdpMem = window.__pstPdpMem || { el: null };
  MEM.sez = MEM.sez || SS.get('pstPdpSez') || {};   // sezioni lette dal portale: { idProcedimento: { stato: {ora, voci}, depositi: {...} } }
  let vista = SS.get('pstPdpVista') || { tipo: 'elenco' };
  let caricando = '';
  const D = { nomi: '', agg: '', xhr: 0, lista: 0, risposte: 0, elementi: 0, errore: '', det: '' };
  const leggiElenco = () => MEM.el || SS.get('pstPdpElenco');
  const scriviElenco = el => { MEM.el = el; SS.set('pstPdpElenco', el); };

  // ---------- raccolta dei dati ----------
  function memorizza(items, sostituisci) {
    const el = leggiElenco() || { items: {} };
    if (sostituisci && items.length) el.items = {};
    for (const it of items) if (it && it.identificativo) el.items[it.identificativo] = it;
    el.aggiornato = new Date().toISOString();
    scriviElenco(el);
    D.elementi = Object.keys(el.items).length;
    if (aperto) disegna();
  }
  // intestazioni: si copiano quelle che l’applicazione ha davvero usato (il portale rifiuta con 405 le richieste diverse)
  const SALTA = /^(cookie|authorization|content-length|host|origin|referer|user-agent|connection)$/i;
  const fetch0 = window.fetch;
  const esadecimale = n => { let r = ''; while (r.length < n) r += Math.floor(Math.random() * 16).toString(16); return r; };
  const filtra = h => { const o = {}; for (const k of Object.keys(h || {})) if (!SALTA.test(k)) o[k] = h[k]; return o; };
  function intestazioniOrdinate(h, conCorpo) {
    const base = { 'Accept': 'application/json, text/plain, */*', 'Cache-Control': 'no-cache', 'traceparent': '00-' + esadecimale(32) + '-' + esadecimale(16) + '-01' };
    if (conCorpo) base['Content-Type'] = 'application/json';
    const out = [];
    const visti = {};
    for (const k of Object.keys(h || {})) { out.push([k, h[k]]); visti[k.toLowerCase()] = 1; }
    for (const k of Object.keys(base)) if (!visti[k.toLowerCase()]) out.push([k, base[k]]);
    return out.map(([k, v]) => {
      if (/^traceparent$/i.test(k)) v = (/^(\w\w)-/.exec(String(v)) || [0, '00'])[1] + '-' + esadecimale(32) + '-' + esadecimale(16) + '-' + (/-(\w\w)$/.exec(String(v)) || [0, '01'])[1];
      return [k, v];
    });
  }
  function applica(x, h, conCorpo) {
    for (const [k, v] of intestazioniOrdinate(h, conCorpo)) { try { x.setRequestHeader(k, v); } catch (e) {} }
  }
  // invio con più modalità: il portale rifiuta (405) le richieste proprie anche se identiche, si provano più strade
  async function invia(metodo, url, h, corpo) {
    const esiti = [];
    const xhr = () => new Promise(ok => {
      const x = new XMLHttpRequest();
      x.open(metodo, url);
      x.__proprio = true;
      try { if (/^https?:/i.test(url) && new URL(url).origin !== location.origin) x.withCredentials = true; } catch (e) {}
      applica(x, h, corpo != null);
      x.onload = () => ok({ stato: x.status, testo: x.responseText || '', tipo: x.getResponseHeader('Content-Type') || '?', allow: x.getResponseHeader('Allow') || '-' });
      x.onerror = () => ok({ stato: 0, testo: '', tipo: '?', allow: '-' });
      x.send(corpo == null ? null : corpo);
    });
    const fch = async () => {
      const hd = {}; for (const [k, v] of intestazioniOrdinate(h, corpo != null)) hd[k] = v;
      const r = await fetch0.call(window, url, { method: metodo, headers: hd, body: corpo == null ? undefined : corpo, credentials: 'include', cache: 'no-store' });
      return { stato: r.status, testo: await r.text(), tipo: r.headers.get('Content-Type') || '?', allow: r.headers.get('Allow') || '-' };
    };
    let ult = null;
    for (const [nome, f] of [['xhr', xhr], ['fetch', fch]]) {
      try { ult = await f(); } catch (e) { ult = { stato: 0, testo: String(e && e.message || e), tipo: '?', allow: '-' }; }
      esiti.push(nome + ' ' + ult.stato);
      if (ult.stato === 200) break;
    }
    ult.esiti = esiti.join(', ');
    return ult;
  }
  function salvaModello(req, intest, u) {
    const f = req.filter || {};
    const pulito = JSON.parse(JSON.stringify(req));
    pulito.filter = {};
    for (const k of Object.keys(f)) pulito.filter[k] = k === 'autorizzatiType' ? f[k] : {};
    const tipo = String(f.autorizzatiType && f.autorizzatiType.autorizzatiTypeEnumValue);
    const mod = LS.get('pstPdpModelli') || {};
    const pagina = Number(req.paging && req.paging.page) || 0;
    let url = null; try { const q = new URL(u, location.href); url = q.pathname + q.search; } catch (e) {}
    mod[tipo] = { url, orig: origineDi(u), ps: Number(req.paging && req.paging.pageSize) || 0, body: pulito, intest: filtra(intest), minPage: mod[tipo] ? Math.min(mod[tipo].minPage, pagina) : pagina };
    LS.set('pstPdpModelli', mod);
  }

  // l’applicazione usa indirizzi relativi (“_ws/api/...”): si confronta sempre il percorso risolto
  const origineDi = u => { try { return new URL(u, document.baseURI).origin; } catch (e) { return ''; } };
  const percorso = u => { try { return new URL(u, location.href).pathname; } catch (e) { return String(u).split('?')[0]; } };

  // ---------- nomi e cognomi per esteso ----------
  const NOMI = SS;
  function trovaNomi(v, out, ch) {
    if (!v || typeof v !== 'object') return out;
    if (Array.isArray(v)) { v.forEach(e => trovaNomi(e, out, ch)); return out; }
    if (ch === 'magistrato') return out;
    const k = {};
    for (const n of Object.keys(v)) k[n.toLowerCase()] = v[n];
    const t = n => (typeof k[n] === 'string' ? k[n].trim() : '');
    let nome = (t('cognome') || t('nome')) ? (t('nome') + ' ' + t('cognome')).trim() : (t('denominazione') || t('ragionesociale') || t('nominativo'));
    if (nome && ch !== 'user') out.push(nome);
    for (const n of Object.keys(v)) trovaNomi(v[n], out, n.toLowerCase());
    return [...new Set(out)];
  }
  const contiene = (testo, valore) => {
    if (!valore || !testo) return false;
    if (/^\d+$/.test(valore)) return new RegExp('(^|[/=?&"\':,])' + valore + '($|[/&"\',}])').test(testo);
    return testo.indexOf(valore) >= 0;
  };
  function salvaNomi(id, chiave, nomi) {
    const n = NOMI.get('pstPdpNomi') || {};
    (n[id] = n[id] || {})[chiave] = nomi;
    NOMI.set('pstPdpNomi', n);
  }
  // quando l’utente apre nell’applicazione la finestra delle iniziali, si impara quale chiamata restituisce i nomi
  function salvaSogg(id, chiave, item) {
    const n = SS.get('pstPdpSogg') || {};
    (n[id] = n[id] || {})[chiave] = item;
    SS.set('pstPdpSogg', n);
  }
  function apprendi(metodo, u, corpo, risposta, intest) {
    if (!/soggetti\/nominativo/.test(u)) return;   // solo questa chiamata restituisce i nomi dei soggetti
    const nomi = trovaNomi(risposta, [], '');
    if (!nomi.length) return;
    const el = leggiElenco();
    if (!el) return;
    const x = new URL(u, location.href);
    let url = x.pathname + x.search;
    let id = null, sogg = null;
    for (const it of Object.values(el.items)) {
      if (!id && (contiene(url, it.identificativo) || contiene(corpo, it.identificativo))) id = it.identificativo;
      for (const s of it.inizialiSoggetti || []) {
        for (const tipo of ['identificativo', 'idRegeWeb']) {
          const val = s[tipo] == null ? '' : String(s[tipo]);
          if (!sogg && val && (contiene(url, val) || contiene(corpo, val))) sogg = { tipo, val, idFasc: it.identificativo };
        }
      }
    }
    if (!id && !sogg) return;
    const sost = t => { let r = t; if (id) r = r.split(id).join('{id}'); if (sogg) r = r.split(sogg.val).join('{sid}'); return r; };
    url = sost(url);
    const urlOrig = url;
    const i = url.indexOf('/_ws/api/');
    if (i > 0 && url.indexOf(PERC) === 0) url = PERC.slice(0, -1) + url.slice(i);
    LS.set('pstPdpTemplNomi', { origine: origineDi(u), metodo, url, urlOrig, intest: filtra(intest), corpo: corpo ? sost(corpo) : null, usaSid: !!sogg, sidTipo: sogg ? sogg.tipo : null });
    const idF = id || (sogg && sogg.idFasc);
    if (idF) salvaNomi(idF, sogg ? sogg.val : '*', nomi);
    const item = risposta && risposta.result && risposta.result.item;
    if (idF && item && typeof item === 'object') salvaSogg(idF, sogg ? sogg.val : '*', item);
    if (aperto && !caricando) disegna();
  }

  const open0 = XMLHttpRequest.prototype.open, send0 = XMLHttpRequest.prototype.send;
  const head0 = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.setRequestHeader = function (n, v) { try { (this.__hd = this.__hd || {})[n] = v; } catch (e) {} return head0.apply(this, arguments); };
  XMLHttpRequest.prototype.open = function (m, u) { this.__pm = String(m); this.__pu = String(u); this.__hd = {}; return open0.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function (b) {
    const x = this;
    D.xhr++;
    const perc = percorso(x.__pu || '');
    const lista = /^post$/i.test(x.__pm || '') && perc.endsWith('/_ws/api/fascicoli/autorizzati');
    const altra = !lista && !x.__proprio && perc.indexOf('/_ws/api/') >= 0 && !/\/(codificati|system)\//.test(perc);
    if (perc.indexOf('/_ws/api/') >= 0 && !x.__proprio) D.host = origineDi(x.__pu) === location.origin ? 'stesso' : origineDi(x.__pu);
    if (/^post$/i.test(x.__pm || '')) D.post = perc.split('/').slice(-3).join('/');
    if (lista) D.lista++;
    // durante la lettura di una sezione (Stato, Depositi) si conservano le risposte che l’applicazione riceve
    const cat = MEM.cat;
    if (cat && !lista && !x.__proprio && perc.indexOf('/_ws/api/') >= 0 && !/\/(codificati|system)\//.test(perc) && !/soggetti\/nominativo/.test(perc)) {
      let rq = null; try { rq = JSON.parse(b); } catch (e) {}
      const voce = { m: x.__pm, u: perc, req: rq, risp: null, stato: 0, fatto: false };
      cat.push(voce); cat.ultima = Date.now();
      const fine = () => {
        if (x.readyState !== 4 || voce.fatto) return;
        voce.fatto = true; voce.stato = x.status; cat.ultima = Date.now();
        try { voce.risp = x.responseType === 'json' ? x.response : JSON.parse(x.responseText); } catch (e) { voce.risp = null; }
      };
      x.addEventListener('loadend', fine); x.addEventListener('readystatechange', fine);
    }
    if (lista || altra) {
      let req = null;
      try { req = JSON.parse(b); } catch (e) {}
      let letto = false;
      const leggi = () => {
        try {
          if (letto || x.readyState !== 4) return;
          if (x.status !== 200) return;
          letto = true;
          const r = x.responseType === 'json' ? x.response : JSON.parse(x.responseText);
          if (altra) { apprendi(x.__pm, x.__pu, typeof b === 'string' ? b : null, r, x.__hd); return; }
          const items = r && r.result && r.result.items;
          if (!Array.isArray(items)) { D.errore = 'risposta senza elenco'; return; }
          D.risposte++;
          if (req && req.paging && !x.__proprio) salvaModello(req, x.__hd, x.__pu);
          memorizza(items, !!x.__sostituisci);
        } catch (e) { D.errore = String(e && e.message || e); }
      };
      x.addEventListener('load', leggi);
      x.addEventListener('loadend', leggi);
      x.addEventListener('readystatechange', leggi);
    }
    return send0.apply(this, arguments);
  };

  if (fetch0) {
    window.fetch = function (i, o) {
      if (i && i.__proprio) return fetch0.apply(this, arguments);
      const p = fetch0.apply(this, arguments);
      try {
        const url = typeof i === 'string' ? i : (i && i.url) || '';
        const metodo = (o && o.method) || (i && i.method) || 'GET';
        if (/^post$/i.test(metodo) && percorso(url).endsWith('/_ws/api/fascicoli/autorizzati')) {
          D.lista++;
          p.then(r => r.clone().json().then(j => {
            const items = j && j.result && j.result.items;
            if (Array.isArray(items)) { D.risposte++; memorizza(items, false); }
          })).catch(() => {});
        }
      } catch (e) {}
      return p;
    };
  }

  async function richiedi(t, id, sid) {
    const sost = q => q.split('{id}').join(id).split('{sid}').join(sid || '');
    const r = await invia(t.metodo, (t.origine || '') + sost(t.url), t.intest, t.corpo == null ? null : sost(t.corpo));
    D.det = 'nomi ' + r.esiti + ' · ' + r.tipo + ' ' + r.testo.length + ' car. “' + r.testo.slice(0, 80).replace(/\s+/g, ' ') + '”' + (r.stato === 405 ? ' Allow=' + r.allow : '');
    if (r.stato !== 200) throw new Error('stato ' + r.stato);
    try { return JSON.parse(r.testo); } catch (e) { return null; }
  }
  async function caricaNomi(id, sogg) {
    const t = LS.get('pstPdpTemplNomi');
    if (!t) { messaggio('Per vedere i nomi: chiudi questo elenco, nell’elenco originale clicca una volta sulle iniziali di un soggetto (la finestra che si apre) e poi torna qui. L’estensione impara da sola quale richiesta usare.'); return false; }
    const val = t.usaSid ? (t.sidTipo === 'idRegeWeb' ? String(sogg.rid) : sogg.sid) : '';
    let r;
    const reale = Object.assign({}, t, { url: t.urlOrig || t.url });
    const varianti = [reale];
    if (t.url !== reale.url) varianti.push(t);
    let nomiTrovati = [], ultimo = null;
    for (const v of varianti) {
      try { r = await richiedi(v, id, val); nomiTrovati = trovaNomi(r, [], ''); if (nomiTrovati.length) break; ultimo = new Error('risposta senza nomi'); }
      catch (e) { ultimo = e; }
    }
    if (!nomiTrovati.length) { D.nomi = ultimo.message; throw ultimo; }
    r = r || {};
    const nomi = trovaNomi(r, [], '');
    D.nomi = nomi.length ? 'ok' : 'risposta senza nomi';
    if (!nomi.length) throw new Error('il portale non ha restituito nomi');
    salvaNomi(id, t.usaSid ? val : '*', nomi);
    return true;
  }

  function chiama(m, sostituisci) {
    const prova = async (url, ps) => {
      const body = JSON.parse(JSON.stringify(m.body));
      body.paging.page = m.minPage;
      if (ps) body.paging.pageSize = ps;
      const r = await invia('POST', url, m.intest, JSON.stringify(body));
      D.agg = 'stato ' + r.stato + ' ' + r.esiti + ' ps' + ps;
      D.det = 'elenco ' + r.esiti + ' Allow=' + r.allow + ' ' + r.tipo + ' “' + r.testo.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100) + '”';
      diag();
      if (r.stato !== 200) throw new Error('stato ' + r.stato);
      const j = JSON.parse(r.testo);
      const items = j && j.result && j.result.items;
      if (!Array.isArray(items)) throw new Error('risposta senza elenco');
      D.risposte++; memorizza(items, sostituisci);
    };
    const urls = [m.url, API].filter((u, i, a) => u && a.indexOf(u) === i).map(u => (m.orig || '') + u);
    const dim = [m.ps || 0, 500].filter((p, i, a) => a.indexOf(p) === i);
    return (async () => {
      let ult;
      for (const u of urls) for (const p of dim) {
        try { return await prova(u, p); } catch (e) { ult = e; if (!/stato (405|400|404|413|422)/.test(e.message)) throw e; }
      }
      throw ult;
    })();
  }
  // l’elenco si rilegge facendo scorrere le pagine all’applicazione: la richiesta la fa lei, l’estensione ne salva la risposta
  let aggInCorso = false;
  async function aggiorna() {
    if (aggInCorso) { aggInCorso = false; return; }
    const SEL = 'app-procedimenti-view tbody.ui-table-tbody > tr.ui-selectable-row';
    if (!document.querySelector(SEL)) { messaggio('Per aggiornare apri la pagina “Procedimenti autorizzati” (o “Procedimenti definiti”) e riprova da lì.'); return; }
    aggInCorso = true;
    const attendi = ms => new Promise(ok => setTimeout(ok, ms));
    const finche = async (f, max) => { const t0 = Date.now(); while (Date.now() - t0 < (max || 4000)) { try { const v = f(); if (v) return v; } catch (e) {} await attendi(100); } return null; };
    const firma = () => Array.from(document.querySelectorAll(SEL)).map(r => r.textContent).join('|');
    const bt = pannello && pannello.querySelector('[data-a]'); if (bt) bt.textContent = 'Interrompi';
    let pagina = 1;
    try {
      const primo = document.querySelector('p-paginator .ui-paginator-first');
      if (primo && !primo.classList.contains('ui-state-disabled')) { const f0 = firma(); primo.click(); await finche(() => firma() !== f0, 4000); await attendi(300); }
      while (aggInCorso) {
        messaggio('Aggiornamento: pagina ' + pagina + '…');
        const next = document.querySelector('p-paginator .ui-paginator-next');
        if (!next || next.classList.contains('ui-state-disabled')) break;
        const f1 = firma(); next.click();
        if (!(await finche(() => firma() !== f1, 6000))) break;
        await attendi(300); pagina++;
      }
      messaggio('Aggiornamento completato: ' + pagina + ' pagine lette.');
    } catch (e) { messaggio('Aggiornamento interrotto: ' + e.message); }
    aggInCorso = false; if (bt) bt.textContent = 'Aggiorna';
    disegna();
  }

  // ---------- interfaccia ----------
  const fmt = d => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || ''); return m ? m[3] + '/' + m[2] + '/' + m[1] : (d || ''); };
  const iso = d => { const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(d || ''); return m ? m[3] + m[2] + m[1] : String(d || ''); };
  const unici = a => [...new Set(a.filter(Boolean))];

  function riga(it, nomiTutti) {
    const isc = it.iscrizioniRegistro || [];
    const nomiR = (nomiTutti || {})[it.identificativo] || {};
    const sogg = (it.inizialiSoggetti || []).map(s => ({ sid: s.identificativo, rid: s.idRegeWeb, abbr: s.abbreviazione || '', parte: s.descrizioneTipoParte || '' }));
    const nomiDi = s => nomiR[s.sid] || nomiR[String(s.rid)] || [];
    const completo = sogg.map(s => s.abbr + (s.parte ? ' (' + s.parte + ')' : '') + (nomiDi(s).length ? ': ' + nomiDi(s).join(', ') : '')).join('; ') +
      (nomiR['*'] ? ' – ' + nomiR['*'].join(', ') : '');
    const primo = isc[0] || {};
    return {
      id: it.identificativo,
      registro: isc.map(i => (i.codiceTipoRegistro || '') + ' ' + i.numero + '/' + i.anno).join(' | '),
      chiave: (Number(primo.anno) || 0) * 1e7 + (Number(primo.numero) || 0),
      ufficio: unici(isc.map(i => i.ufficio && i.ufficio.ufficio)).join(' | '),
      magistrato: unici(isc.map(i => i.magistrato && i.magistrato.nominativo)).join(' | '),
      soggetti: completo, sogg, nomiR, nomiDi,
      nomina: fmt(it.dataNomina),
      chiusa: !!(it.archiviato || it.definito),
      stato: (it.archiviato ? 'Archiviato' : it.definito ? 'Definito' + (it.dataDefinizione ? ' ' + fmt(it.dataDefinizione) : '') : 'In corso') + (it.faulted ? ' ⚠' : ''),
      iter: it.descrizioneIter || ''
    };
  }
  const COLONNE = [
    ['registro', 'Registro', r => r.chiave], ['ufficio', 'Ufficio', r => r.ufficio.toLowerCase()],
    ['magistrato', 'Magistrato', r => r.magistrato.toLowerCase()], ['soggetti', 'Soggetti', r => r.soggetti.toLowerCase()],
    ['nomina', 'Nomina', r => iso(r.nomina)], ['stato', 'Stato', r => r.stato.toLowerCase()], ['iter', 'Iter', r => r.iter.toLowerCase()]
  ];

  function messaggio(t) { if (pannello) pannello.querySelectorAll('[data-m]').forEach(e => { e.textContent = t; }); }

  function vai(percorso) {
    chiudi();
    history.pushState({}, '', percorso);
    window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
  }

  function disegna() {
    if (caricando) return;
    try {
      disegnaInt();
      const lista = pannello && pannello.querySelector('[data-el]'), sc = pannello && pannello.querySelector('[data-sc]');
      if (vista.tipo === 'scheda') disegnaScheda();
      else if (lista) { lista.style.display = ''; sc.style.display = 'none'; }
    } catch (e) { D.errore = 'disegno: ' + (e && e.message || e); diag(); }
  }
  function diag() {
    if (!pannello) return;
    pannello.querySelector('[data-d]').textContent = 'Diagnostica · chiamate viste: ' + D.xhr + ' · elenchi intercettati: ' + D.lista + ' · risposte lette: ' + D.risposte + ' · procedimenti in memoria: ' + D.elementi + ' · ultima POST: ' + (D.post || '-') + (D.errore ? ' · errore: ' + D.errore : '') + ' · richiesta salvata: ' + (LS.get('pstPdpModelli') ? 'sì' : 'no') + ' · aggiornamento: ' + (D.agg || '-') + ' · nomi: ' + (D.nomi || '-') + ' · indirizzo API: ' + (D.host || '-') + (D.det ? ' · dettaglio: ' + D.det : '') + ' · richiesta nomi: ' + (() => { const t = LS.get('pstPdpTemplNomi'); return t ? t.metodo + ' ' + t.url : 'non appresa'; })();
  }
  function disegnaInt() {
    if (!pannello) return;
    const el = leggiElenco();
    const nomiTutti = SS.get('pstPdpNomi') || {};
    const tutte = el ? Object.values(el.items).map(i => riga(i, nomiTutti)) : [];
    const q = (pannello.querySelector('[data-q]').value || '').trim().toLowerCase();
    const nascondi = pannello.querySelector('[data-n]').checked;
    SS.set('pstPdpFiltro', q);
    LS.set('pstPdpNascondi', nascondi);
    const ord = LS.get('pstPdpOrd') || { c: 'nomina', d: -1 };
    const col = COLONNE.find(c => c[0] === ord.c) || COLONNE[4];
    let v = tutte.filter(r => (!nascondi || !r.chiusa) && (!q || (r.registro + ' ' + r.ufficio + ' ' + r.magistrato + ' ' + r.soggetti + ' ' + r.nomina + ' ' + r.stato + ' ' + r.iter).toLowerCase().includes(q)));
    v.sort((a, b) => { const x = col[2](a), y = col[2](b); return (x < y ? -1 : x > y ? 1 : 0) * ord.d; });
    pannello.querySelector('[data-c]').textContent = v.length + ' di ' + tutte.length + ' procedimenti' +
      (el && el.aggiornato ? ' · dati del ' + new Date(el.aggiornato).toLocaleString('it-IT') : '');
    diag();
    const t = pannello.querySelector('table');
    t.innerHTML = '';
    const th = t.createTHead().insertRow();
    for (const c of COLONNE) {
      const h = document.createElement('th');
      h.textContent = c[1] + (ord.c === c[0] ? (ord.d > 0 ? ' ▲' : ' ▼') : '');
      h.style.cssText = 'cursor:pointer;text-align:left;border-bottom:2px solid #889;padding:4px;position:sticky;top:0;background:#fff';
      h.addEventListener('click', () => { LS.set('pstPdpOrd', { c: c[0], d: ord.c === c[0] ? -ord.d : 1 }); disegna(); });
      th.appendChild(h);
    }
    th.appendChild(document.createElement('th'));
    const tb = t.createTBody();
    for (const r of v) {
      const tr = tb.insertRow();
      tr.style.cssText = 'border-bottom:1px solid #ddd' + (r.chiusa ? ';color:#666' : '');
      tr.addEventListener('dblclick', () => apriScheda(r.id, 'panoramica'));
      for (const c of COLONNE) {
        const td = tr.insertCell(); td.style.padding = '4px';
        if (c[0] === 'registro') {
          const a = document.createElement('a');
          a.href = '#'; a.title = 'Apri la scheda del procedimento'; a.textContent = r.registro;
          a.style.cssText = 'cursor:pointer;color:#14c;font-weight:600;text-decoration:none';
          a.addEventListener('click', ev => { ev.preventDefault(); apriScheda(r.id, 'panoramica'); });
          td.appendChild(a); continue;
        }
        if (c[0] !== 'soggetti') { td.textContent = r[c[0]]; continue; }
        for (const sg of r.sogg) {
          const d = document.createElement('div');
          const a = document.createElement('a');
          a.href = '#'; a.title = 'Clic per mostrare nome e cognome';
          a.textContent = sg.abbr + (sg.parte ? ' (' + sg.parte + ')' : '');
          a.style.cssText = 'cursor:pointer;color:#14c;text-decoration:underline dotted';
          a.addEventListener('click', ev => { ev.preventDefault(); ev.stopPropagation(); un(r.id, sg); });
          d.appendChild(a);
          const nn = r.nomiDi(sg);
          if (nn.length) d.appendChild(document.createTextNode(' → ' + nn.join(', ')));
          td.appendChild(d);
        }
        if (r.nomiR['*']) { const d = document.createElement('div'); d.textContent = '→ ' + r.nomiR['*'].join(', '); td.appendChild(d); }
      }
      const az = tr.insertCell();
      for (const [testo, sez] of [['Scheda', 'panoramica'], ['Stato', 'stato'], ['Depositi', 'depositi']]) {
        const b = document.createElement('button');
        b.textContent = testo;
        b.style.cssText = 'margin-right:4px;cursor:pointer';
        b.addEventListener('click', () => apriScheda(r.id, sez));
        az.appendChild(b);
      }
    }
    pannello.__righe = v;
  }

  // ---------- scheda del procedimento ----------
  const SEZIONI = [['panoramica', 'Panoramica'], ['soggetti', 'Soggetti'], ['iscrizioni', 'Iscrizioni'], ['stato', 'Stato'], ['depositi', 'Depositi'], ['completi', 'Dati completi']];
  const ROTTE = { stato: id => PERC + 'procedimenti-autorizzati/' + id + '/procedimento-stato', depositi: id => PERC + 'depositi/' + id };
  const h = (tag, css, testo) => { const e = document.createElement(tag); if (css) e.style.cssText = css; if (testo != null) e.textContent = testo; return e; };
  const BTN = 'padding:5px 12px;cursor:pointer;border:1px solid #9aa;background:#f4f5fa;border-radius:5px;font:inherit';
  const fmtDT = d => { const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(d || ''); return m ? m[3] + '/' + m[2] + '/' + m[1] + (m[4] && (m[4] !== '00' || m[5] !== '00') ? ' ' + m[4] + ':' + m[5] : '') : (d || ''); };
  const umano = k => { const s = String(k).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase(); return s.charAt(0).toUpperCase() + s.slice(1); };
  const sn = b => (b == null ? null : b ? 'sì' : 'no');
  const valore = v => typeof v === 'boolean' ? sn(v) : (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}(T|$)/.test(v)) ? fmtDT(v) : String(v);
  const vuoto = v => !(v instanceof Node) && (v == null || v === '' || (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length));
  const corpoDi = r => (r && r.result ? (r.result.item !== undefined ? r.result.item : r.result.items !== undefined ? r.result.items : r.result) : r);

  function coppie(lista) {
    const dl = h('div', 'display:grid;grid-template-columns:minmax(150px,230px) 1fr;gap:3px 16px');
    for (const [k, v] of lista) {
      if (vuoto(v)) continue;
      dl.appendChild(h('div', 'color:#667;padding:2px 0', k));
      const c = h('div', 'padding:2px 0;word-break:break-word');
      if (v instanceof Node) c.appendChild(v); else c.textContent = v;
      dl.appendChild(c);
    }
    return dl;
  }
  function tabella(righe) {
    const col = [];
    for (const r of righe) for (const k of Object.keys(r)) if (!vuoto(r[k]) && col.indexOf(k) < 0) col.push(k);
    const t = h('table', 'border-collapse:collapse;width:100%;font-size:12px');
    const hr = t.createTHead().insertRow();
    for (const k of col) hr.appendChild(h('th', 'text-align:left;border-bottom:2px solid #99a;padding:3px 6px;color:#445', umano(k)));
    const tb = t.createTBody();
    for (const r of righe) { const tr = tb.insertRow(); tr.style.borderBottom = '1px solid #e3e3ea'; for (const k of col) { const td = tr.insertCell(); td.style.padding = '3px 6px'; td.textContent = vuoto(r[k]) ? '' : valore(r[k]); } }
    return t;
  }
  // visualizzazione generica di qualsiasi risposta del portale: nulla va perso, anche i campi che l’applicazione non mostra
  function albero(v) {
    if (vuoto(v)) return h('span', 'color:#999', '—');
    if (Array.isArray(v)) {
      if (v.every(x => x == null || typeof x !== 'object')) return h('span', null, v.map(valore).join(', '));
      const ogg = v.every(x => x && typeof x === 'object' && !Array.isArray(x));
      if (ogg && v.length > 1 && v.every(x => Object.values(x).every(y => y == null || typeof y !== 'object'))) return tabella(v);
      const w = h('div');
      v.forEach((x, i) => {
        const b = h('div', 'border-left:3px solid #cdd3e0;padding:3px 0 3px 10px;margin:5px 0');
        if (v.length > 1) b.appendChild(h('div', 'color:#889;font-size:11px', (i + 1) + ' di ' + v.length));
        b.appendChild(albero(x)); w.appendChild(b);
      });
      return w;
    }
    if (typeof v === 'object') return coppie(Object.keys(v).map(k => [umano(k), typeof v[k] === 'object' ? albero(v[k]) : (v[k] == null ? null : valore(v[k]))]));
    return h('span', null, valore(v));
  }

  function apriScheda(id, sez) {
    if (!pannello) return;
    if (vista.tipo !== 'scheda') pannello.__scroll = pannello.scrollTop;
    vista = { tipo: 'scheda', id, sez: sez || 'panoramica' };
    SS.set('pstPdpVista', vista);
    disegna();
    pannello.scrollTop = 0;
    if (ROTTE[vista.sez] && !(MEM.sez[id] || {})[vista.sez]) leggiSezione(id, vista.sez);
  }
  function tornaElenco() {
    vista = { tipo: 'elenco' };
    SS.set('pstPdpVista', vista);
    disegna();
    pannello.scrollTop = pannello.__scroll || 0;
  }
  function vaiSezione(sez) {
    vista.sez = sez; SS.set('pstPdpVista', vista); disegna();
    if (ROTTE[sez] && !(MEM.sez[vista.id] || {})[sez]) leggiSezione(vista.id, sez);
  }

  // Stato e Depositi: l’estensione apre la pagina nell’applicazione sotto il pannello, ne legge le risposte e torna indietro
  async function leggiSezione(id, sez) {
    if (caricando || !ROTTE[sez]) return;
    caricando = sez + id;
    const voci = []; MEM.cat = voci;
    const attendi = ms => new Promise(ok => setTimeout(ok, ms));
    messaggio('Lettura di “' + sez + '” dal portale…');
    disegnaScheda();
    try {
      history.pushState({}, '', ROTTE[sez](id));
      window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
      const t0 = Date.now(); voci.ultima = t0;
      while (Date.now() - t0 < 15000) {
        await attendi(250);
        if (!voci.some(v => !v.fatto) && Date.now() - voci.ultima > 1500 && Date.now() - t0 > 2000) break;
      }
      // i depositi sono a pagine da dieci: si scorre il paginatore dell’applicazione fino all’ultima
      for (let n = 0; n < 80 && sez === 'depositi'; n++) {
        const next = document.querySelector('p-paginator .ui-paginator-next');
        if (!next || next.classList.contains('ui-state-disabled')) break;
        const k = voci.length; next.click();
        messaggio('Lettura dei depositi: pagina ' + (n + 2) + '…');
        const t1 = Date.now();
        while (Date.now() - t1 < 8000) { await attendi(200); if (voci.length > k && voci.every(v => v.fatto)) break; }
        await attendi(300);
      }
    } catch (e) { messaggio('Lettura non riuscita: ' + e.message); }
    MEM.cat = null;
    try { history.back(); } catch (e) {}
    await attendi(600);
    const utili = voci.filter(v => v.fatto).map(v => ({ m: v.m, u: v.u, req: v.req, risp: v.risp, stato: v.stato }));
    (MEM.sez[id] = MEM.sez[id] || {})[sez] = { ora: new Date().toISOString(), voci: utili };
    SS.set('pstPdpSez', MEM.sez);
    caricando = '';
    messaggio(utili.length ? '' : 'Il portale non ha restituito dati per questa sezione. Prova “Apri nella pagina originale”.');
    disegna();
  }

  // salva solo la forma dei dati (nomi dei campi, tipi, quantità), senza i valori
  function forma(v, liv) {
    if (v === null || v === undefined) return 'null';
    if (Array.isArray(v)) return v.length ? ['n=' + v.length, forma(v.reduce((m, x) => (x && typeof x === 'object' && Object.keys(x).length > Object.keys(m || {}).length ? x : (m === undefined ? x : m)), undefined), liv + 1)] : [];
    if (typeof v === 'object') { if (liv > 8) return '{…}'; const o = {}; for (const k of Object.keys(v)) o[k] = forma(v[k], liv + 1); return o; }
    return typeof v;
  }
  function salvaForma(sez, c) {
    const dati = { sezione: sez, ora: c.ora, voci: c.voci.map(v => ({ metodo: v.m, url: v.u.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, '{id}'), stato: v.stato, richiesta: forma(v.req, 0), risposta: forma(v.risp, 0) })) };
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(dati, null, 1)], { type: 'application/json' }));
    a.download = 'dati_' + sez + '_' + Date.now() + '.json';
    document.body.appendChild(a); a.click(); a.remove();
  }

  function pulsante(testo, f, css) { const b = h('button', css || BTN, testo); b.addEventListener('click', f); return b; }

  const vociDi = (id, sez) => ((MEM.sez[id] || {})[sez] || {}).voci || [];
  function depositiDi(id) {
    const m = {};
    for (const v of vociDi(id, 'depositi')) if (/elenco-depositi$/.test(v.u)) for (const x of (v.risp && v.risp.result && v.risp.result.items) || []) m[x.identificativo] = x;
    return Object.values(m).sort((a, b) => String(b.dataInvio).localeCompare(String(a.dataInvio)));
  }
  function udienzeDi(id) {
    for (const v of vociDi(id, 'stato')) if (/\/stato$/.test(v.u)) { const it = v.risp && v.risp.result && v.risp.result.item; return (it && it.udienze) || []; }
    return null;
  }
  function tabellaDati(colonne, righe, perRiga) {
    const t = h('table', 'border-collapse:collapse;width:100%;font-size:13px');
    const hr = t.createTHead().insertRow();
    for (const c of colonne) hr.appendChild(h('th', 'text-align:left;border-bottom:2px solid #99a;padding:5px 8px;color:#445;background:#f4f5fa', c));
    const tb = t.createTBody();
    for (const x of righe) perRiga(tb, x);
    return t;
  }
  function renderUdienze(ud) {
    if (!ud.length) return h('div', 'color:#667;padding:8px 0', 'Nessuna udienza fissata.');
    const oggi = new Date().toISOString().slice(0, 10);
    const v = ud.slice().sort((a, b) => String(a.data).localeCompare(String(b.data)));
    return tabellaDati(['Data', 'Aula', 'Ufficio', 'Sezione', 'Causale'], v, (tb, u) => {
      const tr = tb.insertRow(); tr.style.borderBottom = '1px solid #e3e3ea';
      const futura = String(u.data).slice(0, 10) >= oggi;
      if (futura) tr.style.background = '#f1f7ee';
      [fmtDT(u.data) + (futura ? '  · in programma' : ''), u.aula, [u.descrizioneTipoUfficioAmbito, u.descrizioneCircondario].filter(Boolean).join(' · '), u.descrizioneSezione, u.descrizioneCausale].forEach((t, i) => {
        const td = tr.insertCell(); td.style.padding = '5px 8px'; td.textContent = t || ''; if (i === 0 && futura) td.style.fontWeight = '600';
      });
    });
  }
  function renderDepositi(dep) {
    const w = h('div');
    if (!dep.length) { w.appendChild(h('div', 'color:#667;padding:8px 0', 'Nessun deposito.')); return w; }
    w.appendChild(h('div', 'color:#556;margin-bottom:6px', dep.length + ' depositi · dal più recente · clic su una riga per tutti i dati'));
    w.appendChild(tabellaDati(['Prog.', 'Inviato', 'Arrivato', 'Stato', 'Tipo di atto', 'Atti contestuali', 'Registro', 'Annotazione'], dep, (tb, d) => {
      const tr = tb.insertRow(); tr.style.cssText = 'border-bottom:1px solid #e3e3ea;cursor:pointer';
      const reg = d.registro ? (d.registro.codiceTipoRegistro || '') + ' ' + d.registro.numero + '/' + d.registro.anno : '';
      [d.progressivo, fmtDT(d.dataInvio), fmtDT(d.dataArrivo), d.descrizioneStatoPratica, d.descrizioneTipoAtto, d.totaleAttiContestuali, reg, d.annotazione].forEach(t => { const td = tr.insertCell(); td.style.padding = '5px 8px'; td.textContent = t == null ? '' : String(t); });
      let det = null;
      tr.addEventListener('click', () => {
        if (det) { det.remove(); det = null; return; }
        det = tb.insertRow(tr.rowIndex - tb.rows[0].rowIndex + 1);
        const c = det.insertCell(); c.colSpan = 8; c.style.cssText = 'padding:8px 14px;background:#fafbfe'; c.appendChild(albero(d));
      });
    }));
    return w;
  }

  function contenutoSezione(sez, it, r, dettagli) {
    const id = it.identificativo;
    const w = h('div');
    if (sez === 'panoramica') {
      const nl = r.sogg.filter(s => r.nomiDi(s).length).length;
      const tiles = h('div', 'display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px');
      const tile = (t, sotto, s) => { const b = h('button', 'text-align:left;padding:10px 14px;border:1px solid #b9c0d4;border-radius:8px;background:#f7f8fc;cursor:pointer;min-width:170px;font:inherit'); b.appendChild(h('div', 'font-weight:600', t)); b.appendChild(h('div', 'color:#667;font-size:12px;margin-top:2px', sotto)); b.addEventListener('click', () => vaiSezione(s)); return b; };
      tiles.appendChild(tile('Soggetti', r.sogg.length + ' · nomi letti ' + nl + '/' + r.sogg.length, 'soggetti'));
      tiles.appendChild(tile('Iscrizioni', (it.iscrizioniRegistro || []).length + ' registri', 'iscrizioni'));
      const ud = udienzeDi(id), dp = (MEM.sez[id] || {}).depositi ? depositiDi(id) : null;
      tiles.appendChild(tile('Stato e udienze', it.abilitaVisulizzazioneStato === false ? 'non abilitato dal portale' : (ud ? ud.length + ' udienze' : 'da leggere'), 'stato'));
      tiles.appendChild(tile('Depositi', dp ? dp.length + ' depositi' : 'da leggere', 'depositi'));
      tiles.appendChild(tile('Dati completi', 'ogni campo restituito dal portale', 'completi'));
      w.appendChild(tiles);
      const url = it.urlDisponibilitaAtti ? (() => { const a = h('a', 'color:#14c', it.urlDisponibilitaAtti); a.href = it.urlDisponibilitaAtti; a.target = '_blank'; a.rel = 'noopener'; return a; })() : null;
      w.appendChild(coppie([
        ['Stato del procedimento', r.stato], ['Iter', it.descrizioneIter ? it.descrizioneIter + (it.codiceIter ? ' (' + it.codiceIter + ')' : '') : null],
        ['Data di nomina', fmtDT(it.dataNomina)], ['Data di definizione', fmtDT(it.dataDefinizione)], ['Ruolo del difensore', it.codiceTipoLegale],
        ['Avvocatura', it.descrizioneAvvocatura], ['Accesso agli atti', [it.descrizioneStatoAccessoAtti, it.codiceStatoAccessoAtti != null ? 'codice ' + it.codiceStatoAccessoAtti : ''].filter(Boolean).join(' · ')],
        ['Atti disponibili fino al', fmtDT(it.dataScadenzaDisponibilitaAtti)], ['Indirizzo per gli atti', url],
        ['TAUN disponibile', sn(it.isTAUNDisponibile)], ['Marcato per indicizzazione', sn(it.isMarcatoPerIndicizzazione)],
        ['Visualizzazione dello stato', sn(it.abilitaVisulizzazioneStato)], ['Segnalato con errori', it.faulted ? 'sì' : null],
        ['Fascicolo Regeweb', it.identificativoFascicoloRegeWeb], ['Identificativo', id]
      ]));
    } else if (sez === 'soggetti') {
      const lista = it.inizialiSoggetti || [];
      if (!lista.length) w.appendChild(h('div', 'color:#667', 'Nessun soggetto nell’elenco.'));
      lista.forEach(s => {
        const nomi = r.nomiDi({ sid: s.identificativo, rid: s.idRegeWeb });
        const det = dettagli[s.identificativo] || dettagli[String(s.idRegeWeb)] || null;
        const b = h('div', 'border:1px solid #d5d9e6;border-radius:8px;padding:10px 14px;margin-bottom:10px');
        b.appendChild(h('div', 'font-size:15px;font-weight:600', nomi.length ? nomi.join(', ') : (s.abbreviazione || 'Soggetto')));
        b.appendChild(h('div', 'color:#667;font-size:12px;margin:2px 0 8px', [s.abbreviazione, s.descrizioneTipoParte, s.descrizioneTipoPersona].filter(Boolean).join(' · ')));
        b.appendChild(coppie([['Nominato il', fmtDT(s.dataNomina)], ['Ruolo legale', s.descrizioneTipoLegale], ['Codice parte', s.codiceTipoParte], ['Tipo persona', s.codiceTipoPersona], ['Identificativo', s.identificativo], ['Id Regeweb', s.idRegeWeb]]));
        if (det) { b.appendChild(h('div', 'margin:10px 0 4px;font-weight:600;color:#445', 'Anagrafica restituita dal portale')); b.appendChild(albero(det)); }
        else if (!nomi.length) b.appendChild(h('div', 'margin-top:8px;color:#a60', 'Nome non ancora letto.'));
        w.appendChild(b);
      });
      if (lista.some(s => !r.nomiDi({ sid: s.identificativo, rid: s.idRegeWeb }).length)) {
        w.appendChild(h('div', 'color:#667;margin-bottom:6px', 'Per leggere i nomi mancanti l’estensione deve cliccare le iniziali nell’elenco originale: torna all’elenco e premi “Carica tutti i nomi”.'));
        w.appendChild(pulsante('Torna all’elenco', tornaElenco));
      }
    } else if (sez === 'iscrizioni') {
      const l = it.iscrizioniRegistro || [];
      if (!l.length) w.appendChild(h('div', 'color:#667', 'Nessuna iscrizione.'));
      l.forEach(i => {
        const b = h('div', 'border:1px solid #d5d9e6;border-radius:8px;padding:10px 14px;margin-bottom:10px');
        b.appendChild(h('div', 'font-size:15px;font-weight:600', (i.codiceTipoRegistro || '') + ' ' + i.numero + '/' + i.anno + (i.ufficio && i.ufficio.ufficio ? ' · ' + i.ufficio.ufficio : '')));
        const u = i.ufficio || {}, m = i.magistrato || {};
        b.appendChild(coppie([['Data di iscrizione', fmtDT(i.dataIscrizione)], ['Ufficio del registro', i.ufficoRegistroAmbito], ['Codice ufficio registro', i.codiceUfficioRegistro], ['Sede ufficio registro', i.sedeUfficioRegistro],
          ['Protocollo', i.protocolloRegistro], ['Ambito', i.codiceAmbito], ['Competenza', i.codiceCompetenza], ['Magistrato', m.nominativo || [m.nome, m.cognome].filter(Boolean).join(' ')], ['Codice magistrato', m.codice],
          ['Tipo ufficio', u.codiceTipoUfficioAmbito], ['Distretto', u.codiceDistretto], ['Circondario', u.codiceCircondario], ['Sede ufficio', u.codiceSedeUfficio]]));
        w.appendChild(b);
      });
    } else if (sez === 'completi') {
      w.appendChild(h('div', 'color:#667;margin-bottom:8px', 'Tutti i campi che il portale restituisce per questo procedimento nell’elenco, compresi quelli che l’applicazione non mostra.'));
      w.appendChild(albero(it));
      if (Object.keys(dettagli).length) { w.appendChild(h('div', 'margin:14px 0 4px;font-weight:600', 'Anagrafiche dei soggetti già lette')); w.appendChild(albero(dettagli)); }
    } else if (ROTTE[sez]) {
      const c = (MEM.sez[id] || {})[sez];
      const barra = h('div', 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px');
      if (caricando === sez + id) { w.appendChild(h('div', 'padding:14px;color:#556', 'Lettura in corso dal portale…')); return w; }
      barra.appendChild(pulsante(c ? 'Rileggi' : 'Leggi dal portale', () => leggiSezione(id, sez)));
      barra.appendChild(pulsante('Apri nella pagina originale', () => vai(ROTTE[sez](id))));
      if (c && c.voci.length) barra.appendChild(pulsante('Salva struttura dati', () => salvaForma(sez, c)));
      if (c) barra.appendChild(h('span', 'color:#778;font-size:12px', 'Letto il ' + new Date(c.ora).toLocaleString('it-IT') + ' · ' + c.voci.length + ' chiamate'));
      w.appendChild(barra);
      if (c && !c.voci.length) w.appendChild(h('div', 'color:#a60', 'Nessuna risposta ricevuta dal portale per questa sezione.'));
      if (c && c.voci.length) {
        const ud = sez === 'stato' ? udienzeDi(id) : null;
        if (sez === 'stato') { w.appendChild(h('div', 'font-weight:600;margin:6px 0', 'Udienze')); w.appendChild(ud ? renderUdienze(ud) : h('div', 'color:#667', 'Il portale non ha restituito l’elenco delle udienze.')); }
        if (sez === 'depositi') w.appendChild(renderDepositi(depositiDi(id)));
        const dt = h('details', 'margin-top:16px'); dt.appendChild(h('summary', 'cursor:pointer;color:#445', 'Risposte complete del portale (' + c.voci.length + ' chiamate)'));
        w.appendChild(dt);
        for (const v of c.voci) {
          dt.appendChild(h('div', 'color:#889;font-size:11px;margin-top:12px', v.m + ' …' + v.u.split('/').slice(-4).join('/') + ' · stato ' + v.stato));
          const b = h('div', 'border:1px solid #d5d9e6;border-radius:8px;padding:8px 14px;margin-top:2px');
          b.appendChild(albero(corpoDi(v.risp)));
          dt.appendChild(b);
        }
      }
      if (false) for (const v of c.voci) {
        w.appendChild(h('div', 'color:#889;font-size:11px;margin-top:12px', v.m + ' …' + v.u.split('/').slice(-4).join('/') + ' · stato ' + v.stato));
        const b = h('div', 'border:1px solid #d5d9e6;border-radius:8px;padding:8px 14px;margin-top:2px');
        b.appendChild(albero(corpoDi(v.risp)));
        w.appendChild(b);
      }
    }
    return w;
  }

  function disegnaScheda() {
    const box = pannello.querySelector('[data-sc]'), lista = pannello.querySelector('[data-el]');
    const el = leggiElenco(), it = el && el.items[vista.id];
    if (!it) { vista = { tipo: 'elenco' }; SS.set('pstPdpVista', vista); box.style.display = 'none'; lista.style.display = ''; return; }
    lista.style.display = 'none'; box.style.display = '';
    box.innerHTML = '';
    const r = riga(it, SS.get('pstPdpNomi') || {});
    const dettagli = (SS.get('pstPdpSogg') || {})[it.identificativo] || {};
    const ids = (pannello.__righe || []).map(x => x.id), pos = ids.indexOf(it.identificativo);

    const top = h('div', 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px');
    top.appendChild(pulsante('← Elenco', tornaElenco));
    const prec = pulsante('‹', () => apriScheda(ids[pos - 1], vista.sez)), succ = pulsante('›', () => apriScheda(ids[pos + 1], vista.sez));
    prec.title = 'Procedimento precedente'; succ.title = 'Procedimento successivo';
    prec.disabled = pos < 1; succ.disabled = pos < 0 || pos >= ids.length - 1;
    top.appendChild(prec); top.appendChild(succ);
    if (pos >= 0) top.appendChild(h('span', 'color:#778;font-size:12px', (pos + 1) + ' di ' + ids.length));
    const x = pulsante('Chiudi', chiudi); x.style.marginLeft = 'auto'; top.appendChild(x);
    box.appendChild(top);

    const titolo = h('div', 'margin:4px 0 2px;font-size:20px;font-weight:700', r.registro || 'Procedimento');
    box.appendChild(titolo);
    box.appendChild(h('div', 'color:#556;margin-bottom:4px', [r.ufficio, r.magistrato ? 'magistrato ' + r.magistrato : '', r.stato].filter(Boolean).join(' · ')));
    const nomiRiga = r.sogg.map(s => { const n = r.nomiDi(s); return n.length ? n.join(', ') + ' (' + (s.parte || s.abbr) + ')' : s.abbr + (s.parte ? ' (' + s.parte + ')' : ''); }).join(' · ');
    box.appendChild(h('div', 'margin-bottom:12px', nomiRiga));

    const tabs = h('div', 'display:flex;gap:2px;border-bottom:2px solid #c9cfe0;margin-bottom:14px;flex-wrap:wrap');
    for (const [k, t] of SEZIONI) {
      const b = h('button', 'padding:7px 14px;cursor:pointer;border:0;border-bottom:3px solid ' + (vista.sez === k ? '#2a55c8' : 'transparent') + ';background:none;font:inherit;font-weight:' + (vista.sez === k ? '700' : '400') + ';margin-bottom:-2px', t);
      b.addEventListener('click', () => vaiSezione(k));
      tabs.appendChild(b);
    }
    box.appendChild(tabs);
    const m = h('div', 'color:#a00;margin-bottom:6px'); m.setAttribute('data-m', ''); box.appendChild(m);
    const cont = h('div', 'max-width:1000px');
    cont.appendChild(contenutoSezione(vista.sez, it, r, dettagli));
    box.appendChild(cont);
  }

  async function un() { return tutti(); }
  let inCorso = false;
  // i nomi si leggono facendo cliccare le iniziali nell’elenco originale: la richiesta la fa l’applicazione (il portale rifiuta le richieste proprie)
  async function tutti() {
    if (inCorso) { inCorso = false; return; }
    const SEL_RIGHE = 'app-procedimenti-view tbody.ui-table-tbody > tr.ui-selectable-row';
    if (!document.querySelector(SEL_RIGHE)) { messaggio('L’elenco originale non è presente in questa pagina: apri “Procedimenti autorizzati” e riprova.'); return; }
    const mancanti = (pannello.__righe || []).some(r => r.sogg.some(sg => !r.nomiDi(sg).length));
    if ((pannello.__righe || []).length && !mancanti) { messaggio('Tutti i nomi sono già in memoria.'); return; }
    inCorso = true;
    const bt = pannello.querySelector('[data-t]'); bt.textContent = 'Interrompi';
    const attendi = ms => new Promise(ok => setTimeout(ok, ms));
    const finche = async (f, max, passo) => { const t0 = Date.now(); while (Date.now() - t0 < (max || 4000)) { try { const v = f(); if (v) return v; } catch (e) {} await attendi(passo || 100); } return null; };
    const firma = () => Array.from(document.querySelectorAll(SEL_RIGHE)).map(r => r.textContent).join('|');
    const dlgAperto = () => document.querySelector('.ui-dialog #cognome_controlId, .ui-dialog #denominazione_controlId');
    let letti = 0, errori = 0, pagina = 1;
    try {
      const primo = document.querySelector('p-paginator .ui-paginator-first');
      if (primo && !primo.classList.contains('ui-state-disabled')) { const f0 = firma(); primo.click(); await finche(() => firma() !== f0, 4000); await attendi(300); }
      while (inCorso) {
        const righe = Array.from(document.querySelectorAll(SEL_RIGHE));
        for (const r of righe) {
          if (!inCorso) break;
          for (const a of Array.from(r.querySelectorAll('app-soggetti-iniziali a.cursor-pointer'))) {
            if (!inCorso) break;
            a.click();
            const ok = await finche(() => { const i = dlgAperto(); return i && (i.value || document.querySelector('.ui-dialog #nome_controlId, .ui-dialog #denominazione_controlId')) ? i : null; }, 6000);
            await attendi(250);
            if (ok) letti++; else errori++;
            const chiudi = Array.from(document.querySelectorAll('.ui-dialog button')).find(x => (x.textContent || '').trim() === 'Chiudi');
            if (chiudi) chiudi.click();
            await finche(() => !dlgAperto(), 3000);
            await attendi(120);
            messaggio('Nomi letti: ' + letti + ' (pagina ' + pagina + ')' + (errori ? ' · errori: ' + errori : ''));
          }
        }
        disegna();
        const next = document.querySelector('p-paginator .ui-paginator-next');
        if (!inCorso || !next || next.classList.contains('ui-state-disabled')) break;
        const f1 = firma(); next.click();
        if (!(await finche(() => firma() !== f1, 6000))) break;
        await attendi(300); pagina++;
      }
    } catch (e) { messaggio('Interrotto: ' + e.message); inCorso = false; }
    inCorso = false; bt.textContent = 'Carica tutti i nomi';
    messaggio('Nomi letti: ' + letti + ' su ' + pagina + ' pagine' + (errori ? ' · errori: ' + errori : '') + '. I procedimenti archiviati si leggono dalla pagina “Procedimenti definiti”.');
    disegna();
  }

  function csv() {
    const v = pannello.__righe || [];
    const e = s => '"' + String(s).replace(/"/g, '""') + '"';
    const testo = [COLONNE.map(c => e(c[1])).join(';')].concat(v.map(r => COLONNE.map(c => e(r[c[0]])).join(';'))).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + testo], { type: 'text/csv;charset=utf-8' }));
    a.download = 'procedimenti_pdp_' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
  }
  function chiudi() { aperto = false; if (pannello) pannello.style.display = 'none'; }
  function apri() {
    aperto = true;
    pannello.style.display = 'block';
    disegna();
    const el = leggiElenco();
    if (!el || !Object.keys(el.items).length) messaggio('Nessun dato in memoria: apri la pagina “Procedimenti autorizzati” e scorri l’elenco, oppure premi “Aggiorna” da quella pagina.');
    pannello.querySelector('[data-q]').focus();
  }

  function costruisci() {
    const bt = document.createElement('button');
    bt.textContent = 'Elenco procedimenti';
    bt.style.cssText = 'position:fixed;left:8px;bottom:40px;z-index:2147483645;padding:4px 8px;font:12px sans-serif;cursor:pointer;opacity:.85';
    bt.addEventListener('click', () => (aperto ? chiudi() : apri()));
    document.body.appendChild(bt);

    pannello = document.createElement('div');
    pannello.style.cssText = 'display:none;position:fixed;inset:8px;z-index:2147483646;background:#fff;color:#111;overflow:auto;' +
      'padding:12px;font:13px sans-serif;border:1px solid #556;box-shadow:0 4px 24px rgba(0,0,0,.4)';
    pannello.innerHTML = '<div data-el><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px">' +
      '<strong>Procedimenti autorizzati</strong>' +
      '<input data-q type="search" placeholder="Cerca in tutte le colonne" style="padding:3px 6px;min-width:260px">' +
      '<label><input data-n type="checkbox"> nascondi definiti e archiviati</label>' +
      '<button data-a>Aggiorna</button><button data-t>Carica tutti i nomi</button><button data-s>Esporta CSV</button><button data-v>Svuota copia locale</button>' +
      '<button data-x style="margin-left:auto">Chiudi</button></div>' +
      '<div data-c style="margin-bottom:4px"></div><div data-d style="color:#888;font-size:11px;margin-bottom:4px"></div><div data-m style="color:#a00;margin-bottom:4px"></div>' +
      '<table style="border-collapse:collapse;width:100%"></table></div><div data-sc style="display:none"></div>';
    document.body.appendChild(pannello);
    pannello.querySelector('[data-q]').value = SS.get('pstPdpFiltro') || '';
    pannello.querySelector('[data-n]').checked = !!LS.get('pstPdpNascondi');
    pannello.querySelector('[data-q]').addEventListener('input', disegna);
    pannello.querySelector('[data-n]').addEventListener('change', disegna);
    pannello.querySelector('[data-a]').addEventListener('click', aggiorna);
    pannello.querySelector('[data-s]').addEventListener('click', csv);
    pannello.querySelector('[data-t]').addEventListener('click', tutti);
    pannello.querySelector('[data-x]').addEventListener('click', chiudi);
    pannello.querySelector('[data-v]').addEventListener('click', () => { MEM.el = null; MEM.sez = {}; vista = { tipo: 'elenco' }; SS.del('pstPdpVista'); SS.del('pstPdpSez'); SS.del('pstPdpSogg'); SS.del('pstPdpElenco'); SS.del('pstPdpFiltro'); SS.del('pstPdpNomi'); disegna(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && aperto) { if (vista.tipo === 'scheda') tornaElenco(); else chiudi(); } });
  }
  if (document.body) costruisci(); else document.addEventListener('DOMContentLoaded', costruisci);
})();
