# CYVR ATC SIM — Live Radio Simulation

A browser-based air traffic control radio simulator set at Vancouver International (CYVR).
Fly a full **departure** or **arrival** as the pilot: pick up your IFR clearance, taxi,
take off, get vectored — one controller at a time, live on frequency — and get graded
on every readback.

**No build step, no dependencies.** Open `index.html` in Chrome or Edge (best
speech-recognition support) or serve the folder with any static server:

```
python3 -m http.server
```

## What's in a flight

Every flight is procedurally generated — airline, flight number, aircraft type,
destination, SID, squawk, runway flow (east 08s / west 26s), wind, and altimeter
change every time.

- **Departure**: ATIS → clearance delivery → ground (pushback, taxi, runway crossing)
  → tower (line up and wait, takeoff) → departure (vectors, climbs) → handoff to Centre.
- **Arrival**: check-in with terminal → descents and speed control → vectors to final
  → ILS clearance → tower → landing → runway exit → taxi to gate.
  ~1 in 5 arrivals gets a **go-around** and is re-vectored for another approach.
- Random **traffic advisories** and one corrected retry when a readback is wrong
  ("negative, I say again…"), just like the real thing.

## How to respond

- **Hold SPACE** (or the mic button) to transmit, release to send — uses the browser's
  speech recognition.
- No mic? **Type the readback and press ENTER.**
- Readbacks are graded on the items that legally matter: runways, altitudes, headings,
  frequencies, squawk codes, hold-short instructions, clearances. The grader understands
  radio phraseology — "niner", "tree", "decimal", spelled-out digits, "flight level two
  four zero" all normalize correctly.

## The scope

The radar screen is live: your aircraft actually flies what you read back (taxi, takeoff
roll, vectors, ILS intercept, go-around), while ambient AI arrivals and departures move
around you with data blocks, leader lines, and history trails. Optional frequency
chatter and radio static/squelch effects round out the immersion.

## Progression

- Points per transmission, with speed bonuses and a streak counter.
- Three difficulties: **Rookie** (transmission text shown), **First Officer**
  (listen only), **Captain** (fast speech, no retry, 2× points).
- XP and rank (Student Pilot → Check Airman) persist between sessions, and every flight
  ends with a full debrief of each exchange.

## Project layout

```
index.html      page structure
styles.css      radar-room theme
js/data.js      airlines, SIDs, frequencies, ATC number/phonetic formatting
js/radio.js     TTS + radio effects, push-to-talk recognition, readback grader
js/radar.js     scope rendering, aircraft kinematics, ambient AI traffic
js/app.js       flight generation, comms step engine, scoring, UI
```

> Training simulation only — not for real-world ATC or flight operations.
> Phraseology is simplified from the Canadian AIM.
