"use strict";

const https = require("https");
const repo = require("./repo");

function token() {
  return process.env.GITHUB_PAT || "";
}

function pedir(method, ruta, cuerpo) {
  return new Promise((resolve, reject) => {
    const data = cuerpo ? JSON.stringify(cuerpo) : null;
    const headers = {
      "User-Agent": "generador-apis-gratuitas",
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    const clave = token();
    if (clave) headers.Authorization = "Bearer " + clave;
    if (data) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(data);
    }

    const req = https.request(
      {
        hostname: "api.github.com",
        path: ruta,
        method,
        headers,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const texto = Buffer.concat(chunks).toString("utf8");
          let json = null;
          if (texto) {
            try {
              json = JSON.parse(texto);
            } catch {
              json = { message: texto.slice(0, 300) };
            }
          }
          resolve({ status: res.statusCode || 0, json });
        });
      }
    );
    req.setTimeout(12000, () => req.destroy(new Error("GitHub no respondió a tiempo")));
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

module.exports = { pedir, token, ...repo };
