const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const VoiceResponse = require('twilio').twiml.VoiceResponse;
const path = require('path');
require('dotenv').config();

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.json());

// Load dev routes
const updateRoutes = require('./routes/dev/update-code');
app.use(updateRoutes);

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const FORWARD_NUMBER = process.env.TWILIO_FORWARD_NUMBER;

// Entry point for the call
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

// Process the spoken input
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
    const gptRe
