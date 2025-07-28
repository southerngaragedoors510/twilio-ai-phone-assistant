# Twilio AI Phone Assistant

This project uses Twilio, OpenAI GPT-4, and Render to build a voice assistant that:
- Answers customer calls
- Handles scheduling or inquiries
- Responds using natural language
- Forwards to a real number if needed

## Deployment

1. Upload files to GitHub.
2. Deploy on [Render.com](https://render.com).
3. Add environment variables:
   - `OPENAI_API_KEY`
   - `TWILIO_FORWARD_NUMBER`
4. Set Twilio webhook to `https://your-render-url.onrender.com/voice`

## Triggering Forward

The assistant will forward calls if it hears:
- "talk to someone"
- "transfer me"
- "emergency"
