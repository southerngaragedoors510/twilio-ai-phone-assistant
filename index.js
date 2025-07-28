const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const VoiceResponse = require('twilio').twiml.VoiceResponse;
const updateCode = require('./routes/dev/update-code'); // 👈 new auto-update route

require('dotenv').config();

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json()); // 👈 needed for GPT update route

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const FORWARD_NUMBER = process.env.TWILIO_FORWARD_NUMBER;

// Register the GPT update route
app.use(updateCode);

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

  // Quick reply shortcut
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

    const reply = gptResponse.data.choices[0].message.content.trim().toLowerCase();

    if (
      reply.includes("talk to someone") ||
      reply.includes("speak to") ||
      reply.includes("transfer") ||
      reply.includes("emergency")
    ) {
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

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`AI Assistant is live on port ${port}`);
});


