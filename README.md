# Image Describer

A Slack agent that describes images for blind and low-vision users — built for the **Slack Agent Builder Challenge** (Slack Agent for Good track).

## The problem

Slack conversations are full of images — screenshots, memes, diagrams, photos — but none of that content is accessible to blind or low-vision teammates using screen readers. A screen reader announces "image attached" and stops there. Image Describer closes that gap by turning any image in a thread into a clear, spoken-friendly description, on demand, without cluttering the channel for everyone else.

## How it works

1. Someone posts an image in a Slack channel.
2. A user replies to that message in a thread with the word `describe`.
3. The bot fetches the parent message, finds the image, and downloads it.
4. It calls a `describe_image` tool exposed by a custom **MCP (Model Context Protocol) server**, which sends the image to **Gemini Vision** and gets back a structured description plus three tailored follow-up questions.
5. The bot replies **ephemerally** (visible only to the person who asked) with:
   - A plain-language description, written to be the first thing a screen reader announces
   - Up to three follow-up buttons (e.g. "Is there any text in the image?", "What is the person's expression?") for more detail on demand

Clicking a follow-up button sends another private reply with that specific answer — so a user can drill into exactly the detail they need, without a wall of text up front.

## Architecture

```
┌─────────────┐      "describe"       ┌──────────────────┐
│   Slack      │ ───────────────────▶ │   index.js        │
│  (channel/   │                       │  (Bolt app,        │
│   thread)    │ ◀─────────────────── │   MCP client)       │
└─────────────┘   ephemeral reply +    └─────────┬──────────┘
                    follow-up buttons              │
                                          MCP tool call
                                       (stdio transport)
                                                    │
                                                    ▼
                                          ┌──────────────────┐
                                          │  mcp-server.mjs   │
                                          │  (MCP server,      │
                                          │  describe_image     │
                                          │  tool)               │
                                          └─────────┬──────────┘
                                                    │
                                              Gemini Vision API
                                                    │
                                                    ▼
                                          Structured JSON:
                                          { description, followups }
```

- **`index.js`** — A Slack Bolt app. Listens for thread replies, handles Slack events and button interactions, and acts as an **MCP client**.
- **`mcp-server.mjs`** — A standalone MCP server exposing one tool, `describe_image`. This is the genuine MCP server integration: `index.js` spawns it as a child process and communicates over the standard MCP stdio transport, rather than calling Gemini directly.
- **Gemini Vision** (`gemini-flash-latest`) — Does the actual image understanding, prompted to return a short description plus three contextual follow-up Q&A pairs as JSON.

## Tech used

- **MCP server integration** — the core required technology for this build. `mcp-server.mjs` is a real MCP server; `index.js` is a real MCP client connecting to it over stdio.
- **Slack Bolt (Node.js)** for the Slack app itself (events, ephemeral messages, interactive buttons).
- **Google Gemini Vision API** for image understanding.

## Setup

See the full local-development and deployment checklist in this repo for step-by-step instructions on Slack app configuration, environment variables, running locally with a tunnel, and deploying to a persistent host.

## Known limitations (by design, given the timeline)

- Handles one image per trigger, and only image files (not PDFs or other attachments).
- Reply-only trigger (`describe` in a thread) — no slash command or message shortcut yet.
- All responses are ephemeral — no "share with channel" option yet.
- Follow-up answers are generated once per image, not a live back-and-forth conversation.

Being upfront about scope: this was built end-to-end, including learning MCP for the first time, within the hackathon window. The above are the deliberate corners cut to ship something that works reliably over trying to do everything at once.

## Why this matters

Accessibility tooling is often bolted on as an afterthought. Image Describer is small on purpose — it does one thing (describe an image, on request, privately) well, inside the tool teams already use every day, rather than asking anyone to adopt a separate accessibility app.
