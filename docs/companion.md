# Put stream controls within reach

Connect StreamPulse with Bitfocus Companion to bring common broadcast actions to a Stream Deck or another Companion surface. Instead of switching windows to find a control, trigger it from the place you already manage your show.

Use buttons for practical moments such as advancing Game Plan, starting a randomizer reveal, managing a poll, launching or locking a Tier Maker vote, or controlling a timer. Companion feedback can also help show what’s active, so a control surface can become a useful part of your production workspace.

## StreamPulse Companion Module

StreamPulse has a dedicated Companion module maintained at [companion-module-streampulse](https://github.com/jarbochov/companion-module-streampulse).

All commands feature clear category prefixes and contiguous grouping for fast, intuitive searching in Companion:

- **Alerts:** Queue control (skip, pause, resume, clear), mute/unmute display, replay the last 1..N alerts (configurable count), fire rule tests, simulate stream events (follows, subs, bits, raids), and test webhooks / Companion button presses directly.
- **Overlay & Pages:** Page navigation (next, prev, first, last, auto-advance), show page by name, toggle page enabled, video playback controls, cutout punchthrough holes, slideshows, and music overlay toggles.
- **Speaker Badges:** Update profiles and OBS audio sources, toggle individual badge details, and see speaker identity and visibility on your buttons.
- **OBS Health:** Connection-state feedback and variables show whether OBS is disabled, connecting, connected, or disconnected, independently of Scene Sync.
- **Tier Maker (Tier List Studio):** Start voting on an item (auto-advances to next unranked item if omitted, with duration and consensus mode options), lock voting (freeze chat votes without placing for discussion), end vote & place into consensus tier (or discard), cancel active vote, reset all placed items back to unranked queue, and load template presets. Live feedbacks and variables report current item name, votes cast, leading consensus tier, agreement percentage, and remaining time.
- **Interactive Trivia:** Start question (by index or active), reveal answer, next question, previous question, toggle question done/played state, reset done questions, reset session, reset leaderboard (`session` or `season`), and load quiz pack presets. Live feedbacks and variables report active state, question text, category, total votes, countdown seconds remaining, unplayed question counts, and leaderboard standings.
- **Polls & Tournaments:** Start polls from presets or custom questions (blind voting, 2x sub multiplier), end/crown winner, extend (+seconds), or cancel active polls; bracket camera focus and section view controls; match scoring and winner advancement.
- **Versus & Speedrun:** Game and round scores, race clock controls (start, pause, reset, sync start), per-runner finish/toggle/reset (runners 1–4), timer display mode (`finish` vs `always`), and side swapping.
- **Randomizer Studio:** Spin wheel, roller, or card deck with configurable duration, auto-hide, and phrase presets; elimination toggles; restore removed choices.
- **Chat Bot:** Turn bot on/off/toggle, send chat messages, trigger bot commands or silent background actions, send quotes.
- **Variables & Counters:** Increment, decrement, reset counters, set variable values, roll lists/topics.
- **Timers & Goals:** Start, pause, resume, reset, add/subtract time, toggle timer visibility, reset or toggle broadcast goals.
- **Production & Server:** Mark clip candidate moments, pin chat messages as highlights, start/end/archive sessions, reset chat data, restart/stop StreamPulse.

Explore [StreamPulse features](features.md) or [get started](quickstart.md). If StreamPulse is already installed, **Docs** and **API Reference** are available in the app navigation.
