# Tutorial UX Brainstorm — Onboarding a Cold Beginner

_Draft 2026-08-12. Not a spec; a thinking document to iterate on before we
touch code._

The premise: someone lands on Capten with **zero context**. They don't know
it's a board game, they don't know it's turn-based, they've never seen a
Captain's Ball rule set. What are they thinking, and where do we lose them?

---

## 1. A cold-open playthrough, narrated

Below is a beat-by-beat "think-aloud" of a naïve first-time user. I've written
it as internal monologue in italics so the friction points jump out.

### T+0s — page loads

Header says **"THE CAPTAIN'S COMBINE"** with a **v3.1 MCTS TABLETOP** badge,
subtitle "Solo Tactical Beach Tabletop Aptitude Assessment for Captain's Ball".

> *"Wait — Captain's Ball? Is that a real sport I should know? MCTS Tabletop —
> is that a genre? Aptitude Assessment sounds like an interview test. Am I
> being evaluated?"*

Then the **jump-ball modal** takes over the whole screen: "Press and release
in the green zone!" with a moving indicator.

> *"…I've been on the page for two seconds and I'm already being asked to
> perform a reaction test. What am I timing? Why?"*

They mash space bar. The modal dismisses. The board renders.

### T+15s — the board

They see an 11×11 grid, blue pieces at the bottom, red pirate pieces at the
top, a ball glow on one of the blue pieces. Sidebar shows a hand of 3 cards
with numeric costs, gauges, a "Commit & End Player Turn" button, an "MCTS
Search" telemetry panel, an "Opponent Tactical Feed", and a small
**Tutorial** button in the header.

> *"OK the tutorial button. Yes please."*

They click it. **Confirmation modal**: "End Current Match to Enter Tutorial?"

> *"I haven't played a match yet, why is it asking?"*

(This is actually a bug of ours — see §5 — the initial jump-ball counts as
"game in progress" in our current check.)

### T+30s — tutorial fires

Step 1 popup: **"1. The Sand Court & Captains"**, oval highlight over cell
(5, 10). Body text: *"Welcome to The Captain's Combine! The match takes place
on an 11×11 sand court. Each side commands 6 pieces…"*

> *"Six pieces… I count six blue and six red. OK. What's this oval circling?
> That's just… an empty square? Oh wait — the tiny wooden thing on it? Is
> that the Captain? Why does the Captain look different from the players?"*

Step 2: **"The Energy Pool (10.0e Stamina)"**, highlight on one piece's energy
gauge.

> *"10.0e — is 'e' a unit? Like joules? Is my piece tired?"*

Step 3: **"Selecting a Player to Move"**, red "CLICK ME" badge over P2.

> *"Alright, I click P2. Cells light up blue with numbers like '-1.0e',
> '-1.4e'. Am I spending 1 energy? Why is diagonal 1.4?"*

Step 4: **"Staging a Destination Cell"**, "CLICK HERE" over (5, 5).

> *"I click. A blue dashed arrow appears. Did the piece move? Or did it
> stage? The word 'stage' isn't in my life vocabulary yet."*

Step 5: **"Ball Possession & 'No Running'"**, highlight on P1.

> *"OK, the ball carrier can't run. Got it. So how do I score?"*

Step 6: **"Throwing to a Teammate"**, "CLICK CARRIER" over P1.

> *"I click P1. A toolbar appears with 5 teammate chips and 'capture risk'
> percentages. I pick one. A gold arrow flies. …But nothing happens on the
> court itself?"*

Step 7: **"The 1-Step Receiver Cut Rule"**, oval on some button I don't
recognise. Text mentions `max(|Δc|, |Δr|) ≤ 1`.

> *"I have exited to close the tab."*

### Where they bailed

Most first-timers won't survive past **step 7**, and honestly a lot will
bounce during **step 5–6** because they've been given four rules in a row
without ever having the satisfaction of *doing* something and seeing it
resolve. The design pattern currently is: **explain → make user click a
specific thing → explain more**. It's a tour of the UI, not a lesson in the
game.

---

## 2. Diagnosing the friction — what's actually confusing

Sorted by severity for a total beginner:

### 2.1 We never teach them what game they're playing

- Nowhere in step 1 does it say **"Capten is a turn-based tactics game.
  Think chess, but the ball is a special piece and you win by passing it
  onto your Captain."**
- The name "Captain's Ball" is treated as if the user already knows the sport
  (it's a Southeast-Asian playground game — not universally known).
- The header calls itself an "Aptitude Assessment", which primes the user to
  think this is a *test*, not a *game*.

### 2.2 The player has no motivation before they see mechanics

The current curriculum is: grid → energy → move → possession → throw → cut →
AoC → restart → rest → cards → commit.

That's a **rulebook table of contents**, not a lesson plan. A beginner needs
the reverse:

1. *What am I trying to do?* (score by passing to my Captain)
2. *What stops me?* (the ball-carrier can't run; there's an opponent)
3. *So I need teammates downfield.* (movement)
4. *And I need to reach them.* (throwing)
5. *And the opponent can steal the throw.* (AoC / interception)
6. *And I have a budget.* (energy — introduced ONLY when it starts biting)
7. *Bonus tools when things get spicy.* (cards, rest, restarts)

We front-load energy and grid geometry — the two most abstract, least
motivating topics — before the player has ever wanted to do anything.

### 2.3 The vocabulary is engineering-speak

Real strings from the current tutorial and UI:

- "E_move = √(Δc² + Δr²)"
- "E_throw = (Distance^1.6) / 3.0"
- "Extended Continuous Zone Defense AoC wash onto 25 surrounding cells"
- "PLAYER PLANNING PHASE" / "AI PLANNED REVIEW" / "AI EVALUATING (MCTS SEARCH)"
- "Momentum Doubloons"
- "Aptitude Assessment Scouting Radar"

A first-time player doesn't want a formula. They want *"walking one square
straight costs 1 energy, diagonally costs a bit more"* — no square roots.

### 2.4 We tell instead of showing

The tutorial says "if you commit without throwing, you get a holding foul"
and moves on. **A beginner will not internalise that until it happens to
them.** The most powerful teaching moment in any tactics game is *"the AI
just did the exact thing the tip warned me about."*

### 2.5 Overwhelming sidebar during the tutorial

The right panel simultaneously shows:

- The hand (3 cards, each with icons, cost, description)
- The commit button + finalize button
- The MCTS visualizer ("REIGNING NEURAL NETWORK", latency, tier)
- The opponent tactical feed

For the first 5 minutes, all of that is noise. The tutorial highlight ring
draws attention to one thing but doesn't *dim* the other 90% of the screen.

### 2.6 No sense of progress / no "you win"

Even the tutorial ends with a Finish! button, not with the player having
**scored a goal**. There's no dopamine payoff. Contrast with a good game
tutorial (Into the Breach, Slay the Spire, Threes) where step N is literally
"and now you win — see, that's how it works."

### 2.7 The tutorial pauses game time — but the game clock still exists

The player is in PLAYER_PLAN with a 60-second timer running. Even if we
pause it during tutorial popups (we do), the *sight* of a countdown while
being asked to read text is stressful. During tutorial, the timer widget
should probably vanish, not just pause.

### 2.8 Cards are introduced far too late and far too abstractly

Step 11 is *"Momentum Doubloons & 26 Tactical Cards • 6 aptitude
dimensions"*. Twenty-six is a scary number. Six dimensions is scarier. And
this comes after 10 other steps, so by the time the player reaches it they
either quit or they've been drinking from the firehose too long to care.

### 2.9 "AI" is presented as an opponent from step 1, then not seen for 10 steps

Steps 1–11 never actually let the AI move. Then step 12 says "press
Commit" and — surprise — the whole other team acts at once. First-time users
will read that resolution as chaos.

### 2.10 Nothing tells them the pace of the game

Is this a 5-minute game? An hour? Does it end at a score? At a time limit?
We never say.

---

## 3. Design principles for a real onboarding

Borrowing from the games that do this well:

**P1. Start with a win, not a rule.** Give the player a rigged first scenario
where they *can barely help but score*, then reveal that what they just did
was the entire objective of the game.

**P2. One concept at a time, then let them use it.** No new concept should
be introduced until the previous one has been *acted on* successfully.

**P3. Show the failure state on purpose.** Force at least one holding foul
and one interception during tutorial, in safe scenarios, so the beginner
sees the consequence with their own eyes.

**P4. Delay every non-essential UI.** Hide the card hand, MCTS visualiser,
opponent feed, telemetry, config, seed input, timer, and even the AI
pirates until they're relevant. They can fade in as concepts are unlocked.

**P5. Skip formulas, ship intuition.** "Diagonal moves cost slightly more"
beats "E_move = √(Δc² + Δr²)". Formulas can live in a rules reference for
players who want them.

**P6. Use the AI as a co-star.** Have the AI perform scripted, visible,
narrated moves so the player learns opponent behaviour by watching, not by
reading a wall of italics.

**P7. Progress feels like passing a level, not turning a page.** Each
tutorial "chapter" should end with a concrete accomplishment: *"You made a
pass. You scored. You stole a ball. You survived a turn."*

**P8. Let them fail cheaply.** If they miss the required action, don't
lock the Next button forever — after ~15 seconds show a "Watch me" button
that demos the correct click, then re-arms the challenge.

---

## 4. A proposed re-cut: 4 chapters, 12 beats, ~4 minutes

Replace "12 steps, 1 pass each" with "4 chapters, each teaching one skill,
ending in a scripted mini-win." All chapters use a **hand-crafted board
state** — this is what the "custom separate environment" is for.

### Chapter 1 — "You have a Captain. Score on him." (~40s)

**Setup.** Empty board. Just P1 holding the ball at (5, 4). The Captain is
at (5, 10). No AI pieces on the court at all.

- Beat 1: "This is your Captain. Passing the ball to him scores a point.
  That's the whole game." *Highlight Captain. No click required.*
- Beat 2: "Click your player." *Click gates step.*
- Beat 3: "Now click the Captain to throw." *Click gates step. Ball flies,
  arc animation, GOAL sound and confetti.* **"You scored. That's it — you
  just won a round of Capten."**

**Payoff:** The user has scored a goal in under 40 seconds. Everything else
is *how to keep scoring when things get harder*.

### Chapter 2 — "But there's a rule: you can't run with the ball." (~60s)

**Setup.** Board resets: P1 at (5, 4) with ball, P2 at (2, 3), P3 at (8, 3).
Captain at (5, 10). Still no AI.

- Beat 4: "The ball-carrier can't move. See — try clicking P1 to move it,
  it won't offer any cells." (Or don't offer it — just narrate.)
- Beat 5: "To advance the ball, throw to a teammate closer to the Captain.
  Click P2, then click a highlighted cell near (2, 7) to run him downfield."
  *Click P2 → click cell → arrow appears.*
- Beat 6: "Now commit your turn." *Click commit button. Time advances; P2
  actually moves.* **"P2 is in scoring range. Next turn, throw to him."**
- Beat 7: "Click P1, then click P2 on the board. Watch the throw." *Ball
  transfers.*
- Beat 8: "Now click P2, then click the Captain. Score!" **Goal + confetti.**

**Payoff:** They've now used movement + throw + commit end-to-end. They
understand the game loop.

### Chapter 3 — "Meet the pirates." (~90s)

**Setup.** Add a single AI defender at (5, 7) — directly in the passing
lane. All other AI pieces frozen off-court or on their baseline.

- Beat 9: "Red pirates try to steal your throws. See this shaded ring around
  the pirate? That's his **reach**." *Highlight AoC shading.*
- Beat 10: "Try a long throw straight through him. Click P1, then Captain."
  *AI intercepts. Ball turns red. Modal appears explaining the miss.*
  **"Nice — that's an interception. Long throws through a pirate's reach
  are risky."**
- Beat 11: "Try again. But first move P2 to (5, 6) and use him as a bounce
  pass." *Player stages move + short throw to P2 + Captain shot. Success.*
- Beat 12: **"Short passes around defenders are the whole game."**

**Payoff:** They've seen an interception (failure), then routed around it
(success). This is the entire strategic core of Capten in one 90-second
chapter.

### Chapter 4 — "The rest is polish." (~60s, optional)

Introduce **only** the mechanics that a beginner needs for a first real
match. Skip anything that isn't decision-critical in the first 3 games.

- Beat 13: **Energy.** "Each piece has a stamina bar. Long throws and long
  runs drain it. When it's low, moves get riskier." *Show one gauge going
  from green to amber after a long throw.*
- Beat 14: **Rest.** "Pieces that sit still recharge fast. Three turns and
  they're full." *Fast-forward animation.*
- Beat 15: **Cards.** "You'll draw tactical cards over time. Hover any card
  to read it. You never have to use them — but they help when you're stuck."
  *Deal one card, show tooltip, don't require play.*
- Beat 16: **Post-goal restart.** "After a goal, the loser gets the ball at
  their baseline. First pass must go to a teammate, not the Captain."
  *Trigger a scripted restart animation.*

**Deliberately excluded from the tutorial** (they can live in a "Rules"
reference panel or unlock as-you-play tooltips):

- Holding-foul mechanic → let them discover it the first time they
  accidentally hold the ball. Show a big friendly tooltip *when it happens*,
  not preemptively.
- 1-step receiver cut math → advanced tactic, safe to omit.
- Momentum + 6 aptitude dimensions + hand limit → introduce contextually the
  first time they draw a 4th card.
- MCTS tier / neural-net telemetry → hide the whole visualiser during
  tutorial and for the first N matches. It's dev-facing.
- Config tuner / seed input → hide the whole header row during tutorial.

### Ending

"You know enough. Want to play a full match against an easy pirate crew?"

Two buttons: **"Play — Easy AI"** (auto-set NN off, MCTS T1) and **"Just
let me explore"** (back to main app).

---

## 5. Concrete gaps in the tutorial we shipped this session

Things I already regret from the pass we just did:

1. **`isGameInProgress` is too eager.** The initial jump-ball counts as
   "in progress" because `state.turn === 1` but the timer/state is live.
   Result: a fresh page-load user clicks Tutorial and is asked "end current
   match?" — confusing. Fix: also gate on `state.eventLog.length <= 2` or
   `state.phase === 'JUMP_BALL'`.
2. **The tutorial still uses the live game.** We reset the seed and skip
   the jump-ball, but the state is a normal opening formation — not a
   scripted, teachable board. The plan above needs *actual hand-crafted
   pieces per chapter*, which means either:
   - A dedicated "tutorial reducer" that ignores AI and accepts arbitrary
     `SET_POSITION` actions, OR
   - Per-chapter seed constants where we've verified the layout matches the
     lesson, OR
   - A new `INIT_MATCH_SANDBOX` action that takes an explicit `pieces` and
     `ballHolderId` payload.
3. **AI isn't neutralised during the tutorial.** If the user takes 60s to
   read step 3, the timer runs, they commit, and the AI takes a real turn.
   The tutorial should:
   - Freeze the timer (visually hide it, not just pause).
   - Skip AI turns entirely (auto-set `AI_TURN` → `START_PLAYER_TURN`) until
     Chapter 3.
4. **Dim/hide non-highlighted UI.** Right now the "pay attention here" ring
   is loud, but the rest of the UI stays at full contrast. A dark
   semi-transparent overlay with a cutout around the highlighted element
   would dramatically improve focus. (This is the classic "spotlight"
   pattern from Intercom/Shepherd.js.)
5. **"CLICK ME" pointer bounces even when unrelated.** If the tutorial says
   "click cell (5, 5)" and the user clicks a card by accident, we currently
   don't say anything. We should gently *reject* the click and repoint the
   pointer.
6. **No "Skip Tutorial" option.** Some users know sports games and want to
   dive in. We only offer "close (X)" which feels like giving up.
7. **The formulas are still in the copy.** We toned it down but step 8
   still literally says "multiplicative interception risk" and step 6 says
   "E_throw = (Distance^1.6) / 3.0." Cut these entirely for the tutorial;
   put them in a "Rules" tab for the nerds.

---

## 6. What I'd propose we actually build next

If you want to move on this, the smallest useful next PR would be:

**Milestone A — Beginner-safe entry (½ day):**
- Fix the `isGameInProgress` false-positive on page load.
- Rewrite step 1–2 copy: opening sentence should name the game genre
  ("turn-based tactics") and the objective ("pass to your Captain").
- Kill the formulas from tutorial copy (they can survive in the Rules
  modal).
- Add a "Skip tutorial" button next to the close X.
- Hide the timer widget while any tutorial step is showing.

**Milestone B — Scripted sandbox (~1 day):**
- Add `INIT_MATCH_SANDBOX` action to the reducer, taking an explicit
  `pieces` array and `ballHolderId`, and starting in `PLAYER_PLAN` with a
  no-op AI (a `disableAI: true` flag on tutorial matches).
- Define 4 chapter setups as fixtures in `tutorial.ts`.
- Refactor `TutorialOverlay` from "steps" to "chapters" — each chapter has
  its own setup and its own beats.

**Milestone C — Spotlight + on-fail nudges (½ day):**
- Semi-transparent dark overlay with a cutout around the highlighted
  element (SVG mask trick — 15 lines).
- On any click that isn't the required target, briefly flash the pointer
  and shake it. After N misses, show "Show me how" that auto-demonstrates.

**Milestone D — Contextual, in-match tooltips (~½ day):**
- The FIRST time each of these events fires in a real match, pop a small
  parchment tooltip: holding foul, interception, low energy, hand full,
  post-goal restart. Set a "seen" flag in localStorage so they never repeat.
- This is where deep mechanics teach themselves without a curriculum.

Total ≈ 2.5 dev days for a tutorial that a naïve user can actually
graduate from.

---

## 7. One-line summary

> **The current tutorial is a documented UI tour. The tutorial we want is
> a coached first game where every rule is a payoff for something the
> player just did.**
