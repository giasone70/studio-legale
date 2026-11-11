// Apertura e chiusura del menu sugli schermi stretti.
(function () {
  var pulsante = document.querySelector('.menu-pulsante');
  var menu = document.getElementById('menu-principale');
  if (!pulsante || !menu) return;

  pulsante.addEventListener('click', function () {
    var aperto = menu.classList.toggle('aperto');
    pulsante.setAttribute('aria-expanded', aperto ? 'true' : 'false');
  });

  document.addEventListener('keydown', function (evento) {
    if (evento.key === 'Escape' && menu.classList.contains('aperto')) {
      menu.classList.remove('aperto');
      pulsante.setAttribute('aria-expanded', 'false');
      pulsante.focus();
    }
  });
})();
