const PHRASES = [
  {
    id: "yvr-arrival-ils-08r",
    callsign: "WestJet 407",
    atc: "WestJet 407, maintain three thousand until established, cleared ILS runway zero eight right.",
    meaning: "Hold 3,000 ft until established, then continue the ILS approach to Runway 08R.",
    expectedReadback: "Maintain three thousand until established, cleared ILS zero eight right, WestJet 407.",
    sector: "Approach",
  },
  {
    id: "yvr-departure-abbot6",
    callsign: "Air Canada 162",
    atc: "Air Canada 162, cleared to Edmonton via ABBOT six departure, runway zero eight left. Maintain five thousand, expect flight level two four zero ten minutes after departure.",
    meaning: "Cleared to Edmonton via ABBOT6, depart 08L, climb to 5,000 ft and expect FL240 after 10 minutes.",
    expectedReadback:
      "Cleared to Edmonton via ABBOT six, runway zero eight left, maintain five thousand, expect flight level two four zero ten minutes after, Air Canada 162.",
    sector: "Delivery",
  },
  {
    id: "yvr-ground-taxi",
    callsign: "Jazz 3230",
    atc: "Jazz 3230, taxi to runway zero eight left via Alpha, Charlie, hold short of runway zero eight right.",
    meaning: "Taxi via Alpha/Charlie to 08L and stop before crossing 08R.",
    expectedReadback:
      "Taxi to zero eight left via Alpha Charlie, hold short zero eight right, Jazz 3230.",
    sector: "Ground",
  },
  {
    id: "yvr-tower-lineup",
    callsign: "Harbour Air 59",
    atc: "Harbour Air 59, line up and wait runway zero eight left, landing traffic on zero eight right.",
    meaning: "Enter and hold on 08L while another aircraft lands on 08R.",
    expectedReadback: "Line up and wait zero eight left, Harbour Air 59.",
    sector: "Tower",
  },
  {
    id: "yvr-approach-descend",
    callsign: "Alaska 213",
    atc: "Alaska 213, descend to four thousand, reduce speed to two one zero knots.",
    meaning: "Descend to 4,000 ft and slow to 210 knots.",
    expectedReadback: "Down to four thousand, speed two one zero, Alaska 213.",
    sector: "Approach",
  },
  {
    id: "yvr-tower-cleared-takeoff",
    callsign: "Sunwing 602",
    atc: "Sunwing 602, winds zero seven zero at eight, runway zero eight left cleared for takeoff.",
    meaning: "Takeoff clearance on 08L with wind 070/8.",
    expectedReadback: "Cleared for takeoff zero eight left, Sunwing 602.",
    sector: "Tower",
  },
  {
    id: "yvr-ground-push",
    callsign: "Pacific Coastal 31",
    atc: "Pacific Coastal 31, pushback approved, expect taxi to runway two six left.",
    meaning: "Pushback allowed; anticipate taxiing to 26L.",
    expectedReadback: "Pushback approved, expect two six left, Pacific Coastal 31.",
    sector: "Ground",
  },
  {
    id: "yvr-approach-contact-tower",
    callsign: "Porter 114",
    atc: "Porter 114, contact tower one one niner decimal five, good day.",
    meaning: "Switch to tower frequency 119.5 MHz.",
    expectedReadback: "Over to tower on one one niner decimal five, Porter 114.",
    sector: "Approach",
  },
];

const SCENARIOS = [
  {
    task: "Sequence three arrivals onto 08R, keep 170 knots to 4 DME.",
    strip: {
      callsign: "WSH407",
      clearance: "Cleared ILS 08R, maintain 3,000 until established.",
      meta: "Runway 08R • ILS • Speed 170",
    },
    phrase: "WestJet 407, reduce speed to one seven zero, maintain three thousand until established, cleared ILS runway zero eight right.",
  },
  {
    task: "Coordinate a departure gap for 08L between two arrivals.",
    strip: {
      callsign: "ACA162",
      clearance: "Cleared for takeoff 08L, fly runway heading, climb 5,000.",
      meta: "Runway 08L • RWY HDG • Initial 5000",
    },
    phrase: "Air Canada 162, runway zero eight left cleared for takeoff, fly runway heading, maintain five thousand.",
  },
  {
    task: "Hold a taxiing aircraft short of 08R crossing.",
    strip: {
      callsign: "JZA3230",
      clearance: "Taxi to 08L via Alpha, hold short 08R.",
      meta: "Taxi • Hold Short • 08R",
    },
    phrase: "Jazz 3230, taxi to runway zero eight left via Alpha, hold short of runway zero eight right.",
  },
];

const RUNWAY_CONFIGS = [
  { runways: "08L / 08R", arrivals: "08R", departures: "08L" },
  { runways: "26L / 26R", arrivals: "26R", departures: "26L" },
];

const TRAFFIC = [
  { callsign: "ACA162", status: "IFR to CYEG • Gate D72" },
  { callsign: "WSH407", status: "Established ILS 08R • 6 DME" },
  { callsign: "JZA3230", status: "Taxiing to 08L via A/C" },
  { callsign: "POE114", status: "Holding short 08L" },
  { callsign: "HBR59", status: "Clear of 08R, ready for departure" },
];

const elements = {
  runwayConfig: document.getElementById("runway-config"),
  atisCode: document.getElementById("atis-code"),
  windReadout: document.getElementById("wind-readout"),
  altimeter: document.getElementById("altimeter"),
  atisSummary: document.getElementById("atis-summary"),
  matchAtc: document.getElementById("match-atc"),
  matchCallsign: document.getElementById("match-callsign"),
  matchChoices: document.getElementById("match-choices"),
  matchResult: document.getElementById("match-result"),
  readbackAtc: document.getElementById("readback-atc"),
  readbackCallsign: document.getElementById("readback-callsign"),
  readbackText: document.getElementById("readback-text"),
  readbackResult: document.getElementById("readback-result"),
  sessionScore: document.getElementById("session-score"),
  sessionStreak: document.getElementById("session-streak"),
  sessionMode: document.getElementById("session-mode"),
  trafficList: document.getElementById("traffic-list"),
  scenarioTasks: document.getElementById("scenario-tasks"),
  stripCallsign: document.getElementById("strip-callsign"),
  stripClearance: document.getElementById("strip-clearance"),
  stripMeta: document.getElementById("strip-meta"),
  scenarioPhrase: document.getElementById("scenario-phrase"),
  sessionAtc: document.getElementById("session-atc"),
  sessionCallsign: document.getElementById("session-callsign"),
  sessionText: document.getElementById("session-text"),
  sessionResult: document.getElementById("session-result"),
  sessionTimeline: document.getElementById("session-timeline"),
  sessionMic: document.getElementById("session-mic"),
};

let score = 0;
let streak = 0;
let currentMatch = null;
let currentReadback = null;
let currentScenario = null;
let sessionQueue = [];
let currentSession = null;
let recognition = null;

const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);

const toWords = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9\s\.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const keyTokens = (text) => {
  const words = toWords(text).split(" ");
  const nums = [...text.matchAll(/\d+(?:\.\d+)?/g)].map((match) => match[0]);
  const keep = new Set([
    "descend",
    "climb",
    "maintain",
    "turn",
    "left",
    "right",
    "heading",
    "speed",
    "contact",
    "tower",
    "approach",
    "runway",
    "cleared",
    "ils",
    "rnnav",
    "ground",
    "hold",
    "short",
    "line",
    "wait",
    "taxi",
    "takeoff",
    "departure",
    "expect",
  ]);
  return {
    tokens: words.filter((word) => keep.has(word)),
    nums,
  };
};

const speak = (text, rate = 1) => {
  if (!("speechSynthesis" in window)) {
    return;
  }
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = rate;
  utterance.pitch = 1;
  utterance.volume = 1;
  const voices = speechSynthesis.getVoices();
  const selected = voices.find((voice) => /en|English/i.test(voice.lang));
  if (selected) utterance.voice = selected;
  speechSynthesis.cancel();
  speechSynthesis.speak(utterance);
};

const getSpeechRecognition = () => {
  if ("webkitSpeechRecognition" in window) {
    return new window.webkitSpeechRecognition();
  }
  if ("SpeechRecognition" in window) {
    return new window.SpeechRecognition();
  }
  return null;
};

const initRecognition = () => {
  const engine = getSpeechRecognition();
  if (!engine) {
    elements.sessionMic.disabled = true;
    elements.sessionMic.textContent = "🎙️ Mic Unsupported";
    return;
  }
  recognition = engine;
  recognition.lang = "en-US";
  recognition.interimResults = true;
  recognition.continuous = false;
  recognition.onresult = (event) => {
    const transcript = Array.from(event.results)
      .map((result) => result[0].transcript)
      .join(" ");
    elements.sessionText.value = transcript.trim();
  };
  recognition.onerror = () => {
    elements.sessionResult.textContent = "Microphone error. Try again or type your readback.";
  };
};

const updateScore = (delta, resetStreak = false) => {
  score = Math.max(0, score + delta);
  streak = resetStreak ? 0 : Math.max(0, streak + delta);
  elements.sessionScore.textContent = score;
  elements.sessionStreak.textContent = streak;
};

const buildMatch = () => {
  currentMatch = PHRASES[Math.floor(Math.random() * PHRASES.length)];
  elements.matchAtc.textContent = currentMatch.atc;
  elements.matchCallsign.textContent = currentMatch.callsign;
  const choices = shuffle([
    currentMatch.meaning,
    ...shuffle(PHRASES.filter((phrase) => phrase.id !== currentMatch.id))
      .slice(0, 3)
      .map((phrase) => phrase.meaning),
  ]);
  elements.matchChoices.innerHTML = "";
  choices.forEach((choice) => {
    const button = document.createElement("button");
    button.className = "choice";
    button.textContent = choice;
    button.addEventListener("click", () => handleChoice(button, choice));
    elements.matchChoices.appendChild(button);
  });
  elements.matchResult.textContent = "";
};

const handleChoice = (button, choice) => {
  const allChoices = elements.matchChoices.querySelectorAll(".choice");
  allChoices.forEach((choiceButton) => {
    choiceButton.classList.remove("choice--correct", "choice--wrong");
    choiceButton.disabled = true;
  });
  const correct = choice === currentMatch.meaning;
  button.classList.add(correct ? "choice--correct" : "choice--wrong");
  elements.matchResult.textContent = correct
    ? "Correct — great situational awareness."
    : `Not quite. Correct answer: ${currentMatch.meaning}`;
  updateScore(correct ? 1 : 0, !correct);
};

const buildReadback = () => {
  currentReadback = PHRASES[Math.floor(Math.random() * PHRASES.length)];
  elements.readbackAtc.textContent = currentReadback.atc;
  elements.readbackCallsign.textContent = currentReadback.callsign;
  elements.readbackText.value = "";
  elements.readbackResult.textContent = "";
};

const gradeReadback = (typed, reference) => {
  const typedTokens = keyTokens(typed);
  const refTokens = keyTokens(reference);
  const required = new Set(refTokens.tokens);
  const hits = typedTokens.tokens.filter((token) => required.has(token)).length;
  const tokenScore = required.size ? hits / required.size : 1;
  const numsA = new Set(typedTokens.nums);
  const numsB = new Set(refTokens.nums);
  const numHits = [...numsB].filter((num) => numsA.has(num)).length;
  const numScore = numsB.size ? numHits / numsB.size : 1;
  const overall = Math.round((0.65 * tokenScore + 0.35 * numScore) * 100);
  return { overall, ok: overall >= 75, required: [...required], nums: [...numsB] };
};

const updateReadbackResult = () => {
  const typed = elements.readbackText.value.trim();
  if (!typed) {
    elements.readbackResult.textContent = "Type a readback to check your accuracy.";
    return;
  }
  const grade = gradeReadback(typed, currentReadback.expectedReadback);
  elements.readbackResult.innerHTML = `
    <strong>${grade.ok ? "Great readback!" : "Needs improvement."}</strong>
    Score: ${grade.overall}%.
    <div class="muted">Key tokens: ${grade.required.join(", ") || "—"}.</div>
    <div class="muted">Numbers: ${grade.nums.join(", ") || "—"}.</div>
    ${grade.ok ? "" : `<div class="muted">Ideal: ${currentReadback.expectedReadback}</div>`}
  `;
  updateScore(grade.ok ? 1 : 0, !grade.ok);
};

const buildSession = () => {
  sessionQueue = shuffle(PHRASES).slice(0, 5);
  currentSession = sessionQueue.shift();
  elements.sessionTimeline.innerHTML = "";
  elements.sessionResult.textContent = "";
  elements.sessionText.value = "";
  renderSessionStep();
};

const renderSessionStep = () => {
  if (!currentSession) {
    elements.sessionAtc.textContent = "Session complete. Great job!";
    elements.sessionCallsign.textContent = "";
    return;
  }
  elements.sessionAtc.textContent = currentSession.atc;
  elements.sessionCallsign.textContent = currentSession.callsign;
  elements.sessionText.value = "";
  elements.sessionResult.textContent = "";
  speak(currentSession.atc, 1.02);
};

const scoreSessionReadback = () => {
  if (!currentSession) {
    elements.sessionResult.textContent = "Start a session to begin.";
    return;
  }
  const typed = elements.sessionText.value.trim();
  if (!typed) {
    elements.sessionResult.textContent = "Speak or type your readback before scoring.";
    return;
  }
  const grade = gradeReadback(typed, currentSession.expectedReadback);
  elements.sessionResult.innerHTML = `
    <strong>${grade.ok ? "On point!" : "Readback needs tightening."}</strong>
    Score: ${grade.overall}%.
    <div class="muted">Key tokens missed: ${
      grade.required.filter((token) => !keyTokens(typed).tokens.includes(token)).join(", ") || "None"
    }.</div>
    <div class="muted">Expected numbers: ${grade.nums.join(", ") || "—"}.</div>
  `;
  const timelineItem = document.createElement("li");
  timelineItem.innerHTML = `
    <strong>${currentSession.callsign}</strong>
    <span>${currentSession.atc}</span>
    <div class="muted">Your readback: ${typed}</div>
    <div class="muted">Score: ${grade.overall}%</div>
  `;
  elements.sessionTimeline.prepend(timelineItem);
  updateScore(grade.ok ? 2 : 0, !grade.ok);
};

const nextSessionStep = () => {
  if (!sessionQueue.length) {
    currentSession = null;
  } else {
    currentSession = sessionQueue.shift();
  }
  renderSessionStep();
};

const buildTraffic = () => {
  elements.trafficList.innerHTML = "";
  shuffle(TRAFFIC).forEach((item) => {
    const row = document.createElement("li");
    row.innerHTML = `${item.callsign} <span>${item.status}</span>`;
    elements.trafficList.appendChild(row);
  });
};

const buildScenario = () => {
  currentScenario = SCENARIOS[Math.floor(Math.random() * SCENARIOS.length)];
  elements.scenarioTasks.innerHTML = "";
  [currentScenario.task, "Monitor ground for crossing requests.", "Maintain runway separation minima."]
    .map((task) => {
      const li = document.createElement("li");
      li.textContent = task;
      return li;
    })
    .forEach((li) => elements.scenarioTasks.appendChild(li));
  elements.stripCallsign.textContent = currentScenario.strip.callsign;
  elements.stripClearance.textContent = currentScenario.strip.clearance;
  elements.stripMeta.textContent = currentScenario.strip.meta;
  elements.scenarioPhrase.textContent = currentScenario.phrase;
};

const buildAtis = () => {
  const config = RUNWAY_CONFIGS[Math.floor(Math.random() * RUNWAY_CONFIGS.length)];
  const atisLetters = ["ALPHA", "BRAVO", "CHARLIE", "DELTA", "ECHO", "FOXTROT"];
  const atisCode = atisLetters[Math.floor(Math.random() * atisLetters.length)];
  const windDirection = String(60 + Math.floor(Math.random() * 40)).padStart(3, "0");
  const windSpeed = 6 + Math.floor(Math.random() * 10);
  const temp = 12 + Math.floor(Math.random() * 10);
  const dew = temp - 6;
  const alt = (29.7 + Math.random() * 0.7).toFixed(2);
  elements.runwayConfig.textContent = config.runways;
  elements.atisCode.textContent = atisCode;
  elements.windReadout.textContent = `${windDirection}/${windSpeed}`;
  elements.altimeter.textContent = alt;
  elements.atisSummary.textContent = `YVR information ${atisCode}. Wind ${windDirection} at ${windSpeed}. Visibility 10. Few clouds 4000. Temperature ${temp}, dewpoint ${dew}. Altimeter ${alt}. Landing runway ${config.arrivals}, departing runway ${config.departures}.`;
};

const setModeLabel = (label) => {
  elements.sessionMode.textContent = label;
};

const initTabs = () => {
  const tabs = document.querySelectorAll(".tab");
  const cards = document.querySelectorAll(".card");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((btn) => btn.classList.remove("tab--active"));
      tab.classList.add("tab--active");
      cards.forEach((card) => card.classList.remove("card--active"));
      const target = document.getElementById(tab.dataset.tab);
      target.classList.add("card--active");
      setModeLabel(tab.textContent.trim());
    });
  });
};

document.getElementById("match-next").addEventListener("click", buildMatch);
document.getElementById("match-play").addEventListener("click", () => {
  if (currentMatch) speak(currentMatch.atc, 1.02);
});
document.getElementById("readback-next").addEventListener("click", buildReadback);
document.getElementById("readback-play").addEventListener("click", () => {
  if (currentReadback) speak(currentReadback.atc, 1.02);
});
document.getElementById("readback-check").addEventListener("click", updateReadbackResult);
document.getElementById("readback-clear").addEventListener("click", () => {
  elements.readbackText.value = "";
});
document.getElementById("readback-speak").addEventListener("click", () => {
  speak(elements.readbackText.value || "No readback entered.");
});
document.getElementById("session-start").addEventListener("click", buildSession);
document.getElementById("session-next").addEventListener("click", nextSessionStep);
document.getElementById("session-check").addEventListener("click", scoreSessionReadback);
document.getElementById("session-clear").addEventListener("click", () => {
  elements.sessionText.value = "";
});
elements.sessionMic.addEventListener("mousedown", () => {
  if (recognition) {
    recognition.start();
    elements.sessionMic.textContent = "🎙️ Listening...";
  }
});
elements.sessionMic.addEventListener("mouseup", () => {
  if (recognition) {
    recognition.stop();
    elements.sessionMic.textContent = "🎙️ Hold to Talk";
  }
});
elements.sessionMic.addEventListener("mouseleave", () => {
  if (recognition) {
    recognition.stop();
    elements.sessionMic.textContent = "🎙️ Hold to Talk";
  }
});
document.getElementById("scenario-generate").addEventListener("click", () => {
  buildScenario();
  buildAtis();
});
document.getElementById("scenario-play").addEventListener("click", () => {
  if (currentScenario) speak(currentScenario.phrase, 1.01);
});
document.getElementById("refresh-traffic").addEventListener("click", buildTraffic);
document.getElementById("start-session").addEventListener("click", () => {
  buildMatch();
  buildReadback();
  buildSession();
  buildScenario();
  buildTraffic();
  buildAtis();
});
document.getElementById("play-atis").addEventListener("click", () => {
  speak(elements.atisSummary.textContent, 1.02);
});

initTabs();
buildMatch();
buildReadback();
buildScenario();
buildTraffic();
buildAtis();
initRecognition();
