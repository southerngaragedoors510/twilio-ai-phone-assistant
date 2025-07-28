const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const VoiceResponse = require('twilio').twiml.VoiceResponse;

require('dotenv').config();

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const FORWARD_NUMBER = process.env.TWILIO_FORWARD_NUMBER;

// Route for initial voice request
app.post('/voice', (req, res) => {
  const twiml = new VoiceResponse();

  const gather = twiml.gather({
    input: 'speech',
    timeout: 5,
    speechTimeout: 'auto',
    action: '/process',
    method: 'POST'
  });

  gather.say("Thanks for calling Southern Garage Doors. How can I help you today?");
  res.type('text/xml').send(twiml.toString());
});

// Route to process speech result
app.post('/process', async (req, res) => {
  const userInput = req.body.SpeechResult || '';
  const twiml = new VoiceResponse();

  if (!userInput) {
    twiml.say("I'm sorry, I didn't catch that. Transferring you to someone now.");
    twiml.dial(FORWARD_NUMBER);
    return res.type('text/xml').send(twiml.toString());
  }

  try {
    const gptResponse = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: "gpt-4",
      messages: [
        { role: "system", content: "You are a helpful garage door assistant. Be professional, concise, and helpful." },
        { role: "user", content: userInput }
      ]
    }, {
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const reply = gptResponse.data.choices[0].message.content.toLowerCase();

    if (reply.includes("talk to someone") || reply.includes("emergency") || reply.includes("transfer")) {
      twiml.say("Transferring you now.");
      twiml.dial(FORWARD_NUMBER);
    } else {
      twiml.say(reply);
    }

    res.type('text/xml').send(twiml.toString());
  } catch (error) {
    console.error("GPT error:", error.message);
    twiml.say("Sorry, there was a problem. Forwarding your call.");
    twiml.dial(FORWARD_NUMBER);
    res.type('text/xml').send(twiml.toString());
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`AI Assistant live on port ${port}`);
});

