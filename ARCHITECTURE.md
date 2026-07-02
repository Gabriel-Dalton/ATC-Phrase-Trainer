# Architecture

The app is a Vite + React + TypeScript single-page application with a strict
one-way layering. Lower layers never import from higher ones, and React is
confined to the top two.

```
┌─────────────────────────────────────────────────────────┐
│  components/          React UI (presentation only)      │
│  App.tsx              wiring + persistence              │
├─────────────────────────────────────────────────────────┤
│  hooks/               React ↔ engine bridge             │
├─────────────────────────────────────────────────────────┤
│  engine/              pure simulation (no React/DOM)    │
│  audio/               browser audio I/O                 │
└─────────────────────────────────────────────────────────┘
```

## engine/ — the simulation core

| Module | Responsibility |
| --- | --- |
| `types.ts` | All shared domain types (`FlightPlan`, `CommStep`, `Aircraft`, `SessionSnapshot`, …) |
| `data.ts` | Static data: airlines, SIDs, frequencies, runway flows, taxi routes, phonetic alphabet, ranks |
| `phraseology.ts` | Number/identifier → spoken-ATC formatting (`sayAltitude`, `sayRunway`, …) and the accepted-pattern builders used in grading |
| `grader.ts` | Transcript normalizer (niner/tree/decimal, spelled digits, thousands, flight levels) + element-based scoring |
| `flightgen.ts` | Procedural generation: builds a `FlightPlan` and the ordered `CommStep[]` for a departure or arrival, including the player-aircraft choreography attached to each step |
| `world.ts` | `SimWorld`: aircraft kinematics (headings, speeds, climbs, taxi waypoints, a crude ILS), ambient AI arrivals/departures. Ticked at animation-frame rate |
| `session.ts` | `FlightSession`: the state machine. Owns the step sequence, response timers, retry logic, scoring, and the transmission log. Exposes an immutable `SessionSnapshot` via `subscribe`/`getSnapshot` |

The session is the only stateful orchestrator. Every mutation goes through
`patch()`, which produces a new snapshot object — React subscribes with
`useSyncExternalStore`, so renders are driven purely by snapshot identity.

### The comms loop

```
runStep ──► speak ATC ──► awaiting=true, arm response timer
                              │
              ┌───────────────┼──────────────────────┐
              ▼               ▼                      ▼
        submit(text)    timeout #1             timeout #2
        grade readback  "how do you read?"     score 0, next step
              │
     ok? ─────┼───── <80% & first attempt? → "negative, I say again…" (retry)
              ▼
        score + feedback ──► aircraft executes instruction ──► next step
```

## audio/ — browser I/O

| Module | Responsibility |
| --- | --- |
| `tts.ts` | Serialized speech-synthesis queue; watchdog for platforms that never fire `onend` |
| `radioFx.ts` | WebAudio squelch clicks + carrier hiss around transmissions |
| `recognition.ts` | `SpeechCapture` — push-to-talk built on a **hot** continuous recognition session |

### Why the hot-mic design

Starting the Web Speech engine on key-down loses the first ~0.5–1s of audio,
which is exactly when a pilot says the callsign. `SpeechCapture` instead:

1. requests mic permission explicitly up front (denial is a visible state),
2. keeps one continuous recognition session running for the whole flight,
   auto-restarting whenever the browser ends it,
3. uses the PTT key only to mark which recognition results belong to the
   transmission (a result-index boundary at key-down, a grace period at
   key-up to let the recognizer finalize).

Transcripts survive browser-initiated session restarts mid-transmission.

## hooks/ — the React bridge

- `useSession` — `useSyncExternalStore` over the `FlightSession` snapshot.
- `usePushToTalk` — owns a `SpeechCapture`, exposes keyed/status state, binds
  the spacebar (ignored while typing), and steps on in-progress TTS when keyed.
- `useLocalStorage` — persisted settings (`atc-sim-settings`) and career stats
  (`atc-sim-stats`).

## components/ — presentation

`RadarScope` is the one component with real logic: it runs the single
`requestAnimationFrame` loop that both ticks `SimWorld` and paints the canvas
(coastline, compass rose, range rings, runways + extended centrelines,
en-route fixes, targets with velocity leaders, altitude-trend datablocks,
hover/click selection, range control). Everything else renders snapshot data.

## Testing

`window.__atc` exposes `{ session, world, tts }` so Playwright tests can mute
TTS, compress inter-step delays (`session.delayScale`), and read engine state
directly while driving the real UI.
