# Taller de APIs gratuitas

Describe una API en la página y este repositorio la publica en la nube. Cada API nace como una carpeta
dentro de `api/` y queda viva en una dirección como `https://TU-SITIO.vercel.app/api/tienda-barrio`, con
`GET`, `POST`, `PUT` y `DELETE` de verdad.

**Coste: 0 €, para siempre.** GitHub Free + Vercel Hobby + modelos de IA de acceso libre. Ni tarjetas, ni
claves de pago, ni servicios comerciales de OpenAI.

Además, cada API incluye:

- **Documentación automática OpenAPI 3.0.3** en `/api/<nombre>/openapi.json` y una vista legible en
  `/docs?api=<nombre>`.
- **Límite de registros, tamaño y retención de datos configurable** por API.
- **Modo solo lectura y autenticación simple por token opcional**, sin costo.

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
lib/                       -> motor, lector, IA gratuita, OpenAPI, token y límites
scripts/                   -> generación, pruebas y servidor local
data/                      -> los datos que guardan las APIs creadas
docs.html / docs.js        -> vista de documentación (estática, sin función de Vercel)
```

Tres detalles importantes, explicados sin tecnicismos:

1. **Dos archivos dinámicos atienden todas las APIs.** El plan Hobby de Vercel solo admite 12 funciones por
   despliegue; si cada API creada añadiera sus propios archivos, el sitio se rompería a la quinta o sexta.
   Con el reparto dinámico, el taller usa **6 funciones** y puede sostener muchísimas APIs.
2. **La IA no escribe el programa.** El modelo solo devuelve un *plano* en JSON (tablas, campos, reglas,
   límites). Quien atiende las peticiones es siempre `lib/runtime.js`, código fijo y revisado. Una
   descripción maliciosa no puede colar código en tu servidor.
3. **OpenAPI, token y límites salen del mismo plano.** `lib/openapi.js` genera el documento; `lib/auth.js` y
   `lib/limites.js` aplican las reglas. No hay configuración duplicada ni servicios externos.

---

## Uso diario

1. Abre tu sitio en Vercel.
2. Escribe el nombre de la ruta (por ejemplo `tienda-barrio`) y la descripción de tablas, campos y acciones.
3. Ajusta si quieres: solo lectura, token, registros, tamaño o retención.
4. Pulsa **Generar API en la nube**.
5. En uno o dos minutos, `/api/tienda-barrio` responde.

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

Cada `git push` a `main` vuelve a desplegar solo. Los cambios que solo tocan `data/` no gastan
despliegues: `vercel.json` los ignora. `cleanUrls` está activo para que `/docs` funcione sin `.html`.

Comprueba el despliegue con:

```bash
curl https://TU-SITIO.vercel.app/api/salud
curl https://TU-SITIO.vercel.app/api/listar
curl https://TU-SITIO.vercel.app/docs?api=ejemplo-notas
```

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

| Orden | Modelo | Clave | Registro |
| --- | --- | --- | --- |
| 1 | **Gemini** (capa gratuita de Google) | `GEMINI_API_KEY` (opcional) | Cuenta Google, sin tarjeta |
| 2 | **LLM7** | ninguna (`Bearer unused`) | ninguno |
| 3 | **Kilo Gateway** (modelos `:free`, `kilo-auto/free`) | ninguna | ninguno |
| 4 | **OVHcloud AI Endpoints** (capa anónima) | ninguna | ninguno |
| 5 | **Pollinations** (endpoint clásico de texto) | ninguna | ninguno |
| 6 | **Lector del taller** (`lib/motor.mjs`) | ninguna | ninguno |

Los cinco primeros son servicios públicos que no cobran ni piden tarjeta. Si ninguno contesta (o si todos
están lentos), el taller **no se rompe**: usa el lector incluido, que entiende descripciones claras de
tablas, campos y reglas sin internet y sin ninguna clave. El lector también entiende límites escritos en
lenguaje natural («máximo 200 registros», «retención de 30 días», «hasta 64 KB»).

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

## Límites que conviene conocer (y que el taller respeta)

- **Vercel Hobby**: 12 funciones por despliegue (usamos 6), 100 despliegues al día, ancho de banda generoso.
  Suficiente de sobra para un taller.
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
  genera la página tiene 192 bits de entropía. No hay límite de intentos por ahora: es autenticación simple
  para un taller, no un sistema de seguridad completo.

---

## Trabajar en tu computadora

```bash
npm test          # pruebas del lector, motor, registro, generación, OpenAPI, límites y token
npm run local     # servidor local en http://localhost:3000
npm run disenar   # crea una API desde NOMBRE + DESCRIPCION
npm run registrar # rehace lib/registro.js tras tocar api/<nombre>/spec.json
npm run proveedores # prueba los modelos gratuitos
```

Con el servidor local puedes ver la página, `/docs`, `/docs?api=ejemplo-notas` y
`/api/ejemplo-notas/openapi.json` sin ninguna clave. Generar o guardar cambios sigue necesitando `GITHUB_PAT`.

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
