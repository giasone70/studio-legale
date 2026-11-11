// Finestra a comparsa per i collegamenti con l'attributo data-finestra
// (calcolatore e informative). Il valore dell'attributo è il titolo
// mostrato nella barra. Senza JavaScript i collegamenti funzionano come
// collegamenti normali.
(function () {
  var finestra = document.getElementById('finestra');
  if (!finestra || typeof finestra.showModal !== 'function') return;

  var cornice = finestra.querySelector('.finestra-contenuto');
  var titolo = finestra.querySelector('.finestra-titolo');
  var apri = finestra.querySelector('.finestra-apri');
  var chiudi = finestra.querySelector('.finestra-chiudi');

  document.addEventListener('click', function (evento) {
    var link = evento.target.closest('a[data-finestra]');
    if (!link) return;
    // Ctrl/Cmd/Maiusc + clic: comportamento normale del browser.
    if (evento.button !== 0 || evento.ctrlKey || evento.metaKey || evento.shiftKey) return;

    var pdf = /\.pdf($|[?#])/i.test(link.getAttribute('href'));
    // Sui dispositivi che non mostrano i PDF dentro la pagina
    // (gran parte degli smartphone) il PDF si apre in una nuova scheda.
    if (pdf && navigator.pdfViewerEnabled === false) return;

    evento.preventDefault();
    var testo = link.getAttribute('data-finestra') || link.textContent.trim();
    titolo.textContent = testo;
    cornice.title = testo;
    apri.href = link.href;
    finestra.classList.toggle('finestra-pdf', pdf);
    cornice.src = link.href;
    document.documentElement.classList.add('finestra-aperta');
    finestra.showModal();
  });

  chiudi.addEventListener('click', function () { finestra.close(); });

  // Clic sullo sfondo scuro fuori dalla finestra.
  finestra.addEventListener('click', function (evento) {
    if (evento.target === finestra) finestra.close();
  });

  finestra.addEventListener('close', function () {
    cornice.src = 'about:blank';
    document.documentElement.classList.remove('finestra-aperta');
  });
})();
