# Live Chat Trivia & Broadcast Overlays

StreamPulse includes an interactive Live Trivia Studio and broadcast OBS overlay featuring audience chat voting, true/false and multi-choice question formats, visual theme presets (including pure floating broadcast text), customizable typography, and Bitfocus Companion integration.

---

## 1. Overview & Key Capabilities

- **2 to 6 Choices & True/False Support**: Run standard 4-choice questions, rapid True/False binary votes, or nuanced 5–6 choice challenges.
- **Drag-and-Drop Question Reordering**: Rearrange questions seamlessly in the studio using native drag-and-drop handles or instant Up/Down shift buttons.
- **Played & Done Question Tracking**: Questions are marked as Done once revealed so they never repeat during randomized play. Streamers can manually toggle question status or click **Reset Unplayed** before each segment.
- **Transition Control**: Choose between automatic answer reveal when the countdown timer hits zero or **Manual Transition** allowing the host to discuss responses before triggering the reveal.
- **Distinct Visual Themes**:
  - **Modern**: Glassmorphism with rounded cards, neon cyan/purple accents, and subtle glowing borders.
  - **Pure Floating Text (Broadcast / NodeCG Style)**: Transparent floating typography with massive drop shadows, zero card boxes, staggered text entrances, and automatic collapse of incorrect answers on reveal.
  - **Arcade (8-Bit Retro)**: Sharp 0px corners, high-contrast black backgrounds, solid neon yellow borders, and chunky retro styling.
  - **Esports**: Angular polygon clip paths, carbon brushed backgrounds, and electric telemetry meters.
  - **Minimal**: Clean, low-distraction lower-third slate cards for casual talk shows and desktop streams.
- **Toggleable Overlay Elements**: Hide or show individual visual components (Category badge, Question Number, Countdown Timer bar, Choice Letter badges, Vote counts, Choice percentages, Chat hint bar, and Fun fact callout).
- **Audience Chat Voting**: Stream viewers vote in real time with `!a`, `!b`, `!c`, `!d`, `!e`, `!f`, `!true`, or `!false`. Votes tally with percentage bars and optional subscriber vote multipliers.
- **Chatbot Announcements**: Automatically post question openings and answer reveals with statistics to Twitch chat using customizable template tokens.
- **Preset Packs**: Save, load, and delete custom trivia question banks, or choose from built-in packs (*Video Game Classics*, *Pop Culture & Sci-Fi*, *Streaming Lore*).
- **Bitfocus Companion Integration**: Control question flow, reveals, done toggles, and preset selection directly from a Stream Deck.

---

## 2. Using the Trivia Studio

Open the studio at `http://localhost:3000/tools/trivia.html` or navigate to **Tools &rarr; Trivia Studio** in the StreamPulse navigation.

### Managing Questions
1. **Add Question**: Click **Add Question** in the toolbar. Enter a category, question prompt, between 2 and 6 choices, designate the correct choice, and provide an optional fun fact or trivia explanation.
2. **True / False Questions**: For True/False questions, click the True/False toggle to populate two choices ("True" and "False"). The overlay and chatbot will accept both `!true`/`!false` and `!t`/`!f` votes.
3. **Reordering Questions**: Drag any question card by its drag handle to reorder the lineup, or click the **&uarr;** and **&darr;** buttons on each row.
4. **Done Status**: Click the **Done** badge or checkmark icon on any question to toggle its played state. Questions marked as Done are skipped when using **Random Order** or auto-advance. Click **Reset Unplayed** to clear all played marks.
5. **Bulk Import & Export**: Click **Import / Export** to paste a JSON array of questions or export your active question set as a `.json` backup file.

### Controlling Gameplay
- **Start Question**: Click the play icon on any question row, or click **Start Question** on the active question card.
- **Reveal Answer**: Click **Reveal Answer** (or let the countdown timer elapse if **Auto-Reveal** is enabled).
- **Next / Previous**: Navigate questions sequentially or allow the studio to randomly select from unplayed questions.
- **Reset**: Click **Reset Session** to return the overlay to an idle state.

---

## 3. Overlay Theming & Customization

The broadcast overlay is located at:
```text
http://localhost:3000/overlays/trivia.html
```

Add this URL as a Browser Source in OBS Studio at `1920x1080` (or `3840x2160`).

### Visual Styles
- **Card Boxes vs Floating Text**: In the **Appearance & Themes** panel, switch the **Card Container Style** between:
  - `Cards & Boxes`: Standard framed card containers with backgrounds and borders.
  - `Pure Floating Text`: Eliminates all bounding boxes and background panels, rendering floating text directly over your camera or game capture with deep drop shadows.
- **Collapse Incorrect Choices**: When enabled in reveal mode, incorrect choices smoothly collapse and fade out, spotlighting the winning answer and fun fact.
- **Visibility & Parameter Controls**: Configure parameters in the studio or pass them directly in the overlay URL:
  - `?theme=arcade`: Selects visual preset (`modern`, `nodecg`, `arcade`, `esports`, `minimal`, `neon`, `retro`).
  - `?style=text`: Forces pure floating text broadcast mode.
  - `?scale=1.2`: Scales overlay typography and elements.
  - `?cardbg=#1a202c`: Custom glass panel background color.
  - `?cardborder=#38bdf8`: Custom glass panel border color.
  - `?choicebg=#161b22`: Custom choice card background color.
  - `?blur=16`: Custom backdrop blur radius (in px).
  - `?hintcolor=#f6e05e`: Custom color for chat voting instructions and keycap badges.
  - `?catcolor=#a855f7`: Custom category pill color.
  - `?qfont=Oswald` & `?qweight=800`: Question font family and weight (400–900).
  - `?cfont=Inter` & `?cweight=600`: Choice font family and weight (400–800).
  - `?hfont=Rajdhani` & `?hweight=700`: Header / category font family and weight.
  - `?ffont=Oswald` & `?fweight=700`: Did You Know? Fun fact font family and weight.
  - `?voting=0` / `?voting=1`: Controls chat voting mode. When the Chat Bot is turned off or chat voting is disabled, the overlay automatically displays `Live Question` (instead of `Voting Open`) and conceals the chat voting helper footer and vote counter.
  - `?category=0`: Hides category badge.
  - `?counter=0`: Hides question counter (e.g. "Question 1 of 5").
  - `?timer=0`: Hides countdown bar.
  - `?votes=0`: Hides numerical vote totals.
  - `?percentages=0`: Hides percentage displays on choices.
  - `?hint=0`: Hides the "!a / !b in chat" helper bar.
  - `?funfact=0`: Hides fun fact callouts on answer reveal.
  - `?letters=0`: Hides letter badges (A, B, C, D) on choices.

---

## 4. Chatbot Announcements

StreamPulse can automatically announce trivia questions and answers in chat. Configure announcements under **Tools &rarr; Chat Bot &rarr; Settings &rarr; Trivia Announcements**:

### Available Tokens
- **Question Start Announcement**:
  - `{category}`: Category of the question (e.g. "Gaming").
  - `{question}`: Question text.
  - `{choices}`: Formatted list of choices (e.g. "A: Luigi | B: Wario").
  - `{commands}`: Valid vote commands (e.g. "!a, !b" or "!true, !false").
  - `{duration}`: Seconds remaining to vote.
- **Answer Reveal Announcement**:
  - `{question}`: Question text.
  - `{letter}`: Correct choice letter (e.g. "A").
  - `{answer}`: Correct answer text.
  - `{percent}`: Percentage of chat votes for the correct answer.
  - `{votes}`: Total votes cast.
  - `{correctVotes}`: Votes cast for the winning answer.
  - `{funfact}`: Fun fact explanation (if provided).

---

## 5. Bitfocus Companion Integration

The official [companion-module-streampulse](https://github.com/jarbochov/companion-module-streampulse) includes dedicated Trivia actions, feedbacks, and dynamic variables:

### Actions
- `trivia_start`: Start question by index (0-based) or active question with optional custom duration.
- `trivia_reveal`: Reveal the correct answer.
- `trivia_next`: Advance to the next question (or pick a random unplayed question).
- `trivia_prev`: Go back to the previous question.
- `trivia_reset`: Reset active trivia session to idle.
- `trivia_toggle_done`: Toggle played/done state on the active question or a specific question ID.
- `trivia_reset_done`: Mark all questions as unplayed/not done.
- `trivia_load_preset`: Load a saved question preset pack.

### Dynamic Variables
- `$(streampulse:trivia_status)`: Active status (`idle`, `question`, `reveal`).
- `$(streampulse:trivia_active_question)`: Active question prompt text.
- `$(streampulse:trivia_active_category)`: Active question category.
- `$(streampulse:trivia_total_votes)`: Total chat votes cast on active question.
- `$(streampulse:trivia_remaining_seconds)`: Remaining countdown seconds.
- `$(streampulse:trivia_unplayed_count)`: Number of questions not yet played.
- `$(streampulse:trivia_total_questions)`: Total questions in bank.
- `$(streampulse:trivia_active_index)`: 1-based index of active question.

---

## 6. HTTP API Reference

All trivia endpoints support both standard REST methods and Companion-friendly `GET` triggers:

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/trivia` | `GET` | Returns full trivia state. Pass `?includeAnswers=true` for admin view. |
| `/api/trivia/status` | `GET` | Lightweight status summary for Companion polling. |
| `/api/trivia` | `PUT` | Update runtime settings and/or theme properties. |
| `/api/trivia/question/start` | `POST`, `GET` | Start question. Parameters: `index`, `id`, `duration`, `manualTransition`, `autoReveal`. |
| `/api/trivia/question/reveal` | `POST`, `GET` | Reveal the correct answer and trigger fanfare. |
| `/api/trivia/question/next` | `POST`, `GET` | Advance to next or random unplayed question. |
| `/api/trivia/question/previous` | `POST`, `GET` | Step back to previous question. |
| `/api/trivia/reset` | `POST`, `GET` | Clear active question and return overlay to idle. |
| `/api/trivia/question/toggle-done` | `POST`, `GET` | Toggle done/unplayed state on a question (`?id=...` or active). |
| `/api/trivia/question/done` | `POST` | Explicitly set done state (`{ id, done: true|false }`). |
| `/api/trivia/questions/reset-done` | `POST`, `GET` | Mark all questions as unplayed/done=false. |
| `/api/trivia/questions` | `POST` | Add a new question to the bank. |
| `/api/trivia/questions/reorder` | `POST`, `PUT` | Save a new ordered array of question IDs. |
| `/api/trivia/questions/move` | `POST`, `GET` | Move a question up or down (`?id=...&direction=up\|down`). |
| `/api/trivia/questions/shuffle` | `POST`, `GET` | Randomly shuffle questions in the active bank. |
| `/api/trivia/presets` | `GET`, `POST` | List presets or save active bank as a new preset. |
| `/api/trivia/presets/:id` | `GET`, `DELETE` | Load or delete a saved preset pack. |
