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
  function apprendi(metodo, u, corpo, risposta, intest) {
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
    if (aperto) disegna();
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
  async function aggiorna() {
    const mod = LS.get('pstPdpModelli') || {};
    const chiavi = Object.keys(mod);
    if (!chiavi.length) { if (leggiElenco() && Object.keys(leggiElenco().items).length) return; messaggio('Apri una volta l’elenco dei procedimenti nell’applicazione: da quel momento l’estensione sa come richiederlo.'); return; }
    messaggio('Aggiornamento in corso…');
    try {
      for (let i = 0; i < chiavi.length; i++) await chiama(mod[chiavi[i]], i === 0);
      messaggio('');
    } catch (e) {
      messaggio('Aggiornamento non riuscito (' + e.message + '). Apri l’elenco nell’applicazione: l’estensione lo salva da sola.');
      try { const u = Number(sessionStorage.getItem('pstPdpRicarica') || 0); if (Date.now() - u > 120000) { sessionStorage.setItem('pstPdpRicarica', String(Date.now())); messaggio('Aggiornamento diretto rifiutato dal portale: ricarico la pagina per far rileggere l’elenco all’applicazione…'); setTimeout(() => location.reload(), 1200); } } catch (e2) {}
    }
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

  function messaggio(t) { if (pannello) pannello.querySelector('[data-m]').textContent = t; }

  function vai(percorso) {
    chiudi();
    history.pushState({}, '', percorso);
    window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
    setTimeout(() => { if (location.pathname === percorso && document.querySelector('app-procedimenti-autorizzati')) location.reload(); }, 1500);
  }

  function disegna() {
    try { disegnaInt(); } catch (e) { D.errore = 'disegno: ' + (e && e.message || e); diag(); }
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
      for (const c of COLONNE) {
        const td = tr.insertCell(); td.style.padding = '4px';
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
      for (const [testo, p] of [['Stato', PERC + 'procedimenti-autorizzati/' + r.id + '/procedimento-stato'], ['Depositi', PERC + 'depositi/' + r.id]]) {
        const b = document.createElement('button');
        b.textContent = testo;
        b.style.cssText = 'margin-right:4px;cursor:pointer';
        b.addEventListener('click', () => vai(p));
        az.appendChild(b);
      }
    }
    pannello.__righe = v;
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
    const vecchio = !el || !el.aggiornato || Date.now() - new Date(el.aggiornato).getTime() > 15 * 60 * 1000;
    if (!el || !Object.keys(el.items).length || vecchio) aggiorna();
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
    pannello.innerHTML = '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px">' +
      '<strong>Procedimenti autorizzati</strong>' +
      '<input data-q type="search" placeholder="Cerca in tutte le colonne" style="padding:3px 6px;min-width:260px">' +
      '<label><input data-n type="checkbox"> nascondi definiti e archiviati</label>' +
      '<button data-a>Aggiorna</button><button data-t>Carica tutti i nomi</button><button data-s>Esporta CSV</button><button data-v>Svuota copia locale</button>' +
      '<button data-x style="margin-left:auto">Chiudi</button></div>' +
      '<div data-c style="margin-bottom:4px"></div><div data-d style="color:#888;font-size:11px;margin-bottom:4px"></div><div data-m style="color:#a00;margin-bottom:4px"></div>' +
      '<table style="border-collapse:collapse;width:100%"></table>';
    document.body.appendChild(pannello);
    pannello.querySelector('[data-q]').value = SS.get('pstPdpFiltro') || '';
    pannello.querySelector('[data-n]').checked = !!LS.get('pstPdpNascondi');
    pannello.querySelector('[data-q]').addEventListener('input', disegna);
    pannello.querySelector('[data-n]').addEventListener('change', disegna);
    pannello.querySelector('[data-a]').addEventListener('click', aggiorna);
    pannello.querySelector('[data-s]').addEventListener('click', csv);
    pannello.querySelector('[data-t]').addEventListener('click', tutti);
    pannello.querySelector('[data-x]').addEventListener('click', chiudi);
    pannello.querySelector('[data-v]').addEventListener('click', () => { MEM.el = null; SS.del('pstPdpElenco'); SS.del('pstPdpFiltro'); SS.del('pstPdpNomi'); disegna(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && aperto) chiudi(); });
  }
  if (document.body) costruisci(); else document.addEventListener('DOMContentLoaded', costruisci);
})();
