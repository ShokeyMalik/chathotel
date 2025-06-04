// whatsapp-webhook/index.js

import express from 'express';
import bodyParser from 'body-parser';
import axios from 'axios';

const VERIFY_TOKEN = 'chathotelwhatsapp';
const MCP_SERVER_URL = 'https://chathotel-production.onrender.com/webhook'; // Change this to your MCP WhatsApp server's URL

const app = express();
app.use(bodyParser.json());

// webhook route to receive incoming WhatsApp messages
app.post('/webhook', async (req, res) => {
  console.log('📩 Received WhatsApp message:', req.body);
  res.sendStatus(200);
});

/**
 * GET handler for webhook verification (required by Meta)
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

/**
 * POST handler for WhatsApp messages
 */
app.post('/', async (req, res) => {
  // Acknowledge to Meta quickly
  res.sendStatus(200);

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

          // Route to your MCP server (hotel-whatsapp)
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
