# Integrated Chat Bot Guide

StreamPulse includes a built-in chat automation bot designed to handle commands, quotes, timers, auto-replies, and external webhooks without depending on cloud bot services.

Replies are sent back directly through SocialStream Ninja into your broadcast chat.

---

## 1. Commands, Aliases & Permissions

Configure bot rules in **Tools -> Chat Bot** (`/chatbot.html`):

- **Commands & Aliases**: Define primary commands (e.g., `!socials`) with comma-separated aliases (`!discord`, `!twitter`, `!links`).
- **Cooldowns**: Set global command cooldowns and per-user cooldowns to prevent chat spam.
- **Permissions**: Restrict sensitive commands to Broadcaster, Moderators, VIPs, or Subscribers.
- **Target User Parsing**: Commands can accept target arguments (e.g. `!hug @viewer` renders `Streamer gives @viewer a warm hug!`).

---

## 2. Dynamic Variables & Tokens

StreamPulse chat commands support rich dynamic placeholders:

| Variable | Description |
| --- | --- |
| `{{user}}` | Username of the person who typed the command. |
| `{{target}}` | Target username provided after the command (e.g. `!so @friend`). |
| `{{game}}` | Currently active game title from Game Plan or Twitch. |
| `{{uptime}}` | Formatted stream uptime (HH:MM:SS). |
| `{{count:name}}` | Increments a persistent counter (e.g. `!death` counts up deaths). |
| `{{random:item1,item2}}` | Randomly picks an item from a list. |
| `{{weather.temp}}` | Current local temperature from Open-Meteo. |
| `{{song.title}}` | Currently playing music title. |

---

## 3. Silent Commands & Webhook Actions

StreamPulse supports **Silent Commands** that execute background logic without posting a visible message into chat:

- **Silent Execution**: Useful for moderator tools (e.g. `!spin` triggers the Choice Randomizer without cluttering chat).
- **HTTP Webhook Actions**: Send automatic `POST` or `GET` webhooks to external services (such as Home Assistant, Discord webhooks, or local automation scripts) whenever a command is typed or an alert fires.
- **API Runner**: Trigger bot commands programmatically via `POST /api/chatbot/run` or `GET /api/chatbot/run?command=!game`.
