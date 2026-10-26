# Taller de APIs gratuitas

Describe una API en la aplicación y este repositorio la publica en la nube. Cada API nace como una carpeta
dentro de `api/` y queda viva en una dirección como `https://TU-SITIO.vercel.app/api/tienda-barrio`, con
`GET`, `POST`, `PUT` y `DELETE` de verdad.

**Interfaz de producto, no de demo.** El taller es una aplicación con barra lateral y pestañas —Resumen,
Diseñar API, Consola de pruebas, Mis APIs, APIs públicas— más una pantalla de Ajustes con tema claro/oscuro y
cuatro acentos, y una consola de pruebas con latencia y ETag en vivo.

**Aplicación nativa de verdad.** El repositorio incluye proyectos de Capacitor para **Android**
(`android/`, Gradle + SDK 34) e **iOS** (`ios/`, Xcode + Swift 13+): icono, pantalla de arranque, barra de
estado, háptica, compartir nativo y botón atrás. Se instala como cualquier app; no es una web disfrazada.
Guía completa: **[docs/APP-NATIVA.md](docs/APP-NATIVA.md)**.

**Coste: 0 €, para siempre.** GitHub Free + Vercel Hobby + modelos de IA de acceso libre. Ni tarjetas, ni
claves de pago, ni servicios comerciales de OpenAI.

Además, cada API incluye:

- **Documentación automática OpenAPI 3.0.3** en `/api/<nombre>/openapi.json` y una vista legible en
  `/docs?api=<nombre>`.
- **Límite de registros, tamaño y retención de datos configurable** por API.
- **Modo solo lectura y autenticación simple por token opcional**, sin costo.
- **Normalización gratuita**: al guardar, los campos `pais`, `moneda` y `ciudad` se corrigen solos con
  servicios públicos que no piden clave ni registro. Si no responden, el valor se guarda tal cual.
- **Catálogo de APIs públicas sin clave** en `/api/fuentes`, descubierto del repositorio
  [public-apis/public-apis](https://github.com/public-apis/public-apis), con copia local.
- **Caché en memoria, índices por identificador y privacidad explicada** en `/privacidad`.
- **App nativa para Android e iOS** con la misma interfaz, servidor configurable y avisos de red.
- **Diseño profesional y accesible**: tema claro y oscuro, cuatro acentos, navegación por pestañas, iconos SVG
  propios y CSS compilado sin CDNs (CSP estricta).

---

## Qué incluye cada API

### 1. Documentación automática (OpenAPI / Swagger)

Cada API publica su documento generado desde el plano:

```bash
curl https://TU-SITIO.vercel.app/api/ejemplo-notas/openapi.json
```

Y una vista legible, con esquemas, ejemplos, límites, token y botones para probar lecturas:

- `/docs` — directorio de todas las APIs publicadas.
- `/docs?api=ejemplo-notas` — documentación de una API.
- `/api/<nombre>/docs` — redirección corta a la vista anterior.

El documento se genera en `lib/openapi.js` a partir del plano, no se escribe a mano. Incluye `GET`, `POST`,
`PUT` y `DELETE` (salvo en APIs de solo lectura), los esquemas de entrada y salida, los códigos de error,
los límites y los esquemas de seguridad `bearerAuth` y `apiToken` cuando la API pide token. Desde la vista se
puede abrir el mismo JSON en **Swagger Editor** con un clic.

### 2. Límites y retención por API

Cada plano puede guardar un bloque `limites`:

```json
"limites": {
  "maxRegistrosPorRecurso": 500,
  "maxBytes": 262144,
  "retencionDias": 90
}
```

| Ajuste | Por defecto | Rango | Qué hace |
| --- | --- | --- | --- |
| `maxRegistrosPorRecurso` | 500 | 1–5.000 | Un `POST` que pase el cupo responde `409`. |
| `maxBytes` | 262.144 (256 KB) | 4 KB–512 KB | Si el archivo de datos crece más, las escrituras responden `413`. |
| `retencionDias` | 0 (no borrar) | 0–3.650 | Los registros más viejos se ocultan al leer y se limpian al escribir. |

Se configura desde **Ajustes de la API** en la página, escribiendo el bloque en el plano, o con lenguaje
natural en la descripción («máximo 200 registros», «retención de 30 días», «hasta 64 KB»). Los valores
siempre se recortan a un rango seguro.

Las respuestas informan con `X-Limite-Registros`, `X-Retencion-Dias` y `X-Total-Registros` (las dos últimas
cuando aplican). El límite real es el tamaño del archivo `data/<api>.json` con formato legible, no el tamaño
del cuerpo de una petición; el cuerpo además tiene un tope de 1 MB.

### 3. Solo lectura y token opcional

**Solo lectura.** La API solo publica rutas `GET`; cualquier intento de escribir responde `405`. La
documentación también lo refleja (no aparecen rutas de escritura).

**Token opcional.** Se activa en **Ajustes de la API**. El token se crea en tu navegador con
`crypto.getRandomValues`, y al servidor **solo viaja su huella SHA-256**. En el repositorio (que es público)
no queda el token, solo la huella. Se muestra una sola vez al terminar: guárdalo.

La API acepta cualquiera de estas cabeceras:

```bash
curl https://TU-SITIO.vercel.app/api/mis-notas/notas \
  -H "Authorization: Bearer taller_…"

curl https://TU-SITIO.vercel.app/api/mis-notas/notas \
  -H "X-API-Token: taller_…"
```

Modos:

- **Solo escritura** (por defecto): las lecturas son públicas; `POST`, `PUT` y `DELETE` piden token.
- **Todo**: también piden token las lecturas de datos.

El **manifiesto** (`/api/<nombre>`) y el **OpenAPI** (`/api/<nombre>/openapi.json`) siguen abiertos incluso en
modo «todo»: son el contrato, no los datos. Así `/docs?api=<nombre>` puede explicar cómo entrar.

También se puede fijar un token sin tocar el plano, desde Vercel:
`API_TOKEN_MIS_NOTAS` para `/api/mis-notas`. Es útil para rotar el token sin volver a generar la API.

> **Importante:** el token protege las rutas de la API, no el archivo `data/<api>.json` del repositorio. Si
> el repositorio es público, esos datos también son públicos. No guardes contraseñas, datos personales ni
> nada delicado. Para un taller y prototipos es suficiente; no sustituye a un sistema de identidad completo.

---

## Lo primero: cómo queda todo montado

```
api/
  [nombre]/index.js        -> atiende  /api/<cualquier-nombre>
  [nombre]/[...ruta].js    -> atiende  /api/<cualquier-nombre>/lo-que-sea
  <nombre>/spec.json       -> el plano de cada API (datos, no programa)
  generar.js               -> el botón de la página
  estado.js                -> ¿cómo va la creación?
  listar.js                -> catálogo de APIs publicadas
  salud.js                 -> comprobación rápida
  fuentes.js               -> APIs públicas sin clave (curadas y descubiertas en GitHub)
  proveedores.js           -> estado de los modelos gratuitos (con y sin clave)
lib/                       -> motor, lector, IA gratuita, OpenAPI, token, límites, caché, índices
index.html                 -> la interfaz del producto (pestañas, temas, ajustes)
script.js                  -> diseñador en vivo, consola, catálogo, ajustes y arranque nativo
configuracion.js           -> entorno (web o app) y tema aplicado antes del primer pintado
app/nativo.js              -> puente de Capacitor (barra de estado, háptica, compartir, red)
capacitor.config.json      -> identidad de la app nativa
android/ ios/              -> proyectos nativos completos (Gradle y Xcode)
scripts/construir-app.mjs  -> npm run app:preparar | app:sync | app:android | app:apk
scripts/generar-iconos.mjs -> npm run app:iconos (iconos y pantallas de arranque)
lib/publicas.js            -> normaliza países, monedas y ciudades sin clave ni registro
lib/fuentes-github.js      -> lee public-apis y guarda una copia local de respaldo
scripts/                   -> generación, pruebas, sincronización, medición y servidor local
data/                      -> los datos que guardan las APIs creadas
catalogos/                 -> copias locales de catálogos (fuentes públicas descubiertas en GitHub)
catalogos/fuentes-publicas.json -> 958 APIs sin clave con su licencia y fecha
privacidad.html            -> política de privacidad (sin cookies ni analítica)
docs.html / docs.js        -> vista de documentación (estática, sin función de Vercel)
```

Tres detalles importantes, explicados sin tecnicismos:

1. **Dos archivos dinámicos atienden todas las APIs.** El plan Hobby de Vercel solo admite 12 funciones por
   despliegue; si cada API creada añadiera sus propios archivos, el sitio se rompería a la quinta o sexta.
   Con el reparto dinámico, el taller usa **8 funciones de 12** (6 fijas y 2 dinámicas) y puede sostener
   muchísimas APIs.
2. **La IA no escribe el programa.** El modelo solo devuelve un *plano* en JSON (tablas, campos, reglas,
   límites). Quien atiende las peticiones es siempre `lib/runtime.js`, código fijo y revisado. Una
   descripción maliciosa no puede colar código en tu servidor.
3. **OpenAPI, token y límites salen del mismo plano.** `lib/openapi.js` genera el documento; `lib/auth.js` y
   `lib/limites.js` aplican las reglas. No hay configuración duplicada ni servicios externos.

---

## La interfaz

La aplicación se organiza en pestañas (barra lateral en escritorio, barra inferior en el móvil):

| Pestaña | Qué hace |
| --- | --- |
| **Resumen** | Estado del motor, métricas, cadena de IA y accesos rápidos. |
| **Diseñar API** | Plantillas, bloques de campos, límites, token y vista previa del plano en vivo. |
| **Consola de pruebas** | Peticiones reales con latencia, ETag y código en cURL, JavaScript, Python y HTTPie. |
| **Mis APIs** | Catálogo de las APIs publicadas, con enlaces a su documentación OpenAPI. |
| **APIs públicas** | Servicios abiertos que normalizan datos y el catálogo `public-apis`. |
| **Ajustes y app** | Tema claro/oscuro, cuatro acentos, servidor del taller y estado de la app nativa. |

El tema y el acento se guardan en el dispositivo; el servidor también (útil en la app nativa). Todo el color
viaja por variables CSS: sin estilos en línea, con CSP estricta y sin peticiones a terceros.

## La app nativa

```bash
npm run app:preparar   # interfaz + configuración + puente de Capacitor
npm run app:android    # abre Android Studio
npm run app:apk        # APK de depuración en android/app/build/outputs/apk/debug/
npm run app:ios        # abre Xcode (macOS)
```

Los proyectos nativos ya están en el repositorio (`android/`, `ios/`), con iconos, splash y permisos
mínimos (solo red). El flujo `.github/workflows/app-android.yml` compila el APK en cada Release y lo adjunta.
Detalles, firma y solución de problemas: **[docs/APP-NATIVA.md](docs/APP-NATIVA.md)**.

---

## Uso diario

1. Abre tu sitio en Vercel (o la app).
2. Ve a **Diseñar API**, escribe el nombre de la ruta (por ejemplo `tienda-barrio`) y la descripción de
   tablas, campos y acciones.
3. Ajusta si quieres: solo lectura, token, registros, tamaño o retención.
4. Pulsa **Publicar API en la nube**.
5. En uno o dos minutos, `/api/tienda-barrio` responde. Pulsa **Probar en consola** para verlo al instante.

Ya hay tres APIs de ejemplo listas para probar: `/api/ejemplo-notas` (la del taller), `/api/demo-recetas`
(creada de verdad por el flujo, sin ninguna clave, a partir de una descripción en español) y
`/api/demo-gimnasio`.

```bash
# Ver las rutas que tiene una API
curl https://TU-SITIO.vercel.app/api/ejemplo-notas

# Leer los datos de un recurso
curl https://TU-SITIO.vercel.app/api/ejemplo-notas/notas

# Crear un registro
curl -X POST https://TU-SITIO.vercel.app/api/ejemplo-notas/notas \
  -H "Content-Type: application/json" \
  -d '{"titulo":"Mi primera nota"}'

# Ver su documentación OpenAPI
curl https://TU-SITIO.vercel.app/api/ejemplo-notas/openapi.json
```

Filtros y paginación: `?buscar=texto&desde=0&limite=50`.

También puedes pedir una API desde fuera de la página, con la misma `GITHUB_PAT` configurada en Vercel:

```bash
curl -X POST https://TU-SITIO.vercel.app/api/generar \
  -H "Content-Type: application/json" \
  -d '{
    "nombre": "mi-inventario",
    "descripcion": "Tabla productos con campos nombre (texto, obligatorio), precio (número, mínimo 0) y existencias (entero). Quiero listar, crear, actualizar y borrar.",
    "limites": {"maxRegistrosPorRecurso": 800, "retencionDias": 0}
  }'
```

La respuesta es `202` con la dirección de la documentación. La descripción es obligatoria (20–8.000 caracteres).

---

## Publicar en Vercel (una sola vez)

1. Entra a **[vercel.com/new](https://vercel.com/new)** e inicia sesión con GitHub.
2. Elige **Import Git Repository** y selecciona `generador-apis-gratuitas`.
3. Vercel detecta todo solo. No cambies el *Framework Preset* (déjalo en **Other**) ni el *Build Command*.
4. Antes de pulsar **Deploy**, abre **Environment Variables** y añade `GITHUB_PAT` con la clave que crees en
   el apartado siguiente. Elige **Production** y **Preview**.
5. Pulsa **Deploy**. En menos de un minuto tendrás tu dirección: `https://generador-apis-gratuitas-XXX.vercel.app`.

Cada `git push` a `main` vuelve a desplegar solo. Los cambios que solo tocan los datos de las APIs
(`data/<api>.json`) no gastan despliegues: `vercel.json` los ignora. El catálogo (`catalogos/`) queda fuera de
`data/` a propósito, para que sus cambios sí desplieguen. `cleanUrls` está activo para que `/docs` funcione
sin `.html`.

Comprueba el despliegue con:

```bash
curl https://TU-SITIO.vercel.app/api/salud
curl https://TU-SITIO.vercel.app/api/listar
curl https://TU-SITIO.vercel.app/api/fuentes
curl https://TU-SITIO.vercel.app/docs?api=ejemplo-notas
```

La política de privacidad está en `/privacidad` y el contacto de seguridad en `/.well-known/security.txt`
(también en `/security.txt`).

---

## La clave que hay que pegar a mano (GITHUB_PAT)

Es lo único manual. Existe para que el botón pueda escribir en tu repositorio y para que las APIs guardadas
puedan guardar datos. La página **nunca** lleva la clave dentro: vive en las variables de Vercel.

### 1. Crear la clave (PAT)

1. Entra a **[github.com/settings/personal-access-tokens/new](https://github.com/settings/personal-access-tokens/new)**
   (son los *fine-grained tokens*, los nuevos; no uses los clásicos).
2. **Token name**: `Taller de APIs`.
3. **Expiration**: 90 días está bien. Cuando venza, repites estos pasos y actualizas el valor donde toque.
4. **Repository access** → *Only select repositories* → `generador-apis-gratuitas`.
5. **Permissions** (Repository permissions):
   - **Contents**: *Read and write* → sirve para crear la carpeta de cada API y guardar datos.
   - **Actions**: *Read* → sirve para saber cómo va la creación y para avisar si algo falla.
   - **Metadata**: *Read* (viene marcado solo, no lo puedes quitar).
   - **Workflows**: *Read and write* → **solo si** más adelante editas archivos de `.github/workflows`
     desde fuera de GitHub. Para el uso normal no hace falta.
6. Pulsa **Generate token** y copia el valor (empieza por `github_pat_…`). GitHub solo lo muestra una vez.

### 2. Pegarla en Vercel

Proyecto → **Settings** → **Environment Variables**:

| Nombre | Valor | Entornos |
| --- | --- | --- |
| `GITHUB_PAT` | la clave `github_pat_…` | Production y Preview |
| `GENERADOR_SECRETO` | (opcional) una palabra tuya | Production y Preview |
| `API_TOKEN_<NOMBRE>` | (opcional) token en claro de una API concreta | Production y Preview |
| `TALLER_FUENTES` | (opcional) `0` apaga la normalización y la consulta de fuentes | Production y Preview |
| `TALLER_FUENTES_MS` | (opcional) tiempo máximo por fuente, en milisegundos (mínimo 800) | Production y Preview |
| `TALLER_ORIGENES` | (opcional) orígenes extra separados por comas, para generar desde fuera | Production y Preview |
| `GENERADOR_ESTRATEGIA` | (opcional) `gratis` (por defecto), `calidad`, `sin-clave` o `con-clave` | Production y Preview |
| `TALLER_URL` | (opcional) dirección canónica, para que el OpenAPI no dependa de la cabecera `Host` | Production y Preview |

Guarda y pulsa **Redeploy** para que la función la vea. Si defines `GENERADOR_SECRETO`, la página pedirá
esa palabra para generar APIs y nadie más podrá llenar tu repositorio.

`API_TOKEN_MIS_NOTAS` es un atajo para rotar el token de `/api/mis-notas` sin volver a generar el plano. La
API acepta tanto la huella guardada en el plano como el token de esta variable.

### 3. Pegarla también en GitHub Actions

Repositorio → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:

| Nombre | ¿Obligatorio? | Para qué |
| --- | --- | --- |
| `GITHUB_PAT` | Recomendado | Da más margen de peticiones a la API de GitHub. El `push` de la carpeta nueva funciona igual sin él (el flujo usa el token propio de Actions), así que el taller ya sirve sin pegar nada aquí. |
| `GEMINI_API_KEY` | No | Mejora la calidad del plano. Es gratis y sin tarjeta en [aistudio.google.com/apikey](https://aistudio.google.com/apikey). |
| `KILO_API_KEY` | No | Solo si algún día quieres más cupo en Kilo. El taller funciona sin ella. |

> `GEMINI_API_KEY` vive únicamente en GitHub. Nunca se copia a la página ni al navegador.

---

## La IA: qué se usa y por qué (todo gratis)

**GitHub Models cerró el 30 de julio de 2026.** El taller ya no lo usa. En su lugar, al generar una API se
prueba en este orden hasta que alguno responda:

El orden por defecto (`GENERADOR_ESTRATEGIA=gratis`) es **sin clave primero** y las variables de entorno
solo como respaldo, que es justo lo que se pedía: si los servicios públicos no responden, las claves ya
configuradas siguen funcionando y, si tampoco hay claves, entra el lector incluido.

| Orden | Modelo | Clave | Registro |
| --- | --- | --- | --- |
| 1 | **LLM7** | ninguna (`Bearer unused`) | ninguno |
| 2 | **Kilo Gateway** (modelos `:free`, `kilo-auto/free`) | ninguna | ninguno |
| 3 | **OVHcloud AI Endpoints** (capa anónima) | ninguna | ninguno |
| 4 | **Pollinations** (endpoint clásico de texto) | ninguna | ninguno |
| 5 | **Gemini** (capa gratuita de Google) | `GEMINI_API_KEY`, opcional | cuenta Google, sin tarjeta |
| 6 | **Groq** | `GROQ_API_KEY`, opcional | capa gratuita, sin tarjeta |
| 7 | **OpenRouter** (modelos `:free`) | `OPENROUTER_API_KEY`, opcional | capa gratuita |
| 8 | **Cerebras**, **Mistral**, **Together**, **DeepSeek** | sus variables, opcionales | capa gratuita |
| 9 | **Hugging Face** Inference | `HF_TOKEN`, opcional | cuenta gratuita |
| 10 | **Lector del taller** (`lib/motor.mjs`) | ninguna | ninguno |

Los cuatro primeros son servicios públicos que no cobran ni piden tarjeta ni registro. Si ninguno contesta
(o si todos están lentos), el taller **no se rompe**: prueba los que tengan clave configurada y, al final,
usa el lector incluido, que entiende descripciones claras de tablas, campos y reglas sin internet y sin
ninguna clave. El lector también entiende límites escritos en lenguaje natural («máximo 200 registros»,
«retención de 30 días», «hasta 64 KB»).

Con `GENERADOR_ESTRATEGIA` puedes cambiar el orden: `calidad` pone primero los proveedores con clave,
`sin-clave` usa solo los públicos y `con-clave` solo los de entorno. `GENERADOR_PROVEEDOR` fuerza uno
concreto. `GENERADOR_SIN_IA=1` salta la IA por completo. Para ver qué hay disponible ahora mismo:
`curl https://TU-SITIO.vercel.app/api/proveedores` o `npm run proveedores`.

### Comprobado el 14 de octubre de 2026 (sin ninguna clave)

| Proveedor | ¿Respondió? | Tiempo | Plano que devolvió |
| --- | --- | --- | --- |
| LLM7 | Sí | 1,7 s | `recetas`, `ingredientes` con tipos y mínimos correctos |
| OVHcloud AI | Sí | 5,9 s | el mismo plano, igual de correcto |
| Pollinations | Sí | 2,4 s | el mismo plano, igual de correcto |
| Kilo | Intermitente | — | su catálogo cambia a menudo; el taller lo intenta y sigue |

La API de ejemplo `demo-recetas` que trae este repositorio se creó en esa prueba, **sin pegar ninguna
clave**: el plano lo hizo OVHcloud en su capa anónima. Las tres primeras siguen funcionando hoy; el taller
prueba una detrás de otra y, si las tres fallaran algún día, usa el lector incluido.

¿Quieres ver qué está respondiendo ahora mismo? Pestaña **Actions** → *Probar proveedores de IA* →
**Run workflow**. O desde tu computadora: `npm run proveedores`.

---

## APIs públicas sin clave (y sin registro)

El taller no depende de ninguna clave para funcionar mejor. Usa **servicios públicos que no piden cuenta,
tarjeta ni registro** y los deja caer con elegancia cuando fallan:

| Fuente | Para qué | Sin clave |
| --- | --- | --- |
| [REST Countries](https://restcountries.com) | nombres de países, ISO-2/ISO-3, moneda y capital | sí |
| [Frankfurter](https://frankfurter.app) | códigos y nombres de monedas ISO 4217 | sí |
| [Open-Meteo Geocoding](https://open-meteo.com/en/docs/geocoding-api) | nombre correcto de una ciudad | sí |
| [DummyJSON](https://dummyjson.com), [JSONPlaceholder](https://jsonplaceholder.typicode.com) | datos de ejemplo | sí |
| [Open Library](https://openlibrary.org/developers/api), [Wikipedia REST](https://es.wikipedia.org/api/rest_v1/) | libros y resúmenes | sí |
| [Hacker News](https://github.com/HackerNews/API), [Open Trivia DB](https://opentdb.com/api_config.php) | noticias y preguntas | sí |
| [public-apis](https://github.com/public-apis/public-apis) | catálogo de **958 APIs** filtradas a «sin clave + HTTPS» | sí |

### Normalización al guardar

Si un recurso tiene campos llamados `pais`, `moneda` o `ciudad`, al crear o actualizar un registro el taller
los corrige:

```bash
curl -X POST https://TU-SITIO.vercel.app/api/mi-api/lugares \
  -H "Content-Type: application/json" \
  -d '{"pais":"mexico","moneda":"mxn","ciudad":"cdmx"}'
# guarda: {"pais":"México","moneda":"MXN","ciudad":"Ciudad de México"}
```

La respuesta lo anuncia en `X-Normalizado: pais=rest-countries,moneda=frankfurter,ciudad=open-meteo-geo`.
Si una fuente no responde en `TALLER_FUENTES_MS` (3 s por defecto), **el valor se guarda tal cual** y la
petición sigue adelante: nunca se pierde un registro por culpa de un tercero. `TALLER_FUENTES=0` apaga todo
el mecanismo y el taller se comporta como antes. El manifiesto de cada API y su OpenAPI explican qué campos
se normalizan en `normalizacion` y `x-taller.normalizacion`.

### El catálogo de GitHub

- `GET /api/fuentes` — catálogo curado + APIs descubiertas en `public-apis` (filtradas a sin clave y HTTPS).
  Parámetros: `buscar`, `categoria`, `limite`, `github=0`, `githubLimite=0…200`, `probar=1`.
- `GET /api/fuentes?probar=1` — comprueba ahora qué fuentes responden (6 pruebas por minuto y por IP).
- La copia local vive en `catalogos/fuentes-publicas.json` y se refresca con `npm run fuentes`, que lee el README
  del repositorio público. Si GitHub no responde, el comando termina con error y **no toca** la copia.
- El catálogo se lee una vez al día y se cachea; la web funciona incluso sin red porque la copia va incluida
  en el despliegue.

En la portada hay una sección **APIs públicas sin clave** con el botón *Probar ahora*. En `/docs` aparece el
mismo resumen con enlaces a la documentación de cada servicio.

---

## Caché, índices y velocidad

El taller no tiene base de datos: los datos son archivos JSON en GitHub. Aun así, se puede evitar trabajo
repetido, y eso es lo que se hizo:

- **Caché en memoria con TTL** (`lib/cache.js`): catálogo, documentos OpenAPI, normalizaciones y el catálogo
  de GitHub. Tiene *single flight* (diez peticiones simultáneas de la misma clave provocan **una** lectura
  remota), invalidación por prefijo y un máximo de 400 entradas.
- **Índices derivados** (`lib/indice.js`): `GET /api/<api>/<recurso>/{id}` pasa de recorrer la lista (O(n)) a
  una lectura de diccionario (O(1)); `?buscar=` usa el texto ya normalizado por fila y no distingue acentos
  ni mayúsculas. El índice se liga al `sha` del archivo, así que si los datos no cambian no se reconstruye.
- **ETag y 304** en manifiestos, catálogo, fuentes y proveedores: un navegador que ya tiene la respuesta no
  vuelve a descargarla.
- **Retención y límites** se aplican antes de escribir, no después de leer.

Para verlo con números en tu máquina:

```bash
npm run medir
```

Compara `Array.find` con el índice por id, la búsqueda texto a texto con el índice, la caché contra una
lectura remota simulada de 5 ms y comprueba que el *single flight* hace una sola carga. En la última
medición: **~52×** más rápido por id, **~4×** en búsquedas y **~900×** menos tiempo con caché.

Los índices y la caché son estructuras derivadas: se pueden borrar en cualquier momento y nunca se suben al
repositorio.

---

## Seguridad y privacidad

- **Sin cookies, sin analítica y sin terceros en el navegador.** El CSS y las fuentes se sirven desde el
  propio sitio (nada de CDNs); la CSP es `default-src 'self'`.
- **Cabeceras de seguridad** en `vercel.json` y en el servidor local: CSP, `nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy`, `Permissions-Policy`, HSTS, COOP y `Cross-Origin-Resource-Policy`.
- **CSRF**: crear una API, probar fuentes y probar modelos solo aceptan peticiones del propio sitio
  (`Origin`/`Sec-Fetch-Site`). Las llamadas sin navegador (curl, Actions) siguen funcionando.
- **Cupos**: `/api/generar` admite 12 creaciones por hora y por IP, con una sola en curso; las pruebas de
  fuentes y modelos tienen su propio cupo; los tokens de las APIs bloquean 60 s tras 20 fallos seguidos.
- **Tokens**: solo se guarda su huella SHA-256 y la comparación es en tiempo constante. El valor en claro se
  enseña una sola vez y nunca viaja al repositorio.
- **Datos**: topes de 1 MB por cuerpo, 512 KB por archivo, 40 KB por descripción y validación de tipos,
  longitudes y enumeraciones. Los errores no filtran rutas ni claves.
- **Dependencias**: el sitio y la API **no tienen dependencias de ejecución**
  (`npm audit --omit=dev` → 0 vulnerabilidades). Tailwind y las fuentes solo se usan al compilar; sus avisos
  de desarrollo conocidos están explicados en [`SECURITY.md`](SECURITY.md) y el flujo `Pruebas` revisa el CSS.
- **Privacidad**: `/privacidad` explica qué se guarda (los datos que tú escribes), qué no (sin cuentas, sin
  cookies, sin analítica, sin publicidad) y cómo borrarlo. Contacto de seguridad en
  `/.well-known/security.txt` y en [`SECURITY.md`](SECURITY.md).

> ⚠️ Los datos de las APIs viven en el repositorio. Si es público, esos datos también lo son. No guardes
> información personal ni contraseñas.

---

## Límites que conviene conocer (y que el taller respeta)

- **Vercel Hobby**: 12 funciones por despliegue (usamos 8: 6 fijas y 2 dinámicas), 100 despliegues al día,
  ancho de banda generoso. Suficiente de sobra para un taller.
- **GitHub Actions**: minutos ilimitados en repositorios públicos. Cada generación tarda ~1 minuto.
- **Cupo amable**: una creación a la vez y 12 por hora, para que el taller no se descontrole.
- **Datos**: se guardan en archivos dentro de `data/` de tu repositorio (`data/<api>.json`), no en una base
  de datos de pago. ⚠️ Son **públicos** si el repositorio es público: **no guardes contraseñas, datos
  personales ni nada delicado.** El token protege las rutas, no el archivo.
- **Una API por carpeta**: `api/<nombre>/spec.json`. Si borras la carpeta y ejecutas `npm run registrar`,
  la API desaparece del taller (los datos de `data/<nombre>.json` los borras aparte).
- **Lecturas sin clave**: leer funciona siempre. Para crear, actualizar o borrar hace falta `GITHUB_PAT`.
  Con token, además, hay que enviar la cabecera correcta.
- **Tamaño**: `data/<api>.json` no debe pasar de 512 KB por API. Es el límite duro; el ajuste por API puede
  ser menor.
- **Retención**: si pones 30 días, los registros con `creado` de más de 30 días dejan de aparecer y se
  eliminan en la siguiente escritura. Los ejemplos iniciales usan la fecha de la primera lectura, así que no
  desaparecen solos al momento.
- **Token**: la huella SHA-256 es pública (está en el plano). Un token débil se podría adivinar; el que
  genera la página tiene 192 bits de entropía. Tras **20 fallos en un minuto** desde la misma IP, las
  respuestas pasan a `429` durante 60 segundos. Aun así es autenticación simple para un taller, no un
  sistema de identidad completo.

---

## Trabajar en tu computadora

```bash
npm test            # pruebas de todo: lector, motor, HTTP, caché, índices, seguridad y servidor local
npm run local       # servidor local en http://localhost:3000 (imita a Vercel)
npm run disenar     # crea una API desde NOMBRE + DESCRIPCION
npm run registrar   # rehace lib/registro.js tras tocar api/<nombre>/spec.json
npm run proveedores # prueba los modelos gratuitos
npm run fuentes     # refresca catalogos/fuentes-publicas.json desde public-apis (necesita red)
npm run css         # recompila assets/estilos.css con Tailwind (solo si tocas clases)
npm run medir       # mide índices, búsqueda y caché
```

`npm install` solo hace falta para `npm run css`: el sitio y la API no tienen dependencias de ejecución.
`npm test` levanta el servidor local en un puerto libre y comprueba `/`, `/docs`, `/privacidad`, el CSS,
`/api/salud`, `/api/fuentes` y una API de ejemplo; no necesita internet ni claves.

Con el servidor local puedes ver la página, `/docs`, `/docs?api=ejemplo-notas`,
`/api/ejemplo-notas/openapi.json` y `/privacidad` sin ninguna clave. Generar o guardar cambios sigue
necesitando `GITHUB_PAT`.

Para probar la generación completa sin tocar la nube:

```bash
GENERADOR_SIN_IA=1 NOMBRE=mi-prueba \
DESCRIPCION="Tabla tareas con campos titulo (texto, obligatorio) y hecha (si o no)." \
npm run disenar
```

Para generar una API con token desde la terminal:

```bash
TOKEN=taller_mi_token_de_prueba
GENERADOR_SIN_IA=1 NOMBRE=mis-notas \
DESCRIPCION="Tabla notas con campos titulo (texto, obligatorio) y cuerpo (texto)." \
TOKEN_ACCION=poner \
TOKEN_HASH=$(printf '%s' "$TOKEN" | sha256sum | cut -d' ' -f1) \
TOKEN_MODO=escritura \
LIMITES='{"maxRegistrosPorRecurso":250,"retencionDias":14}' \
npm run disenar
```

---

## Si algo no funciona

| Síntoma | Qué mirar |
| --- | --- |
| El botón dice que falta `GITHUB_PAT` | Añade la variable en Vercel y pulsa **Redeploy**. |
| «GitHub no aceptó el pedido» | El PAT debe tener **Contents: Read and write** y acceso a este repositorio. |
| La dirección responde 404 | Espera un minuto: Vercel está desplegando. Revisa [Actions](https://github.com/muecojulio/generador-apis-gratuitas/actions) por si el flujo falló. |
| Guardar devuelve 503 | Falta `GITHUB_PAT` en Vercel. La lectura sí funciona sin ella. |
| Guardar devuelve 401 | La API pide token: envía `Authorization: Bearer <token>` o `X-API-Token: <token>`. El token solo se mostró al crearla. |
| Guardar devuelve 409 | Se alcanzó `maxRegistrosPorRecurso` o hubo un choque al guardar. Borra registros o sube el límite. |
| Guardar devuelve 413 | Se alcanzó `maxBytes`. Borra registros o sube el límite (máximo 512 KB). |
| Guardar devuelve 405 | La API está en modo solo lectura. |
| Perdí el token | Vuelve a generar la API con **Token opcional** marcado. El token viejo deja de funcionar. También puedes definir `API_TOKEN_<NOMBRE>` en Vercel. |
| `/docs` da 404 en Vercel | Comprueba que el despliegue incluye `docs.html` y `docs.js`, y que `cleanUrls` está activo. |
| Quiero volver a generar una API | Usa el mismo nombre: el taller actualiza su plano y conserva los datos. Los ajustes que no envíes se conservan en la medida de lo posible. |
| Los datos se ven raros | Mira `data/<api>.json` en el repositorio: ahí vive todo. |
| `/api/fuentes` avisa «No pude leer GitHub» | Es normal sin red o si GitHub limita la API. Se usa la copia local; para refrescarla, `npm run fuentes`. |
| El país o la moneda se guardan tal cual | La normalización está apagada (`TALLER_FUENTES=0`), no hay red o el campo no se llama `pais`/`moneda`/`ciudad`. Revisa `normalizacion` en el manifiesto. |
| Una fuente tarda demasiado | Baja `TALLER_FUENTES_MS` (por ejemplo, 1200) o apaga la normalización con `TALLER_FUENTES=0`. |
| `/api/generar` o `?probar=1` devuelven 403 | La petición viene de otro sitio (CSRF). Llama desde tu propio dominio o añádelo a `TALLER_ORIGENES`. |
| Demasiadas peticiones (`429`) | Espera lo que indique `Retry-After`: hay cupo por IP en generar, probar fuentes y tras 20 fallos de token. |

---

## Ideas para probar

- **Tienda**: productos, categorías y pedidos.
- **Biblioteca**: libros y préstamos.
- **Gimnasio**: socios, rutinas y asistencia.
- **Colegio**: cursos, alumnos y notas.
- **Restaurante**: mesas y reservas.

Describe tablas, campos, qué se puede hacer y cualquier regla («el precio no puede ser negativo», «el
correo es obligatorio»). Cuanto más concreto, mejor queda.

Licencia MIT. Hecho para que aprender a publicar APIs no cueste dinero.

Las tipografías **Outfit** y **Fraunces** se sirven desde el propio sitio con licencia SIL Open Font
License 1.1; el texto de ambas licencias está en `assets/fuentes/OFL-Outfit.txt` y
`assets/fuentes/OFL-Fraunces.txt`. El catálogo de `public-apis` se usa bajo licencia MIT y el detalle de las
fuentes públicas está en `/api/fuentes`.
