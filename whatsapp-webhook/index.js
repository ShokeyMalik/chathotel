// whatsapp-webhook/index.js

import express from 'express';
import bodyParser from 'body-parser';
import axios from 'axios';

const VERIFY_TOKEN = 'chathotelwhatsapp';
const MCP_SERVER_URL = 'https://chathotel-production.onrender.com/webhook'; // Your MCP server endpoint

const app = express();
app.use(bodyParser.json());

/**
 * POST: Handles WhatsApp webhook messages from Meta
 */
app.post('/webhook', async (req, res) => {
  console.log('📩 Received WhatsApp message:', req.body);
  res.sendStatus(200); // Acknowledge quickly to Meta

  const body = req.body;

  if (body?.object === 'whatsapp_business_account') {
    const entries = body.entry || [];

    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        const messages = change.value?.messages || [];

        for (const msg of messages) {
          const payload = {
            from: msg.from,
            message: msg.text?.body || '',
            type: msg.type,
            timestamp: msg.timestamp,
            phone_number_id: change.value.metadata?.phone_number_id
          };

          try {
            await axios.post(`${MCP_SERVER_URL}/webhook`, payload);
            console.log('✅ Forwarded message to MCP:', payload);
          } catch (err) {
            console.error('❌ Failed to forward to MCP:', err.message);
          }
        }
      }
    }
  }
});

/**
 * GET: Webhook verification for Meta (GET request with token + challenge)
 */
app.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  return res.status(403).send('Verification failed');
});

// ✅ Critical for Render – Listen on 0.0.0.0
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 WhatsApp Webhook server running on port ${PORT}`);
});
