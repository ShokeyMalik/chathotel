// whatsapp-webhook/index.js

import express from 'express';
import bodyParser from 'body-parser';
import axios from 'axios';

const VERIFY_TOKEN = 'chathotelwhatsapp';
const MCP_SERVER_URL = 'https://chathotel-production.onrender.com/webhook';

const app = express();
app.use(bodyParser.json());

// ✅ Health check route
app.get('/ping', (req, res) => {
  res.status(200).send('WhatsApp Webhook is alive 🟢');
});

// ✅ Webhook Verification for Meta (GET)
app.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token === VERIFY_TOKEN) {
    console.log('✅ Webhook verified successfully');
    return res.status(200).send(challenge);
  }

  console.warn('❌ Webhook verification failed');
  return res.status(403).send('Verification failed');
});

// ✅ Webhook POST – Incoming WhatsApp Messages
app.post('/', async (req, res) => {
  console.log('📩 Incoming webhook POST from Meta:', JSON.stringify(req.body, null, 2));
  res.sendStatus(200); // respond quickly to avoid retry

  const body = req.body;

  if (!body?.object) {
    console.warn('⚠️ No object found in webhook payload');
    return;
  }

  if (body.object === 'whatsapp_business_account') {
    const entries = body.entry || [];

    for (const entry of entries) {
      const changes = entry.changes || [];

      for (const change of changes) {
        const messages = change.value?.messages || [];

        if (!messages.length) {
          console.warn('⚠️ No messages found in change');
        }

        for (const msg of messages) {
          const payload = {
            from: msg.from,
            message: msg.text?.body || '',
            type: msg.type,
            timestamp: msg.timestamp,
            phone_number_id: change.value.metadata?.phone_number_id
          };

          if (!msg.text?.body && msg.type !== 'text') {
            console.warn('⚠️ Received non-text message:', JSON.stringify(msg, null, 2));
          }

          console.log('📤 Forwarding to MCP:', payload);

          try {
            const response = await axios.post(`${MCP_SERVER_URL}/webhook`, payload);
            console.log('✅ Sent to MCP successfully:', response.status);
          } catch (err) {
            if (err.response) {
              console.error(`❌ MCP Error [${err.response.status}]:`, err.response.data);
            } else {
              console.error('❌ Failed to forward to MCP:', err.message);
            }
          }
        }
      }
    }
  } else {
    console.warn('⚠️ Webhook received unknown object type:', body.object);
  }
});

// ✅ Start server on Render-compatible IP
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 WhatsApp Webhook server running on port ${PORT}`);
});
// Export app for testing