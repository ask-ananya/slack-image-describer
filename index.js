// Slack Image Describer — MVP (now with real MCP server integration)
require('dotenv').config();
const { App, LogLevel } = require('@slack/bolt');
const fetch = require('node-fetch');
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET;
const app = new App({
  token: SLACK_BOT_TOKEN,
  signingSecret: SLACK_SIGNING_SECRET,
  port: process.env.PORT || 3000,
  logLevel: LogLevel.DEBUG,
});
let mcpClientPromise = null;
async function getMcpClient() {
  if (mcpClientPromise) return mcpClientPromise;
  mcpClientPromise = (async () => {
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
    const transport = new StdioClientTransport({
      command: 'node',
      args: ['mcp-server.mjs'],
      env: process.env,
    });
    const client = new Client(
      { name: 'slack-image-describer', version: '1.0.0' },
      { capabilities: {} }
    );
    await client.connect(transport);
    return client;
  })();
  return mcpClientPromise;
}
app.message(async ({ message, client, say }) => {
  try {
    if (message.subtype || message.bot_id) return;
    if (!message.thread_ts || message.thread_ts === message.ts) return;
    if (!message.text || message.text.trim().toLowerCase() !== 'describe') return;
    const { channel, thread_ts, user, ts } = message;
    const replies = await client.conversations.replies({
      channel,
      ts: thread_ts,
      limit: 1,
    });
    const parent = replies.messages && replies.messages[0];
    const imageFile = parent && parent.files && parent.files.find(f => f.mimetype && f.mimetype.startsWith('image/'));
    if (!imageFile) {
      await client.chat.postEphemeral({
        channel,
        user,
        thread_ts,
        text: "I couldn't find an image on the message you're replying to.",
      });
      return;
    }
    const imgResp = await fetch(imageFile.url_private, {
      headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` },
    });
    const imgBuffer = await imgResp.buffer();
    const base64Image = imgBuffer.toString('base64');
    const mcpClient = await getMcpClient();
    const result = await mcpClient.callTool({
      name: 'describe_image',
      arguments: {
        imageBase64: base64Image,
        mimeType: imageFile.mimetype,
      },
    });
    const rawText = result?.content?.[0]?.text;
    if (!rawText) {
      console.error('Unexpected MCP tool response:', JSON.stringify(result));
      await client.chat.postEphemeral({
        channel, user, thread_ts,
        text: 'Sorry, I had trouble describing that image. Please try again.',
      });
      return;
    }
    const parsed = JSON.parse(rawText);
    const followupButtons = (parsed.followups || []).slice(0, 3).map((f, i) => ({
      type: 'button',
      text: { type: 'plain_text', text: f.question.slice(0, 70) },
      action_id: `followup_${i}`,
      value: JSON.stringify({
        answer: f.answer.slice(0, 1500),
        channel,
        thread_ts,
      }),
    }));
    await client.chat.postEphemeral({
      channel,
      user,
      thread_ts,
      text: parsed.description,
      blocks: [
        { type: 'section', text: { type: 'mrkdwn', text: parsed.description } },
        ...(followupButtons.length
          ? [{ type: 'actions', elements: followupButtons }]
          : []),
      ],
    });
  } catch (err) {
    console.error('Error describing image:', err);
  }
});
app.action(/^followup_/, async ({ ack, body, client }) => {
  console.log('Button clicked! action_id:', body.actions[0].action_id);
  await ack();
  const { answer, channel, thread_ts } = JSON.parse(body.actions[0].value);
  await client.chat.postEphemeral({
    channel,
    user: body.user.id,
    thread_ts,
    text: answer,
  });
});
(async () => {
  await app.start();
  console.log('⚡ Image Describer is running (MCP-powered)');
})();