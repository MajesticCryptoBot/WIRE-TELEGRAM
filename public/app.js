const state = {
  bots: [],
  activeToken: null,
  messages: [],
  pollTimer: null,
};

const $ = (sel) => document.querySelector(sel);

// ---------- API helpers ----------
async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  return res.json();
}

// ---------- Load bots ----------
async function loadBots() {
  const data = await api("/wire/bots");
  state.bots = data.result || [];
  renderBotList();
}

function renderBotList() {
  const list = $("#botList");
  list.innerHTML = "";

  if (state.bots.length === 0) {
    list.innerHTML = `<div style="padding:16px;color:var(--muted);font-size:13px;text-align:center">No bots yet</div>`;
    return;
  }

  state.bots.forEach((bot) => {
    const el = document.createElement("div");
    el.className = "bot-item" + (state.activeToken === bot.token ? " active" : "");
    el.innerHTML = `
      <div class="bot-avatar">${bot.first_name[0].toUpperCase()}</div>
      <div class="bot-info">
        <div class="bot-name">${bot.first_name}</div>
        <div class="bot-user">@${bot.username}</div>
      </div>
    `;
    el.onclick = () => selectBot(bot);
    list.appendChild(el);
  });
}

// ---------- Select bot ----------
function selectBot(bot) {
  state.activeToken = bot.token;
  renderBotList();

  $("#chatHeader .chat-title").textContent = bot.first_name;
  $("#chatHeader .chat-subtitle").textContent = `Token: ${bot.token.slice(0, 20)}…`;
  $("#composer").style.display = "block";

  loadMessages();
  startPolling();
}

// ---------- Messages ----------
async function loadMessages() {
  if (!state.activeToken) return;
  const data = await api(`/wire/messages?token=${encodeURIComponent(state.activeToken)}`);
  state.messages = data.result || [];
  renderMessages();
}

function renderMessages() {
  const container = $("#messages");
  container.innerHTML = "";

  if (state.messages.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <h2>Ready</h2>
        <p>Type a command below.<br/>It will be delivered to your Python bot via getUpdates.</p>
      </div>`;
    return;
  }

  state.messages.forEach((msg) => {
    const el = document.createElement("div");
    const isBot = msg.from?.is_bot;
    el.className = "message " + (isBot ? "in" : "out");
    el.innerHTML = `
      <div>${escapeHtml(msg.text)}</div>
      <div class="meta">${isBot ? "Bot" : "You"} · ${new Date(msg.date * 1000).toLocaleTimeString()}</div>
    `;
    container.appendChild(el);
  });

  container.scrollTop = container.scrollHeight;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ---------- Send command ----------
async function sendCommand() {
  const input = $("#input");
  const text = input.value.trim();
  if (!text || !state.activeToken) return;

  // Optimistic UI – show the outgoing message
  state.messages.push({
    message_id: Date.now(),
    from: { is_bot: false, first_name: "You" },
    date: Math.floor(Date.now() / 1000),
    text,
  });
  renderMessages();
  input.value = "";

  // Inject into the Bot API (so the Python bot can pick it up via getUpdates)
  await api("/wire/inject", {
    method: "POST",
    body: JSON.stringify({ token: state.activeToken, text }),
  });
}

// ---------- Poll for bot replies ----------
function startPolling() {
  if (state.pollTimer) clearInterval(state.pollTimer);
  state.pollTimer = setInterval(loadMessages, 1500);
}

// ---------- Create bot ----------
$("#btnCreateBot").onclick = () => {
  $("#modal").style.display = "grid";
  $("#botName").focus();
};

$("#btnCancel").onclick = () => {
  $("#modal").style.display = "none";
};

$("#btnConfirmCreate").onclick = async () => {
  const name = $("#botName").value.trim() || "ABinance Trading Bot";
  const data = await api("/wire/createBot", {
    method: "POST",
    body: JSON.stringify({ name }),
  });

  if (data.ok) {
    $("#modal").style.display = "none";
    await loadBots();
    // Auto-select the new bot
    const bot = data.result.bot;
    selectBot(bot);

    // Show token in a clear way
    alert(
      `Bot created successfully!\n\n` +
      `Token:\n${data.result.token}\n\n` +
      `Owner ID: ${data.result.owner_id}\n\n` +
      `Use these values in your Python script.`
    );
  }
};

// ---------- Keyboard ----------
$("#input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendCommand();
});
$("#btnSend").onclick = sendCommand;

// ---------- Init ----------
loadBots();
