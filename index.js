const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { twiml: { VoiceResponse } } = require('twilio');

require('dotenv').config();

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.json());

// ENV
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const FORWARD_NUMBER = process.env.TWILIO_FORWARD_NUMBER;
const DEPLOY_HOOK_URL = process.env.RENDER_DEPLOY_HOOK_URL;
const DEV_API_KEY = process.env.DEV_API_KEY || 'changeme';

// PATHS
const INDEX_PATH = path.join(__dirname, 'index.js');
const BACKUP_DIR = path.join(__dirname, 'backups');
const LOG_PATH = path.join(__dirname, 'logs', 'update-log.jsonl');

// Ensure folders exist
fs.mkdirSync(BACKUP_DIR, { recursive: true });
fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });

/**
 * Main Twilio voice entry point
 */
app.post('/voice', (req, res) => {
  const response = new VoiceResponse();
  const gather = response.gather({
    input: 'speech',
    timeout: 5,
    speechTimeout: 'auto',
    action: '/process',
    method: 'POST'
  });

  gather.say({ voice: 'Polly.Joanna' }, "Thanks for calling Southern Garage Doors. How can I help you today?");
  res.type('text/xml').send(response.toString());
});

/**
 * Process user speech
 */
app.post('/process', async (req, res) => {
  const input = req.body.SpeechResult || '';
  const response = new VoiceResponse();

  if (!input) {
    response.say({ voice: 'Polly.Joanna' }, "I'm sorry, I didn't catch that. Transferring you now.");
    response.dial(FORWARD_NUMBER);
    return res.type('text/xml').send(response.toString());
  }

  // Shortcut
  if (input.toLowerCase().includes('spring')) {
    const gather = response.gather({
      input: 'speech',
      timeout: 10,
      speechTimeout: 'auto',
      action: '/process',
      method: 'POST'
    });
    gather.say({ voice: 'Polly.Joanna' }, "A standard spring replacement is $599. Is there anything else I can help you with?");
    response.redirect('/voice');
    return res.type('text/xml').send(response.toString());
  }

  try {
    const gptRes = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: 'You are a professional garage door assistant. Be concise and helpful.' },
        { role: 'user', content: input }
      ]
    }, {
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const reply = gptRes.data.choices[0].message.content.toLowerCase();

    if (reply.includes('transfer') || reply.includes('speak to')) {
      response.say({ voice: 'Polly.Joanna' }, "Transferring you now.");
      response.dial(FORWARD_NUMBER);
    } else {
      const gather = response.gather({
        input: 'speech',
        timeout: 10,
        speechTimeout: 'auto',
        action: '/process',
        method: 'POST'
      });
      gather.say({ voice: 'Polly.Joanna' }, `${reply}. Is there anything else I can help you with?`);
      response.redirect('/voice');
    }

    res.type('text/xml').send(response.toString());
  } catch (err) {
    console.error("GPT error:", err.message);
    response.say({ voice: 'Polly.Joanna' }, "Something went wrong. Transferring you now.");
    response.dial(FORWARD_NUMBER);
    res.type('text/xml').send(response.toString());
  }
});

/**
 * Self-update assistant
 */
app.post('/dev/update-code', async (req, res) => {
  const { command } = req.body;
  const apiKey = req.headers['x-api-key'];

  if (apiKey !== DEV_API_KEY) return res.status(401).json({ error: 'Unauthorized request.' });
  if (!command) return res.status(400).json({ error: 'Missing command.' });

  const originalCode = fs.readFileSync(INDEX_PATH, 'utf-8');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(BACKUP_DIR, `index-${timestamp}.js`);

  fs.writeFileSync(backupPath, originalCode);

  try {
    const gptRes = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4',
      messages: [
        { role: 'system', content: 'You are modifying index.js for a Twilio Express app. Return only full valid JavaScript code. It must include an Express app and Twilio routes.' },
        { role: 'user', content: `Here is the current code:\n\n${originalCode}` },
        { role: 'user', content: `Please make this change:\n\n${command}` }
      ],
      temperature: 0.3
    }, {
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const newCode = gptRes.data.choices[0].message.content.trim();

    if (!newCode.includes('express') || !newCode.includes('app.listen')) {
      throw new Error("GPT output invalid — critical lines missing.");
    }

    fs.writeFileSync(INDEX_PATH, newCode);

    const logEntry = {
      timestamp: new Date().toISOString(),
      command,
      summary: newCode.slice(0, 300)
    };
    fs.appendFileSync(LOG_PATH, JSON.stringify(logEntry) + '\n');

    await axios.post(DEPLOY_HOOK_URL);
    res.json({ success: true, message: 'Code updated and redeployment triggered.', backup: backupPath });
  } catch (err) {
    console.error("Update error:", err.message);
    res.status(500).json({ error: 'Update failed.', details: err.message });
  }
});

/**
 * Rollback handler
 */
app.post('/dev/rollback', async (req, res) => {
  const { filename } = req.body;
  const apiKey = req.headers['x-api-key'];

  if (apiKey !== DEV_API_KEY) return res.status(401).json({ error: 'Unauthorized request.' });
  if (!filename) return res.status(400).json({ error: 'Missing filename.' });

  try {
    const file = path.join(BACKUP_DIR, filename);
    const backup = fs.readFileSync(file, 'utf-8');
    fs.writeFileSync(INDEX_PATH, backup);

    const logEntry = {
      timestamp: new Date().toISOString(),
      action: 'rollback',
      restoredFrom: filename
    };
    fs.appendFileSync(LOG_PATH, JSON.stringify(logEntry) + '\n');

    await axios.post(DEPLOY_HOOK_URL);
    res.json({ success: true, message: `Rolled back to ${filename}` });
  } catch (err) {
    console.error("Rollback error:", err.message);
    res.status(500).json({ error: 'Rollback failed.', details: err.message });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`✅ AI Assistant is live on port ${port}`);
});

