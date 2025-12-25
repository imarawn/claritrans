import { toAbc, clarinetTransposeSemis } from "./note_input.js";

const abcjs = window.ABCJS; // kommt aus abcjs-basic-min.js

const $ = (id) => document.getElementById(id);

const LETTER_ORDER = ["C", "D", "E", "F", "G", "A", "B"];
const LETTER_TO_INDEX = LETTER_ORDER.reduce((acc, letter, idx) => {
  acc[letter] = idx;
  return acc;
}, {});

const STAFF_LINE_SPACING = 16;
const STAFF_STEP = STAFF_LINE_SPACING / 2;
const STAFF_TOP = 30;
const STAFF_BOTTOM = STAFF_TOP + 4 * STAFF_LINE_SPACING;
const STAFF_LEFT = 20;
const STAFF_NOTE_START_X = 140;
const STAFF_ELEMENT_SPACING = 28;
const STAFF_REF_NOTE = { letter: "E", oct: 4 };
const EXTRA_GUIDE_COUNT = 4;
const STAFF_MAX_STEPS = 28;
const STAFF_MIN_STEPS = -20;
const DEFAULT_OCTAVE = 4;

const KEY_SIG_ORDERS = {
  sharp: ["F#", "C#", "G#", "D#", "A#", "E#", "B#"],
  flat: ["Bb", "Eb", "Ab", "Db", "Gb", "Cb", "Fb"]
};

const KEY_LABELS = {
  C: "C-Dur / a-moll",
  G: "G-Dur / e-moll",
  D: "D-Dur / h-moll",
  A: "A-Dur / f#-moll",
  E: "E-Dur / c#-moll",
  B: "H-Dur / g#-moll",
  "F#": "F#-Dur / d#-moll",
  "C#": "C#-Dur / a#-moll",
  F: "F-Dur / d-moll",
  Bb: "B-Dur / g-moll",
  Eb: "Es-Dur / c-moll",
  Ab: "As-Dur / f-moll",
  Db: "Des-Dur / b-moll",
  Gb: "Ges-Dur / es-moll",
  Cb: "Ces-Dur / as-moll"
};

const staffState = {
  canvas: null,
  ctx: null,
  elements: []
};

const appState = {
  signatureType: null,
  selectedAccidentals: [],
  key: "C",
  meter: "4/4"
};


function setStatus(msg) {
  $("status").textContent = msg;
}

function render() {
  const input = $("in").value || "";
  const clar = $("clarinet").value;
  const transposeSemis = clarinetTransposeSemis(clar);
  const preferFlats = appState.signatureType === "flat";
  const defaultOct = DEFAULT_OCTAVE;
  const key = appState.key;
  const meter = appState.meter || "4/4";

  const abc = toAbc({ input, transposeSemis, preferFlats, defaultOct, key, meter });

  $("abc").textContent = abc;
  $("paper").innerHTML = "";

  try {
    abcjs.renderAbc("paper", abc, { responsive: "resize" });
    setStatus(`gerendert (${clar}, ${transposeSemis >= 0 ? "+" : ""}${transposeSemis})`);
  } catch (e) {
    setStatus("Render-Fehler");
    console.error(e);
  }

  redrawStaff();
}

async function copyAbc() {
  const text = $("abc").textContent || "";
  if (!text) return;
  await navigator.clipboard.writeText(text);
  setStatus("ABC kopiert");
}

function setupKeySignatureControls() {
  document.querySelectorAll(".sig-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const accidental = btn.dataset.acc;
      const container = btn.closest("[data-type]");
      const type = container?.dataset.type;
      if (!accidental || !type) return;
      applySignatureSelection(accidental, type);
    });
  });

  $("btnSigReset")?.addEventListener("click", resetSignatureSelection);
  resetSignatureSelection();
}

function applySignatureSelection(accidental, type) {
  const order = KEY_SIG_ORDERS[type];
  if (!order) return;
  const idx = order.indexOf(accidental);
  if (idx === -1) return;
  appState.signatureType = type;
  appState.selectedAccidentals = order.slice(0, idx + 1);
  updateSignatureButtons();
  updateKeyFromSignature();
}

function resetSignatureSelection() {
  appState.signatureType = null;
  appState.selectedAccidentals = [];
  updateSignatureButtons();
  updateKeyFromSignature();
}

function updateSignatureButtons() {
  document.querySelectorAll(".sig-btn").forEach((btn) => {
    const accidental = btn.dataset.acc;
    const container = btn.closest("[data-type]");
    const type = container?.dataset.type;
    const isActive = Boolean(
      type &&
      type === appState.signatureType &&
      accidental &&
      appState.selectedAccidentals.includes(accidental)
    );
    btn.classList.toggle("active", isActive);
  });
}

function updateKeyFromSignature() {
  const selection = appState.selectedAccidentals;
  const keyName = findKeyForSignature(selection);
  appState.key = keyName;
  if (!selection.length) {
    appState.signatureType = null;
  }
  const label = KEY_LABELS[keyName] || `K:${keyName}`;
  const el = $("keyDetected");
  if (el) el.textContent = label;
  render();
}

function findKeyForSignature(selection) {
  if (!selection.length) return "C";
  for (const [keyName, entries] of Object.entries(KEY_SIGNATURES)) {
    if (entries.length !== selection.length) continue;
    let matches = true;
    for (let i = 0; i < entries.length; i += 1) {
      if (entries[i] !== selection[i]) {
        matches = false;
        break;
      }
    }
    if (matches) return keyName;
  }
  return "C";
}

function setupStaffInput() {
  const canvas = $("staffCanvas");
  if (!canvas) return;

  staffState.canvas = canvas;
  staffState.ctx = canvas.getContext("2d");

  canvas.addEventListener("click", handleStaffClick);
  $("btnStaffBar")?.addEventListener("click", addStaffBar);
  $("btnStaffUndo")?.addEventListener("click", undoStaffElement);
  $("btnStaffClear")?.addEventListener("click", clearStaffElements);

  redrawStaff();
}

function handleStaffClick(evt) {
  if (!staffState.canvas) return;
  const rect = staffState.canvas.getBoundingClientRect();
  const y = evt.clientY - rect.top;
  const note = yToStaffNote(y);
  if (!note) return;
  appendStaffNote(note);
}

function appendStaffNote(note) {
  const accidental = getDefaultAccidental(note.letter);
  const token = formatStaffToken(note.letter, accidental, note.oct);
  appendStaffElement({ type: "note", note, accidental, token });
}

function appendStaffElement(element) {
  staffState.elements.push(element);
  syncStaffInputFromElements();
}

function addStaffBar() {
  appendStaffElement({ type: "bar", token: "|" });
}

function undoStaffElement() {
  if (!staffState.elements.length) return;
  staffState.elements.pop();
  syncStaffInputFromElements();
}

function clearStaffElements() {
  if (!staffState.elements.length) return;
  staffState.elements = [];
  syncStaffInputFromElements();
}

function syncStaffInputFromElements() {
  const tokens = staffState.elements.map((el) => (el.type === "bar" ? "|" : el.token));
  $("in").value = tokens.join(" ");
  render();
}

function redrawStaff() {
  const ctx = staffState.ctx;
  if (!ctx || !staffState.canvas) return;

  ctx.clearRect(0, 0, staffState.canvas.width, staffState.canvas.height);
  drawStaffBase(ctx);
  drawKeySignature(ctx);
  drawStaffElements(ctx);
}

function drawStaffBase(ctx) {
  drawExtendedGuides(ctx);

  ctx.strokeStyle = "#555";
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i += 1) {
    const y = STAFF_TOP + i * STAFF_LINE_SPACING;
    ctx.beginPath();
    ctx.moveTo(STAFF_LEFT, y);
    ctx.lineTo(staffState.canvas.width - STAFF_LEFT, y);
    ctx.stroke();
  }
  ctx.font = "46px serif";
  ctx.fillStyle = "#333";
  ctx.fillText("𝄞", STAFF_LEFT - 10, STAFF_BOTTOM + 12);
}

function drawExtendedGuides(ctx) {
  ctx.save();
  ctx.strokeStyle = "rgba(22, 35, 59, 0.2)";
  ctx.lineWidth = 0.5;
  ctx.setLineDash([6, 6]);
  const width = staffState.canvas?.width ?? 0;
  for (let i = 1; i <= EXTRA_GUIDE_COUNT; i += 1) {
    const yTop = STAFF_TOP - i * STAFF_LINE_SPACING;
    const yBottom = STAFF_BOTTOM + i * STAFF_LINE_SPACING;
    ctx.beginPath();
    ctx.moveTo(STAFF_LEFT, yTop);
    ctx.lineTo(width - STAFF_LEFT, yTop);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(STAFF_LEFT, yBottom);
    ctx.lineTo(width - STAFF_LEFT, yBottom);
    ctx.stroke();
  }
  ctx.restore();
}

function drawKeySignature(ctx) {
  const entries = KEY_SIGNATURES[appState.key] || [];
  if (!entries.length) return;

  let x = STAFF_LEFT + 50;
  ctx.fillStyle = "#222";
  ctx.font = "20px serif";

  for (const entry of entries) {
    const base = entry[0];
    const accidental = entry.includes("#") ? "#" : "b";
    const offset = accidental === "#" ? KEY_SIG_POSITIONS_SHARP[base] : KEY_SIG_POSITIONS_FLAT[base];
    if (offset === undefined) continue;
    const y = STAFF_BOTTOM - offset * STAFF_STEP;
    ctx.fillText(accidental === "#" ? "♯" : "♭", x, y + 6);
    x += 16;
  }
}

function drawStaffElements(ctx) {
  let idx = 0;
  for (const el of staffState.elements) {
    const x = STAFF_NOTE_START_X + idx * STAFF_ELEMENT_SPACING;
    if (el.type === "note") {
      drawStaffNote(ctx, x, el);
    } else if (el.type === "bar") {
      drawBar(ctx, x);
    }
    idx += 1;
  }
}

function drawStaffNote(ctx, x, element) {
  const y = noteToY(element.note);
  const steps = noteToSteps(element.note);

  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.ellipse(x, y, 8, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#111";
  ctx.stroke();

  if (element.accidental) {
    ctx.font = "20px serif";
    ctx.fillText(element.accidental === "#" ? "♯" : "♭", x - 14, y + 6);
  }

  drawLedgerLines(ctx, x, steps);
}

function drawLedgerLines(ctx, x, steps) {
  const maxLineStep = 8 + EXTRA_GUIDE_COUNT * 2;
  const minLineStep = 0 - EXTRA_GUIDE_COUNT * 2;

  if (steps > maxLineStep) {
    for (let s = maxLineStep + 2; s <= steps; s += 2) {
      drawLedgerLine(ctx, x, s);
    }
  } else if (steps < minLineStep) {
    for (let s = minLineStep - 2; s >= steps; s -= 2) {
      drawLedgerLine(ctx, x, s);
    }
  }
}

function drawLedgerLine(ctx, x, step) {
  const note = stepsToNote(step);
  const y = noteToY(note);
  ctx.beginPath();
  ctx.moveTo(x - 10, y);
  ctx.lineTo(x + 10, y);
  ctx.stroke();
}

function drawBar(ctx, x) {
  ctx.strokeStyle = "#333";
  ctx.beginPath();
  ctx.moveTo(x, STAFF_TOP - 10);
  ctx.lineTo(x, STAFF_BOTTOM + 10);
  ctx.stroke();
}

function yToStaffNote(y) {
  const refY = STAFF_BOTTOM;
  let steps = Math.round((refY - y) / STAFF_STEP);
  if (steps > STAFF_MAX_STEPS) steps = STAFF_MAX_STEPS;
  if (steps < STAFF_MIN_STEPS) steps = STAFF_MIN_STEPS;
  return stepsToNote(steps);
}

function noteToSteps(note) {
  let steps = (note.oct - STAFF_REF_NOTE.oct) * LETTER_ORDER.length;
  steps += LETTER_TO_INDEX[note.letter] - LETTER_TO_INDEX[STAFF_REF_NOTE.letter];
  return steps;
}

function stepsToNote(steps) {
  let idx = LETTER_TO_INDEX[STAFF_REF_NOTE.letter];
  let oct = STAFF_REF_NOTE.oct;
  let remaining = steps;

  while (remaining > 0) {
    idx += 1;
    if (idx >= LETTER_ORDER.length) {
      idx = 0;
      oct += 1;
    }
    remaining -= 1;
  }

  while (remaining < 0) {
    idx -= 1;
    if (idx < 0) {
      idx = LETTER_ORDER.length - 1;
      oct -= 1;
    }
    remaining += 1;
  }

  return { letter: LETTER_ORDER[idx], oct };
}

function noteToY(note) {
  const steps = noteToSteps(note);
  return STAFF_BOTTOM - steps * STAFF_STEP;
}

function formatStaffToken(letter, accidental, oct) {
  let base = letter;
  let suffix = accidental;

  if (letter === "B") {
    if (accidental === "b") {
      base = "Hb";
      suffix = "";
    } else {
      base = "H";
    }
  }

  return `${base}${suffix}${oct}`;
}

function getDefaultAccidental(letter) {
  const accMap = getKeyAccidentalMap();
  return accMap[letter] || "";
}

function getKeyAccidentalMap() {
  const entries = KEY_SIGNATURES[appState.key] || [];
  const map = {};
  for (const entry of entries) {
    const base = entry[0];
    const accidental = entry.includes("#") ? "#" : "b";
    map[base] = accidental;
  }
  return map;
}

const KEY_SIGNATURES = {
  C: [],
  G: ["F#"],
  D: ["F#", "C#"],
  A: ["F#", "C#", "G#"],
  E: ["F#", "C#", "G#", "D#"],
  B: ["F#", "C#", "G#", "D#", "A#"],
  "F#": ["F#", "C#", "G#", "D#", "A#", "E#"],
  "C#": ["F#", "C#", "G#", "D#", "A#", "E#", "B#"],
  F: ["Bb"],
  Bb: ["Bb", "Eb"],
  Eb: ["Bb", "Eb", "Ab"],
  Ab: ["Bb", "Eb", "Ab", "Db"],
  Db: ["Bb", "Eb", "Ab", "Db", "Gb"],
  Gb: ["Bb", "Eb", "Ab", "Db", "Gb", "Cb"],
  Cb: ["Bb", "Eb", "Ab", "Db", "Gb", "Cb", "Fb"]
};

const KEY_SIG_POSITIONS_SHARP = {
  F: 8,
  C: 5,
  G: 9,
  D: 6,
  A: 3,
  E: 7,
  B: 4
};

const KEY_SIG_POSITIONS_FLAT = {
  B: 4,
  E: 7,
  A: 3,
  D: 6,
  G: 2,
  C: 5,
  F: 1
};

function wire() {
  $("ver").textContent = `v${window.api?.version?.() ?? "?"}`;

  $("btnRender").addEventListener("click", render);
  $("btnCopy").addEventListener("click", copyAbc);

  $("clarinet").addEventListener("change", render);
  const meterEl = $("meter");
  if (meterEl) {
    appState.meter = meterEl.value || "4/4";
    meterEl.addEventListener("change", (e) => {
      appState.meter = e.target.value;
      render();
    });
  }

  setupKeySignatureControls();
  setupStaffInput();

  $("in").value = "";
  staffState.elements = [];
  render();
}

wire();
