// Configurazione usata per generare risorse/tailwind.css (Tailwind CSS 3.4).
// Va rigenerato solo se si aggiungono al calcolatore classi Tailwind nuove.
// Dalla cartella utilita/calcolo-termini-penali, con Node.js installato:
//   npx tailwindcss@3.4.17 -c risorse/tailwind.config.js -i risorse/tailwind-sorgente.css -o risorse/tailwind.css --minify
module.exports = {
  content: ['./index.html'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'sans-serif'] },
      colors: {
        brand: { 50: '#f0f7ff', 100: '#e0effe', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8', 800: '#1e40af', 900: '#1e3a8a', 950: '#0f172a' }
      }
    }
  }
}
