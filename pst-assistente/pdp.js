// Elenco locale dei procedimenti del PDP: raccoglie le risposte che l’applicazione già riceve
// e le mostra in un pannello ricercabile, raggiungibile anche dal dettaglio di un procedimento.
(() => {
  if (window.__pstPdp) return;
  window.__pstPdp = true;
  const API = '/PST/PAVVP/consultazioni/_ws/api/fascicoli/autorizzati';
  const PERC = '/PST/PAVVP/consultazioni/';
  const RX_LISTA = /\/_ws\/api\/fascicoli\/[a-z-]*(autorizzati|definiti)[a-z-]*$/i;
  const arch = s => ({
    get: k => { try { return JSON.parse(s.getItem(k)); } catch (e) { return null; } },
    set: (k, v) => { try { s.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del: k => { try { s.removeItem(k); } catch (e) {} }
  });
  const LS = arch(localStorage);     // solo preferenze e modelli di richiesta, senza dati dei procedimenti
  const SS = arch(sessionStorage);   // elenco dei procedimenti: scompare alla chiusura della scheda

  let pannello = null, aperto = false, btnApri = null;
  // l’elenco sta anche in memoria: il portale potrebbe svuotare sessionStorage
  const MEM = window.__pstPdpMem = window.__pstPdpMem || { el: null };
  MEM.sez = MEM.sez || SS.get('pstPdpSez') || {};   // sezioni lette dal portale: { idProcedimento: { stato: {ora, voci}, depositi: {...} } }
  let vista = SS.get('pstPdpVista') || { tipo: 'elenco' };
  if (vista.sez === 'stato') vista.sez = 'udienze';
  let caricando = '';
  const D = { nomResp: 0, nomOk: 0, nomSt: 0, nomi: '', agg: '', xhr: 0, lista: 0, risposte: 0, elementi: 0, errore: '', det: '' };
  // elenco, nomi e anagrafiche restano nel browser anche dopo la chiusura della scheda (prima stavano in sessionStorage e andavano persi)
  for (const k of ['pstPdpElenco', 'pstPdpNomi', 'pstPdpSogg']) {
    const v = SS.get(k);
    if (v && k !== 'pstPdpElenco') { const o = LS.get(k) || {}; for (const id of Object.keys(v)) o[id] = Object.assign({}, o[id] || {}, v[id]); LS.set(k, o); }
    else if (v && !LS.get(k)) LS.set(k, v);
    SS.del(k);
  }
  const leggiElenco = () => MEM.el || LS.get('pstPdpElenco');
  const scriviElenco = el => { MEM.el = el; LS.set('pstPdpElenco', el); };

  // ---------- raccolta dei dati ----------
  function memorizza(items, sostituisci) {
    MEM.pagina = items.map(it => it && it.identificativo);   // la tabella dell’applicazione mostra le righe in questo stesso ordine
    const el = leggiElenco() || { items: {} };
    if (sostituisci && items.length) el.items = {};
    for (const it of items) if (it && it.identificativo) { el.items[it.identificativo] = it; if (MEM.visti) MEM.visti[it.identificativo] = it; }
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
  const NOMI = LS;
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
    const n = LS.get('pstPdpSogg') || {};
    (n[id] = n[id] || {})[chiave] = item;
    LS.set('pstPdpSogg', n);
  }
  function nomeDi(o) {
    const t = k => (typeof o[k] === 'string' ? o[k].trim() : '');
    return (t('cognome') || t('nome')) ? (t('nome') + ' ' + t('cognome')).trim() : (t('denominazione') || t('ragioneSociale') || '');
  }
  function apprendiElenco(u, corpo, risposta) {
    const el = leggiElenco(); if (!el || !risposta || typeof risposta !== 'object') return 0;
    const ogg = [];
    const giu = v => { if (Array.isArray(v)) v.forEach(giu); else if (v && typeof v === 'object') { if (nomeDi(v)) ogg.push(v); Object.keys(v).forEach(k => { if (v[k] && typeof v[k] === 'object') giu(v[k]); }); } };
    giu(risposta);
    if (!ogg.length) return 0;
    const idx = {};
    for (const it of Object.values(el.items)) for (const sg of it.inizialiSoggetti || []) {
      if (sg.identificativo) idx['i' + sg.identificativo] = [it.identificativo, sg.identificativo];
      if (sg.idRegeWeb != null) idx['r' + sg.idRegeWeb] = [it.identificativo, sg.identificativo];
    }
    let n = 0;
    for (const o of ogg) {
      let m = null;
      for (const k of Object.keys(o)) { const v = o[k]; if (v == null || typeof v === 'object') continue; m = m || idx['i' + v] || idx['r' + v]; }
      if (m) { salvaNomi(m[0], m[1], [nomeDi(o)]); n++; }
    }
    if (n) { D.nomListe = (D.nomListe || 0) + n; if (aperto && !caricando) disegna(); }
    return n;
  }
  function apprendi(metodo, u, corpo, risposta, intest) {
    if (!/soggetti\/nominativo/.test(u)) { apprendiElenco(u, corpo, risposta); return; }   // le altre risposte: nomi solo se legati a un soggetto noto
    const nomi = trovaNomi(risposta, [], '');
    if (!nomi.length) { D.nomVuote = (D.nomVuote || 0) + 1; return; }
    D.nomOk++;
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
    const lista = /^post$/i.test(x.__pm || '') && RX_LISTA.test(perc);
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
          if (altra && !x.__cn && /soggetti\/nominativo/.test(perc)) { x.__cn = 1; D.nomResp++; D.nomSt = x.status; }
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
        if (/^post$/i.test(metodo) && RX_LISTA.test(percorso(url))) {
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
  const attendi = ms => new Promise(ok => setTimeout(ok, ms));
  const finche = async (f, max, passo) => { const t0 = Date.now(); while (Date.now() - t0 < (max || 4000)) { try { const v = f(); if (v) return v; } catch (e) {} await attendi(passo || 100); } return null; };
  // fa scorrere le pagine dell’elenco originale, dalla prima all’ultima: le richieste le fa l’applicazione
  async function scorri(continua, avanza) {
    const firma = () => righeLista().map(r => r.textContent).join('|');
    const attivo = b => b && !b.classList.contains('ui-state-disabled');
    let pagina = 1, completo = false, motivo = '';
    const primo = document.querySelector('p-paginator .ui-paginator-first');
    const succ = () => document.querySelector('p-paginator .ui-paginator-next');
    if (attivo(primo)) { const f0 = firma(); primo.click(); await finche(() => firma() !== f0, 4000); await attendi(300); }
    else if (attivo(succ())) {   // già sulla prima pagina: si va avanti e indietro per far rileggere anche quella
      const f0 = firma(); succ().click(); await finche(() => firma() !== f0, 6000); await attendi(300);
      const p2 = document.querySelector('p-paginator .ui-paginator-first'), f1 = firma();
      if (attivo(p2)) { p2.click(); await finche(() => firma() !== f1, 6000); await attendi(300); }
    }
    while (continua()) {
      if (avanza) avanza(pagina);
      const next = succ();
      if (!next || !attivo(next)) { completo = true; break; }
      const f1 = firma(); next.click();
      let ok = await finche(() => firma() !== f1, 8000);
      if (!ok) { const n2 = succ(); if (attivo(n2)) { n2.click(); ok = await finche(() => firma() !== f1, 8000); } }
      if (!ok) { motivo = 'la tabella non è cambiata dopo il clic sulla pagina ' + (pagina + 1); break; }
      await attendi(300); pagina++;
    }
    if (!completo && !motivo) motivo = 'interrotto';
    return { pagine: pagina, completo, motivo };
  }
  async function aggiorna() {
    if (aggInCorso) { aggInCorso = false; return; }
    if (caricando) return;
    aggInCorso = true;
    if (!righeLista().length) { messaggio('Apro l’elenco dei procedimenti autorizzati…'); if (!(await assicuraLista('attivi'))) { aggInCorso = false; messaggio('L’elenco dei procedimenti autorizzati non si è caricato: aprilo dal menu del portale e riprova.'); return; } }
    const bt = pannello && pannello.querySelector('[data-a]'); if (bt) bt.textContent = 'Interrompi';
    const lista = listaCorrente();
    MEM.visti = {};
    let esito = '';
    try {
      const r = await scorri(() => aggInCorso, p => messaggio('Aggiornamento: pagina ' + p + '…'));
      esito = 'Aggiornamento completato: ' + r.pagine + ' pagine lette.';
      if (r.completo && aggInCorso) { const n = nvConfronta(lista, MEM.visti, String(Date.now())); esito += ' ' + n.testo; }
    } catch (e) { esito = 'Aggiornamento interrotto: ' + e.message; }
    MEM.visti = null;
    aggInCorso = false; if (bt) bt.textContent = 'Aggiorna';
    messaggio(esito);
    disegna();
  }

  // ---------- interfaccia ----------
  const fmt = d => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || ''); return m ? m[3] + '/' + m[2] + '/' + m[1] : (d || ''); };
  const iso = d => { const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(d || ''); return m ? m[3] + m[2] + m[1] : String(d || ''); };
  const unici = a => [...new Set(a.filter(Boolean))];

  // ---------- reati contestati ----------
  // Il nome del campo non è noto con certezza: si cercano le chiavi che parlano di reati o imputazioni, in qualsiasi punto della risposta.
  const RX_REATI = /reat|imputaz|qualificaz|contestaz/i;
  const RX_NO_REATO = /^(id|identificativ|data|numero|totale|flag|is[A-Z]|has[A-Z]|codice)/;
  function fmtReato(o) {
    if (o == null) return '';
    if (typeof o !== 'object') return String(o).trim();
    const f = piatto(o, '', {});
    const ult = k => k.split('.').pop().replace(/\[[^\]]*\]/g, '');
    const pick = re => { for (const k of Object.keys(f)) if (re.test(ult(k))) return f[k]; return ''; };
    const art = pick(/^(articolo|numeroArticolo|art)$/i), co = pick(/^comma$/i), le = pick(/^lettera$/i);
    const fonte = pick(/^(descrizioneFonte|fonte|siglaFonte|descrizioneLegge|legge|descrizioneNorma|norma|descrizioneCodice|codiceFonte)$/i);
    const des = pick(/^(descrizione|descrizioneReato|titolo|titoloReato|descrizioneBreve|descrizioneEstesa|testo|reato)$/i);
    let t = [art && 'art. ' + art, co && 'co. ' + co, le && 'lett. ' + le, fonte].filter(Boolean).join(' ');
    if (des && des !== t) t = t ? t + ' – ' + des : des;
    if (!t) t = Object.keys(f).filter(k => !RX_NO_REATO.test(ult(k)) && !/^(true|false)$/.test(f[k])).map(k => f[k]).join(' ');
    return t.trim();
  }
  function reatiIn(v, escludi, out, prof) {
    out = out || []; prof = prof || 0;
    if (!v || typeof v !== 'object' || prof > 7) return out;
    if (Array.isArray(v)) { v.forEach(x => reatiIn(x, escludi, out, prof + 1)); return out; }
    for (const k of Object.keys(v)) {
      if (escludi && escludi.indexOf(k) >= 0) continue;
      const x = v[k];
      if (RX_REATI.test(k)) {
        if (Array.isArray(x)) x.forEach(e => { const t = fmtReato(e); if (t) out.push(t); });
        else if (x && typeof x === 'object') { const t = fmtReato(x); if (t) out.push(t); }
        else if (x != null && x !== '' && typeof x !== 'boolean' && !RX_NO_REATO.test(k)) out.push(String(x).trim());
      } else if (x && typeof x === 'object') reatiIn(x, escludi, out, prof + 1);
    }
    return [...new Set(out)];
  }
  // righe dell’elenco originale: selettore preciso e, in mancanza, qualsiasi riga di tabella PrimeNG con le iniziali dei soggetti
  const SEL_LISTA = 'app-procedimenti-view tbody.ui-table-tbody > tr.ui-selectable-row';
  const righeLista = () => {
    let r = Array.from(document.querySelectorAll(SEL_LISTA));
    if (!r.length) r = Array.from(document.querySelectorAll('tbody.ui-table-tbody > tr, tbody.p-datatable-tbody > tr')).filter(x => x.querySelector('app-soggetti-iniziali'));
    return r.filter(x => !pannello || !pannello.contains(x));
  };
  // a quale procedimento in memoria corrisponde una riga dell’elenco originale (numero/anno di registro e ufficio)
  function itemDiRiga(tr) {
    const el = leggiElenco(); if (!el) return null;
    const righe = righeLista(), i = righe.indexOf(tr);
    if (MEM.pagina && MEM.pagina.length === righe.length && i >= 0 && el.items[MEM.pagina[i]]) return el.items[MEM.pagina[i]];
    // in mancanza: numero e anno di registro nel testo della riga (si tolgono punti e spazi, il portale può scrivere 2.730/2025)
    const t = tr.textContent.replace(/[.\s ]/g, '');
    const prova = (i2, a, b) => new RegExp('(^|\\D)' + a + '/' + b + '(\\D|$)').test(t);
    const cand = Object.values(el.items).filter(it => (it.iscrizioniRegistro || []).some(x => x.numero != null && (prova(0, x.numero, x.anno) || prova(0, x.anno, x.numero))));
    if (cand.length < 2) return cand[0] || null;
    const t2 = tr.textContent.replace(/\s+/g, ' ');
    return cand.find(it => (it.iscrizioniRegistro || []).some(x => x.ufficio && x.ufficio.ufficio && t2.indexOf(x.ufficio.ufficio) >= 0)) || cand[0];
  }

  const rottaLista = lista => {
    if (lista === 'attivi') return PERC + 'procedimenti-autorizzati';
    const ld = document.querySelector('a[href*="definiti"]');
    try { if (ld) return new URL(ld.getAttribute('href'), document.baseURI).pathname; } catch (e) {}
    return PERC + 'procedimenti-autorizzati-definiti';
  };
  // porta l’applicazione sull’elenco richiesto (sotto il pannello) e attende che le righe siano quelle nuove
  async function assicuraLista(lista) {
    if (righeLista().length && listaCorrente() === lista) return true;
    const firma0 = righeLista().map(r => r.textContent).join('|');
    history.pushState({}, '', rottaLista(lista));
    window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
    const ok = await finche(() => listaCorrente() === lista && righeLista().length && righeLista().map(r => r.textContent).join('|') !== firma0, 20000, 250);
    await attendi(1000);
    return !!ok;
  }

  function riga(it, nomiTutti) {
    const isc = it.iscrizioniRegistro || [];
    const nomiR = (nomiTutti || {})[it.identificativo] || {};
    const sogg = (it.inizialiSoggetti || []).map(s => ({ sid: s.identificativo, rid: s.idRegeWeb, abbr: s.abbreviazione || '', parte: s.descrizioneTipoParte || '', }));
    const nomiDi = s => nomiR[s.sid] || nomiR[String(s.rid)] || [];
    const magDi = i => { const m = i.magistrato || {}; return m.nominativo || [m.nome, m.cognome].filter(Boolean).join(' '); };
    // una riga per iscrizione: numero, ufficio e magistrato restano allineati
    const linee = isc.map(i => ({ reg: ((i.codiceTipoRegistro || '') + ' ' + i.numero + '/' + i.anno).trim(), uff: (i.ufficio && i.ufficio.ufficio) || '', mag: magDi(i) }));
    const primo = isc[0] || {};
    const nomiTesto = sogg.map(x => nomiDi(x).join(', ')).filter(Boolean).concat(nomiR['*'] || []);
    return {
      id: it.identificativo, linee,
      registro: linee.map(l => l.reg).join(' | '),
      chiave: (Number(primo.anno) || 0) * 1e7 + (Number(primo.numero) || 0),
      ufficio: unici(linee.map(l => l.uff)).join(' | '),
      magistrato: unici(linee.map(l => l.mag)).join(' | '),
      soggetti: sogg.map(x => x.abbr + (x.parte ? ' (' + x.parte + ')' : '') + (nomiDi(x).length ? ': ' + nomiDi(x).join(', ') : '')).join('; ') + (nomiR['*'] ? ' – ' + nomiR['*'].join(', ') : ''),
      nomiTesto,
      sogg, nomiR, nomiDi,
      nomina: fmt(it.dataNomina),
      chiusa: !!(it.archiviato || it.definito),
      stato: (it.archiviato ? 'Archiviato' : it.definito ? 'Definito' + (it.dataDefinizione ? ' ' + fmt(it.dataDefinizione) : '') : 'In corso') + (it.faulted ? ' ⚠' : ''),
      iter: it.descrizioneIter || ''
    };
  }
  // gruppo: “isc” una riga per iscrizione, “sog” una riga per soggetto, “proc” una cella sola per il procedimento
  const COLONNE = [
    ['registro', 'Registro', r => r.chiave, 'isc', r => r.linee.map(l => l.reg)],
    ['ufficio', 'Ufficio', r => r.ufficio.toLowerCase(), 'isc', r => r.linee.map(l => l.uff)],
    ['magistrato', 'Magistrato', r => r.magistrato.toLowerCase(), 'isc', r => r.linee.map(l => l.mag)],
    ['iniziali', 'Iniziali', r => r.sogg.map(x => x.abbr).join(' ').toLowerCase(), 'sog', r => r.sogg.map(x => x.abbr)],
    ['nome', 'Nome', r => (r.nomiTesto.join(' ') || '~').toLowerCase(), 'sog', r => r.sogg.map(x => r.nomiDi(x).join(', '))],
    ['ruolo', 'Ruolo', r => r.sogg.map(x => x.parte).join(' ').toLowerCase(), 'sog', r => r.sogg.map(x => x.parte)],
    ['nomina', 'Nomina', r => iso(r.nomina), 'proc', r => [r.nomina]],
    ['stato', 'Stato', r => r.stato.toLowerCase(), 'proc', r => [r.stato]],
    ['iter', 'Iter', r => r.iter.toLowerCase(), 'proc', r => [r.iter]]
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
      else if (vista.tipo === 'novita') disegnaNovita();
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
    const nomiTutti = LS.get('pstPdpNomi') || {};
    const tutte = el ? Object.values(el.items).map(i => riga(i, nomiTutti)) : [];
    const q = (pannello.querySelector('[data-q]').value || '').trim().toLowerCase();
    const nascondi = pannello.querySelector('[data-n]').checked;
    SS.set('pstPdpFiltro', q);
    LS.set('pstPdpNascondi', nascondi);
    const ord = LS.get('pstPdpOrd') || { c: 'nomina', d: -1 };
    const col = COLONNE.find(c => c[0] === ord.c) || COLONNE.find(c => c[0] === 'nomina');
    let v = tutte.filter(r => (!nascondi || !r.chiusa) && (!q || [r.registro, r.linee.map(l => l.uff + ' ' + l.mag).join(' '), r.soggetti, r.nomiTesto.join(' '), r.nomina, r.stato, r.iter].join(' ').toLowerCase().includes(q)));
    v.sort((a, b) => { const x = col[2](a), y = col[2](b); return (x < y ? -1 : x > y ? 1 : 0) * ord.d; });
    pannello.querySelector('[data-c]').textContent = v.length + ' di ' + tutte.length + ' procedimenti' +
      (el && el.aggiornato ? ' · dati del ' + new Date(el.aggiornato).toLocaleString('it-IT') : '');
    diag();
    const ko = SS.get('pstPdpNomiKo') || [], boxKo = pannello.querySelector('[data-ko]');
    boxKo.innerHTML = '';
    if (ko.length) {
      const dt = h('details', 'margin-bottom:6px'); dt.appendChild(h('summary', 'cursor:pointer;color:#a60', 'Nomi non letti nell’ultima lettura: ' + ko.length + ' (procedimento · iniziali · motivo)'));
      ko.forEach(x => dt.appendChild(h('div', 'font-size:12px;color:#445;padding:1px 0 1px 14px', x)));
      boxKo.appendChild(dt);
    }
    const t = pannello.querySelector('table');
    t.innerHTML = '';
    const th = t.createTHead().insertRow();
    for (const c of COLONNE) {
      const hd = document.createElement('th');
      hd.textContent = c[1] + (ord.c === c[0] ? (ord.d > 0 ? ' ▲' : ' ▼') : '');
      hd.style.cssText = 'cursor:pointer;text-align:left;border-bottom:2px solid #889;padding:4px 6px;position:sticky;top:0;background:#fff;white-space:nowrap';
      hd.addEventListener('click', () => { LS.set('pstPdpOrd', { c: c[0], d: ord.c === c[0] ? -ord.d : 1 }); disegna(); });
      th.appendChild(hd);
    }
    th.appendChild(h('th', 'position:sticky;top:0;background:#fff;border-bottom:2px solid #889'));
    const tb = t.createTBody();
    const TD = 'padding:3px 6px;vertical-align:top';
    v.forEach((r, gi) => {
      const k = Math.max(r.linee.length, r.sogg.length, 1);
      const sfondo = gi % 2 ? '#f6f7fb' : '#fff';
      for (let j = 0; j < k; j++) {
        const tr = tb.insertRow();
        tr.style.cssText = 'background:' + sfondo + (j === 0 ? ';border-top:1px solid #b9bfd0' : '') + (r.chiusa ? ';color:#666' : '');
        tr.addEventListener('dblclick', () => apriScheda(r.id, 'panoramica'));
        for (const c of COLONNE) {
          if (c[3] === 'proc' && j > 0) continue;
          const td = tr.insertCell(); td.style.cssText = TD;
          if (c[3] === 'proc') {
            td.rowSpan = k;
            td.textContent = c[4](r)[0];
            continue;
          }
          if (c[3] === 'isc') {
            const l = r.linee[j]; if (!l) continue;
            if (c[0] === 'registro') {
              const a = h('a', 'cursor:pointer;color:#14c;font-weight:600;text-decoration:none;white-space:nowrap', l.reg);
              a.href = '#'; a.title = 'Apri la scheda del procedimento';
              a.addEventListener('click', ev => { ev.preventDefault(); apriScheda(r.id, 'panoramica'); });
              td.appendChild(a);
            } else td.textContent = c[0] === 'ufficio' ? l.uff : l.mag;
            continue;
          }
          const sg = r.sogg[j];
          if (!sg) { if (c[0] === 'nome' && j === 0 && r.nomiR['*']) td.textContent = r.nomiR['*'].join(', '); continue; }
          if (c[0] === 'iniziali') {
            const a = h('a', 'cursor:pointer;color:#14c;text-decoration:underline dotted;white-space:nowrap', sg.abbr || '?');
            a.href = '#'; a.title = 'Clic per leggere i nomi';
            a.addEventListener('click', ev => { ev.preventDefault(); ev.stopPropagation(); un(r.id); });
            td.appendChild(a);
          } else if (c[0] === 'nome') {
            const nn = r.nomiDi(sg);
            if (nn.length) { td.textContent = nn.join(', '); td.style.fontWeight = '600'; td.style.color = '#111'; }
            else td.appendChild(h('span', 'color:#aab', 'non letto'));
          } else td.textContent = sg.parte;
        }
        if (j > 0) continue;
        const az = tr.insertCell(); az.rowSpan = k; az.style.cssText = TD + ';white-space:nowrap';
        for (const [testo, sez] of [['Scheda', 'panoramica'], ['Udienze', 'udienze'], ['Depositi', 'depositi']]) {
          const b = h('button', 'margin-right:4px;cursor:pointer', testo);
          b.addEventListener('click', () => apriScheda(r.id, sez));
          az.appendChild(b);
        }
      }
    });
    pannello.__righe = v;
  }

  // ---------- novità: fascicoli aggiunti, rimossi o modificati ----------
  // Si conserva, in questo browser, una copia di ciò che l’elenco riporta per ciascun procedimento (registro, iniziali, iter, date, stato).
  // Ad ogni lettura completa dell’elenco si confronta con la copia precedente. Le novità restano finché non si segnano come lette.
  const NV_ORE = 6;
  const nvLeggi = () => { const s = LS.get('pstPdpNovita') || {}; s.snap = s.snap || {}; s.base = s.base || {}; s.voci = s.voci || []; if (s.auto == null) s.auto = true; return s; };
  const nvScrivi = s => { LS.set('pstPdpNovita', s); nvBadge(); };
  const nvNonLette = () => nvLeggi().voci.filter(v => !v.letto);
  const listaCorrente = () => /definit/i.test(location.pathname) ? 'definiti' : 'attivi';
  const NOME_LISTA = { attivi: 'procedimenti autorizzati', definiti: 'procedimenti definiti' };

  function piatto(v, pre, out) {
    if (Array.isArray(v)) {
      if (v.every(x => x == null || typeof x !== 'object')) { if (v.length) out[pre] = v.map(String).sort().join(', '); }
      else v.forEach((x, i) => { const k = x && typeof x === 'object' ? (x.identificativo || x.idRegeWeb || (x.numero != null ? x.numero + '/' + x.anno : null) || i) : i; piatto(x, pre + '[' + k + ']', out); });
    } else if (v && typeof v === 'object') Object.keys(v).forEach(k => piatto(v[k], pre ? pre + '.' + k : k, out));
    else if (v != null && v !== '') out[pre] = String(v);
    return out;
  }
  const etichetta = k => k.split('.').map(p => umano(p.replace(/\[[^\]]*\]/g, ''))).join(' › ');
  const vv = t => { if (t === 'true') return 'sì'; if (t === 'false') return 'no'; const x = /^\d{4}-\d{2}-\d{2}/.test(t) ? fmtDT(t) : t; return x.length > 70 ? x.slice(0, 70) + '…' : x; };
  function differenze(a, b) {
    const out = [], chiavi = new Set(Object.keys(a).concat(Object.keys(b)));
    for (const k of chiavi) {
      if (a[k] === b[k]) continue;
      if (a[k] === undefined) out.push(etichetta(k) + ': aggiunto ' + vv(b[k]));
      else if (b[k] === undefined) out.push(etichetta(k) + ': tolto (era ' + vv(a[k]) + ')');
      else out.push(etichetta(k) + ': ' + vv(a[k]) + ' → ' + vv(b[k]));
    }
    if (out.length > 12) { const n = out.length - 12; out.length = 12; out.push('… e altre ' + n + ' differenze'); }
    return out;
  }
  const titoloDi = it => { const r = riga(it, null); return { t: r.registro || it.identificativo, u: r.ufficio, s: (it.inizialiSoggetti || []).map(x => x.abbreviazione).filter(Boolean).join(' ') }; };

  // confronta la lettura completa di un elenco con la copia precedente; ctl identifica il controllo in corso
  function nvConfronta(lista, items, ctl) {
    const ids = Object.keys(items || {});
    const s = nvLeggi(), vecchio = s.snap[lista] || {}, primo = !s.base[lista];
    if (!ids.length) return { testo: 'Nessun dato letto dall’elenco dei ' + NOME_LISTA[lista] + ': nessun confronto.', n: 0 };
    if (!primo && ids.length < 0.5 * Object.keys(vecchio).length) return { testo: 'Lettura incompleta dell’elenco dei ' + NOME_LISTA[lista] + ' (' + ids.length + ' contro ' + Object.keys(vecchio).length + ' precedenti): nessun confronto.', n: 0 };
    const nuovo = {};
    for (const id of ids) nuovo[id] = Object.assign(titoloDi(items[id]), { f: piatto(items[id], '', {}) });
    const ora = new Date().toISOString(), voci = [];
    const nuova = (tipo, id, t, dettaglio) => voci.push({ k: ora + id + tipo, c: ctl, tipo, id, lista, t: t.t, u: t.u, s: t.s, quando: ora, dettaglio: dettaglio || [], letto: false });
    if (!primo) {
      for (const id of ids) {
        if (!vecchio[id]) nuova('aggiunto', id, nuovo[id]);
        else { const d = differenze(vecchio[id].f, nuovo[id].f); if (d.length) nuova('modificato', id, nuovo[id], d); }
      }
      for (const id of Object.keys(vecchio)) if (!nuovo[id]) nuova('rimosso', id, vecchio[id]);
      // un procedimento che passa da un elenco all’altro nello stesso controllo è una sola novità
      const altre = s.voci.filter(v => v.c === ctl && v.lista !== lista && !v.letto);
      for (const v of voci.slice()) {
        const o = altre.find(x => x.id === v.id && ((x.tipo === 'rimosso' && v.tipo === 'aggiunto') || (x.tipo === 'aggiunto' && v.tipo === 'rimosso')));
        if (!o) continue;
        const verso = v.tipo === 'aggiunto' ? 'dai ' + NOME_LISTA[o.lista] + ' ai ' + NOME_LISTA[lista] : 'dai ' + NOME_LISTA[lista] + ' ai ' + NOME_LISTA[o.lista];
        voci.splice(voci.indexOf(v), 1);
        o.tipo = 'modificato'; o.dettaglio = ['Passato ' + verso]; o.lista = lista;
      }
    }
    s.snap[lista] = nuovo;
    s.base[lista] = s.base[lista] || ora;
    s.ultimo = ora;
    s.voci = voci.concat(s.voci).filter(v => !v.letto || Date.now() - new Date(v.quando) < 60 * 864e5).slice(0, 600);
    nvScrivi(s);
    if (aperto) disegna();
    const testo = primo ? 'Copia di partenza salvata per ' + ids.length + ' ' + NOME_LISTA[lista] + ': le novità compariranno dai prossimi controlli.'
      : voci.length ? voci.length + ' novità negli ' + (lista === 'attivi' ? 'attivi' : 'definiti') + '.' : 'Nessuna novità negli ' + (lista === 'attivi' ? 'attivi' : 'definiti') + '.';
    return { testo, n: voci.length };
  }

  // controllo senza intervento: apre in sequenza gli elenchi nell’applicazione, li scorre, poi torna dov’era
  let ctlInCorso = false;
  async function controllaNovita(manuale) {
    if (ctlInCorso || caricando || aggInCorso || inCorso) return;
    ctlInCorso = true; caricando = 'novita';
    const origine = location.pathname + location.search;
    const ctl = String(Date.now());
    const barra = h('div', 'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#223;color:#fff;padding:8px 14px;border-radius:8px;font:13px sans-serif;box-shadow:0 2px 12px rgba(0,0,0,.4);display:flex;gap:12px;align-items:center');
    const tx = h('span', null, 'Controllo novità…'); barra.appendChild(tx);
    let stop = false;
    barra.appendChild(pulsante('Interrompi', () => { stop = true; tx.textContent = 'Interruzione…'; }, 'cursor:pointer;padding:2px 10px'));
    document.body.appendChild(barra);
    const esiti = []; let passi = 0;
    try {
      const rotte = [['attivi', rottaLista('attivi')], ['definiti', rottaLista('definiti')]];
      for (const [lista, rotta] of rotte) {
        if (stop) break;
        tx.textContent = 'Controllo novità: ' + NOME_LISTA[lista] + '…';
        MEM.visti = {};
        history.pushState({}, '', rotta); passi++;
        window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
        // si attende che l’applicazione abbia ricevuto l’elenco della nuova pagina, non solo che ci siano righe (potrebbero essere quelle della pagina precedente)
        if (!(await finche(() => righeLista().length && Object.keys(MEM.visti || {}).length, 20000, 250))) { esiti.push('elenco dei ' + NOME_LISTA[lista] + ' non raggiunto'); MEM.visti = null; continue; }
        await attendi(1200);
        const prima = MEM.visti; MEM.visti = {};   // la pagina può aver fatto più richieste: si riparte da zero e si rilegge dalla prima pagina
        const r = await scorri(() => !stop, p => { tx.textContent = 'Controllo novità: ' + NOME_LISTA[lista] + ', pagina ' + p + '…'; });
        if (!Object.keys(MEM.visti).length && r.pagine === 1) MEM.visti = prima;
        if (lista === 'definiti') for (const k of Object.keys(MEM.visti)) { const it = MEM.visti[k]; if (!(it.definito || it.archiviato)) delete MEM.visti[k]; }
        if (r.completo && !stop) esiti.push(nvConfronta(lista, MEM.visti, ctl).testo);
        else esiti.push('lettura dei ' + NOME_LISTA[lista] + ' interrotta (' + (stop ? 'su richiesta' : r.motivo) + ', pagine lette ' + r.pagine + ')');
        MEM.visti = null;
      }
    } catch (e) { esiti.push('errore: ' + e.message); }
    MEM.visti = null;
    try { if (passi) { history.go(-passi); await attendi(900); } if (location.pathname + location.search !== origine) { history.pushState({}, '', origine); window.dispatchEvent(new PopStateEvent('popstate', { state: {} })); } } catch (e) {}
    barra.remove();
    caricando = ctlInCorso = false;
    const s = nvLeggi(); s.ultimoEsito = esiti.join(' ');
    if (!esiti.some(x => /interrott|errore|non raggiunto/.test(x))) s.ultimoControllo = new Date().toISOString();
    nvScrivi(s);
    homeCard(); if (aperto) disegna();
  }
  function avvioAutomatico() {
    const s = nvLeggi();
    if (!s.auto || !/\/home\/?$/.test(location.pathname) || ctlInCorso) return;
    if (s.ultimoControllo && Date.now() - new Date(s.ultimoControllo) < NV_ORE * 36e5) return;
    controllaNovita(false);
  }

  function segna(chiavi, letto) {
    const s = nvLeggi();
    s.voci.forEach(v => { if (chiavi === 'tutte' || chiavi.indexOf(v.k) >= 0) v.letto = letto; });
    nvScrivi(s); homeCard(); if (aperto) disegna();
  }
  const ETICHETTA_TIPO = { aggiunto: ['Aggiunto', '#1d7a3a'], rimosso: ['Rimosso', '#b3261e'], modificato: ['Modificato', '#a65f00'] };
  function renderNovita(w, compatto) {
    const s = nvLeggi(), voci = compatto ? s.voci.filter(v => !v.letto) : s.voci;
    const el = leggiElenco();
    if (!voci.length) w.appendChild(h('div', 'color:#667;padding:6px 0', compatto ? 'Nessuna novità da leggere.' : 'Nessuna novità registrata.'));
    for (const v of voci) {
      const b = h('div', 'border:1px solid ' + (v.letto ? '#dde' : '#c7cde0') + ';border-left:5px solid ' + ETICHETTA_TIPO[v.tipo][1] + ';border-radius:6px;padding:6px 10px;margin:6px 0;background:' + (v.letto ? '#fafafa' : '#fff') + (v.letto ? ';color:#778' : ''));
      const t = h('div', 'display:flex;gap:8px;align-items:baseline;flex-wrap:wrap');
      t.appendChild(h('span', 'font-weight:700;color:' + ETICHETTA_TIPO[v.tipo][1], ETICHETTA_TIPO[v.tipo][0]));
      t.appendChild(h('span', 'font-weight:600', v.t));
      if (v.u) t.appendChild(h('span', 'color:#667', v.u));
      if (v.s) t.appendChild(h('span', 'color:#667', '· ' + v.s));
      t.appendChild(h('span', 'color:#889;font-size:11px;margin-left:auto', new Date(v.quando).toLocaleString('it-IT') + ' · ' + (v.lista === 'definiti' ? 'definiti' : 'attivi')));
      b.appendChild(t);
      for (const d of v.dettaglio) b.appendChild(h('div', 'font-size:12px;color:#445;margin-top:2px', d));
      const az = h('div', 'margin-top:4px;display:flex;gap:6px');
      if (el && el.items[v.id]) az.appendChild(pulsante('Apri scheda', () => { if (!aperto) apri(); apriScheda(v.id, 'panoramica'); }, 'cursor:pointer;padding:1px 8px;font-size:12px'));
      az.appendChild(pulsante(v.letto ? 'Segna da leggere' : 'Segna come letta', () => segna([v.k], !v.letto), 'cursor:pointer;padding:1px 8px;font-size:12px'));
      b.appendChild(az); w.appendChild(b);
    }
  }
  function disegnaNovita() {
    const box = pannello.querySelector('[data-sc]'), lista = pannello.querySelector('[data-el]');
    lista.style.display = 'none'; box.style.display = ''; box.innerHTML = '';
    const s = nvLeggi();
    const top = h('div', 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px');
    top.appendChild(pulsante('← Elenco', tornaElenco));
    top.appendChild(h('strong', 'font-size:18px', 'Novità sui fascicoli'));
    top.appendChild(pulsante('Controlla ora', () => controllaNovita(true)));
    top.appendChild(pulsante('Segna tutte come lette', () => segna('tutte', true)));
    const x = pulsante('Chiudi', chiudi); x.style.marginLeft = 'auto'; top.appendChild(x);
    box.appendChild(top);
    const lb = h('label', 'display:block;margin-bottom:6px'); const cb = h('input'); cb.type = 'checkbox'; cb.checked = !!s.auto;
    cb.addEventListener('change', () => { const t = nvLeggi(); t.auto = cb.checked; nvScrivi(t); });
    lb.appendChild(cb); lb.appendChild(document.createTextNode(' Controllo automatico quando apri la home del portale (al massimo ogni ' + NV_ORE + ' ore)'));
    box.appendChild(lb);
    box.appendChild(h('div', 'color:#667;font-size:12px;margin-bottom:8px', 'Ultimo controllo: ' + (s.ultimo ? new Date(s.ultimo).toLocaleString('it-IT') : 'mai') + (s.ultimoEsito ? ' · ' + s.ultimoEsito : '') + '. Il confronto riguarda ciò che l’elenco riporta (registro, iniziali, iter, date, stato): nuovi depositi, udienze o sentenze compaiono solo se cambiano quei dati.'));
    const m = h('div', 'color:#a00;margin-bottom:6px'); m.setAttribute('data-m', ''); box.appendChild(m);
    const lb2 = h('label', 'display:block;margin-bottom:8px'); const cb2 = h('input'); cb2.type = 'checkbox'; cb2.checked = !!SS.get('pstPdpNvLette');
    cb2.addEventListener('change', () => { SS.set('pstPdpNvLette', cb2.checked); disegna(); });
    lb2.appendChild(cb2); lb2.appendChild(document.createTextNode(' mostra anche le novità già lette')); box.appendChild(lb2);
    const w = h('div', 'max-width:1000px'); renderNovita(w, !SS.get('pstPdpNvLette')); box.appendChild(w);
  }
  function nvBadge() {
    const n = nvNonLette().length;
    if (btnApri) btnApri.textContent = 'Elenco procedimenti' + (n ? ' · ' + n + ' novità' : '');
    const b = pannello && pannello.querySelector('[data-nv]'); if (b) b.textContent = 'Novità' + (n ? ' (' + n + ')' : '');
  }
  // riquadro nella home del PDP, finché ci sono novità da leggere
  function homeCard() {
    const vecchio = document.getElementById('pstNovitaHome'); if (vecchio) vecchio.remove();
    if (!/\/home\/?$/.test(location.pathname) || !document.body) return;
    const n = nvNonLette().length, s = nvLeggi();
    if (!n) return;
    const c = h('div', 'position:fixed;top:64px;right:12px;width:380px;max-height:70vh;overflow:auto;z-index:2147483640;background:#fff;color:#111;border:1px solid #889;border-radius:8px;box-shadow:0 3px 16px rgba(0,0,0,.3);padding:10px 12px;font:13px sans-serif');
    c.id = 'pstNovitaHome';
    const t = h('div', 'display:flex;gap:8px;align-items:center;flex-wrap:wrap');
    t.appendChild(h('strong', 'font-size:15px', 'Novità sui fascicoli' + (n ? ' (' + n + ')' : '')));
    t.appendChild(pulsante('Controlla ora', () => controllaNovita(true), 'cursor:pointer;padding:1px 8px;font-size:12px;margin-left:auto'));
    c.appendChild(t);
    if (n) { const b = h('div', 'margin:4px 0'); b.appendChild(pulsante('Segna tutte come lette', () => segna('tutte', true), 'cursor:pointer;padding:1px 8px;font-size:12px')); c.appendChild(b); }
    renderNovita(c, true);
    c.appendChild(h('div', 'color:#889;font-size:11px;margin-top:4px', 'Ultimo controllo: ' + (s.ultimo ? new Date(s.ultimo).toLocaleString('it-IT') : 'mai')));
    document.body.appendChild(c);
  }

  // ---------- scheda del procedimento ----------
  const SEZIONI = [['panoramica', 'Panoramica'], ['soggetti', 'Soggetti'], ['iscrizioni', 'Iscrizioni'], ['udienze', 'Udienze'], ['sentenze', 'Sentenze'], ['impugnazioni', 'Impugnazioni'], ['depositi', 'Depositi'], ['completi', 'Dati completi']];
  // udienze, sentenze e impugnazioni provengono tutte dalla pagina “Stato” del portale; i depositi dalla loro pagina
  const FONTE = { udienze: 'stato', sentenze: 'stato', impugnazioni: 'stato', depositi: 'depositi' };
  const fonteDi = sez => FONTE[sez] || null;
  const NOME_FONTE = { stato: 'stato del procedimento', depositi: 'depositi' };
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
    if (sez === 'stato') sez = 'udienze';
    vista = { tipo: 'scheda', id, sez: sez || 'panoramica' };
    SS.set('pstPdpVista', vista);
    disegna();
    pannello.scrollTop = 0;
    const f = fonteDi(vista.sez);
    if (f && !(MEM.sez[id] || {})[f]) leggiSezione(id, f);
  }
  function tornaElenco() {
    vista = { tipo: 'elenco' };
    SS.set('pstPdpVista', vista);
    disegna();
    pannello.scrollTop = pannello.__scroll || 0;
  }
  function vaiSezione(sez) {
    vista.sez = sez; SS.set('pstPdpVista', vista); disegna();
    const f = fonteDi(sez);
    if (f && !(MEM.sez[vista.id] || {})[f]) leggiSezione(vista.id, f);
  }

  // Stato e Depositi: l’estensione apre la pagina nell’applicazione sotto il pannello, ne legge le risposte e torna indietro
  async function leggiSezione(id, sez) {
    if (caricando || !ROTTE[sez]) return;
    caricando = sez + id;
    const voci = []; MEM.cat = voci;
    const attendi = ms => new Promise(ok => setTimeout(ok, ms));
    messaggio('Lettura di “' + (NOME_FONTE[sez] || sez) + '” dal portale…');
    disegnaScheda();
    try {
      history.pushState({}, '', ROTTE[sez](id));
      window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
      const t0 = Date.now(); voci.ultima = t0;
      while (Date.now() - t0 < 15000) {
        await attendi(250);
        if (!voci.some(v => !v.fatto) && Date.now() - voci.ultima > 1500 && Date.now() - t0 > 2000) break;
      }
      // nello Stato si preme anche “Storico Udienze”, come farebbe l’utente, e se ne raccolgono le risposte
      if (sez === 'stato') {
        const bt = Array.from(document.querySelectorAll('button')).find(x => /storico\s+udienze/i.test(x.textContent || '') && !pannello.contains(x));
        if (bt) {
          const k = voci.length, p0 = location.pathname; bt.click();
          const t2 = Date.now(); voci.ultima = t2;
          while (Date.now() - t2 < 8000) { await attendi(250); if (voci.length > k && !voci.some(v => !v.fatto) && Date.now() - voci.ultima > 1200) break; }
          const dlg = document.querySelector('.ui-dialog');
          const ch = dlg && Array.from(dlg.querySelectorAll('button')).find(x => (x.textContent || '').trim() === 'Chiudi');
          if (ch) ch.click(); else if (dlg && dlg.querySelector('.ui-dialog-titlebar-close')) dlg.querySelector('.ui-dialog-titlebar-close').click();
          if (location.pathname !== p0) { history.back(); await attendi(600); }
          D.storico = 'pulsante premuto, ' + (voci.length - k) + ' chiamate';
        } else D.storico = 'pulsante non trovato';
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
    if (sez === 'stato') ricordaUdienze(id);
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
  // il portale restituisce solo le udienze correnti: quelle già viste si conservano nel browser, così lo storico cresce a ogni lettura
  const chiaveUd = u => (u.idRegeWeb || '') + '|' + u.data;
  // cerca in qualsiasi risposta gli elenchi di udienze (oggetti con data e causale o aula)
  function cercaUdienze(v, out) {
    if (Array.isArray(v)) { if (v.some(e => e && typeof e === 'object' && e.data && ('descrizioneCausale' in e || 'aula' in e))) v.forEach(e => { if (e && e.data) out.push(e); }); else v.forEach(e => cercaUdienze(e, out)); }
    else if (v && typeof v === 'object') Object.keys(v).forEach(k => cercaUdienze(v[k], out));
    return out;
  }
  function udienzeLette(id) {
    const v = vociDi(id, 'stato');
    return v.length ? cercaUdienze(v.map(x => x.risp), []) : null;
  }
  function udienzeDi(id) {
    const corr = udienzeLette(id);
    const mem = (LS.get('pstPdpUdienze') || {})[id] || {};
    if (corr === null && !Object.keys(mem).length) return null;
    const attuali = {}; (corr || []).forEach(u => { attuali[chiaveUd(u)] = u; });
    const tutte = Object.assign({}, mem, attuali);
    return Object.keys(tutte).map(k => Object.assign({}, tutte[k], { _solo: !attuali[k] }));
  }
  function ricordaUdienze(id) {
    const corr = udienzeLette(id);
    if (!corr || !corr.length) return;
    const st = LS.get('pstPdpUdienze') || {}; const m = st[id] || {};
    corr.forEach(u => { m[chiaveUd(u)] = u; });
    st[id] = m; LS.set('pstPdpUdienze', st);
  }

  // soggetti ed esiti dello Stato (sentenze, provvedimenti): il portale li invia nella risposta /stato e in quella dello storico
  const RX_ESITO = /sentenz|esit|dispositiv|provvedim|condann|assoluz|pena|decision|deliber|ordinanz|decreto|irrevocab|grado/i;
  function soggettiStato(id) {
    const out = [];
    for (const v of vociDi(id, 'stato')) { const it = v.risp && v.risp.result && v.risp.result.item; if (it && it.soggetti && !vuoto(it.soggetti)) out.push(it.soggetti); }
    return out;
  }
  function cercaEsiti(id) {
    const out = [], visti = new Set();
    const giu = (v, pre) => {
      if (Array.isArray(v)) v.forEach((x, i) => giu(x, pre + '[' + (i + 1) + ']'));
      else if (v && typeof v === 'object') Object.keys(v).forEach(k => giu(v[k], pre ? pre + '.' + k : k));
      else if (v != null && v !== '' && RX_ESITO.test(pre.split('.').pop().replace(/\[\d+\]/g, ''))) { const c = pre + '=' + v; if (!visti.has(c)) { visti.add(c); out.push([etichetta(pre), valore(v)]); } }
    };
    for (const v of vociDi(id, 'stato')) { const r = corpoDi(v.risp); if (r && typeof r === 'object') { const c = Object.assign({}, r); delete c.soggetti; giu(c, ''); } }
    return out;
  }
  // oggetti annidati che hanno i campi indicati, con il nome del soggetto a cui appartengono
  const nomeOgg = o => ['nome', 'cognome', 'denominazione', 'nominativo', 'abbreviazione'].map(k => o[k]).filter(x => x && typeof x !== 'object').join(' ');
  const ruoloOgg = o => ['descrizioneTipoParte', 'tipoParte', 'descrizioneRuolo', 'ruolo', 'descrizioneTipoSoggetto'].map(k => o[k]).find(x => x && typeof x !== 'object') || '';
  function trovaOggetti(v, test, ctx, out, so) {
    if (Array.isArray(v)) v.forEach(x => trovaOggetti(x, test, ctx, out, so));
    else if (v && typeof v === 'object') {
      const n = nomeOgg(v), c = n || ctx, s2 = n ? v : so;
      if (test(v)) out.push({ o: v, s: c, so: s2 || null });
      else Object.keys(v).forEach(k => { if (v[k] && typeof v[k] === 'object') trovaOggetti(v[k], test, c, out, s2); });
    }
    return out;
  }
  // impugnazioni: elementi sotto chiavi che parlano di impugnazione, oppure oggetti con campi propri dell’impugnazione
  function trovaImpugnazioni(v, ctx, so, out, visti) {
    out = out || []; visti = visti || new Set();
    const metti = (o, c, s2, sent) => { if (o && typeof o === 'object' && !Array.isArray(o) && !visti.has(o)) { visti.add(o); out.push({ o, s: c, so: s2 || null, sent: sent || null }); } };
    if (Array.isArray(v)) { v.forEach(x => trovaImpugnazioni(x, ctx, so, out, visti)); return out; }
    if (!v || typeof v !== 'object') return out;
    const n = nomeOgg(v), c = n || ctx, s2 = n ? v : so;
    if (Object.keys(v).some(k => /impugn/i.test(k) && (v[k] == null || typeof v[k] !== 'object') && !vuoto(v[k]))) metti(v, c, s2);
    for (const k of Object.keys(v)) {
      const x = v[k]; if (!x || typeof x !== 'object') continue;
      if (/impugn/i.test(k)) { (Array.isArray(x) ? x : [x]).forEach(e => { if (e && typeof e === 'object' && !Array.isArray(e)) metti(e, c, s2, ('numeroSentenza' in v) ? v : null); }); }
      else trovaImpugnazioni(x, c, s2, out, visti);
    }
    return out;
  }
  // tabella generica: colonne fisse più tutti i campi semplici degli oggetti; clic su una riga per vedere ogni dato
  function tabellaOggetti(lista, fisse, saltaCampi) {
    const extra = [];
    lista.forEach(x => Object.keys(x.o).forEach(k => { if (saltaCampi.indexOf(k) < 0 && !vuoto(x.o[k]) && typeof x.o[k] !== 'object' && extra.indexOf(k) < 0 && !/^(id|identificativ)/i.test(k)) extra.push(k); }));
    const nc = fisse.length + extra.length;
    return tabellaDati(fisse.map(f => f[0]).concat(extra.map(umano)), lista, (tb, x) => {
      const tr = tb.insertRow(); tr.style.cssText = 'border-bottom:1px solid #e3e3ea;cursor:pointer;vertical-align:top';
      fisse.map(f => f[1](x)).concat(extra.map(k => vuoto(x.o[k]) ? '' : valore(x.o[k]))).forEach(t => { const td = tr.insertCell(); td.style.padding = '5px 8px'; td.textContent = t == null ? '' : String(t); });
      let det = null;
      tr.addEventListener('click', () => {
        if (det) { det.remove(); det = null; return; }
        det = tb.insertRow(tr.sectionRowIndex + 1);
        const c = det.insertCell(); c.colSpan = nc; c.style.cssText = 'padding:8px 14px;background:#fafbfe'; c.appendChild(albero(x.o));
      });
    });
  }
  // reati della sentenza: prima nell’oggetto della sentenza, poi nel soggetto (escluse le altre sentenze)
  function reatiSentenza(x) {
    const a = reatiIn(x.o); if (a.length) return a;
    if (!x.so) return [];
    const escl = Object.keys(x.so).filter(k => { const v = x.so[k]; const l = Array.isArray(v) ? v : [v]; return l.some(e => e && typeof e === 'object' && ('numeroSentenza' in e || 'annoSentenza' in e)); });
    return reatiIn(x.so, escl);
  }
  function renderSentenze(id) {
    const w = h('div');
    const sg = soggettiStato(id), es = cercaEsiti(id);
    const trovate = trovaOggetti(sg, o => ('numeroSentenza' in o || 'annoSentenza' in o || 'codiceGrado' in o), '', []);
    const DATE = [['dataPrevistoDeposito', 'Deposito previsto'], ['dataProrogaSentenza', 'Deposito prorogato'], ['dataDepositoSentenza', 'Depositata il'], ['dataIrrevocabilita', 'Irrevocabile dal']];
    // la stessa sentenza può riguardare più soggetti: una sola riga, con i soggetti e i rispettivi reati
    const per = {};
    for (const x of trovate) {
      const k = [x.o.codiceGrado, x.o.numeroSentenza, x.o.annoSentenza, x.o.dataDepositoSentenza].join('|');
      const g = per[k] = per[k] || { o: Object.assign({}, x.o), sogg: [], reati: [] };
      const ru = x.so ? ruoloOgg(x.so) : '';
      g.sogg.push(x.s + (ru ? ' (' + ru + ')' : ''));
      const re = reatiSentenza(x);
      if (re.length) g.reati.push({ s: x.s, l: re });
      for (const d of DATE) if (!g.o[d[0]] && x.o[d[0]]) g.o[d[0]] = x.o[d[0]];
    }
    const data = o => String(o.dataDepositoSentenza || o.dataPrevistoDeposito || o.dataIrrevocabilita || '');
    const sent = Object.values(per).sort((a, b) => (Number(a.o.annoSentenza) || 0) - (Number(b.o.annoSentenza) || 0) || (Number(a.o.numeroSentenza) || 0) - (Number(b.o.numeroSentenza) || 0) || data(a.o).localeCompare(data(b.o)));
    sent.forEach(g => {
      const tutte = g.reati.map(x => x.l.join('; '));
      g.testoReati = !g.reati.length ? '' : tutte.every(t => t === tutte[0]) ? tutte[0] : g.reati.map(x => x.s + ': ' + x.l.join('; ')).join('\n');
      g.s = unici(g.sogg).join('\n');
    });
    if (sent.length) {
      w.appendChild(h('div', 'color:#667;font-size:12px;margin-bottom:6px', sent.length + ' sentenze · per anno, numero e data · clic su una riga per tutti i dati'));
      const t = tabellaOggetti(sent, [
        ['Anno', x => x.o.annoSentenza], ['Sentenza n.', x => x.o.numeroSentenza], ['Grado', x => x.o.codiceGrado]
      ].concat(DATE.map(d => [d[1], x => x.o[d[0]] ? fmtDT(x.o[d[0]]) : ''])).concat([['Reati contestati', x => x.testoReati || '—'], ['Soggetti', x => x.s]]),
      ['numeroSentenza', 'annoSentenza', 'codiceGrado'].concat(DATE.map(d => d[0])));
      t.querySelectorAll('td').forEach(td => { td.style.whiteSpace = 'pre-line'; });
      w.appendChild(t);
      if (!sent.some(g => g.reati.length)) {
        const k = o => o && typeof o === 'object' ? Object.keys(o).join(', ') : '-';
        w.appendChild(h('div', 'color:#a60;font-size:12px;margin-top:6px', 'Reati non riconosciuti nei dati della sentenza. Campi della sentenza: ' + k(trovate[0].o) + ' · campi del soggetto: ' + k(trovate[0].so)));
      }
    } else w.appendChild(h('div', 'color:#667;padding:6px 0', sg.length ? 'Nessuna sentenza registrata per i soggetti di questo procedimento.' : 'Il portale non restituisce l’elenco dei soggetti nello Stato di questo procedimento.'));
    if (es.length) { w.appendChild(h('div', 'font-weight:600;margin:14px 0 4px', 'Altri campi su esiti e provvedimenti')); w.appendChild(coppie(es)); }
    if (sg.length) {
      const dt = h('details', 'margin-top:10px'); dt.appendChild(h('summary', 'cursor:pointer;color:#445', 'Tutti i dati dei soggetti dello Stato'));
      sg.forEach(x => { const b = h('div', 'border:1px solid #d5d9e6;border-radius:8px;padding:8px 14px;margin-top:6px'); b.appendChild(albero(x)); dt.appendChild(b); });
      w.appendChild(dt);
    }
    return w;
  }
  function renderImpugnazioni(id, r) {
    const w = h('div');
    const sg = soggettiStato(id);
    const imp = trovaImpugnazioni(sg, '', null);
    if (imp.length) {
      w.appendChild(h('div', 'color:#667;font-size:12px;margin-bottom:6px', imp.length + ' impugnazioni · clic su una riga per tutti i dati'));
      w.appendChild(tabellaOggetti(imp, [
        ['Soggetto', x => x.s], ['Ruolo', x => x.so ? ruoloOgg(x.so) : ''],
        ['Sentenza impugnata', x => { const z = x.o.numeroSentenza ? x.o : x.sent; return z && z.numeroSentenza ? z.numeroSentenza + (z.annoSentenza ? '/' + z.annoSentenza : '') + (z.codiceGrado ? ' (grado ' + z.codiceGrado + ')' : '') : ''; }]
      ], ['numeroSentenza', 'annoSentenza']));
    } else w.appendChild(h('div', 'color:#667;padding:6px 0', sg.length ? 'Nessuna impugnazione registrata per i soggetti di questo procedimento.' : 'Il portale non restituisce l’elenco dei soggetti nello Stato di questo procedimento.'));
    return w;
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
    const v = ud.slice().sort((a, b) => String(b.data).localeCompare(String(a.data)));
    const extra = []; v.forEach(u => Object.keys(u).forEach(k => { if (RX_ESITO.test(k) && !vuoto(u[k]) && typeof u[k] !== 'object' && extra.indexOf(k) < 0) extra.push(k); }));
    return tabellaDati(['Data', 'Aula', 'Ufficio', 'Sezione', 'Causale'].concat(extra.map(umano)), v, (tb, u) => {
      const tr = tb.insertRow(); tr.style.borderBottom = '1px solid #e3e3ea';
      const futura = String(u.data).slice(0, 10) >= oggi;
      if (futura) tr.style.background = '#f1f7ee';
      [fmtDT(u.data) + (futura ? '  · in programma' : u._solo ? '  · dallo storico locale' : ''), u.aula, [u.descrizioneTipoUfficioAmbito, u.descrizioneCircondario].filter(Boolean).join(' · '), u.descrizioneSezione, u.descrizioneCausale].concat(extra.map(k => vuoto(u[k]) ? '' : valore(u[k]))).forEach((t, i) => {
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
      const ud = udienzeDi(id), dp = (MEM.sez[id] || {}).depositi ? depositiDi(id) : null, st = (MEM.sez[id] || {}).stato;
      const noSt = it.abilitaVisulizzazioneStato === false ? 'non abilitato dal portale' : null;
      tiles.appendChild(tile('Udienze', noSt || (ud ? ud.length + ' udienze' : 'da leggere'), 'udienze'));
      const sgS = st ? soggettiStato(id) : [];
      tiles.appendChild(tile('Sentenze', noSt || (st ? trovaOggetti(sgS, o => ('numeroSentenza' in o || 'annoSentenza' in o || 'codiceGrado' in o), '', []).length + ' sentenze' : 'da leggere'), 'sentenze'));
      tiles.appendChild(tile('Impugnazioni', noSt || (st ? trovaImpugnazioni(sgS, '', null).length + ' impugnazioni' : 'da leggere'), 'impugnazioni'));
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
    } else if (fonteDi(sez)) {
      const f = fonteDi(sez), c = (MEM.sez[id] || {})[f];
      const barra = h('div', 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px');
      if (caricando === f + id) { w.appendChild(h('div', 'padding:14px;color:#556', 'Lettura in corso dal portale…')); return w; }
      barra.appendChild(pulsante(c ? 'Rileggi' : 'Leggi dal portale', () => leggiSezione(id, f)));
      barra.appendChild(pulsante('Apri nella pagina originale', () => vai(ROTTE[f](id))));
      if (c && c.voci.length) barra.appendChild(pulsante('Salva struttura dati', () => salvaForma(f, c)));
      if (c) barra.appendChild(h('span', 'color:#778;font-size:12px', 'Letto il ' + new Date(c.ora).toLocaleString('it-IT') + ' · ' + c.voci.length + ' chiamate' + (f === 'stato' && D.storico ? ' · storico udienze: ' + D.storico : '')));
      w.appendChild(barra);
      if (c && !c.voci.length) w.appendChild(h('div', 'color:#a60', 'Nessuna risposta ricevuta dal portale per questa sezione.'));
      if (c && c.voci.length) {
        if (sez === 'udienze') {
          const ud = udienzeDi(id);
          w.appendChild(h('div', 'color:#667;font-size:12px;margin-bottom:6px', 'Udienze fissate e storico udienze del portale. Quelle già lette in precedenza restano anche in questo browser.'));
          w.appendChild(ud ? renderUdienze(ud) : h('div', 'color:#667', 'Il portale non ha restituito l’elenco delle udienze.'));
        }
        if (sez === 'sentenze') w.appendChild(renderSentenze(id));
        if (sez === 'impugnazioni') w.appendChild(renderImpugnazioni(id, r));
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
    }
    return w;
  }

  function disegnaScheda() {
    const box = pannello.querySelector('[data-sc]'), lista = pannello.querySelector('[data-el]');
    const el = leggiElenco(), it = el && el.items[vista.id];
    if (!it) { vista = { tipo: 'elenco' }; SS.set('pstPdpVista', vista); box.style.display = 'none'; lista.style.display = ''; return; }
    lista.style.display = 'none'; box.style.display = '';
    box.innerHTML = '';
    const r = riga(it, LS.get('pstPdpNomi') || {});
    const dettagli = (LS.get('pstPdpSogg') || {})[it.identificativo] || {};
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
    const elSogg = h('div', 'margin-bottom:12px;display:flex;flex-wrap:wrap;gap:6px 22px');
    r.sogg.forEach(sg => {
      const nn = r.nomiDi(sg), b = h('div');
      b.appendChild(h('div', 'color:#556;font-size:12px', sg.abbr + (sg.parte ? ' (' + sg.parte + ')' : '')));
      b.appendChild(h('div', 'font-weight:600', nn.length ? nn.join(', ') : 'nome non letto'));
      elSogg.appendChild(b);
    });
    box.appendChild(elSogg);

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

  let inCorso = false;
  const dlgAperto = () => document.querySelector('.ui-dialog #cognome_controlId, .ui-dialog #denominazione_controlId, .p-dialog #cognome_controlId, .p-dialog #denominazione_controlId');
  const campiDlg = () => ['cognome', 'nome', 'denominazione'].map(n => { const e = document.querySelector('.ui-dialog #' + n + '_controlId, .p-dialog #' + n + '_controlId'); return e ? String(e.value || '').trim() : ''; });
  async function chiudiDlg() {
    const ch = Array.from(document.querySelectorAll('.ui-dialog button, .p-dialog button')).find(x => (x.textContent || '').trim() === 'Chiudi');
    if (ch) ch.click();
    else { const x = document.querySelector('.ui-dialog .ui-dialog-titlebar-close, .p-dialog .p-dialog-header-close'); if (x) x.click(); }
    await finche(() => !dlgAperto(), 3000);
    await attendi(150);
  }
  // clic su un’iniziale nell’elenco originale e attesa della risposta del portale; restituisce '' se il nome è stato letto, altrimenti il motivo
  async function leggiDaIniziale(a) {
    const r0 = D.nomResp, o0 = D.nomOk, v0 = D.nomVuote || 0;
    let aperta = false, risposta = false;
    for (let prova = 0; prova < 2 && !risposta; prova++) {
      a.click();
      aperta = !!(await finche(() => dlgAperto(), 4000));
      risposta = !!(await finche(() => D.nomResp > r0 || campiDlg().some(Boolean), 8000));
      if (!risposta) await chiudiDlg();
    }
    await attendi(250);
    const ok = D.nomOk > o0 || campiDlg().some(Boolean);
    await chiudiDlg();
    if (ok) return '';
    return !aperta ? 'finestra non aperta' : !risposta ? 'nessuna risposta del portale' : (D.nomSt && D.nomSt !== 200) ? 'risposta ' + D.nomSt : (D.nomVuote || 0) > v0 ? 'il portale non indica il nome' : 'nome non riconosciuto';
  }
  // struttura del riquadro delle iniziali, senza testi personali (solo segni come “+3” o “…”), per capire come il portale nasconde le altre
  function struttura(el, prof) {
    if (!el || prof > 6) return '';
    if (el.nodeType === 3) { const t = el.nodeValue.trim(); return !t ? '' : /^[\s+.…\d()]+$/.test(t) ? '“' + t + '”' : '[' + t.length + ']'; }
    if (el.nodeType !== 1) return '';
    const c = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : '';
    const f = Array.from(el.childNodes).map(x => struttura(x, (prof || 0) + 1)).filter(Boolean).join(' ');
    return el.tagName.toLowerCase() + c + (f ? '{' + f + '}' : '');
  }
  // collegamenti delle iniziali di una riga; se il portale ne mostra meno dei soggetti, si prova ad aprire il resto (“+N”, “…”, “altri”)
  // Il portale mostra al massimo alcune iniziali; l’ultimo collegamento (“+N”) apre la finestra “Soggetti” con tutte le parti
  // e il nome per esteso, in una tabella a pagine. Si legge da lì, pagina per pagina.
  const tabSogg = () => document.querySelector('app-soggetti-info');
  function linkPiu(tr, it) {
    const l = Array.from(tr.querySelectorAll('app-soggetti-iniziali a'));
    const abbr = new Set(((it && it.inizialiSoggetti) || []).map(x => (x.abbreviazione || '').trim()));
    const titoli = {}; l.forEach(a => { const k = a.getAttribute('title') || ''; titoli[k] = (titoli[k] || 0) + 1; });
    return l.find(a => /^\s*\+|\d/.test(a.textContent || '') && !abbr.has((a.textContent || '').trim())) ||
      (l.length > 1 && titoli[l[l.length - 1].getAttribute('title') || ''] === 1 && !abbr.has((l[l.length - 1].textContent || '').trim()) ? l[l.length - 1] : null);
  }
  async function leggiFinestraSoggetti(a, it, falliti, etichetta) {
    const x0 = D.nomListe || 0;
    a.click();
    if (!(await finche(() => { const t = tabSogg(); return t && t.querySelector('tbody tr'); }, 8000))) { falliti.push(etichetta + ' · finestra “Soggetti” non aperta'); return 0; }
    await attendi(500);
    const sogg = (it && it.inizialiSoggetti) || [];
    const usati = new Set(); let n = 0;
    const leggiPagina = () => {
      const t = tabSogg(); if (!t) return;
      const th = Array.from(t.querySelectorAll('thead th')).map(c => (c.textContent || '').trim().toLowerCase());
      let iNome = th.findIndex(x => /cognome|nominativ|denominaz|nome/.test(x));
      for (const tr of Array.from(t.querySelectorAll('tbody tr'))) {
        const c = Array.from(tr.cells).map(td => (td.textContent || '').replace(/\s+/g, ' ').trim());
        if (iNome < 0) iNome = Array.from(tr.cells).findIndex(td => td.querySelectorAll('xlib-ngp-df').length >= 2);
        const nome = iNome >= 0 ? c[iNome] : '';
        if (!nome) continue;
        // si abbina per iniziali; a parità, per tipo di parte e data di nomina, poi nell’ordine
        const cand = sogg.filter(sg => !usati.has(sg.identificativo) && c.indexOf((sg.abbreviazione || '').trim()) >= 0);
        const dn = sg => sg.dataNomina ? fmtDT(sg.dataNomina) : '';
        const sg = cand.find(x => (!x.descrizioneTipoParte || c.some(v => v.toLowerCase() === x.descrizioneTipoParte.toLowerCase())) && (!dn(x) || c.indexOf(dn(x)) >= 0)) || cand[0];
        if (!sg) continue;
        usati.add(sg.identificativo); salvaNomi(it.identificativo, sg.identificativo, [nome]); n++;
      }
    };
    for (let p = 0; p < 40; p++) {
      leggiPagina();
      const t = tabSogg(); const next = t && t.querySelector('p-paginator .ui-paginator-next, p-paginator .p-paginator-next');
      if (!next || next.classList.contains('ui-state-disabled') || next.classList.contains('p-disabled')) break;
      const f = Array.from(t.querySelectorAll('tbody tr')).map(r => r.textContent).join('|');
      next.click();
      if (!(await finche(() => { const t2 = tabSogg(); return t2 && Array.from(t2.querySelectorAll('tbody tr')).map(r => r.textContent).join('|') !== f; }, 6000))) break;
      await attendi(300);
    }
    // chiusura: pulsante “Chiudi” della finestra dei soggetti
    const t = tabSogg();
    const ch = t && Array.from(t.querySelectorAll('button')).find(b => (b.textContent || '').trim() === 'Chiudi');
    if (ch) ch.click(); else await chiudiDlg();
    await finche(() => !tabSogg() || !tabSogg().offsetParent, 3000);
    await attendi(200);
    const tot = Math.max(n, (D.nomListe || 0) - x0);
    if (!tot) falliti.push(etichetta + ' · finestra “Soggetti” aperta ma nessun nome riconosciuto');
    return tot;
  }
  async function leggiRiga(tr, it, falliti, conteggio) {
    const etichetta = it ? riga(it, null).registro : (tr.cells[0] ? tr.cells[0].textContent.replace(/\s+/g, ' ').trim().slice(0, 40) : '?');
    const piu = linkPiu(tr, it);
    if (piu && it) {
      conteggio.letti += await leggiFinestraSoggetti(piu, it, falliti, etichetta);
      messaggio('Nomi letti: ' + conteggio.letti + (conteggio.errori ? ' · non letti: ' + conteggio.errori : '') + (conteggio.dove ? ' · ' + conteggio.dove : ''));
      return;
    }
    const rr = it ? riga(it, LS.get('pstPdpNomi') || {}) : null;
    const l = Array.from(tr.querySelectorAll('app-soggetti-iniziali a')).filter(a => a !== piu);
    for (let i = 0; i < l.length; i++) {
      if (!inCorso) break;
      const a = l[i], t = (a.textContent || '').trim();
      // si salta l’iniziale se il soggetto con la stessa sigla ha già il nome
      if (rr) { const s2 = rr.sogg.filter(x => x.abbr === t); if (s2.length && s2.every(x => rr.nomiDi(x).length)) continue; }
      if (!a.isConnected) continue;
      const m = await leggiDaIniziale(a);
      if (m) { conteggio.errori++; falliti.push(etichetta + ' · ' + t + ' · ' + m); } else conteggio.letti++;
      messaggio('Nomi letti: ' + conteggio.letti + (conteggio.errori ? ' · non letti: ' + conteggio.errori : '') + (conteggio.dove ? ' · ' + conteggio.dove : ''));
    }
  }
  const nomiCompleti = it => { const r = riga(it, LS.get('pstPdpNomi') || {}); return r.sogg.every(sg => r.nomiDi(sg).length); };
  const firmaLista = () => righeLista().map(r => r.textContent).join('|');
  async function primaPagina() {
    const primo = document.querySelector('p-paginator .ui-paginator-first, p-paginator .p-paginator-first');
    if (primo && !primo.classList.contains('ui-state-disabled') && !primo.classList.contains('p-disabled')) { const f0 = firmaLista(); primo.click(); await finche(() => firmaLista() !== f0, 4000); await attendi(300); }
  }
  async function paginaSuccessiva() {
    const next = document.querySelector('p-paginator .ui-paginator-next, p-paginator .p-paginator-next');
    if (!next || next.classList.contains('ui-state-disabled') || next.classList.contains('p-disabled')) return false;
    const f1 = firmaLista(); next.click();
    if (!(await finche(() => firmaLista() !== f1, 6000))) return null;
    await attendi(300); return true;
  }
  function inizioLettura() { inCorso = true; const bt = pannello.querySelector('[data-t]'); bt.textContent = 'Interrompi'; }
  function fineLettura(testo, falliti) {
    const interrotto = !inCorso;
    inCorso = false; pannello.querySelector('[data-t]').textContent = 'Carica tutti i nomi';
    SS.set('pstPdpNomiKo', falliti);
    messaggio((interrotto ? 'Interrotto. ' : '') + testo);
    disegna();
  }

  // clic sulle iniziali nel pannello: si leggono solo i nomi di quel procedimento
  async function un(id) {
    if (inCorso) { inCorso = false; return; }
    if (caricando || aggInCorso || ctlInCorso) { messaggio('Attendi la fine dell’operazione in corso.'); return; }
    const el = leggiElenco(), it = el && el.items[id];
    if (!it) return;
    if (nomiCompleti(it)) { messaggio('I nomi di questo procedimento sono già in memoria.'); return; }
    inizioLettura();
    const falliti = [], cont = { letti: 0, errori: 0, dove: riga(it, null).registro };
    let trovata = false;
    try {
      // prima l’elenco in cui si trova di solito, poi l’altro
      for (const lista of (it.definito || it.archiviato) ? ['definiti', 'attivi'] : ['attivi', 'definiti']) {
        if (!inCorso || trovata) break;
        messaggio('Cerco ' + cont.dove + ' nell’elenco dei ' + NOME_LISTA[lista] + '…');
        if (!(await assicuraLista(lista))) continue;
        let tr = righeLista().find(r => { const x = itemDiRiga(r); return x && x.identificativo === id; });
        if (!tr) {
          await primaPagina();
          for (let n = 0; n < 200 && inCorso; n++) {
            tr = righeLista().find(r => { const x = itemDiRiga(r); return x && x.identificativo === id; });
            if (tr) break;
            const p = await paginaSuccessiva(); if (!p) break;
          }
        }
        if (tr) { trovata = true; await leggiRiga(tr, it, falliti, cont); }
      }
    } catch (e) { falliti.push(cont.dove + ' · interrotto: ' + e.message); }
    fineLettura(trovata ? 'Nomi letti per ' + cont.dove + ': ' + cont.letti + (cont.errori ? ' · non letti: ' + cont.errori : '') : cont.dove + ' non trovato negli elenchi del portale.', falliti);
  }

  // “Carica tutti i nomi”: l’estensione apre da sé l’elenco dei procedimenti autorizzati e poi quello dei definiti, sotto il pannello
  async function tutti() {
    if (inCorso) { inCorso = false; return; }
    if (caricando || aggInCorso || ctlInCorso) { messaggio('Attendi la fine dell’operazione in corso.'); return; }
    const el0 = leggiElenco();
    if (el0 && Object.keys(el0.items).length && Object.values(el0.items).every(nomiCompleti)) { messaggio('Tutti i nomi sono già in memoria.'); return; }
    inizioLettura();
    const falliti = [], note = [], cont = { letti: 0, errori: 0, dove: '' };
    let saltati = 0, pagine = 0;
    try {
      for (const lista of ['attivi', 'definiti']) {
        if (!inCorso) break;
        messaggio('Apro l’elenco dei ' + NOME_LISTA[lista] + '…');
        if (!(await assicuraLista(lista))) { note.push('elenco dei ' + NOME_LISTA[lista] + ' non raggiunto'); continue; }
        await primaPagina();
        let pagina = 1;
        while (inCorso) {
          pagine++; cont.dove = NOME_LISTA[lista] + ', pagina ' + pagina;
          for (const r of righeLista()) {
            if (!inCorso) break;
            const it = itemDiRiga(r);
            if (it && nomiCompleti(it)) { saltati++; continue; }
            await leggiRiga(r, it, falliti, cont);
          }
          disegna();
          if (!inCorso) break;
          const p = await paginaSuccessiva();
          if (p === null) note.push(NOME_LISTA[lista] + ': la pagina ' + (pagina + 1) + ' non si è caricata');
          if (!p) break;
          pagina++;
        }
      }
    } catch (e) { note.push('interrotto: ' + e.message); }
    fineLettura('Nomi letti: ' + cont.letti + ' · procedimenti già completi saltati: ' + saltati + ' · pagine: ' + pagine + (cont.errori ? ' · non letti: ' + cont.errori : '') + (note.length ? ' · ' + note.join(' · ') : ''), falliti);
  }

  function csv() {
    const v = pannello.__righe || [];
    const e = x => '"' + String(x == null ? '' : x).replace(/"/g, '""') + '"';
    const testo = [COLONNE.map(c => e(c[1])).join(';')].concat(v.map(r => COLONNE.map(c => e(c[4](r).join('\n'))).join(';'))).join('\r\n');
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
    const bt = document.createElement('button'); btnApri = bt;
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
      '<button data-nv>Novità</button><button data-a>Aggiorna</button><button data-t>Carica tutti i nomi</button><button data-s>Esporta CSV</button><button data-v title="Cancella l’elenco e le sezioni lette; i nomi già letti restano">Svuota copia locale</button>' +
      '<button data-x style="margin-left:auto">Chiudi</button></div>' +
      '<div data-c style="margin-bottom:4px"></div><div data-d style="color:#888;font-size:11px;margin-bottom:4px"></div><div data-m style="color:#a00;margin-bottom:4px"></div><div data-ko></div>' +
      '<table style="border-collapse:collapse;width:100%"></table></div><div data-sc style="display:none"></div>';
    document.body.appendChild(pannello);
    pannello.querySelector('[data-q]').value = SS.get('pstPdpFiltro') || '';
    pannello.querySelector('[data-n]').checked = !!LS.get('pstPdpNascondi');
    pannello.querySelector('[data-q]').addEventListener('input', disegna);
    pannello.querySelector('[data-n]').addEventListener('change', disegna);
    pannello.querySelector('[data-a]').addEventListener('click', aggiorna);
    pannello.querySelector('[data-nv]').addEventListener('click', () => { vista = { tipo: 'novita' }; SS.set('pstPdpVista', vista); disegna(); pannello.scrollTop = 0; });
    pannello.querySelector('[data-s]').addEventListener('click', csv);
    pannello.querySelector('[data-t]').addEventListener('click', tutti);
    pannello.querySelector('[data-x]').addEventListener('click', chiudi);
    pannello.querySelector('[data-v]').addEventListener('click', () => { MEM.el = null; MEM.sez = {}; vista = { tipo: 'elenco' }; SS.del('pstPdpVista'); SS.del('pstPdpSez'); SS.del('pstPdpSogg'); LS.del('pstPdpElenco'); SS.del('pstPdpFiltro'); SS.del('pstPdpNomiKo'); disegna(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && aperto) { if (vista.tipo !== 'elenco') tornaElenco(); else chiudi(); } });
  }
  function avvia() {
    costruisci(); nvBadge(); homeCard();
    let ultimo = location.pathname;
    setTimeout(avvioAutomatico, 5000);
    setInterval(() => { if (location.pathname !== ultimo) { ultimo = location.pathname; homeCard(); if (/\/home\/?$/.test(ultimo)) setTimeout(avvioAutomatico, 4000); } }, 1500);
  }
  if (document.body) avvia(); else document.addEventListener('DOMContentLoaded', avvia);
})();
