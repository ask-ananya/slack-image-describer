# Slack Image Describer — build & deploy checklist

This is deliberately the *smallest* version that still demos well: reply
"describe" in a thread under an image, get an ephemeral (private) description
back with follow-up buttons. No slash command, no share button, no OCR-mode
switching — add those later only if time allows.

## Part A — Slack app setup (~15 min)

1. Go to https://api.slack.com/apps → **Create New App** → **From an app manifest**.
2. Pick your workspace, paste in `manifest.yml` from this folder, click through to create.
3. Go to **OAuth & Permissions** → **Install to Workspace** → approve.
4. Copy the **Bot User OAuth Token** (starts `xoxb-`) → this is your `SLACK_BOT_TOKEN`.
5. Go to **Basic Information** → **App Credentials** → copy the **Signing Secret** → this is your `SLACK_SIGNING_SECRET`.
6. Invite the bot to a test channel: `/invite @Image Describer`.

Don't set the Event Subscriptions Request URL yet — you need a deployed URL first (Part C).

## Part B — Get a Gemini API key (~2 min)

1. Go to https://aistudio.google.com/app/apikey → create a key.
2. That's your `GEMINI_API_KEY`.
3. Double-check which model name is currently valid for your key at
   https://ai.google.dev — model names change often, and `index.js` has a
   `GEMINI_MODEL` constant at the top you may need to update.

## Part C — Run it locally first (~10 min)

```
cd slack-image-describer
npm install
cp .env.example .env
# fill in .env with your three secrets from Parts A and B
npm start
```

You should see `⚡ Image Describer is running` on port 3000.

To let Slack reach your local server before you deploy anywhere, use a tunnel:

```
npx ngrok http 3000
```

Copy the `https://xxxx.ngrok-free.app` URL it gives you.

## Part D — Point Slack at your server

1. Back in your Slack app config → **Event Subscriptions** → toggle on →
   Request URL = `https://<your-url>/slack/events` → it should show "Verified".
2. **Interactivity & Shortcuts** → toggle on → same Request URL.
3. Save changes, reinstall the app if prompted.

## Part E — Test it

1. Post any image in your test channel.
2. Reply to that message (creating a thread) with the word `describe`.
3. You should get a private (ephemeral) reply — only you can see it — with a
   short description and up to 3 follow-up buttons.
4. Click a follow-up button → you should get another private reply with that answer.

## Part F — Deploy somewhere permanent (before recording your demo video)

ngrok URLs expire/change, which will break your submission if a judge tests it
after your session ends. Deploy to something persistent:

- **Railway** (railway.app) or **Render** (render.com) are the fastest for a
  Node app like this — connect your GitHub repo, add the three env vars in
  their dashboard, deploy, then update the Event Subscriptions / Interactivity
  Request URLs in Slack to the new permanent URL.

## Known cut corners (be upfront about these in your submission)

- Only handles one image per trigger, and only images (not PDFs/other files).
- No slash command or message-shortcut trigger yet — reply-only.
- No OCR-priority mode for screenshots vs. meme-tone mode — single prompt for now.
- No "share with channel" option — everything is ephemeral.
- Follow-up answers are static (generated once, not truly conversational).

Being explicit about what's intentionally out of scope for a 2-day build reads
much better to judges than pretending it's more finished than it is.
