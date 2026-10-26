# App nativa: Android e iOS

El Taller de APIs **no es una web disfrazada**. La interfaz se empaqueta con
[Capacitor](https://capacitorjs.com/) dentro de proyectos nativos reales:

| Plataforma | Proyecto | Qué se instala |
| --- | --- | --- |
| Android | `android/` (Gradle + Kotlin/Java, SDK 34, minSdk 22) | APK / AAB con icono, splash, barra de estado e háptica |
| iOS | `ios/App/App.xcodeproj` (Swift, iOS 13+) | App de Xcode para App Store o dispositivo |

Una sola interfaz (`index.html` + `script.js` + `assets/estilos.css`) para web,
Android e iOS. Nada de código duplicado: la app carga el paquete local
(`app-web/`) y habla con el servidor del taller por HTTPS.

---

## 1. Compilar en un minuto

```bash
npm ci                 # dependencias (incluye Capacitor, esbuild y sharp)
npm run css            # estilos de la interfaz
npm run app:preparar   # genera app-web/ + puente nativo
npm run app:sync       # copia app-web/ a android/ e ios/
```

Luego, según la plataforma:

```bash
npm run app:android    # abre Android Studio con el proyecto nativo
npm run app:ios        # abre Xcode en un Mac con el proyecto nativo
npm run app:apk        # compila android/app/build/outputs/apk/debug/app-debug.apk
```

Requisitos: Node 22, JDK 21 y el SDK de Android (Android Studio) para Android;
un Mac con Xcode 15+ y CocoaPods para iOS. Todo gratuito.

> El APK es de **depuración** y se instala con «orígenes desconocidos». Para
> publicar en Google Play hay que firmarlo (ver punto 6).

---

## 2. El servidor del taller

La app es el cliente del taller: para **publicar** APIs necesita un servidor
(GitHub Actions + Vercel del propio repositorio). Hay tres formas de fijarlo:

1. **Desde la app:** *Ajustes → Servidor del taller*. La URL se guarda en el
   teléfono y se puede cambiar cuando quieras.
2. **Al preparar la app:** `TALLER_SERVIDOR=https://mi-taller.vercel.app npm run app:preparar`
3. **En GitHub Actions:** variable de repositorio `TALLER_SERVIDOR`; el flujo
   `App Android` la usa al compilar.

El servidor debe incluir ese origen en `TALLER_ORIGENES` **solo si** usas un
dominio propio inusual: la app llega con `Origin: https://localhost` (Android) o
`capacitor://localhost` (iOS), que el servidor ya reconoce como orígenes
nativos de confianza (`lib/http.js`, `ORIGENES_NATIVOS`).

Diseñar, ver la vista previa y consultar el catálogo local funciona **sin
conexión**; publicar y probar endpoints requiere red.

---

## 3. Qué aporta la capa nativa

`app/nativo.js` (empaquetado con esbuild) se ocupa de lo que la web no puede:

- **Barra de estado** adaptada al tema claro u oscuro (Android e iOS).
- **Pantalla de arranque** propia, generada con `npm run app:iconos`.
- **Háptica** al cambiar de pestaña (`@capacitor/haptics`).
- **Compartir** nativo del enlace del taller (`@capacitor/share`).
- **Navegador del sistema** para enlaces externos y para `/docs`, `/privacidad`
  y `/api/...`, que viven en el servidor (`@capacitor/browser`).
- **Botón físico atrás**: vuelve a Resumen y, si ya estás ahí, sale de la app.
- **Red en tiempo real** (`@capacitor/network`) con aviso sin conexión.
- **Teclado** sin barra accesoria sobre el formulario (`@capacitor/keyboard`).

Los iconos y las pantallas de arranque son propios: un SVG de marca convertido a
PNG con `sharp` (`scripts/generar-iconos.mjs`). No se descarga nada de terceros.

---

## 4. Estructura

```
app/nativo.js              puente de Capacitor (solo se empaqueta para la app)
app-web/                   paquete que carga la WebView nativa (generado)
capacitor.config.json      id, nombre y plugins nativos
android/                   proyecto Gradle completo
ios/                       proyecto Xcode completo
assets/iconos/             iconos web, Android (por densidad) y notificación
scripts/construir-app.mjs  genera app-web/ y sincroniza los proyectos
scripts/generar-iconos.mjs iconos y pantallas de arranque
.github/workflows/app-android.yml  compila el APK en cada Release
```

`app-web/` es salida de compilación: no se versiona (está en `.gitignore` y en
`.vercelignore`).

---

## 5. Aspectos nativos ya configurados

- **Solo HTTPS** en Android: `network_security_config.xml` bloquea tráfico en
  claro (salvo `localhost`, para depurar contra el servidor local).
- Sin permisos de cámara, ubicación ni contactos: solo `INTERNET` y
  `ACCESS_NETWORK_STATE`.
- `allowBackup=false`, `supportsRtl=true`, teclado `adjustResize` y splash
  temática con `windowSplashScreenBackground` (Android 12+).
- iOS: `ITSAppUsesNonExemptEncryption=false`, localizaciones `es`/`en` y
  orientaciones estándar.
- Barra inferior de pestañas y `env(safe-area-inset-*)` para el notch.

---

## 6. Firmar y publicar

**Android (Google Play):**

```bash
keytool -genkey -v -keystore taller.jks -keyalg RSA -keysize 2048 \
  -validity 10000 -alias taller
```

Añade la firma a `android/app/build.gradle` (bloque `signingConfigs`) y ejecuta
`./gradlew bundleRelease` para obtener el `.aab`. Guarda el keystore y sus
contraseñas fuera del repositorio.

**iOS (App Store):** abre `ios/App/App.xcworkspace`, define tu *Team* en
*Signing & Capabilities* y usa *Product → Archive*.

---

## 7. Problemas frecuentes

| Síntoma | Causa y solución |
| --- | --- |
| «Servidor sin conexión» en la app | La URL de *Ajustes* no responde. Comprueba que empieza por `https://` y que el despliegue de Vercel está vivo (`/api/salud`). |
| Publicar devuelve 403 | El servidor no reconoce el origen. Actualiza el repositorio: `ORIGENES_NATIVOS` debe incluir `https://localhost` y `capacitor://localhost`. |
| No aparece el APK | Ejecuta `npm run app:sync` antes de compilar; el flujo de GitHub Actions lo hace solo. |
| Cambié el HTML y la app no cambia | Vuelve a ejecutar `npm run app:sync` (webDir se copia en cada sync). |
| Xcode no encuentra Pods | `cd ios/App && pod install` (CocoaPods no viene instalado por defecto). |
