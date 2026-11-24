(() => {
  if (window.__pstScheletro) return;
  window.__pstScheletro = true;

  const SALTA = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'PATH', 'LINK', 'META']);
  const TESTO_LIBERO = 'label,button,th,legend,option,h1,h2,h3,h4,h5,h6,caption';
  const maschera = s => s.replace(/[A-Za-zÀ-ÿ]/g, 'x').replace(/\d/g, '9');
  const senzaCifre = s => s.replace(/\d/g, '9');

  function forma(u) {
    try {
      const x = new URL(u, location.href);
      const q = [...x.searchParams.keys()].join('&');
      return x.origin + x.pathname + (q ? '?' + q : '');
    } catch (e) { return ''; }
  }

  function testo(t, el) {
    const s = t.textContent.replace(/\s+/g, ' ').trim();
    if (!s) return null;
    if (el.closest(TESTO_LIBERO)) return senzaCifre(s).slice(0, 80);
    if (el.closest('a') && !el.closest('td') && !/\d/.test(s) && s.length < 40) return s;
    return maschera(s).slice(0, 60);
  }

  function nodo(el, prof) {
    if (SALTA.has(el.tagName.toUpperCase()) || prof > 40) return null;
    const o = { t: el.tagName.toLowerCase() };
    for (const a of ['id', 'name', 'type', 'role', 'for', 'method', 'colspan', 'rowspan', 'target']) {
      if (el.hasAttribute(a)) o[a] = senzaCifre(el.getAttribute(a));
    }
    if (typeof el.className === 'string' && el.className.trim()) o.c = el.className.trim().slice(0, 120);
    if (el.hasAttribute('href')) o.href = forma(el.getAttribute('href'));
    if (el.hasAttribute('action')) o.action = forma(el.getAttribute('action'));
    if (el.hasAttribute('onclick')) o.onclick = senzaCifre(el.getAttribute('onclick')).slice(0, 200);
    if (el.tagName === 'SELECT') {
      o.opzioni = [...el.options].slice(0, 300).map(x => ({ v: x.value, l: x.text.trim() }));
    }
    if (el.tagName === 'INPUT' && el.type === 'hidden') o.nascosto = true;
    const figli = [];
    for (const n of el.childNodes) {
      if (n.nodeType === 3) {
        const s = testo(n, el);
        if (s) figli.push(s);
      } else if (n.nodeType === 1) {
        const f = nodo(n, prof + 1);
        if (f) figli.push(f);
      }
    }
    if (figli.length && el.tagName !== 'SELECT') o.f = figli;
    return o;
  }

  function esporta() {
    const out = {
      url: forma(location.href),
      titolo: senzaCifre(document.title),
      frame: window.top !== window,
      data: new Date().toISOString(),
      corpo: nodo(document.body, 0)
    };
    const blob = new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    const nome = (location.hostname + location.pathname).replace(/[^\w]+/g, '_').slice(0, 80);
    a.href = URL.createObjectURL(blob);
    a.download = 'scheletro_' + nome + '_' + Date.now() + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  const b = document.createElement('button');
  b.textContent = 'Esporta scheletro';
  b.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:2147483647;padding:4px 8px;font:12px sans-serif;opacity:.7;cursor:pointer';
  b.addEventListener('click', esporta);
  document.body.appendChild(b);
})();
