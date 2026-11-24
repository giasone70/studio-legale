// Registra la forma delle chiamate di rete del PDP (indirizzi, nomi dei campi, tipi), mai i valori.
(() => {
  try { if (localStorage.getItem('pstRete') !== '1') return; } catch (e) { return; }
  if (window.__pstRete) return;
  window.__pstRete = true;
  const voci = [];
  const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
  const forma = u => {
    try {
      const x = new URL(u, location.href);
      const q = [...x.searchParams.keys()].join('&');
      return x.pathname.replace(UUID, '{uuid}').replace(/\d{5,}/g, '{n}') + (q ? '?' + q : '');
    } catch (e) { return String(u).slice(0, 100); }
  };
  const schema = (v, d = 0) => {
    if (v === null) return 'null';
    if (Array.isArray(v)) return v.length ? ['n=' + v.length, schema(v[0], d + 1)] : [];
    if (typeof v === 'object') {
      if (d > 7) return '{…}';
      const o = {};
      for (const k of Object.keys(v)) o[k] = schema(v[k], d + 1);
      return o;
    }
    return typeof v;
  };
  const daTesto = t => {
    if (!t) return null;
    try { return schema(JSON.parse(t)); } catch (e) { return 'non JSON, ' + t.length + ' caratteri'; }
  };
  const registra = (metodo, url, stato, richiesta, risposta) => {
    voci.push({ ora: new Date().toISOString(), metodo, url: forma(url), stato,
      richiesta: daTesto(typeof richiesta === 'string' ? richiesta : null), risposta: daTesto(risposta) });
    aggiornaPulsante();
  };

  const f0 = window.fetch;
  if (f0) {
    window.fetch = function (i, o) {
      const url = typeof i === 'string' ? i : (i && i.url) || '';
      const metodo = (o && o.method) || (i && i.method) || 'GET';
      const corpo = o && typeof o.body === 'string' ? o.body : null;
      const p = f0.apply(this, arguments);
      p.then(r => r.clone().text().then(t => registra(metodo, url, r.status, corpo, t)).catch(() => {})).catch(() => {});
      return p;
    };
  }
  const open0 = XMLHttpRequest.prototype.open, send0 = XMLHttpRequest.prototype.send;
  const head0 = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.open = function (m, u) { this.__m = m; this.__u = u; this.__h = []; return open0.apply(this, arguments); };
  XMLHttpRequest.prototype.setRequestHeader = function (n) { try { this.__h.push(String(n)); } catch (e) {} return head0.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function (b) {
    let fatto = false;
    const chiudi = () => {
      if (fatto || this.readyState !== 4) return;
      fatto = true;
      let r = null;
      try {
        if (this.responseType === '' || this.responseType === 'text') r = daTesto(this.responseText);
        else if (this.responseType === 'json') r = this.response === null ? null : schema(this.response);
        else r = 'tipo ' + this.responseType;
      } catch (e) { r = 'illeggibile'; }
      voci.push({ ora: new Date().toISOString(), metodo: this.__m, url: forma(this.__u), stato: this.status,
        intestazioni: this.__h, richiesta: daTesto(typeof b === 'string' ? b : null), risposta: r });
      aggiornaPulsante();
    };
    this.addEventListener('readystatechange', chiudi);
    this.addEventListener('load', chiudi);
    this.addEventListener('loadend', chiudi);
    return send0.apply(this, arguments);
  };

  let pulsante = null;
  function aggiornaPulsante() { if (pulsante) pulsante.textContent = 'Esporta rete (' + voci.length + ')'; }
  document.addEventListener('DOMContentLoaded', () => {
    pulsante = document.createElement('button');
    pulsante.style.cssText = 'position:fixed;right:8px;bottom:8px;z-index:2147483647;padding:4px 8px;font:12px sans-serif;opacity:.7;cursor:pointer';
    aggiornaPulsante();
    pulsante.addEventListener('click', () => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify({ pagina: forma(location.href), voci }, null, 1)], { type: 'application/json' }));
      a.download = 'rete_' + location.pathname.replace(/[^\w]+/g, '_').slice(0, 60) + '_' + Date.now() + '.json';
      document.body.appendChild(a); a.click(); a.remove();
    });
    document.body.appendChild(pulsante);
  });
})();
