/**
 * WIRE Local Bot API Server – Phase 2
 * ===================================
 * - Persistent bots & messages
 * - Built-in chat UI
 * - Full Telegram Bot API compatibility for python-telegram-bot
 */

import { createServer } from "http";
import { randomUUID } from "crypto";
import { parse as parseUrl } from "url";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = 8787;
const HOST = "127.0.0.1";
const DATA_DIR = join(__dirname, "..", "data");
const STORE_FILE = join(DATA_DIR, "store.json");

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

// ============================================================
// STORE + PERSISTENCE
// ============================================================
function loadStore() {
  try {
    if (existsSync(STORE_FILE)) {
      const raw = JSON.parse(readFileSync(STORE_FILE, "utf8"));
      return {
        bots: new Map(raw.bots || []),
        updates: new Map(raw.updates || []),
        messages: new Map(raw.messages || []),
        owner: raw.owner || {
          id: 5704509563,
          is_bot: false,
          first_name: "Owner",
          username: "wire_owner",
          language_code: "en",
        },
      };
    }
  } catch (e) {
    console.error("[WIRE] Failed to load store:", e.message);
  }
  return {
    bots: new Map(),
    updates: new Map(),
    messages: new Map(),
    owner: {
      id: 5704509563,
      is_bot: false,
      first_name: "Owner",
      username: "wire_owner",
      language_code: "en",
    },
  };
}

function saveStore() {
  try {
    const data = {
      bots: [...store.bots.entries()],
      updates: [...store.updates.entries()],
      messages: [...store.messages.entries()],
      owner: store.owner,
    };
    writeFileSync(STORE_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("[WIRE] Failed to save store:", e.message);
  }
}

const store = loadStore();

// ============================================================
// HELPERS
// ============================================================
function json(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(data),
    "Access-Control-Allow-Origin": "*",
  });
  res.end(data);
}

function ok(result) { return { ok: true, result }; }
function err(code, description) { return { ok: false, error_code: code, description }; }

function generateToken() {
  const botId = Math.floor(100000000 + Math.random() * 900000000);
  const secret = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "").slice(0, 8);
  return `${botId}:${secret}`;
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        if (req.headers["content-type"]?.includes("application/json")) {
          resolve(JSON.parse(body || "{}"));
        } else {
          const params = {};
          for (const part of body.split("&")) {
            const [k, v] = part.split("=");
            if (k) params[decodeURIComponent(k)] = decodeURIComponent(v || "");
          }
          resolve(params);
        }
      } catch { resolve({}); }
    });
  });
}

function createUpdate(botId, text) {
  const list = store.updates.get(botId) || [];
  const updateId = (list[list.length - 1]?.update_id || 0) + 1;

  const update = {
    update_id: updateId,
    message: {
      message_id: Date.now(),
      from: { ...store.owner },
      chat: {
        id: store.owner.id,
        first_name: store.owner.first_name,
        username: store.owner.username,
        type: "private",
      },
      date: Math.floor(Date.now() / 1000),
      text,
    },
  };

  if (text.startsWith("/")) {
    update.message.entities = [
      { offset: 0, length: text.split(/\s+/)[0].length, type: "bot_command" },
    ];
  }

  list.push(update);
  store.updates.set(botId, list);
  saveStore();
  return update;
}

function serveStatic(res, filePath, contentType) {
  try {
    const content = readFileSync(filePath);
    res.writeHead(200, { "Content-Type": contentType });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

// ============================================================
// ROUTER
// ============================================================
async function handler(req, res) {
  const parsed = parseUrl(req.url, true);
  const path = parsed.pathname || "/";
  const method = req.method || "GET";

  if (method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    return res.end();
  }

  // ---------- Static UI ----------
  if (path === "/" || path === "/index.html") {
    return serveStatic(res, join(__dirname, "..", "public", "index.html"), "text/html");
  }
  if (path === "/style.css") {
    return serveStatic(res, join(__dirname, "..", "public", "style.css"), "text/css");
  }
  if (path === "/app.js") {
    return serveStatic(res, join(__dirname, "..", "public", "app.js"), "application/javascript");
  }

  // ---------- Health ----------
  if (path === "/health") {
    return json(res, 200, {
      service: "WIRE Local Bot API",
      version: "2.0.0-phase2",
      status: "running",
      owner_id: store.owner.id,
      bots: store.bots.size,
    });
  }

  // ---------- Create Bot ----------
  if (path === "/wire/createBot" && method === "POST") {
    const body = await readBody(req);
    const name = (body.name || "ABinance Trading Bot").trim();
    let username = (body.username || name.toLowerCase().replace(/\s+/g, "_") + "_bot")
      .replace(/[^a-z0-9_]/g, "");
    if (!username.endsWith("bot")) username += "_bot";

    const token = generateToken();
    const botId = parseInt(token.split(":")[0], 10);

    const bot = {
      id: botId,
      is_bot: true,
      first_name: name,
      username,
      can_join_groups: false,
      can_read_all_group_messages: false,
      supports_inline_queries: false,
      token,
      created_at: new Date().toISOString(),
    };

    store.bots.set(token, bot);
    store.updates.set(botId, []);
    store.messages.set(botId, []);
    saveStore();

    console.log(`\n[WIRE] ✓ Bot created: ${bot.first_name} (@${bot.username})`);
    console.log(`       Token: ${token}\n`);

    return json(res, 200, ok({
      bot,
      token,
      owner_id: store.owner.id,
    }));
  }

  // ---------- List bots ----------
  if (path === "/wire/bots") {
    const list = [...store.bots.values()].map((b) => ({
      id: b.id,
      first_name: b.first_name,
      username: b.username,
      token: b.token,
      created_at: b.created_at,
    }));
    return json(res, 200, ok(list));
  }

  // ---------- Get messages for UI ----------
  if (path === "/wire/messages" && method === "GET") {
    const token = parsed.query.token;
    const bot = store.bots.get(token);
    if (!bot) return json(res, 401, err(401, "Unauthorized"));
    const msgs = store.messages.get(bot.id) || [];
    return json(res, 200, ok(msgs));
  }

  // ---------- Inject command (from UI) ----------
  if (path === "/wire/inject" && method === "POST") {
    const body = await readBody(req);
    const bot = store.bots.get(body.token);
    if (!bot) return json(res, 401, err(401, "Unauthorized"));

    const update = createUpdate(bot.id, body.text || "");
    console.log(`[WIRE] UI → Bot: ${body.text}`);
    return json(res, 200, ok({ update_id: update.update_id }));
  }

  // ---------- Telegram Bot API ----------
  const botMatch = path.match(/^\/bot([^\/]+)\/([a-zA-Z0-9_]+)$/);
  if (botMatch) {
    const token = botMatch[1];
    const apiMethod = botMatch[2].toLowerCase();
    const bot = store.bots.get(token);

    if (!bot) return json(res, 401, err(401, "Unauthorized"));

    const body = method === "POST" ? await readBody(req) : {};
    const params = { ...parsed.query, ...body };

    if (apiMethod === "getme") {
      return json(res, 200, ok({
        id: bot.id,
        is_bot: true,
        first_name: bot.first_name,
        username: bot.username,
        can_join_groups: false,
        can_read_all_group_messages: false,
        supports_inline_queries: false,
      }));
    }

    if (apiMethod === "getupdates") {
      const offset = parseInt(params.offset || "0", 10);
      const limit = Math.min(parseInt(params.limit || "100", 10), 100);
      const timeout = Math.min(Math.max(parseInt(params.timeout || "0", 10), 0), 50);

      let updates = (store.updates.get(bot.id) || []).filter((u) => u.update_id >= offset);

      if (updates.length === 0 && timeout > 0) {
        const deadline = Date.now() + timeout * 1000;
        while (Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 250));
          updates = (store.updates.get(bot.id) || []).filter((u) => u.update_id >= offset);
          if (updates.length > 0) break;
        }
      }

      const result = updates.slice(0, limit);

      if (result.length > 0) {
        const last = result[result.length - 1].update_id;
        store.updates.set(
          bot.id,
          (store.updates.get(bot.id) || []).filter((u) => u.update_id > last)
        );
        saveStore();
      }

      return json(res, 200, ok(result));
    }

    if (apiMethod === "sendmessage") {
      const chatId = parseInt(params.chat_id, 10);
      const text = String(params.text || "");

      if (!text) return json(res, 200, err(400, "Bad Request: text is empty"));
      if (chatId !== store.owner.id) {
        return json(res, 200, err(403, "Forbidden: single-user mode"));
      }

      const message = {
        message_id: Date.now(),
        from: {
          id: bot.id,
          is_bot: true,
          first_name: bot.first_name,
          username: bot.username,
        },
        chat: {
          id: store.owner.id,
          first_name: store.owner.first_name,
          username: store.owner.username,
          type: "private",
        },
        date: Math.floor(Date.now() / 1000),
        text,
      };

      const msgs = store.messages.get(bot.id) || [];
      msgs.push(message);
      store.messages.set(bot.id, msgs);
      saveStore();

      console.log(`[WIRE] Bot → you: ${text.slice(0, 120)}${text.length > 120 ? "…" : ""}`);
      return json(res, 200, ok(message));
    }

    if (apiMethod === "getchat") {
      const chatId = parseInt(params.chat_id, 10);
      if (chatId === store.owner.id) {
        return json(res, 200, ok({
          id: store.owner.id,
          first_name: store.owner.first_name,
          username: store.owner.username,
          type: "private",
        }));
      }
      return json(res, 200, err(400, "Chat not found"));
    }

    return json(res, 200, err(400, `Method ${apiMethod} not implemented yet`));
  }

  json(res, 404, err(404, "Not Found"));
}

// ============================================================
// START
// ============================================================
const server = createServer(handler);

server.listen(PORT, HOST, () => {
  console.log("============================================================");
  console.log("  WIRE Local Bot API Server – Phase 2");
  console.log("============================================================");
  console.log(`  UI + API     http://${HOST}:${PORT}`);
  console.log(`  Owner ID     ${store.owner.id}`);
  console.log(`  Bots loaded  ${store.bots.size}`);
  console.log("============================================================");
  console.log("  Open http://127.0.0.1:8787 in your browser");
  console.log("============================================================");
});
