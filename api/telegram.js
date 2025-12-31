/**
 * Telegram Bot on Vercel (Webhook)
 *
 * Env vars needed:
 * - BOT_TOKEN: Telegram bot token from @BotFather
 * - BOT_SECRET: random string for simple auth (optional but recommended)
 * - ALLOWED_DOMAINS: comma-separated domains (e.g. "yourdomain.com,examplemail.com")
 *
 * Optional provider keys (if you integrate Emailnator or any provider):
 * - EMAIL_PROVIDER_KEY
 * - EMAIL_PROVIDER_BASE_URL
 */

const TG_API = (token, method) => `https://api.telegram.org/bot${token}/${method}`;

const MENU = {
  home: "home",
  generate: "generate",
  inbox: "inbox",
  settings: "settings",
  help: "help",
  domain: "domain"
};

// Basic per-user preference store (stateless).
// For production, use a DB / KV (Upstash/Vercel KV). Here we keep it simple:
const memoryPrefs = new Map(); // key: userId -> { domain }

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).send("OK");

  const BOT_TOKEN = process.env.BOT_TOKEN;
  if (!BOT_TOKEN) return res.status(500).json({ error: "Missing BOT_TOKEN" });

  // Optional simple secret check (set webhook URL with ?secret=... to match)
  const BOT_SECRET = process.env.BOT_SECRET;
  if (BOT_SECRET) {
    const secret = req.query?.secret;
    if (secret !== BOT_SECRET) return res.status(401).json({ error: "Unauthorized" });
  }

  const update = req.body;

  try {
    if (update.message) {
      await onMessage(BOT_TOKEN, update.message);
    } else if (update.callback_query) {
      await onCallback(BOT_TOKEN, update.callback_query);
    }
  } catch (e) {
    // Avoid failing webhook
    console.error(e);
  }

  return res.status(200).json({ ok: true });
}

function getAllowedDomains() {
  const raw = process.env.ALLOWED_DOMAINS || "";
  const domains = raw
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  // Safe default: require explicit domains
  return domains.length ? domains : ["yourdomain.com"];
}

function getUserPref(userId) {
  const allowed = getAllowedDomains();
  const existing = memoryPrefs.get(userId);
  if (existing?.domain && allowed.includes(existing.domain)) return existing;
  return { domain: allowed[0] };
}

function setUserPref(userId, patch) {
  const current = getUserPref(userId);
  const next = { ...current, ...patch };
  memoryPrefs.set(userId, next);
  return next;
}

async function onMessage(token, message) {
  const chatId = message.chat.id;
  const userId = message.from?.id;
  const text = (message.text || "").trim();

  if (!text || !userId) return;

  if (text === "/start" || text === "/menu") {
    await sendHome(token, chatId, userId);
    return;
  }

  if (text === "/help") {
    await sendHelp(token, chatId);
    return;
  }

  // Fallback
  await sendMessage(token, chatId, "Use /menu to open the bot menu.");
}

async function onCallback(token, cq) {
  const chatId = cq.message?.chat?.id;
  const userId = cq.from?.id;
  const data = cq.data || "";

  if (!chatId || !userId) return;

  // Acknowledge callback quickly
  await answerCallback(token, cq.id);

  const [action, value] = data.split(":");

  switch (action) {
    case MENU.home:
      await editOrSendHome(token, chatId, userId, cq.message?.message_id);
      break;

    case MENU.generate:
      await generateEmailFlow(token, chatId, userId, cq.message?.message_id);
      break;

    case MENU.inbox:
      await showInboxStub(token, chatId, cq.message?.message_id);
      break;

    case MENU.settings:
      await showSettings(token, chatId, userId, cq.message?.message_id);
      break;

    case MENU.help:
      await showHelp(token, chatId, cq.message?.message_id);
      break;

    case MENU.domain:
      {
        const allowed = getAllowedDomains();
        if (allowed.includes(value)) {
          setUserPref(userId, { domain: value });
        }
        await showSettings(token, chatId, userId, cq.message?.message_id);
      }
      break;

    default:
      await sendMessage(token, chatId, "Unknown action. Use /menu.");
  }
}

async function sendHome(token, chatId, userId) {
  const pref = getUserPref(userId);
  const text =
`🏠 *Main Menu*
Selected domain: \`${pref.domain}\`

Choose an option:`;

  await sendMessage(token, chatId, text, {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [{ text: "📧 Generate Email", callback_data: `${MENU.generate}` }],
        [{ text: "📥 Check Inbox", callback_data: `${MENU.inbox}` }],
        [{ text: "⚙️ Settings", callback_data: `${MENU.settings}` }],
        [{ text: "ℹ️ Help", callback_data: `${MENU.help}` }]
      ]
    }
  });
}

async function editOrSendHome(token, chatId, userId, messageId) {
  const pref = getUserPref(userId);
  const text =
`🏠 *Main Menu*
Selected domain: \`${pref.domain}\`

Choose an option:`;

  if (messageId) {
    await editMessage(token, chatId, messageId, text, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "📧 Generate Email", callback_data: `${MENU.generate}` }],
          [{ text: "📥 Check Inbox", callback_data: `${MENU.inbox}` }],
          [{ text: "⚙️ Settings", callback_data: `${MENU.settings}` }],
          [{ text: "ℹ️ Help", callback_data: `${MENU.help}` }]
        ]
      }
    });
  } else {
    await sendHome(token, chatId, userId);
  }
}

async function generateEmailFlow(token, chatId, userId, messageId) {
  const pref = getUserPref(userId);

  // IMPORTANT:
  // Replace this "local generator" with your provider integration if allowed.
  // This just generates a random mailbox at the selected domain.
  const email = generateRandomEmail(pref.domain);

  const text =
`📧 *Generated Email*
\`${email}\`

(You can integrate an email provider API here if it explicitly supports your domains.)`;

  const keyboard = {
    inline_keyboard: [
      [{ text: "🔄 Generate Another", callback_data: `${MENU.generate}` }],
      [{ text: "⚙️ Settings", callback_data: `${MENU.settings}` }],
      [{ text: "🏠 Home", callback_data: `${MENU.home}` }]
    ]
  };

  if (messageId) {
    await editMessage(token, chatId, messageId, text, {
      parse_mode: "Markdown",
      reply_markup: keyboard
    });
  } else {
    await sendMessage(token, chatId, text, { parse_mode: "Markdown", reply_markup: keyboard });
  }
}

async function showInboxStub(token, chatId, messageId) {
  const text =
`📥 *Inbox*
This is a stub.

If you use an email API provider, implement:
- list messages for the generated address
- show newest OTP/code safely

(Hosting on Vercel means you should do quick fetches; no long polling.)`;

  const keyboard = {
    inline_keyboard: [
      [{ text: "🏠 Home", callback_data: `${MENU.home}` }],
      [{ text: "ℹ️ Help", callback_data: `${MENU.help}` }]
    ]
  };

  if (messageId) {
    await editMessage(token, chatId, messageId, text, { parse_mode: "Markdown", reply_markup: keyboard });
  } else {
    await sendMessage(token, chatId, text, { parse_mode: "Markdown", reply_markup: keyboard });
  }
}

async function showSettings(token, chatId, userId, messageId) {
  const allowed = getAllowedDomains();
  const pref = getUserPref(userId);

  const buttons = allowed.map(d => {
    const selected = d === pref.domain ? "✅ " : "";
    return [{ text: `${selected}${d}`, callback_data: `${MENU.domain}:${d}` }];
  });

  const keyboard = {
    inline_keyboard: [
      ...buttons,
      [{ text: "🏠 Home", callback_data: `${MENU.home}` }]
    ]
  };

  const text =
`⚙️ *Settings*
Choose the domain to generate addresses from.

Current: \`${pref.domain}\``;

  if (messageId) {
    await editMessage(token, chatId, messageId, text, { parse_mode: "Markdown", reply_markup: keyboard });
  } else {
    await sendMessage(token, chatId, text, { parse_mode: "Markdown", reply_markup: keyboard });
  }
}

async function showHelp(token, chatId, messageId) {
  const text =
`ℹ️ *Help*
Commands:
- /start or /menu — open menu
- /help — show help

Notes:
- This template generates random emails at allowed domains.
- To use a provider API, call it inside the serverless function (never in frontend).
- Add domains via ALLOWED_DOMAINS environment variable.`;

  const keyboard = {
    inline_keyboard: [
      [{ text: "🏠 Home", callback_data: `${MENU.home}` }]
    ]
  };

  if (messageId) {
    await editMessage(token, chatId, messageId, text, { parse_mode: "Markdown", reply_markup: keyboard });
  } else {
    await sendMessage(token, chatId, text, { parse_mode: "Markdown", reply_markup: keyboard });
  }
}

function generateRandomEmail(domain) {
  const rand = cryptoRandomString(12);
  return `${rand}@${domain}`;
}

function cryptoRandomString(len) {
  // Node runtime on Vercel supports Web Crypto in most cases.
  // Fallback to Math.random if needed.
  try {
    const bytes = new Uint8Array(len);
    crypto.getRandomValues(bytes);
    return Array.from(bytes).map(b => (b % 36).toString(36)).join("");
  } catch {
    let out = "";
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  }
}

async function sendMessage(token, chatId, text, extra = {}) {
  await fetch(TG_API(token, "sendMessage"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, ...extra })
  });
}

async function editMessage(token, chatId, messageId, text, extra = {}) {
  await fetch(TG_API(token, "editMessageText"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId, text, ...extra })
  });
}

async function answerCallback(token, callbackQueryId) {
  await fetch(TG_API(token, "answerCallbackQuery"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId })
  });
}
