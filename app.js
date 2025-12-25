(function () {
  "use strict";

  // --- Key signature lookup (from number of sharps/flats) ---
  // We keep a simple, deterministic mapping. Users can toggle Dur/Moll.
  var KEYS_MAJOR_SHARPS = ["C", "G", "D", "A", "E", "B", "F#", "C#"];
  var KEYS_MAJOR_FLATS  = ["C", "F", "Bb", "Eb", "Ab", "Db", "Gb", "Cb"];
  var KEYS_MINOR_SHARPS = ["Am", "Em", "Bm", "F#m", "C#m", "G#m", "D#m", "A#m"];
  var KEYS_MINOR_FLATS  = ["Am", "Dm", "Gm", "Cm", "Fm", "Bbm", "Ebm", "Abm"];

  var KEY_PC = {
    C:0, "B#":0,
    "C#":1, Db:1,
    D:2,
    "D#":3, Eb:3,
    E:4, Fb:4,
    F:5, "E#":5,
    "F#":6, Gb:6,
    G:7,
    "G#":8, Ab:8,
    A:9,
    "A#":10, Bb:10,
    B:11, H:11, Cb:11
  };

  var KEY_NAMES_SHARP = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
  var KEY_NAMES_FLAT  = ["C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","Cb"];

  // Prefer sharps for sharp keys, flats for flat keys; C/Am default to sharps.
  function prefersSharps(accType, accCount) {
    if (accType === "flats" && accCount > 0) return false;
    return true;
  }

  function keyFromSignature(accType, accCount, mode) {
    var n = clampInt(accCount, 0, 7);
    var isMajor = mode === "major";
    if (accType === "sharps") return isMajor ? KEYS_MAJOR_SHARPS[n] : KEYS_MINOR_SHARPS[n];
    return isMajor ? KEYS_MAJOR_FLATS[n] : KEYS_MINOR_FLATS[n];
  }

  function keyToPc(keyName) {
    var root = keyName && keyName.endsWith("m") ? keyName.slice(0, -1) : keyName;
    if (root && KEY_PC.hasOwnProperty(root)) return KEY_PC[root];
    return 0;
  }

  function pcToKeyName(pc, isMinor, preferSharps) {
    var names = preferSharps ? KEY_NAMES_SHARP : KEY_NAMES_FLAT;
    var safePc = ((pc % 12) + 12) % 12;
    var root = names[safePc];
    return isMinor ? root + "m" : root;
  }

  function germanizeKeyName(keyName) {
    var isMinor = keyName && keyName.endsWith("m");
    var root = isMinor ? keyName.slice(0, -1) : keyName;
    var mapped = root;
    if (root === "B") mapped = "H";     // B natural -> H
    else if (root === "Bb") mapped = "B"; // Bb -> B (deutsch)
    return isMinor ? mapped + "m" : mapped;
  }

  function describeKeyName(keyName) {
    var displayName = germanizeKeyName(keyName);
    var isMinor = displayName && displayName.endsWith("m");
    var root = isMinor ? displayName.slice(0, -1) : displayName;
    return root + (isMinor ? "-Moll" : "-Dur");
  }

  // --- Instrument transposition (input = concert pitch; output = written clarinet part) ---
  // Bb clarinet sounds a major 2nd LOWER than written => written = concert + M2
  // A  clarinet sounds a minor 3rd LOWER than written => written = concert + m3
  // Eb clarinet sounds a minor 3rd HIGHER than written => written = concert - m3
  function transposeSemitonesForInstrument(instr) {
    if (instr === "Bb") return 2;
    if (instr === "A") return 3;
    if (instr === "Eb") return -3;
    return 0;
  }

  // --- ABC helpers ---
  // We use L:1/8 for simplicity. Durations are in "eighths".
  function durToAbc(dur) {
    // dur can be 1,2,4,8 or 0.5 (sixteenth)
    if (dur === 1) return "";     // 1 * (1/8) => omit
    if (dur === 2) return "2";    // 1/4
    if (dur === 4) return "4";    // 1/2
    if (dur === 8) return "8";    // whole (in 4/4)
    if (dur === 0.5) return "/";  // 1/16
    return "";
  }

  // Map pitch class to ABC accidental + note name with sharp/flat preference.
  // We output explicit accidentals ( ^, _ ) for black keys.
  function pcToAbcName(pc, useSharps) {
    var sharpNames = ["C", "^C", "D", "^D", "E", "F", "^F", "G", "^G", "A", "^A", "B"];
    var flatNames  = ["C", "_D", "D", "_E", "E", "F", "_G", "G", "_A", "A", "_B", "B"];
    return (useSharps ? sharpNames : flatNames)[pc % 12];
  }

  // MIDI -> ABC note token (no duration)
  // MIDI 60 = middle C => "C"
  function midiToAbc(midi, useSharps) {
    var m = Math.round(midi);
    var pc = ((m % 12) + 12) % 12;
    var octave = Math.floor(m / 12) - 1; // MIDI standard: 60 -> 4

    var name = pcToAbcName(pc, useSharps); // includes ^ or _
    // Base letter without accidentals, but accidental prefix stays with case changes.
    // For octave mapping:
    // octave 4 => uppercase (C..B)
    // octave 5 => lowercase (c..b)
    // >5 => lowercase + apostrophes
    // <4 => uppercase + commas
    var accPrefix = "";
    var letter = name;

    if (name[0] === "^" || name[0] === "_") {
      accPrefix = name[0];
      letter = name.slice(1);
    }

    var isLower = false;
    var outLetter = letter;

    if (octave >= 5) {
      isLower = true;
      outLetter = letter.toLowerCase();
    } else {
      outLetter = letter.toUpperCase();
    }

    var marks = "";
    if (octave > 5) {
      marks = repeat("'", octave - 5);
    } else if (octave < 4) {
      marks = repeat(",", 4 - octave);
    }

    return accPrefix + outLetter + marks;
  }

  function repeat(ch, n) {
    var s = "";
    for (var i = 0; i < n; i++) s += ch;
    return s;
  }

  function clampInt(v, min, max) {
    var x = parseInt(v, 10);
    if (isNaN(x)) x = min;
    if (x < min) x = min;
    if (x > max) x = max;
    return x;
  }

  // --- State ---
  var state = {
    accType: "sharps",  // "sharps" | "flats"
    accCount: 0,
    mode: "major",      // "major" | "minor"
    meter: "4/4",
    instrument: "Bb",
    title: "",
    autoBars: true,
    // Note entry as concert MIDI numbers + duration in eighths
    // tokens: { kind:"note", midi:60, dur:2 } | { kind:"rest", dur:2 } | { kind:"bar" }
    tokens: [],
    // Octave selector: stored as octave number (MIDI octave, where 4 is middle C octave)
    octave: 4,
    // Selected duration (in eighths). 1=1/8, 2=1/4, 4=1/2, 8=whole, 0.5=1/16
    dur: 1
  };

  // --- DOM ---
  var $ = function (id) { return document.getElementById(id); };

  var accTypeSharps = $("accTypeSharps");
  var accTypeFlats  = $("accTypeFlats");
  var accCount      = $("accCount");
  var modeMajor     = $("modeMajor");
  var modeMinor     = $("modeMinor");
  var meter         = $("meter");
  var instrument    = $("instrument");

  var pitchButtons  = $("pitchButtons");
  var octDown       = $("octDown");
  var octUp         = $("octUp");
  var octLabel      = $("octLabel");
  var staffOctDown;
  var staffOctUp;

  var addRest       = $("addRest");
  var addBar        = $("addBar");
  var addNewline    = $("addNewline");
  var undo          = $("undo");
  var clearBtn      = $("clear");
  var autoBars      = $("autoBars");

  var paper         = $("paper");
  var renderStatus  = $("renderStatus");
  var noteNamesEl   = $("noteNames");
  var origKeyLabel  = $("origKeyLabel");
  var origKeyText   = $("origKeyText");
  var targetKeyLabel= $("targetKeyLabel");
  var printBtn      = $("print");
  var titleInput    = $("titleInput");

  // Build staff + chromatic accidentals via modifiers
  // Accidental applies to the next placed pitch.
  var accidental = 0; // -1 flat, 0 natural, +1 sharp (applied to the next pitch)

  function makeButton(label, onClick, className) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = className || "btn";
    b.textContent = label;
    b.addEventListener("click", onClick);
    return b;
  }

  function buildPitchUI() {
    pitchButtons.innerHTML = "";

    // Accidental toggles
    var accWrap = document.createElement("div");
    accWrap.className = "btnwrap";
    accWrap.appendChild(makeButton("♭", function(){ accidental = -1; setAccToggles(); }, "btn"));
    accWrap.appendChild(makeButton("♮", function(){ accidental = 0;  setAccToggles(); }, "btn"));
    accWrap.appendChild(makeButton("♯", function(){ accidental = 1;  setAccToggles(); }, "btn"));
    pitchButtons.appendChild(accWrap);

    // Staff field
    var staffWrap = document.createElement("div");
    staffWrap.className = "staff";
    var staffControls = document.createElement("div");
    staffControls.className = "staff-controls";
    staffOctDown = makeButton("−", function () { adjustOctave(-1); }, "btn sm");
    staffOctUp   = makeButton("+", function () { adjustOctave(1); }, "btn sm");
    staffControls.appendChild(staffOctDown);
    staffControls.appendChild(staffOctUp);
    staffWrap.appendChild(staffControls);
    pitchButtons.appendChild(staffWrap);
    buildStaffGrid(staffWrap);

    setAccToggles();
  }

  function setAccToggles() {
    // visually mark selected accidental by outlining the corresponding button (first 3 in the first wrap)
    var wrap = pitchButtons.firstChild;
    if (!wrap) return;
    var btns = wrap.querySelectorAll("button");
    for (var i = 0; i < btns.length; i++) {
      btns[i].style.outline = "none";
    }
    var idx = (accidental === -1) ? 0 : (accidental === 0 ? 1 : 2);
    if (btns[idx]) btns[idx].style.outline = "2px solid rgba(28,126,214,0.35)";
  }

  function buildStaffGrid(root) {
    root.innerHTML = "";
    var width = 1100;
    var height = 360;
    var lineCount = 5;
    var startY = 40;
    var lineGap = 44;
    // 5-Linien-Notensystem (Violin-Schlüssel-ähnliche Lage), aufsteigend links->rechts
    // C4, D4, E4, F4, G4, A4, B4, C5, D5, F5 (11 Stufen inkl. Zwischenräume)
    var baseMidiPositions = [60,62,64,65,67,69,71,72,74,76,77];
    var xPositions = [];
    for (var xi = 0; xi < baseMidiPositions.length; xi++) {
      xPositions.push(60 + xi * 90); // eine Note pro Zeile, nach rechts versetzt
    }

    var svgNS = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", "0 0 " + width + " " + height);
    svg.setAttribute("class", "staff-svg");

    // Draw lines (top to bottom)
    for (var i = 0; i < lineCount; i++) {
      var y = startY + i * lineGap;
      var line = document.createElementNS(svgNS, "line");
      line.setAttribute("x1", 12);
      line.setAttribute("x2", width - 12);
      line.setAttribute("y1", y);
      line.setAttribute("y2", y);
      line.setAttribute("class", "staff-line");
      svg.appendChild(line);
    }

    // Click zones + Noteheads (lines + spaces, top to bottom)
    var bandHeight = lineGap / 2;
    var octaveShift = (state.octave - 4) * 12;
    var useSharps = prefersSharps(state.accType, state.accCount);

    function displayNoteName(midi) {
      var pc = ((midi % 12) + 12) % 12;
      var octave = Math.floor(midi / 12) - 1;
      var namesSharp = ["C","C♯","D","D♯","E","F","F♯","G","G♯","A","A♯","H"];
      var namesFlat  = ["C","D♭","D","E♭","E","F","G♭","G","A♭","A","B","H"];
      var name = (useSharps ? namesSharp : namesFlat)[pc];
      return name + octave;
    }

    function attachClick(el, base) {
      el.addEventListener("click", function () {
        var midi = base + octaveShift;
        addStaffNote(midi);
      });
    }

    var slots = baseMidiPositions.length;

    for (var j = 0; j < slots; j++) {
      var idxY = (slots - 1 - j); // untere Stufe = niedrigste Note
      var centerY = startY + idxY * bandHeight;
      var rect = document.createElementNS(svgNS, "rect");
      rect.setAttribute("x", 0);
      rect.setAttribute("width", width);
      rect.setAttribute("y", centerY - bandHeight / 2);
      rect.setAttribute("height", bandHeight);
      rect.setAttribute("class", "staff-zone");
      rect.dataset.baseMidi = baseMidiPositions[j];
      svg.appendChild(rect);

      // Notehead preview (eine pro Zeile/Space, nach rechts versetzt)
      var head = document.createElementNS(svgNS, "circle");
      head.setAttribute("cx", xPositions[j]);
      head.setAttribute("cy", centerY);
      head.setAttribute("r", 20);
      head.setAttribute("class", "notehead");
      head.dataset.baseMidi = baseMidiPositions[j];
      svg.appendChild(head);
      // Label unter der Note
      var label = document.createElementNS(svgNS, "text");
      label.setAttribute("x", xPositions[j]);
      label.setAttribute("y", centerY + 18);
      label.setAttribute("class", "note-label");
      label.textContent = displayNoteName(baseMidiPositions[j] + octaveShift);
      svg.appendChild(label);
      attachClick(head, baseMidiPositions[j]);

      attachClick(rect, baseMidiPositions[j]);
    }

    root.appendChild(svg);
  }

  function addStaffNote(baseMidi) {
    var midi = baseMidi + (accidental || 0);
    state.tokens.push({ kind: "note", midi: midi, dur: state.dur });
    accidental = 0;
    setAccToggles();
    sync();
  }

  function addRestToken() {
    state.tokens.push({ kind: "rest", dur: state.dur });
    sync();
  }

  function addBarToken() {
    state.tokens.push({ kind: "bar" });
    sync();
  }

  function addNewlineToken() {
    state.tokens.push({ kind: "newline" });
    sync();
  }

  function undoToken() {
    state.tokens.pop();
    sync();
  }

  function clearTokens() {
    state.tokens = [];
    sync();
  }

  function setOctaveLabel() {
    // show as C{octave}
    octLabel.textContent = "C" + state.octave;
    // Rebuild staff zones to reflect octave shift
    var staff = document.querySelector(".staff");
    if (staff) buildStaffGrid(staff);
  }

  function meterToEighths(meter) {
    if (!meter || typeof meter !== "string") return 8;
    var parts = meter.split("/");
    if (parts.length !== 2) return 8;
    var num = parseInt(parts[0], 10);
    var den = parseInt(parts[1], 10);
    if (!num || !den) return 8;
    return num * (8 / den);
  }

  function computeKeyInfo() {
    var key = keyFromSignature(state.accType, state.accCount, state.mode);
    var preferSharpNames = prefersSharps(state.accType, state.accCount);
    var trans = transposeSemitonesForInstrument(state.instrument);
    var basePc = keyToPc(key);
    var isMinor = state.mode === "minor";
    var writtenPc = ((basePc + trans) % 12 + 12) % 12;

    return {
      baseKeyName: pcToKeyName(basePc, isMinor, preferSharpNames),
      writtenKeyName: pcToKeyName(writtenPc, isMinor, preferSharpNames),
      preferSharps: preferSharpNames,
      transSemis: trans
    };
  }

  // --- Generate ABC ---
  function buildAbc(keyInfo) {
    var info = keyInfo || computeKeyInfo();
    var useSharps = info.preferSharps;
    var trans = info.transSemis;
    var title = state.title || "";
    var measureLen = meterToEighths(state.meter);

    // Header
    var abc = [];
    abc.push("X:1");
    abc.push("T:" + title);
    abc.push("M:" + state.meter);
    abc.push("L:1/8");
    abc.push("K:" + info.writtenKeyName);

    // Body: transpose MIDI notes for instrument
    var body = [];
    var names = [];
    var accCount = 0;

    for (var i = 0; i < state.tokens.length; i++) {
      var t = state.tokens[i];
      if (t.kind === "bar") {
        body.push("|");
        names.push("|");
        accCount = 0;
        continue;
      }
      if (t.kind === "newline") {
        body.push("\n");
        names.push("\n");
        accCount = 0;
        continue;
      }
      if (t.kind === "rest") {
        var restToken = "z" + durToAbc(t.dur);
        body.push(restToken);
        names.push(restToken);
        accCount += t.dur;
      } else if (t.kind === "note") {
        var outMidi = t.midi + trans;
        var noteText = midiToAbc(outMidi, useSharps);
        var durText = durToAbc(t.dur);
        body.push(noteText + durText);
        names.push(noteText);
        accCount += t.dur;
      } else {
        continue;
      }

      if (state.autoBars && measureLen > 0) {
        while (accCount >= measureLen) {
          body.push("|");
          names.push("|");
          accCount -= measureLen;
        }
      }
    }

    // Keep it readable: respect explicit newlines, otherwise wrap every ~16 tokens
    var wrapped = [];
    var line = [];
    for (var j = 0; j < body.length; j++) {
      var tok = body[j];
      if (tok === "\n") {
        wrapped.push(line.join(" "));
        line = [];
        continue;
      }
      line.push(tok);
      if (line.length >= 16) {
        wrapped.push(line.join(" "));
        line = [];
      }
    }
    if (line.length) wrapped.push(line.join(" "));

    abc.push(wrapped.join("\n"));
    return { abc: abc.join("\n"), names: names.join(" ") };
  }

  function renderAbc(abc) {
    if (!window.ABCJS || !window.ABCJS.renderAbc) {
      renderStatus.textContent = "abcjs noch nicht geladen (CDN).";
      return;
    }
    paper.innerHTML = "";
    renderStatus.textContent = "";
    try {
      window.ABCJS.renderAbc(paper, abc, {
        responsive: "resize",
        add_classes: true
      });
    } catch (e) {
      renderStatus.textContent = "Render-Fehler: " + (e && e.message ? e.message : String(e));
    }
  }

  // --- Sync ---
  function sync() {
    var keyInfo = computeKeyInfo();
    var originalName = describeKeyName(keyInfo.baseKeyName);
    if (origKeyLabel) origKeyLabel.textContent = originalName;
    if (origKeyText) origKeyText.textContent = originalName;
    if (targetKeyLabel) targetKeyLabel.textContent = describeKeyName(keyInfo.writtenKeyName);
    setOctaveLabel();
    var res = buildAbc(keyInfo);
    if (noteNamesEl) noteNamesEl.textContent = res.names;
    renderAbc(res.abc);
  }

  // --- Wire controls ---
  function setSegActive(btnOn, btnOff) {
    btnOn.classList.add("active");
    btnOff.classList.remove("active");
  }

  accTypeSharps.addEventListener("click", function () {
    state.accType = "sharps";
    setSegActive(accTypeSharps, accTypeFlats);
    sync();
  });

  accTypeFlats.addEventListener("click", function () {
    state.accType = "flats";
    setSegActive(accTypeFlats, accTypeSharps);
    sync();
  });

  accCount.addEventListener("change", function () {
    state.accCount = clampInt(accCount.value, 0, 7);
    sync();
  });

  modeMajor.addEventListener("click", function () {
    state.mode = "major";
    setSegActive(modeMajor, modeMinor);
    sync();
  });

  modeMinor.addEventListener("click", function () {
    state.mode = "minor";
    setSegActive(modeMinor, modeMajor);
    sync();
  });

  meter.addEventListener("change", function () {
    state.meter = meter.value || "4/4";
    sync();
  });

  instrument.addEventListener("change", function () {
    state.instrument = instrument.value || "Bb";
    sync();
  });

  // Duration buttons
  function setDurActive(targetBtn) {
    var all = document.querySelectorAll(".btn.dur");
    for (var i = 0; i < all.length; i++) all[i].classList.remove("active");
    targetBtn.classList.add("active");
  }

  document.addEventListener("click", function (e) {
    var t = e.target;
    if (t && t.classList && t.classList.contains("dur")) {
      var v = t.getAttribute("data-dur");
      state.dur = (v === "1/2") ? 0.5 : parseInt(v, 10);
      setDurActive(t);
      sync();
    }
  });

  function adjustOctave(delta) {
    state.octave = Math.min(8, Math.max(1, state.octave + delta));
    sync();
  }

  octDown.addEventListener("click", function () {
    adjustOctave(-1);
  });

  octUp.addEventListener("click", function () {
    adjustOctave(1);
  });

  addRest.addEventListener("click", addRestToken);
  addBar.addEventListener("click", addBarToken);
  addNewline.addEventListener("click", addNewlineToken);
  undo.addEventListener("click", undoToken);
  clearBtn.addEventListener("click", clearTokens);
  if (printBtn) {
    printBtn.addEventListener("click", function () {
      window.print();
    });
  }
  if (titleInput) {
    titleInput.addEventListener("input", function () {
      state.title = titleInput.value || "";
      sync();
    });
  }
  if (autoBars) {
    autoBars.addEventListener("change", function () {
      state.autoBars = !!autoBars.checked;
      sync();
    });
    state.autoBars = !!autoBars.checked;
  }

  // Init
  buildPitchUI();
  sync();
})();
