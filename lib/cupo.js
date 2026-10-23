"use strict";

/**
 * Cupo de peticiones en memoria (ventana fija).
 *
 * Sirve para que un bot no pueda llenar el repositorio de APIs ni machacar los
 * servicios públicos que usamos. Es una defensa de mejor esfuerzo: cada
 * instancia de Vercel lleva su propia cuenta y, si se enfría, empieza de cero.
 * Para el taller (una creación a la vez y 12 por hora) es más que suficiente.
 *
 * Variables:
 *   TALLER_CUPO_HORA   creaciones por IP y hora (por defecto 12)
 *   TALLER_CUPO_MIN    peticiones por IP y minuto a rutas sensibles (por defecto 30)
 */

const ventanas = new Map();
const MAX_VENTANAS = 5000;

function claveDe(req, sufijo) {
  const cabeceras = (req && req.headers) || {};
  const adelante = cabeceras["x-forwarded-for"] || cabeceras["x-real-ip"] || "";
  const crudo = Array.isArray(adelante) ? adelante[0] : String(adelante).split(",")[0].trim();
  const ip = crudo || (req && req.socket && req.socket.remoteAddress) || "local";
  return sufijo + ":" + ip;
}

/**
 * Cuenta un intento. Devuelve { ok, restante, reinicio, limite }.
 * @param {object} req
 * @param {string} sufijo nombre del cubo ("generar", "probar"…)
 * @param {number} maximo intentos permitidos en la ventana
 * @param {number} ventanaMs duración de la ventana
 */
function consumir(req, sufijo, maximo, ventanaMs) {
  const clave = claveDe(req, sufijo);
  const limite = Math.max(1, Number(maximo) || 1);
  const duracion = Math.max(1000, Number(ventanaMs) || 60 * 60 * 1000);
  const marca = Date.now();
  let cubo = ventanas.get(clave);
  if (!cubo || cubo.expira <= marca) {
    cubo = { usados: 0, expira: marca + duracion };
    ventanas.set(clave, cubo);
  }
  cubo.usados += 1;
  if (ventanas.size > MAX_VENTANAS) {
    for (const [otra, datos] of ventanas) {
      if (datos.expira <= marca || ventanas.size > MAX_VENTANAS) ventanas.delete(otra);
      else break;
    }
  }
  const restante = Math.max(0, limite - cubo.usados);
  return {
    ok: cubo.usados <= limite,
    restante,
    limite,
    reinicio: new Date(cubo.expira).toISOString(),
    segundos: Math.max(1, Math.ceil((cubo.expira - marca) / 1000)),
  };
}

function limpiar() {
  ventanas.clear();
}

module.exports = { consumir, limpiar, claveDe };
