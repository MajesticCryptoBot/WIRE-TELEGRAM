# WIRE

**Private Telegram for your trading bots.**

WIRE is a single-user desktop application that works exactly like Telegram for your Python trading bot.  
You only change the bot token and the base URL in your script. Everything else stays the same.

---

## For normal use (recommended)

1. Go to the **Releases** page of this repository
2. Download `WIRESetup-x.x.x-x64.exe`
3. Double-click the installer and install WIRE
4. Launch WIRE from the Start Menu or desktop shortcut
5. Click **+ Create Bot** and copy the token
6. In your trading script change only these lines:

```python
WIRE_BOT_TOKEN = "paste-the-token-here"
WIRE_USER_ID   = 5704509563

from telegram.ext import ApplicationBuilder

app = (
    ApplicationBuilder()
    .token(WIRE_BOT_TOKEN)
    .base_url("http://127.0.0.1:8787/bot")
    .build()
)
```

7. Start your trading bot as usual.  
   Type commands in the WIRE window — they are delivered exactly like Telegram.

---

## What WIRE gives you

- Real Telegram Bot API compatible server (local)
- Clean chat interface
- Persistent bots and message history
- Works with the existing `python-telegram-bot` library
- Only token + base_url change required in your script
- Fully offline / private (everything stays on your PC)

---

## Development

```bash
node src/server.js          # start API + UI
npm run desktop             # run as Electron window
npm run build:win           # build the Windows installer (on Windows)
```

The Windows installer is built automatically by GitHub Actions on every push to `main`.

---

## Status

- Phase 1: Local Telegram-compatible Bot API → Done
- Phase 2: Chat UI + persistence → Done
- Phase 3: Desktop app + automatic installer → Done
