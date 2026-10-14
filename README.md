# Taller de APIs gratuitas

Describe una API en la página y este repositorio la publica en la nube. Cada API nace como una carpeta
dentro de `api/` y queda viva en una dirección como `https://TU-SITIO.vercel.app/api/tienda-barrio`, con
`GET`, `POST`, `PUT` y `DELETE` de verdad.

**Coste: 0 €, para siempre.** GitHub Free + Vercel Hobby + modelos de IA de acceso libre. Ni tarjetas, ni
claves de pago, ni servicios comerciales de OpenAI.

---

## Lo primero: cómo queda todo montado

```
api/
  [nombre]/index.js        -> atiende  /api/<cualquier-nombre>
  [nombre]/[...ruta].js    -> atiende  /api/<cualquier-nombre>/lo-que-sea
  ejemplo-notas/spec.json  -> el plano de la API de ejemplo (datos, no programa)
  generar.js               -> el botón de la página
  estado.js                -> ¿cómo va la creación?
  listar.js                -> catálogo de APIs publicadas
  salud.js                 -> comprobación rápida
lib/                       -> motor, lector, IA gratuita, herramientas
scripts/                   -> programa de generación, pruebas y servidor local
data/                      -> los datos que guardan las APIs creadas
```

Dos detalles importantes, explicados sin tecnicismos:

1. **Dos archivos dinámicos atienden todas las APIs.** El plan Hobby de Vercel solo admite 12 funciones por
   despliegue; si cada API creada añadiera sus propios archivos, el sitio se rompería a la quinta o sexta.
   Con el reparto dinámico, el taller usa **6 funciones** y puede sostener muchísimas APIs.
2. **La IA no escribe el programa.** El modelo solo devuelve un *plano* en JSON (tablas, campos, reglas).
   Quien atiende las peticiones es siempre `lib/runtime.js`, código fijo y revisado. Una descripción
   maliciosa no puede colar código en tu servidor.

---

## Uso diario

1. Abre tu sitio en Vercel.
2. Escribe el nombre de la ruta (por ejemplo `tienda-barrio`) y la descripción.
3. Pulsa **Generar API en la nube**.
4. En uno o dos minutos, `/api/tienda-barrio` responde.

Ya hay dos APIs de ejemplo listas para probar: `/api/ejemplo-notas` (la del taller) y `/api/demo-recetas`
(creada de verdad por el flujo, sin ninguna clave, a partir de una descripción en español).

```bash
# Ver las rutas que tiene una API
curl https://TU-SITIO.vercel.app/api/ejemplo-notas

# Leer los datos de un recurso
curl https://TU-SITIO.vercel.app/api/ejemplo-notas/notas

# Crear un registro
curl -X POST https://TU-SITIO.vercel.app/api/ejemplo-notas/notas \
  -H "Content-Type: application/json" \
  -d '{"titulo":"Mi primera nota"}'
```

Filtros y paginación: `?buscar=texto&desde=0&limite=50`.

---

## Publicar en Vercel (una sola vez)

1. Entra a **[vercel.com/new](https://vercel.com/new)** e inicia sesión con GitHub.
2. Elige **Import Git Repository** y selecciona `generador-apis-gratuitas`.
3. Vercel detecta todo solo. No cambies el *Framework Preset* (déjalo en **Other**) ni el *Build Command*.
4. Antes de pulsar **Deploy**, abre **Environment Variables** y añade `GITHUB_PAT` con la clave que crees en
   el apartado siguiente. Elige **Production** y **Preview**.
5. Pulsa **Deploy**. En menos de un minuto tendrás tu dirección: `https://generador-apis-gratuitas-XXX.vercel.app`.

Cada `git push` a `main` vuelve a desplegar solo. Los cambios que solo tocan `data/` no gastan
despliegues: `vercel.json` los ignora.

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

Guarda y pulsa **Redeploy** para que la función la vea. Si defines `GENERADOR_SECRETO`, la página pedirá
esa palabra para generar APIs y nadie más podrá llenar tu repositorio.

### 3. Pegarla también en GitHub Actions

Repositorio → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:

| Nombre | ¿Obligatorio? | Para qué |
| --- | --- | --- |
| `GITHUB_PAT` | Sí | Hace el `push` de la nueva carpeta. Sin esto, el flujo no puede publicar. |
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
tablas y campos sin internet y sin ninguna clave. Por eso el botón funciona siempre.

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

- **Vercel Hobby**: 12 funciones por despliegue (usamos 6), 100 despliegues al día, ancho de banda
  generoso. Suficiente de sobra para un taller.
- **GitHub Actions**: minutos ilimitados en repositorios públicos. Cada generación tarda ~1 minuto.
- **Cupo amable**: una creación a la vez y 12 por hora, para que el taller no se descontrole.
- **Datos**: se guardan en archivos dentro de `data/` de tu repositorio (`data/<api>.json`), no en una base
  de datos de pago. Son públicos, igual que el repositorio: **no guardes contraseñas ni datos personales.**
- **Lecturas sin clave**: leer funciona siempre. Para crear, actualizar o borrar hace falta `GITHUB_PAT`.

---

## Trabajar en tu computadora

```bash
npm test          # pruebas del lector, del motor y del registro
npm run local     # servidor local en http://localhost:3000
npm run registrar # rehace lib/registro.js tras tocar api/<nombre>/spec.json
npm run proveedores # prueba los modelos gratuitos
```

Para probar la generación completa sin tocar la nube:

```bash
GENERADOR_SIN_IA=1 NOMBRE=mi-prueba \
DESCRIPCION="Tabla tareas con campos titulo (texto, obligatorio) y hecha (si o no)." \
node scripts/disenar.mjs
```

---

## Si algo no funciona

| Síntoma | Qué mirar |
| --- | --- |
| El botón dice que falta `GITHUB_PAT` | Añade la variable en Vercel y pulsa **Redeploy**. |
| «GitHub no aceptó el pedido» | El PAT debe tener **Contents: Read and write** y acceso a este repositorio. |
| La dirección responde 404 | Espera un minuto: Vercel está desplegando. Revisa [Actions](https://github.com/muecojulio/generador-apis-gratuitas/actions) por si el flujo falló. |
| Guardar devuelve 503 | Falta `GITHUB_PAT` en Vercel. La lectura sí funciona sin ella. |
| Quiero volver a generar una API | Usa el mismo nombre: el taller actualiza su plano y conserva los datos. |
| Los datos se ven raros | Mira `data/<api>.json` en el repositorio: ahí vive todo. |

---

## Ideas para probar

- **Tienda**: productos, categorías y pedidos.
- **Biblioteca**: libros y préstamos.
- **Gimnasio**: socios, rutinas y asistencia.
- **Colegio**: cursos, alumnos y notas.

Describe tablas, campos, qué se puede hacer y cualquier regla («el precio no puede ser negativo», «el
correo es obligatorio»). Cuanto más concreto, mejor queda.

Licencia MIT. Hecho para que aprender a publicar APIs no cueste dinero.
