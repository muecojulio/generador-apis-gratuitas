/** Configuración de Tailwind para compilar los estilos del sitio.
 *
 *  npm run css  ->  assets/estilos.css (minificado, se sube al repositorio)
 *
 *  Antes se usaba el CDN de Tailwind, que avisa en la consola de que no debe
 *  usarse en producción. Con esta compilación el sitio no pide nada a terceros.
 */
module.exports = {
  content: ["./index.html", "./docs.html", "./privacidad.html", "./script.js", "./docs.js"],
  theme: {
    extend: {
      colors: {
        ink: "#121410",
        panel: "#1c1f1a",
        ivory: "#f3f0e8",
        stone: "#9a978c",
        clay: "#d4784a",
        deep: "#a85a32",
        line: "#2e322b",
      },
      fontFamily: {
        display: ["Fraunces", "Georgia", "serif"],
        sans: ["Outfit", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};
