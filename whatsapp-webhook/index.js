const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// Webhook verification endpoint
app.get('/', (req, res) => {
  const VERIFY_TOKEN = "chathotelwhatsapp"; // You can set this to anything you want

  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token === VERIFY_TOKEN) {
    console.log("WEBHOOK_VERIFIED");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Webhook receiving messages
app.post('/', (req, res) => {
  console.log("📩 Webhook received:", JSON.stringify(req.body, null, 2));
  res.sendStatus(200);
});

app.listen(port, () => {
  console.log(`✅ WhatsApp Webhook is running on port ${port}`);
});
