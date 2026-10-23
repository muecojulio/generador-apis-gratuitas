# Seguridad

Gracias por tomarte el tiempo de revisar el taller. Este documento explica cómo
avisar de una vulnerabilidad y qué medidas ya están puestas.

## Cómo reportar

- **Usa el aviso privado de GitHub**: entra en
  <https://github.com/muecojulio/generador-apis-gratuitas/security/advisories/new>
  y describe el problema. Es privado, llega solo a los mantenedores y permite
  coordinar la solución antes de que se publique.
- **No abras un issue público** con detalles explotables ni incluyas datos
  personales, tokens reales o capturas con secretos. Si necesitas enviar una
  prueba, usa un repositorio de ejemplo con datos inventados.
- También hay un contacto legible por máquina en
  [`./.well-known/security.txt`](./.well-known/security.txt).

Plazos orientativos: acuse de recibo en **72 horas**, primera valoración en
**7 días** y, si el fallo se confirma, una corrección en **30 días**. Si es
grave y hay explotación activa, se intentará parchear antes.

## Qué versiones cubre

La rama `main` y el despliegue más reciente. El taller no mantiene versiones
antiguas: la corrección se publica en `main` y Vercel redespliega sola.

## Alcance

**En alcance**

- Saltarse el token de una API (`Authorization: Bearer`, `X-API-Token`) o su
  modo «todo».
- Leer datos que la API marca como protegidos, o escribir sin token.
- Inyección de código en el plano (todo/dead code, plantillas, `eval`).
- XSS en la página, en `/docs` o en las respuestas JSON.
- SSRF a través de cabeceras (`X-Forwarded-Host`) o de las fuentes públicas.
- Fuga de `GITHUB_PAT`, `GENERADOR_SECRETO` o claves de IA (en respuestas,
  logs, cabeceras, OpenAPI o el repositorio).
- Evasión de los límites de tamaño, registros, retención o cupo de peticiones.
- Inyección de comandos en los flujos de GitHub Actions.
- Debilidades de las cabeceras de seguridad o de la CSP.

**Fuera de alcance**

- Los datos de `data/` son **públicos por diseño** si el repositorio es público.
- Que cualquiera pueda crear APIs cuando **no** se configuró
  `GENERADOR_SECRETO`: es el comportamiento documentado del taller abierto.
- Límites de terceros (GitHub, Vercel o los proveedores gratuitos de IA).
- Fuerza bruta contra tokens de 192 bits generados por el taller (no es
  práctico) o contra tokens débiles elegidos a mano por el usuario.
- Ataques de denegación de servicio volumétricos: el plan gratuito no incluye
  mitigación a nivel de red.

## Medidas ya aplicadas

- Comparación de huellas SHA-256 en tiempo constante; nunca se guarda el token
  en claro.
- Bloqueo temporal tras 20 intentos fallidos por minuto y por IP.
- CORS cerrado en las rutas de administración; CORS abierto solo en las APIs
  públicas, que no usan cookies.
- Límite de cuerpo (1 MB en datos, 40 KB en la creación), de registros, de
  tamaño de archivo y de velocidad de consulta.
- La IA nunca escribe código: solo se acepta un plano JSON normalizado y
  validado antes de publicarse.
- Cabeceras de seguridad: CSP estricta, `nosniff`, `X-Frame-Options: DENY`,
  HSTS, `Referrer-Policy`, `Permissions-Policy` y `Cross-Origin-*`.
- Sin dependencias de ejecución: `npm audit --omit=dev` da **0
  vulnerabilidades**. Las únicas herramientas son Tailwind y las fuentes, y solo
  se usan al compilar. Flujo de trabajo `Pruebas` en cada push y pull request.
- Avisos de desarrollo conocidos: Tailwind 3 arrastra `braces`, `micromatch` y
  `fast-glob`, que hoy no tienen versión parcheada y solo se usan para leer
  archivos **del propio repositorio** al compilar el CSS. No viajan al sitio ni
  procesan datos de terceros. `postcss-nested` y `postcss-selector-parser` sí se
  actualizaron mediante `overrides` en `package.json`; el CSS resultante es
  idéntico y una prueba lo comprueba.
- Los errores internos no devuelven mensajes de GitHub ni rutas del servidor.

## Buenas prácticas para quien despliega

- Define `GENERADOR_SECRETO` si el sitio es público: sin él, cualquiera puede
  pedir APIs y llenar el repositorio.
- Usa un PAT *fine-grained* limitado a este repositorio y con caducidad.
- No pongas datos personales en APIs cuyo repositorio sea público.
- Revisa los avisos de seguridad de GitHub tras cada cambio.
