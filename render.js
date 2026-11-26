const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const api = require("./api/index");
const frontendDir = path.join(__dirname, "frontend");

// The existing HTML was written for local development and contains absolute
// localhost URLs. Rewrite them to this Render service before sending the page.
app.use((req, res, next) => {
  const requestedPath = req.path === "/" ? "/index.html" : req.path;
  if (!requestedPath.endsWith(".html")) return next();

  const filePath = path.resolve(frontendDir, requestedPath.slice(1));
  if (!filePath.startsWith(frontendDir + path.sep) || !fs.existsSync(filePath)) {
    return next();
  }

  try {
    let html = fs.readFileSync(filePath, "utf8");
    html = html.replaceAll("http://localhost:3000", "");
    html = html.replaceAll("chamada.paiente", "chamada.paciente");
    html = html.replaceAll("ultimold", "ultmold");
    res.type("html").send(html);
  } catch (error) {
    next(error);
  }
});

app.use(express.static(frontendDir));

// Keep the /api URLs already used by the pages, while mounting the existing
// API's routes (which are defined without the /api prefix).
app.use("/api", (req, res, next) => {
  if (req.path === "/medicacoes/lista") {
    req.url = "/lista-medicacoes";
  } else if (req.method === "GET" && req.path === "/triagem") {
    req.url = "/triagens";
  }
  api(req, res, next);
});

// Also retain the unprefixed routes for local compatibility.
app.use("/", api);

const port = process.env.PORT || 3000;
app.listen(port, "0.0.0.0", () => {
  console.log(`Sentinela rodando na porta ${port}`);
});
