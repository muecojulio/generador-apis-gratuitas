/*
 * Puente nativo del Taller de APIs (Android + iOS).
 *
 * Este archivo NO se carga en la web: `scripts/construir-app.mjs` lo empaqueta
 * con esbuild y lo copia a la app de Capacitor. Aquí viven las APIs reales del
 * dispositivo: barra de estado, pantalla de arranque, háptica, compartir,
 * navegador del sistema, teclado, red y botón atrás.
 */

import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { StatusBar, Style } from "@capacitor/status-bar";
import { SplashScreen } from "@capacitor/splash-screen";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { Share } from "@capacitor/share";
import { Browser } from "@capacitor/browser";
import { Keyboard } from "@capacitor/keyboard";
import { Network } from "@capacitor/network";

const COLOR_BARRA_CLARA = "#ffffff";
const COLOR_BARRA_OSCURA = "#0f172a";

let ayudas = {};

function esEnlaceExterno(url) {
  try {
    const destino = new URL(url, location.href);
    if (destino.protocol !== "http:" && destino.protocol !== "https:") return false;
    return destino.origin !== location.origin;
  } catch {
    return false;
  }
}

/** Rutas del taller que en la app viven en el servidor, no en el paquete local. */
function esRutaRemota(url) {
  try {
    const destino = new URL(url, location.href);
    if (destino.origin !== location.origin) return false;
    return /^\/(docs|privacidad|api)(\/|$)/.test(destino.pathname);
  } catch {
    return false;
  }
}

async function abrirFuera(url) {
  try {
    await Browser.open({ url, presentationStyle: "fullscreen" });
  } catch {
    window.open(url, "_system");
  }
}

async function actualizarBarra(oscuro) {
  try {
    await StatusBar.setStyle({ style: oscuro ? Style.Dark : Style.Light });
    if (Capacitor.getPlatform() === "android") {
      await StatusBar.setBackgroundColor({ color: oscuro ? COLOR_BARRA_OSCURA : COLOR_BARRA_CLARA });
    }
  } catch {
    /* el plugin no está disponible en este entorno */
  }
}

const puente = {
  esNativo: true,
  plataforma: Capacitor.getPlatform(),
  async vibrar() {
    try {
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch {
      /* sin háptica */
    }
  },
  async compartir(datos) {
    await Share.share({
      title: (datos && datos.titulo) || "Taller de APIs",
      text: (datos && datos.texto) || "",
      url: (datos && datos.url) || "",
      dialogTitle: "Compartir el Taller de APIs",
    });
  },
  actualizarBarra,
};

window.TALLER_NATIVO = puente;

export async function iniciarNativo(opciones) {
  ayudas = opciones || {};

  await actualizarBarra(document.documentElement.classList.contains("tema-oscuro"));

  try {
    await Keyboard.setAccessoryBarVisible({ isVisible: false });
  } catch {
    /* opcional */
  }

  // Botón físico «atrás»: primero vuelve al inicio, después sale de la app.
  App.addListener("backButton", ({ canGoBack }) => {
    if (typeof ayudas.panel === "function" && ayudas.panel() !== "inicio") {
      if (typeof ayudas.irA === "function") ayudas.irA("inicio");
      return;
    }
    if (canGoBack) {
      history.back();
      return;
    }
    App.exitApp();
  });

  // Estado de la red en tiempo real.
  let conectado = true;
  try {
    const estado = await Network.getStatus();
    conectado = estado.connected;
    if (typeof ayudas.alCambiarRed === "function") ayudas.alCambiarRed(conectado);
  } catch {
    /* opcional */
  }
  Network.addListener("networkStatusChange", (estado) => {
    conectado = estado.connected;
    if (typeof ayudas.alCambiarRed === "function") ayudas.alCambiarRed(conectado);
  });

  // Enlaces: lo externo y las páginas del servidor se abren en el navegador.
  document.addEventListener(
    "click",
    (evento) => {
      const ancla = evento.target instanceof Element ? evento.target.closest("a[href]") : null;
      if (!ancla) return;
      const href = ancla.getAttribute("href") || "";
      if (!href || href.startsWith("mailto:") || href.startsWith("tel:")) return;

      let remota = "";
      if (esEnlaceExterno(href)) {
        remota = new URL(href, location.href).href;
      } else if (esRutaRemota(href)) {
        const servidor = typeof ayudas.servidor === "function" ? ayudas.servidor() : "";
        if (servidor) remota = new URL(href, servidor).href;
      }
      if (!remota) return;
      evento.preventDefault();
      abrirFuera(remota);
    },
    true
  );

  // La pantalla de arranque se retira cuando la interfaz ya está montada.
  try {
    await SplashScreen.hide({ fadeOutDuration: 220 });
  } catch {
    /* opcional */
  }

  return {
    plataforma: Capacitor.getPlatform(),
    red: conectado ? "En línea" : "Sin conexión",
  };
}
