const express = require('express');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const router = express.Router();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const DEPLOY_HOOK_URL = process.env.RENDER_DEPLOY_HOOK_URL;
const DEV_API_KEY = process.env.DEV_API_KEY || 'changeme';

const INDEX_PATH = path.join(__dirname, '..', 'index.js');
const BACKUP_DIR = path.join(__dirname, '..', 'backups');
const LOG_PATH = path.join(__dirname, '..', 'logs', 'update-log.jsonl');

// Ensure backup and log directories exist
fs.mkdirSync(BACKUP_DIR, { recursive: true });
fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });

// ===== Update Index.js =====
router.post('/dev/update-code', async (req, res) => {
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

  // Backup current code
  fs.writeFileSync(backupPath, originalCode);

  try {
    const gptRes = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are a Node.js developer modifying index.js for a Twilio voice assistant. Only return complete working code. Keep Twilio and Express logic intact.'
        },
        { role: 'user', content: `Here is the current code:\n\n${originalCode}` },
        { role: 'user', content: `Please perform this change:\n\n${command}` }
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
      throw new Error('Generated code is missing critical pieces.');
    }

    fs.writeFileSync(INDEX_PATH, newCode);

    const logEntry = {
      timestamp: new Date().toISOString(),
      action: 'update',
      command,
      summary: newCode.slice(0, 250)
    };
    fs.appendFileSync(LOG_PATH, JSON.stringify(logEntry) + '\n');

    await axios.post(DEPLOY_HOOK_URL);

    res.json({ success: true, message: 'Code updated and redeployed.', backup: backupPath });
  } catch (err) {
    console.error('Update error:', err.message);
    res.status(500).json({ error: 'Update failed.', details: err.message });
  }
});

// ===== Rollback =====
router.post('/dev/rollback', async (req, res) => {
  const { filename } = req.body;
  const apiKey = req.headers['x-api-key'];

  if (apiKey !== DEV_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized request.' });
  }

  if (!filename) {
    return res.status(400).json({ error: 'Missing backup filename.' });
  }

  const backupPath = path.join(BACKUP_DIR, filename);

  try {
    const backupCode = fs.readFileSync(backupPath, 'utf-8');
    fs.writeFileSync(INDEX_PATH, backupCode);

    const logEntry = {
      timestamp: new Date().toISOString(),
      action: 'rollback',
      restoredFrom: filename
    };
    fs.appendFileSync(LOG_PATH, JSON.stringify(logEntry) + '\n');

    await axios.post(DEPLOY_HOOK_URL);

    res

