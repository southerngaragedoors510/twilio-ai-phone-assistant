const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const VoiceResponse = require('twilio').twiml.VoiceResponse;

require('dotenv').config();

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const FORWARD_NUMBER = process.env.TWILIO_FORWARD_NUMBER;

app.post('/voice', async (req, res) => {
  const userInput = req.body.SpeechResult || req.body.Body || '';
  const twiml = new VoiceResponse();

  if (!userInput) {
    twiml.say("I'm sorry, I didn't catch that. Could you please repeat?");
    return res.type('text/xml').send(twiml.toString());
  }

  try {
    const gptResponse = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: "gpt-4",
      messages: [
        { role: "system", content: "You are a helpful and professional garage door service assistant. Be concise and respectful." },
        { role: "user", content: userInput }
      ]
    }, {
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const reply = gptResponse.data.choices[0].message.content.trim().toLowerCase();

    if (reply.includes("talk to someone") || reply.includes("transfer") || reply.includes("speak to") || reply.includes("emergency")) {
      twiml.say("Please hold while I transfer you to someone who can help.");
      twiml.dial(FORWARD_NUMBER);
    } else {
      twiml.say(reply);
    }

    res.type('text/xml').send(twiml.toString());
  } catch (error) {
    console.error("Error processing GPT response:", error.message);
    twiml.say("Sorry, there was an issue understanding your request. Forwarding you now.");
    twiml.dial(FORWARD_NUMBER);
    res.type('text/xml').send(twiml.toString());
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`AI Assistant listening on port ${port}`);
});
