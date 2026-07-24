import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Serve static files from the root directory
app.use(express.static(__dirname));

// Clean URLs for the request page
app.get("/timbratore", (req, res) => {
  res.sendFile(path.join(__dirname, "timbratore.html"));
});
app.get("/timbratore.html", (req, res) => {
  res.sendFile(path.join(__dirname, "timbratore.html"));
});

app.get("/richieste", (req, res) => {
  res.sendFile(path.join(__dirname, "richiesta_assenze.html"));
});

app.get("/richiesta_assenze", (req, res) => {
  res.sendFile(path.join(__dirname, "richiesta_assenze.html"));
});

app.get("/richiesta_assenze.html", (req, res) => {
  res.sendFile(path.join(__dirname, "richiesta_assenze.html"));
});

// For all other requests, serve index.html
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
