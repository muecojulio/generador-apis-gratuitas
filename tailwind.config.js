/** Configuración de Tailwind para compilar los estilos del sitio.
 *
 *  npm run css  ->  assets/estilos.css (minificado, se sube al repositorio)
 *
 *  Usa variables CSS RGB para permitir cambiar la atmósfera visual en vivo
 *  (Fragua Cobre, Nebulosa Cyber, Bosque Bioluminiscente) sin estilos en línea
 *  y cumpliendo estrictamente con la CSP (`style-src 'self'`).
 */
module.exports = {
  content: ["./index.html", "./docs.html", "./privacidad.html", "./script.js", "./docs.js"],
  theme: {
    extend: {
      colors: {
        ink: "rgb(var(--c-ink) / <alpha-value>)",
        panel: "rgb(var(--c-panel) / <alpha-value>)",
        surface: "rgb(var(--c-surface) / <alpha-value>)",
        ivory: "rgb(var(--c-ivory) / <alpha-value>)",
        stone: "rgb(var(--c-stone) / <alpha-value>)",
        clay: "rgb(var(--c-clay) / <alpha-value>)",
        deep: "rgb(var(--c-deep) / <alpha-value>)",
        glow: "rgb(var(--c-glow) / <alpha-value>)",
        line: "rgb(var(--c-line) / <alpha-value>)",
      },
      fontFamily: {
        display: ["Fraunces", "Georgia", "serif"],
        sans: ["Outfit", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        viva: "0 20px 50px -15px rgba(0, 0, 0, 0.65), 0 0 0 1px rgb(var(--c-line) / 0.8)",
        brillo: "0 0 35px -5px rgb(var(--c-clay) / 0.38)",
      },
    },
  },
  plugins: [],
};
