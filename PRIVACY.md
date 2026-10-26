# Política de Privacidad — Taller Vivo de APIs (`generador-apis-gratuitas`)

Última actualización: **25 de octubre de 2026**
Versión web pública: [`/privacidad`](./privacidad.html)

Este proyecto es una herramienta de código abierto que diseña, documenta y publica APIs REST dentro de un repositorio de GitHub y las sirve mediante funciones sin servidor en Vercel. Nuestra regla de diseño es **minimización estricta de datos**: no hay cuentas de usuario, no hay cookies, no hay píxeles de seguimiento, no hay telemetría comercial y las tipografías se alojan en el propio servidor para no filtrar tu dirección IP a CDNs de terceros.

---

## La app nativa (Android e iOS)

La aplicación nativa incluye la misma interfaz y respeta esta política. Añade únicamente:

- **Preferencias locales** en el dispositivo: tema, color de acento y dirección del servidor del taller.
  Se borran desde *Ajustes → Borrar preferencias* o desinstalando la app.
- **Estado de la red** (solo si hay conexión) para avisarte cuando estás sin conexión.
- **Ningún permiso** de cámara, micrófono, ubicación, contactos ni almacenamiento externo. Solo `INTERNET`.
- **Sin analítica, sin publicidad y sin rastreadores**, igual que la versión web.

## 1. Responsable del tratamiento y alcance

- **Proyecto de código abierto**: [`muecojulio/generador-apis-gratuitas`](https://github.com/muecojulio/generador-apis-gratuitas).
- **Despliegues propios (autoalojamiento)**: Si haces un *fork* o despliegas tu propia copia en Vercel y GitHub, **tú eres el responsable del tratamiento** de los datos almacenados en tu repositorio y tu cuenta de Vercel.
- **Instancia pública de demostración**: Se ofrece únicamente con fines demostrativos y de prototipado. Cualquier persona puede consultar los planos publicados en el repositorio público.

---

## 2. Qué datos se tratan y con qué finalidad

| Categoría | Qué incluye | Dónde vive y cuánto tiempo | Finalidad y base legal |
| :--- | :--- | :--- | :--- |
| **1. Diseño de una API** | Nombre (`slug`), descripción funcional (tablas, campos y reglas), límites de tamaño/retención y huella opcional de token. | Se envía a GitHub Actions (`.github/workflows/generar-api.yml`) y a un proveedor gratuito de IA para generar `api/<nombre>/spec.json`. Permanece en el repositorio mientras exista la API. | Ejecutar la creación de la API solicitada por el usuario (consentimiento al enviar el formulario). |
| **2. Registros de cada API** | Objetos JSON creados mediante `POST` o `PUT` en `/api/<nombre>/<recurso>`. | Archivo `data/<nombre>.json` en el repositorio de GitHub y caché efímera en memoria (TTL de 8 s para lecturas y respaldo en memoria de hasta 1 h ante caídas de red). | Almacenar y servir los recursos de la API (ejecución del servicio). Si la API define `retencionDias`, los registros caducados se purgan automáticamente antes de cada escritura y se filtran en lectura. |
| **3. Tokens de acceso** | Huella criptográfica **SHA-256** (64 caracteres hexadecimales) y modo (`escritura` o `todo`). | `api/<nombre>/spec.json`. El token en claro se genera con `crypto.getRandomValues` en tu navegador y **jamás viaja al servidor al crear la API**. | Autenticación sin guardar secretos en el repositorio. Al usar la API, el token se compara en tiempo constante (`crypto.timingSafeEqual`). |
| **4. Preferencias en tu navegador (`localStorage`)** | Tema visual (`taller_tema`) y, solo si tú decides guardarlo en el explorador `/docs`, el token de prueba de una API (`taller_token_<api>`). | Exclusivamente en tu navegador (`window.localStorage`). Nunca se transmite automáticamente como cookie. | Recordar el aspecto visual elegido y facilitarte las pruebas en el explorador interactivo. Puedes borrarlo en cualquier momento desde tu navegador. |
| **5. Metadatos técnicos y de seguridad** | Dirección IP (normalizada y truncada en memoria), ruta HTTP, cabeceras `Origin`/`Referer` y contadores de ventana fija. | En la memoria volátil de la función serverless durante la ventana activa (1 minuto para cupos de escritura y bloqueo anti-fuerza bruta; 1 hora para cupos de creación). | Interés legítimo en proteger el servicio frente a abusos, ataques de fuerza bruta y agotamiento de cuota en GitHub (`SECURITY.md`). |

> **Advertencia importante sobre repositorios públicos:** Si el repositorio de GitHub donde corre el taller es público, tanto los planos (`api/<nombre>/spec.json`) como los archivos de datos (`data/<nombre>.json`) y el historial de commits de Git son públicos. **No introduzcas datos personales sensibles, contraseñas reales, secretos empresariales ni información médica o financiera en las descripciones ni en los registros de prueba.**

---

## 3. Qué datos NO recogemos

- **Cero cookies (`Set-Cookie`)**: ni propias ni de terceros.
- **Cero analítica o rastreadores**: no usamos Google Analytics, Meta Pixel, Hotjar, Sentry ni telemetría oculta.
- **Cero CDNs de fuentes o estilos**: las tipografías (*Fraunces*, *Outfit*, *JetBrains Mono*) y el CSS compilado viven en `/assets/`, por lo que tu navegador no realiza peticiones a `fonts.googleapis.com` ni `cdn.tailwindcss.com`.
- **Cero perfilado o venta de datos**: los datos nunca se ceden con fines publicitarios ni de entrenamiento comercial propio.

---

## 4. Terceros y subencargados técnicos

Para funcionar con coste `$0`, el taller se apoya únicamente en los siguientes servicios cuando realizas la acción correspondiente:

1. **GitHub (Microsoft)**: aloja el código, los planos (`api/*/spec.json`), los datos (`data/*.json`) y ejecuta el flujo de construcción en GitHub Actions.
2. **Vercel**: aloja los archivos estáticos y ejecuta las funciones serverless (`/api/*`), aplicando TLS/HTTPS y registros técnicos de red propios de su plataforma.
3. **Proveedores gratuitos de IA (solo al diseñar una API)**: el texto descriptivo que escribes en el formulario se envía al primer proveedor disponible de la cadena configurada (LLM7, Kilo Gateway, OVHcloud AI Endpoints, Pollinations o un proveedor con clave opcional en el entorno; si ninguno responde, actúa el motor local determinista sin salir de GitHub Actions).
4. **Fuentes públicas sin clave (solo si tu API usa campos `pais`, `moneda` o `ciudad` y `TALLER_FUENTES` está activo)**:
   - **REST Countries** (`restcountries.com`): recibe únicamente el nombre o código del país para normalizarlo.
   - **Frankfurter** (`api.frankfurter.dev`): recibe únicamente el código ISO de moneda para validarlo.
   - **Open-Meteo Geocoding** (`geocoding-api.open-meteo.com`): recibe únicamente el nombre de la ciudad para completar su país y coordenadas.
   - Puedes desactivar por completo estas consultas externas definiendo `TALLER_FUENTES=0`.
5. **Catálogo público `public-apis/public-apis`**: el servidor consulta periódicamente su listado público en GitHub sin enviar ningún dato del usuario.

---

## 5. Medidas de seguridad activas

El taller aplica defensa en profundidad tanto en el navegador como en el servidor (`lib/http.js`, `lib/auth.js`, `lib/cupo.js`, `lib/runtime.js`):

- **Cabeceras de seguridad en todas las respuestas**: `Content-Security-Policy` estricta (`default-src 'self'`, `frame-ancestors 'none'`), `Strict-Transport-Security` (HSTS), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `X-DNS-Prefetch-Control: off`, `Cross-Origin-Resource-Policy` y `Permissions-Policy`.
- **Protección contra polución de prototipos e inyección**: saneamiento recursivo de claves `__proto__`, `constructor` y `prototype` al parsear JSON (`lib/http.js`), bloqueo de identificadores reservados en esquemas (`lib/motor.mjs`) y limpieza de caracteres de control y bytes nulos (`\u0000`) en entradas de texto (`lib/runtime.js`).
- **Protección CSRF y de origen**: las rutas de administración (`/api/generar`, `/api/estado`, `/api/proveedores`) exigen mismo origen o inclusión explícita en `TALLER_ORIGENES` y verifican `Sec-Fetch-Site`.
- **Control de cupos y anti-fuerza bruta**: límite de creaciones por IP/hora (`TALLER_CUPO_HORA`), límite de escrituras por IP/minuto (`TALLER_CUPO_MIN`) y bloqueo temporal tras 8 fallos de token en 1 minuto.
- **Protección contra pérdida de datos**: las escrituras nunca sobrescriben datos si la lectura previa a GitHub falla (`503`), y las lecturas disponen de caché e índices en memoria con respaldo temporal ante fallos transitorios de red.

---

## 6. Tus derechos (Acceso, Rectificación, Supresión y Oposición — RGPD / LFPDPPP)

Independientemente de tu ubicación (incluyendo el Espacio Económico Europeo bajo el RGPD o México bajo la LFPDPPP / derechos ARCO), puedes:

1. **Consultar y exportar** cualquier plano o registro directamente desde `/api/<nombre>` o desde el repositorio de GitHub.
2. **Rectificar o borrar registros** en tiempo real enviando `PUT /api/<nombre>/<recurso>/{id}` o `DELETE /api/<nombre>/<recurso>/{id}` (o configurando `retencionDias` en el plano de la API).
3. **Solicitar la eliminación completa de una API o de un dato publicado por error** abriendo un [issue en el repositorio](https://github.com/muecojulio/generador-apis-gratuitas/issues) o, si se trata de un dato sensible o vulnerabilidad, mediante un aviso privado siguiendo [`SECURITY.md`](./SECURITY.md).
