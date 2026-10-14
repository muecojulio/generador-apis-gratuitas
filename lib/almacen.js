"use strict";

const gh = require("./github");

function ruta(nombre) {
  return (
    "/repos/" +
    gh.OWNER +
    "/" +
    gh.REPO +
    "/contents/data/" +
    encodeURIComponent(nombre) +
    ".json"
  );
}

async function leer(nombre) {
  const res = await gh.pedir("GET", ruta(nombre) + "?ref=" + encodeURIComponent(gh.BRANCH));
  if (res.status === 404) return { datos: null, sha: null };
  if (res.status === 403 || res.status === 429) {
    const error = new Error("GitHub limitó las lecturas por un momento.");
    error.status = res.status;
    throw error;
  }
  if (res.status !== 200 || !res.json || !res.json.content) {
    const error = new Error("No pude leer los datos guardados.");
    error.status = 502;
    throw error;
  }
  const contenido = Buffer.from(res.json.content || "", "base64").toString("utf8");
  return { datos: JSON.parse(contenido), sha: res.json.sha };
}

async function guardar(nombre, datos, sha) {
  if (!gh.token()) {
    const error = new Error(
      "Falta la clave GITHUB_PAT en Vercel. Puedes consultar, pero todavía no se pueden guardar cambios."
    );
    error.status = 503;
    throw error;
  }
  const res = await gh.pedir("PUT", ruta(nombre), {
    message: "datos: " + nombre,
    content: Buffer.from(JSON.stringify(datos, null, 2) + "\n", "utf8").toString("base64"),
    branch: gh.BRANCH,
    ...(sha ? { sha } : {}),
  });
  if (res.status === 409 || res.status === 422) {
    const error = new Error("Alguien guardó al mismo tiempo. Inténtalo otra vez.");
    error.status = 409;
    throw error;
  }
  if (res.status !== 200 && res.status !== 201) {
    const error = new Error((res.json && res.json.message) || "No pude guardar los datos.");
    error.status = 502;
    throw error;
  }
  return res.json;
}

module.exports = { leer, guardar, token: gh.token };
