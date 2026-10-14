# Taller de APIs gratuitas

Describes una API en la página y este repositorio abre una carpeta en `api/`. Vercel la publica en una ruta como `/api/tienda-barrio`. No se crean repositorios nuevos y no hay servicios de pago.

La inteligencia artificial **no escribe el programa**. Solo devuelve un plano (tablas, campos y reglas). Un generador fijo, revisado, convierte ese plano en la función. Así una descripción maliciosa no puede colar código en el servidor.

GitHub Models cerró el 30 de julio de 2026. El plano lo hace Gemini en su capa gratuita. Si todavía no pegas esa clave, un lector incluido entiende descripciones claras de tablas y campos.

## Uso

1. Abre el sitio.
2. Escribe el nombre de la ruta y la descripción.
3. Pulsa **Generar API en la nube**.
4. En uno o dos minutos abre `/api/el-nombre`.

La de ejemplo ya responde en `/api/ejemplo-notas`.

## Lo único que hay que pegar a mano

El botón y el guardado de datos necesitan una clave personal de GitHub. La página no puede llevarla dentro, porque cualquiera la vería.

### 1. Crear la clave (PAT)

1. Entra a [github.com/settings/personal-access-tokens/new](https://github.com/settings/personal-access-tokens/new).
2. Nombre del token: `Taller de APIs`.
3. Caducidad: 90 días (cuando venza, repites estos pasos).
4. Acceso al repositorio: **Only select repositories** → `generador-apis-gratuitas`.
5. Permisos del repositorio:
   - **Contents**: Read and write
   - **Metadata**: Read (viene solo)
6. Pulsa **Generate token** y copia el valor. GitHub lo enseña una sola vez.

### 2. Pegarla en Vercel

Proyecto → **Settings** → **Environment Variables**.

| Nombre | Valor | Dónde |
| --- | --- | --- |
| `GITHUB_PAT` | la clave que copiaste | Production y Preview |

Guarda y vuelve a desplegar (**Redeploy**) para que el botón la vea.

### 3. Pegarla también en GitHub Actions

Repositorio → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.

| Nombre | Valor |
| --- | --- |
| `GITHUB_PAT` | la misma clave |
| `GEMINI_API_KEY` | clave gratuita de [Google AI Studio](https://aistudio.google.com/apikey) |

`GEMINI_API_KEY` solo vive en GitHub, nunca en la página. Créala en AI Studio sin añadir tarjeta ni facturación. Elige el plan gratuito.

### Opcional

`GENERADOR_SECRETO` en Vercel. Si existe, el formulario pide esa clave y un desconocido no puede llenar el repositorio. Si no existe, cualquiera que abra la página puede generar una API.

## Límites del plan gratis

- Un solo repositorio y un solo proyecto de Vercel (plan Hobby).
- Como máximo una creación a la vez y 12 por hora.
- Cada alta, cambio o borrado de datos guarda un archivo en `data/` usando la clave. No usa una base de datos de pago.
- Esos guardados no vuelven a publicar el sitio.
- Los datos son públicos, igual que el repositorio. No guardes contraseñas ni datos personales.
