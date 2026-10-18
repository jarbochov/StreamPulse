# Cinematic Credits Studio Guide

StreamPulse was originally designed around a cinematic, movie-style credits roll that celebrates everyone who made your broadcast special: subscribers, followers, cheerers, raiders, gifters, chatters, and moderators.

The dedicated **Credits Studio** (`/credits-editor.html`) lets you customize every section, preview in real time, and synchronize roll timing perfectly with your outro music.

![Credits Studio](images/credits-studio.png)

---

## 1. Studio Architecture & Navigation

The Credits Studio is organized into four intuitive tabs:

1. **Sections & Order**: Enable, disable, rename, and drag-and-drop to reorder built-in and custom sections.
2. **Header & Spacing**: Customize the top title, subtitle, streamer logo/avatar, font scale, column layout, and scroll speed.
3. **Custom & Thanks**: Manage dedicated full-screen fade cards for Special Thanks, VIP patrons, or stream highlights.
4. **Closing & Socials**: Configure final closing messages, social media handles (Twitter/X, YouTube, Discord, TikTok, Bluesky), and outro links.

---

## 2. Built-In Sections

StreamPulse automatically aggregates data across your live session and past broadcasts:

| Section | Content Displayed |
| --- | --- |
| **Subscribers** | Active channel subscribers and recent resubs with tenure months. |
| **Gift Subs** | Community members who gifted subscriptions during the broadcast. |
| **Bits & Cheerers** | Viewers who cheered bits, sorted by total amount cheered. |
| **Raiders** | Streamers who raided your channel, with incoming viewer counts. |
| **Followers** | New followers gained during the session. |
| **Top Chatters** | Most active chat participants across the stream. |
| **Chat Emotes** | Most-used custom and platform emotes rendered directly on the roll. |
| **Hashtags** | Community hashtags used in chat (e.g. `#hype`, `#clutch`, `#gg`). |

---

## 3. Custom Sections & Special Thanks

In addition to automated lists, you can add unlimited **Custom Sections**:
- **Display Style**:
  - `Scrolling List`: Multi-column scroll alongside regular credits.
  - `Fade Card`: Full-screen focal card that smoothly fades in, holds, and fades out before the next section appears.
- **Names / Body**: Enter freeform text or comma-separated lists of patrons, mods, or guest streamers.
- **Per-Section Hold Duration**: Customize exact display time in seconds for high-priority cards.

---

## 4. Syncing Credits with Outro Music

To synchronize your credits roll with an outro track:
1. Note the length of your music track (e.g., 1 minute and 15 seconds = 75 seconds).
2. Set the duration in the Credits Studio or append `?duration=75` to your OBS browser source URL:
   ```text
   http://localhost:3000/overlays/credits.html?duration=75
   ```
3. StreamPulse will automatically calculate the scroll velocity so the credits finish scrolling and transition to your closing socials right as the song reaches its finale.
4. **Static Preview Mode**: To view the credits without waiting for the animation, add `?preview=true` (`http://localhost:3000/overlays/credits.html?preview=true`).
