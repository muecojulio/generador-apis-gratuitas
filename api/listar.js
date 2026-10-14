"use strict";

const gh = require("../lib/github");

function enviar(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(data));
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    enviar(res, 204, {});
    return;
  }
  if (req.method !== "GET") {
    enviar(res, 405, { error: "Usa GET." });
    return;
  }
  try {
    const respuesta = await gh.pedir(
      "GET",
      "/repos/" + gh.OWNER + "/" + gh.REPO + "/contents/catalogo.json?ref=" + encodeURIComponent(gh.BRANCH)
    );
    if (respuesta.status !== 200 || !respuesta.json || !respuesta.json.content) {
      enviar(res, 200, { apis: [] });
      return;
    }
    const json = JSON.parse(Buffer.from(respuesta.json.content, "base64").toString("utf8"));
    enviar(res, 200, { apis: json.apis || [] });
  } catch {
    enviar(res, 200, { apis: [] });
  }
};
