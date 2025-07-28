const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const VoiceResponse = require('twilio').twiml.VoiceResponse;

require('dotenv').config();

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const FORWARD_NUMBER = process.env.TWILIO_FORWARD_NUMBER;
const DEPLOY_HOOK_URL = process.env.RENDER_DEPLOY_HOOK_URL;
const DEV_API_KEY = process.env.DEV_API_KEY || 'changeme';

const INDEX_PATH = path.join(__dirname, 'index.js');
const BACKUP_DIR = path.join(__dirname, 'backups');
const LOG_PATH = path.join(__dirname, 'logs', 'update-log.jsonl');

// Ensure backup and log dirs exist
fs.mkdirSync(BACKUP_DIR, { recursive: true });
fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });

app.post('/voice', (req, res) => {
  const twiml = new VoiceResponse();
  const gather = twiml.gather({
    input: 'speech',
    timeout: 5,
    speechTimeout: 'auto',
    action: '/process',
    method: 'POST'
  });
  gather.say({ voice: 'Polly.Joanna' }, "Thanks for calling Southern Garage Doors. How can I help you today?");
  res.type('text/xml').send(twiml.toString());
});

app.post('/process', async (req, res) => {
  const userInput = req.body.SpeechResult || '';
  const twiml = new VoiceResponse();

  if (!userInput) {
    twiml.say({ voice: 'Polly.Joanna' }, "I'm sorry, I didn't catch that. Transferring you now.");
    twiml.dial(FORWARD_NUMBER);
    return res.type('text/xml').send(twiml.toString());
  }

  if (userInput.toLowerCase().includes('spring')) {
    const gather = twiml.gather({
      input: 'speech',
      timeout: 10,
      speechTimeout: 'auto',
      action: '/process',
      method: 'POST'
    });
    gather.say({ voice: 'Polly.Joanna' }, "A standard spring replacement is $599. Is there anything else I can help you with?");
    twiml.redirect('/voice');
    return res.type('text/xml').send(twiml.toString());
  }

  try {
    const gptResponse = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "You are a helpful and professional garage door assistant. Be concise, courteous, and helpful." },
        { role: "user", content: userInput }
      ]
    }, {
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const reply = gptResponse.data.choices[0].message.content.trim();

    if (reply.toLowerCase().includes("talk to someone") || reply.toLowerCase().includes("transfer")) {
      twiml.say({ voice: 'Polly.Joanna' }, "Transferring you now.");
      twiml.dial(FORWARD_NUMBER);
    } else {
      const gather = twiml.gather({
        input: 'speech',
        timeout: 10,
        speechTimeout: 'auto',
        action: '/process',
        method: 'POST'
      });
      gather.say({ voice: 'Polly.Joanna' }, `${reply}. Is there anything else I can help you with?`);
      twiml.redirect('/voice');
    }

    res.type('text/xml').send(twiml.toString());
  } catch (error) {
    console.error("GPT error:", error.message);
    twiml.say({ voice: 'Polly.Joanna' }, "Sorry, something went wrong. I'm transferring you now.");
    twiml.dial(FORWARD_NUMBER);
    res.type('text/xml').send(twiml.toString());
  }
});

// GPT-Powered Self-Update Endpoint
app.post('/dev/update-code', async (req, res) => {
  const { command } = req.body;
  const apiKey = req.headers['x-api-key'];

  if (apiKey !== DEV_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized request.' });
  }

  if (!command) {
    return res.status(400).json({ error: 'Missing command input.' });
  }

  const originalCode = fs.readFileSync(INDEX_PATH, 'utf-8');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(BACKUP_DIR, `index-${timestamp}.js`);

  fs.writeFileSync(backupPath, originalCode);

  try {
    const gptRes = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are a Node.js developer modifying index.js for a Twilio voice assistant. The file MUST stay functional and start an Express app with the correct Twilio routes.'
        },
        { role: 'user', content: `Here is the current code:\n\n${originalCode}` },
        { role: 'user', content: `Please


