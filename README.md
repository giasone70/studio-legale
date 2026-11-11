# Sito dello Studio Legale Silvestro

Sito statico per GitHub Pages, compilato da Jekyll (il motore già integrato in GitHub Pages: non occorre installare nulla). I contenuti provengono da studiolegalesilvestro.wordpress.com.

## Come è organizzato

```
_config.yml                 impostazioni generali (indirizzo del sito)
_data/
  studio.yml                nome, motto, sedi, e-mail, telefono, percorsi dei media
  navigazione.yml           voci del menu
  informative.yml           elenco dei PDF della pagina Informative
  utilita.yml               elenco degli strumenti della pagina Utilità
_layouts/                   ossatura delle pagine (base, pagina, home)
_includes/moduli/           moduli riutilizzabili: testata, menu, piè di pagina,
                            recapiti, documenti, strumenti, profilo, foto
pagine/                     una pagina per file
index.md                    pagina iniziale
assets/css/stile.css        aspetto grafico (colori e caratteri in cima al file)
assets/js/menu.js           menu per schermi stretti
assets/js/finestra.js       finestra a comparsa per calcolatore e informative
assets/img/                 immagini (sfondi/ per le intestazioni delle pagine)
assets/documenti/           PDF scaricabili
utilita/
  calcolo-termini-penali/   il calcolatore, copiato tale e quale
```

Le pagine contengono solo il testo; testata, menu e piè di pagina sono moduli richiamati dai layout. Una modifica a un modulo o a un file di `_data` vale per tutto il sito.

## Media

Le immagini stanno in `assets/img/`, i PDF in `assets/documenti/`. Il sito usa `emblema.png` (bilancia della testata, ricavata dal logo), `logo.png` (icona del sito), `testata.jpg` (sfondo della pagina iniziale), `avv-silvestro.jpg` e le fotografie della cartella `assets/img/sfondi/`. In `assets/img/archivio/` resta la testata originale di WordPress, non usata.

Le fotografie di sfondo si scelgono pagina per pagina, nell’intestazione del file in `pagine/`:

```
sfondo: /assets/img/sfondi/tribunale-1.jpg
sfondo_posizione: center 70%
```

La seconda riga è facoltativa e sposta l’inquadratura (la prima percentuale è orizzontale, la seconda verticale). Togliendo la riga `sfondo`, l’intestazione torna su fondo chiaro. Per una nuova fotografia basta caricarla in `assets/img/sfondi/` e indicarne il nome.

Per sostituire un’immagine o un PDF basta caricare il nuovo file con lo stesso nome. Se il nome cambia, va aggiornato in `_data/studio.yml` (immagini) o in `_data/informative.yml` (PDF).

## Finestre a comparsa

Il calcolatore e le informative si aprono in una finestra sopra la pagina, con i pulsanti “Apri in una nuova scheda” e “Chiudi” (si chiude anche con Esc o con un clic fuori). Qualunque collegamento con l’attributo `data-finestra="Titolo"` si apre allo stesso modo. Per gli strumenti della pagina Utilità basta la voce `finestra: true` in `_data/utilita.yml`.

Sugli smartphone che non visualizzano i PDF all’interno di una pagina, le informative si aprono in una nuova scheda.

## Calcolatore

Il calcolatore è il file `utilita/calcolo-termini-penali/index.html`, copia identica byte per byte dell’originale; la finestra a comparsa lo mostra senza modificarlo. Jekyll pubblica senza alcuna trasformazione i file privi di intestazione `---`, quindi risponde tale e quale all’indirizzo `/utilita/calcolo-termini-penali/`. Per aggiornarlo basta sostituire quel file.

Il vecchio indirizzo calcoloterminipenali.studiosilvestro.it resta attivo finché il vecchio repository è pubblicato. Quando il nuovo sito è in linea, si può sostituire il contenuto del vecchio repository con una pagina di reindirizzamento al nuovo indirizzo.


## Modifiche frequenti

Nuova pagina: creare un file in `pagine/` copiando l’intestazione di `lo-studio.md` (titolo e `permalink`), poi aggiungere la voce in `_data/navigazione.yml`.

Nuova informativa: caricare il PDF in `assets/documenti/` e aggiungere un blocco in `_data/informative.yml`.

Nuovo strumento: creare una cartella in `utilita/` e aggiungere un blocco in `_data/utilita.yml`.

Recapiti: `_data/studio.yml`. Nello stesso file si possono compilare `partita_iva` e `pec`, che compaiono nel piè di pagina.

## Anteprima sul proprio computer (facoltativa)

Con Ruby installato: `bundle install`, poi `bundle exec jekyll serve`. Il sito è visibile su http://localhost:4000.
