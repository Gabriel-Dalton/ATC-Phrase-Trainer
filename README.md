# CYVR ATC Sim

A browser-based air traffic control radio simulator set at Vancouver
International (CYVR). Fly a full **departure** or **arrival** as the pilot:
pick up your IFR clearance, taxi, take off, get vectored — one controller at
a time, live on frequency — and get graded on every readback.

Built with **React + TypeScript + Vite**. No backend; everything runs in the
browser (Web Speech API for voice, WebAudio for radio effects, canvas for the
radar scope).

## Development

```bash
npm install
npm run dev        # local dev server
npm run build      # type-check + production build to dist/
npm run preview    # serve the production build locally
```

## Deploying to Vercel

The repo is a standard Vite app — import it into Vercel and the framework
preset is detected automatically (build `npm run build`, output `dist/`).
No configuration or environment variables required.

> Voice input needs a secure origin (https or localhost), which Vercel
> provides out of the box. Chrome and Edge have the best Web Speech support.

## What's in a flight

Every flight is procedurally generated — airline, flight number, aircraft
type, destination, SID, squawk, runway flow (east 08s / west 26s), wind and
altimeter change every time.

- **Departure**: ATIS → clearance delivery → ground (pushback, taxi, runway
  crossing) → tower (line up and wait, takeoff) → departure (vectors, climbs)
  → handoff to Centre.
- **Arrival**: check-in with terminal → descents and speed control → vectors
  to final → ILS clearance → tower → landing → runway exit → taxi to the gate.
  About 1 in 5 arrivals gets a **go-around** and is re-vectored for another
  approach.
- Random traffic advisories, "how do you read?" prompts if you go quiet, and
  one corrected retry when a readback is wrong.

## How to respond

- **Hold SPACE** (or the mic button) to transmit, release to send. The mic is
  armed the moment ATC finishes talking, so your first words are never clipped.
- No microphone? **Type the readback and press Enter** — it plays identically.

> **Voice needs a cloud speech service.** Chrome's `SpeechRecognition` streams
> audio to Google's servers, so voice needs Chrome or Edge on a normal network
> over HTTPS. **Brave and other privacy browsers disable that endpoint**, which
> shows up as "voice unavailable" — type your readbacks there. The sim is fully
> playable by typing.
- Readbacks are graded on the items that legally matter: runways, altitudes,
  headings, frequencies, squawk codes, hold-short instructions, clearances.
  The grader understands radio phraseology — "niner", "tree", "decimal",
  spelled-out digits and "flight level two four zero" all normalize correctly.

## The scope

The radar is live: your aircraft flies what you read back (taxi, takeoff
roll, vectors, ILS intercept, go-around) while ambient AI traffic moves
around you. Coastline, compass rose, range rings, en-route fixes, velocity
leaders, altitude-trend datablocks, and hover/click target selection.
**Drag to pan, scroll or use the buttons to zoom, and recenter on CYVR.**

## Scoring

- **Score** is your total for the current flight. **XP** is the lifetime sum of
  every flight's score, and it drives your **rank** (Student Pilot → Check
  Airman) — the progress bar in the header fills toward the next rank.
- Each correct readback is worth 100 points, plus a speed bonus (+30 fast,
  +15 prompt). Consecutive correct readbacks build a **streak multiplier**
  (×1.25 at 3, ×1.5 at 5, ×2 at 8), and difficulty multiplies on top (First
  Officer ×1.5, Captain ×2). Every readback shows exactly how its points broke
  down.

## Progression

Points per transmission with speed bonuses and streaks; three difficulties
(Rookie shows the transmission text, First Officer is listen-only, Captain is
fast speech with no retries at 2× points); persistent XP and ranks from
Student Pilot to Check Airman; a full per-transmission debrief after every
flight.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for how the code is organized.

> Training simulation only — not for real-world ATC or flight operations.
> Phraseology is simplified from the Canadian AIM.
