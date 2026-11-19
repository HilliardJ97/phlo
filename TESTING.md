# Testing Phlo: a 20-minute run

Use Chrome (free speech recognition) with ChatGPT connected through Codex. Each step says what to do, what should happen, and what to note if it doesn't.

## 0. Setup (5 minutes, once)

```bash
npm i -g @openai/codex && codex login     # choose "Sign in with ChatGPT"
git clone -b claude/mvp-design-backend-arch-vu489h https://github.com/HilliardJ97/phlo && cd phlo
```

Double-click **Open Phlo.command**. It installs on first run, then opens Chrome at `http://127.0.0.1:8790`. The terminal tells you whether ChatGPT is connected.

If Phlo says *"ChatGPT isn't connected yet"*, it's settling with local rules. Everything still works, just with simpler placement.

## 1. The blank page (1 minute)

| Do | Expect | Note if not |
|---|---|---|
| Open a new draft (＋ in the rail) | "Start talking." with a hairline dot. The caret is in the page. | Anything that asks you to name or set up something |
| Hold **Space** and say a sentence, release | The dot turns vermilion and breathes; your words appear light gray, then settle to ink | More than ~2 s from releasing to ink |

## 2. Product sense interview, in Scribe (5 minutes)

Click **Scribe** (Room view opens in Sumi). **Tap Space twice** to lock talking on. Then talk the way you would in a real interview:

> "Okay so the prompt is design a product that helps families make photo books. Let me start by clarifying the goal. I think the goal is more families finish a printed book… The users I'd focus on are parents of young kids… Pain points. Picking forty photos out of four thousand is the wall… No wait, scratch that, not forty, more like sixty… For solutions, one, auto-pick the best moments. Two, a designer layout… The metric I'd use is the percent of started books printed within two weeks."

| Expect | Note if not |
|---|---|
| Sections appear from your own cue words: Goal, Users, Pain points, Solutions, Metric | A section you signposted that didn't appear, or one you didn't say |
| "Scratch that, not forty, sixty" changes the line; hover it to see `EARLIER:` | The correction landing on the wrong line, or text lost |
| "One…, two…" becomes bullets | It stays one paragraph |
| **No words you didn't say** (fillers removed is fine) | Any invented word or idea. This is the Scribe promise. |
| Nothing moves while you're mid-sentence | Text jumping under you |

Esc leaves Room view.

## 3. Thinking with Partner (5 minutes)

Switch to **Partner**, lock talking on, and think through something real of yours.

| Try | Expect |
|---|---|
| "Oh also, could this be a subscription?" | A `TANGENT · LATER` card in the margin, not in your section |
| "I need to talk to five couples about price" | It lands on the **Next** list at the end |
| "We decided to launch for PMs first" | A **Decision** block |
| Three ordered steps, then "make that a flowchart" | A flow diagram; Undo in the toast |
| "Not [word], [other word]" about something on the page | That exact word changes, with the old version kept |
| "Rename X to Y", "move X under Y", "park X" | A toast names the change; Undo works |
| Stay quiet ~8 s while locked on | One `PHLO ASKS` question under your section (needs ChatGPT) |
| List 3 competitors as "Name: price, detail" | A **Phlo suggests** card offers a table |

## 4. Typing (2 minutes)

| Try | Expect |
|---|---|
| Type a messy paragraph and press Enter twice | It settles (gray → ink) and moves under the right heading |
| Type `/` on an empty line | The Add menu: pick Decision, Table, Flow… |
| Right-click any line | **Turn into** |
| Click into wet text while Phlo is thinking | That text never moves while your caret is in it |

## 5. References and Publish (2 minutes)

| Try | Expect |
|---|---|
| ⌘V a link or a screenshot | It goes to References in the sidebar (⌘\\), not into the page |
| A draft with 3+ sections | **Publish** turns solid; publishing opens a clean read view |

## What to send back

1. The first moment it felt like magic, and the first moment it felt janky.
2. Each "Note if not" you hit: what you said, and what Phlo did.
3. Speed: did settling ever feel slow? Your AI (sidebar) shows the last settle's route and time.
4. Then run `npm run eval -- --chatgpt` and paste the last line: it scores the exact model Codex uses on the 41 golden checks.
