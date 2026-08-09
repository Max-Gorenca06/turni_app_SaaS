import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import webpush from "web-push";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());

// === PUSH NOTIFICATIONS SETUP ===
// Queste sono le chiavi VAPID generate per l'app. (Nel mondo reale andrebbero in variabili d'ambiente)
const publicVapidKey = "BLAvFrPhZKkFEPt_3FAdMcPFB8aCYoF1TiJ354yaVzVuxHOcq_g6IHECTONm4j4fOBiLX4pwKy1ObLjKAjcYQE4";
const privateVapidKey = "UX6bsEZv55Mtn4-EX8uMN-3SzLWwNM7R4OtF9Obj9_I";

webpush.setVapidDetails(
  "mailto:tuo.indirizzo@email.com",
  publicVapidKey,
  privateVapidKey
);

// Endpoint API per inviare una notifica (può essere chiamato ad es. dal pannello Admin)
app.post("/api/send-push", async (req, res) => {
  const { subscription, title, body } = req.body;
  
  const payload = JSON.stringify({
    title: title || "Nuovo Avviso",
    body: body || "Hai una nuova notifica",
    url: "/app_dipendente.html"
  });

  try {
    await webpush.sendNotification(subscription, payload);
    res.status(200).json({ success: true });
  } catch (err) {
    console.error("Errore nell'invio della notifica:", err);
    res.status(500).json({ error: "Errore nell'invio della notifica push" });
  }
});
// ================================

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
