// mcp-server.mjs
//
// A minimal MCP server exposing one tool: describe_image.
// It takes a base64-encoded image + mimeType, sends it to Gemini Vision,
// and returns a JSON string (as the tool's text content) shaped like:
//   { "description": "...", "followups": [ { "question": "...", "answer": "..." }, ... ] }
//
// Run standalone for testing:
//   node mcp-server.mjs
// (it will just sit there waiting for stdio input — that's normal, it's
// meant to be spawned by index.js, not run directly by a human)

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import fetch from 'node-fetch';

const GEMINI_MODEL = 'gemini-flash-latest';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error('[mcp-server] GEMINI_API_KEY is not set — describe_image calls will fail.');
}

const server = new Server(
  { name: 'image-describer-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

// ---- Tool list ----
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'describe_image',
      description:
        'Describes an image for a blind or low-vision Slack user. Returns a short description plus up to 3 follow-up Q&A pairs as JSON.',
      inputSchema: {
        type: 'object',
        properties: {
          imageBase64: { type: 'string', description: 'Base64-encoded image bytes' },
          mimeType: { type: 'string', description: 'e.g. image/png, image/jpeg' },
        },
        required: ['imageBase64', 'mimeType'],
      },
    },
  ],
}));

// ---- Tool call handler ----
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== 'describe_image') {
    throw new Error(`Unknown tool: ${request.params.name}`);
  }

  const { imageBase64, mimeType } = request.params.arguments;

  const prompt = `You are describing an image for a blind or low-vision user.
Respond with ONLY valid JSON, no markdown fences, no extra text, in exactly this shape:
{
  "description": "A concise, plain-language description of the image (1-3 sentences).",
  "followups": [
    { "question": "Is there any text in the image?", "answer": "..." },
    { "question": "What is the person's expression?", "answer": "..." },
    { "question": "What style is the drawing?", "answer": "..." }
  ]
}
Tailor the 3 follow-up questions to what's actually useful for this specific image
(they don't have to be the examples above — pick whatever's most relevant).
Keep each answer under 300 characters.`;

  const body = {
    contents: [
      {
        parts: [
          { text: prompt },
          { inline_data: { mime_type: mimeType, data: imageBase64 } },
        ],
      },
    ],
  };

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Gemini API error ${resp.status}: ${errText}`);
  }

  const data = await resp.json();
  let text = data?.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text;

  if (!text) {
    throw new Error(`Gemini returned no text. Raw response: ${JSON.stringify(data)}`);
  }

  // Gemini sometimes wraps JSON in ```json fences even when told not to — strip them.
  text = text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '');

  // Validate it's parseable JSON before handing it back, so index.js's
  // JSON.parse(rawText) doesn't blow up on malformed model output.
  try {
    JSON.parse(text);
  } catch (e) {
    throw new Error(`Gemini did not return valid JSON: ${text}`);
  }

  return {
    content: [{ type: 'text', text }],
  };
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('[mcp-server] Image Describer MCP server ready (stdio)');
