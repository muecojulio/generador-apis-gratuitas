# Política de seguridad

## Cómo avisar de un fallo

Si encuentras una vulnerabilidad, **no abras un issue público** con los detalles de explotación. Usa uno de estos dos canales privados:

1. La pestaña **Security → Report a vulnerability** de este repositorio:
   <https://github.com/muecojulio/generador-apis-gratuitas/security/advisories/new>
2. Un correo a `324687122+muecojulio@users.noreply.github.com` con el asunto `[seguridad] generador-apis-gratuitas`.

Incluye los pasos para reproducirlo y qué impacto tendría. También está publicado `/.well-known/security.txt` según el [RFC 9116](https://www.rfc-editor.org/rfc/rfc9116), y la política de privacidad completa está disponible en [`PRIVACY.md`](./PRIVACY.md) y en `/privacidad`.

## Qué protecciones lleva el taller

- **La IA nunca genera código ejecutable.** Solo devuelve un plano JSON (`api/<nombre>/spec.json`) que pasa por `normalizar()` en `lib/motor.mjs` y es servido por el mismo motor fijo (`lib/runtime.js`).
- **Prevención de polución de prototipos e inyección de caracteres de control.**
  - `lib/http.js` (`leerJson`) sanea recursivamente cualquier objeto JSON entrante eliminando claves peligrosas (`__proto__`, `constructor`, `prototype`).
  - `lib/motor.mjs` y `lib/catalogo.js` bloquean identificadores reservados de `Object.prototype` (`constructor`, `prototype`, `tostring`, `valueof`, `hasownproperty`) tanto en nombres de API como en recursos y campos.
  - `lib/runtime.js` limpia caracteres de control ASCII y bytes nulos (`\u0000`) antes de validar, almacenar o indexar textos.
- **Los tokens no viajan ni se guardan en claro.** El navegador genera el token con `crypto.getRandomValues`, calcula su huella SHA-256 y envía únicamente esa huella de 64 caracteres hexadecimales. La comparación en `lib/auth.js` se hace con `crypto.timingSafeEqual`.
- **Freno a fuerza bruta y cupos por IP (`lib/auth.js` y `lib/cupo.js`).**
  - Tras 8 intentos fallidos de token en un minuto desde la misma IP, la API responde `429 Too Many Requests` con `Retry-After`.
  - Creación de APIs limitada por `TALLER_CUPO_HORA` (12/hora por IP por defecto).
  - Escrituras en APIs (`POST`, `PUT`, `DELETE`) limitadas por `TALLER_CUPO_MIN` (60/minuto por IP por defecto), devolviendo `X-RateLimit-Limit` y `X-RateLimit-Remaining`.
  - Normalización de IP en `lib/http.js` (`ipDe`), eliminando prefijos IPv4-mapeados (`::ffff:`) y caracteres inválidos.
- **No se pisan datos a ciegas + respaldo en memoria (`lib/almacen.js` y `lib/runtime.js`).**
  - Si la lectura previa a GitHub falla o el JSON guardado está dañado, las escrituras devuelven `503`/`500` y no sobrescriben el archivo.
  - Si GitHub sufre un fallo transitorio durante una lectura (`GET`), `lib/almacen.js` sirve el último estado válido en memoria (`datos:respaldo:<api>`) marcado con `X-Datos: respaldo` y `Warning: 110`.
  - Las respuestas de la API de GitHub tienen un tope estricto de 4 MB en `lib/github.js` para evitar agotamiento de memoria.
- **Rutas de administración cerradas a otros sitios.** `/api/generar`, `/api/estado` y `/api/proveedores` no abren CORS al mundo, marcan `X-Robots-Tag: noindex`, y comprueban `Origin`, `Referer` y `Sec-Fetch-Site` frente al propio host (o la lista blanca `TALLER_ORIGENES`). Además, `/api/generar` puede exigir una contraseña maestra (`TALLER_CLAVE`).
- **Cabeceras de seguridad en todas las respuestas (`lib/http.js` y `vercel.json`).**
  - `Content-Security-Policy` estricta sin `'unsafe-inline'`, sin `eval` y con `frame-ancestors 'none'`.
  - `Strict-Transport-Security: max-age=63072000; includeSubDomains` (HSTS).
  - `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `X-DNS-Prefetch-Control: off`, `Cross-Origin-Resource-Policy` y `Permissions-Policy`.
- **Sin CDNs de terceros.** Tailwind CSS se compila en el repositorio (`npm run css`) y las fuentes viven en `/assets/fuentes/`. Ninguna página hace peticiones a Google Fonts ni a `cdn.tailwindcss.com`.
- **Auditoría continua en CI (`.github/workflows/pruebas.yml`).** Cada push o Pull Request ejecuta `npm audit`, `npm test`, `npm run medir` y verifica que `assets/estilos.css` coincida exactamente con la salida de Tailwind.
