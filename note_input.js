const NOTE_TO_SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11, H: 11 };

function parseTokens(input) {
    return (input || "")
        .trim()
        .split(/\s+|,\s*/g)
        .filter(Boolean);
}

function tokenToMidi(token, defaultOct = 4) {
    if (token === "|") return { kind: "bar" };

    // A-G with optional accidental (#/b) and optional octave (integer)
    const m = token.match(/^([A-Ha-h])([#b]?)(-?\d+)?$/);
    if (!m) return { kind: "unknown", raw: token };

    const letterRaw = m[1];
    const letter = letterRaw.toUpperCase();
    const isLower = letterRaw === letterRaw.toLowerCase();
    const acc = m[2] || "";
    let oct;
    if (m[3] !== undefined) {
        oct = parseInt(m[3], 10);
    } else {
        oct = defaultOct + (isLower ? 1 : 0); // lowercase input => nächsthöhere Oktave
    }

    let semi = NOTE_TO_SEMI[letter];
    if (semi === undefined || Number.isNaN(oct)) return { kind: "unknown", raw: token };

    if (acc === "#") semi += 1;
    if (acc === "b") semi -= 1;

    // MIDI: C4 = 60
    const midi = 12 * (oct + 1) + semi;
    return { kind: "note", midi };
}

function midiToNameOct(midi, preferFlats = false) {
    const semi = ((midi % 12) + 12) % 12;
    const oct = Math.floor(midi / 12) - 1;

    const sharpNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const flatNames = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

    const name = preferFlats ? flatNames[semi] : sharpNames[semi];
    return { name, oct };
}

function nameOctToAbc(name, oct) {
    // name: "C", "C#", "Bb" etc.
    const letter = name[0].toUpperCase();
    const acc = name.length > 1 ? name.slice(1) : "";

    let abcAcc = "";
    if (acc === "#") abcAcc = "^";
    if (acc === "b") abcAcc = "_";

    // ABC octave mapping with C4 -> "C"
    const baseOct = 4;
    const delta = oct - baseOct;

    let abcLetter;
    if (delta === 0) {
        abcLetter = letter;
    } else if (delta === 1) {
        abcLetter = letter.toLowerCase();
    } else if (delta >= 2) {
        abcLetter = letter.toLowerCase() + "'".repeat(delta - 1);
    } else {
        // delta <= -1
        abcLetter = letter + ",".repeat(-delta);
    }

    return abcAcc + abcLetter;
}

function formatAbcNotes(tokens) {
    const lines = [];
    let current = [];

    for (const token of tokens) {
        current.push(token);
        if (token === "|") {
            lines.push(current.join(" ").trim());
            current = [];
        }
    }

    if (current.length) {
        lines.push(current.join(" ").trim());
    }

    return lines.join("\n");
}

export function clarinetTransposeSemis(kind) {
    switch (kind) {
        case "Bb": return 2;
        case "A": return 3;
        case "Eb": return -3;
        default: return 0;
    }
}

export function toAbc({ input, transposeSemis = 0, preferFlats = false, defaultOct = 4, key = "C", meter = "4/4" }) {
    const tokens = parseTokens(input);
    const out = [];
    const outKey = transposeKey(key, transposeSemis, preferFlats);

    for (const t of tokens) {
        const parsed = tokenToMidi(t, defaultOct);

        if (parsed.kind === "bar") {
            out.push("|");
            continue;
        }
        if (parsed.kind === "unknown") {
            continue;
        }

        const midiT = parsed.midi + transposeSemis;
        const { name, oct } = midiToNameOct(midiT, preferFlats);
        out.push(nameOctToAbc(name, oct));
    }

    return [
        "X:1",
        "T:ClariTrans",
        `M:${meter}`,
        "L:1/4",
        `K:${outKey}`,
        formatAbcNotes(out)
    ].join("\n");
}

const KEY_TO_SEMI = {
    "C": 0, "G": 7, "D": 2, "A": 9, "E": 4, "B": 11, "F#": 6, "C#": 1,
    "F": 5, "Bb": 10, "Eb": 3, "Ab": 8, "Db": 1, "Gb": 6, "Cb": 11
};

// Für Anzeige: wir wählen Namen aus einem Sharp- oder Flat-Kreis
const SEMI_TO_KEY_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const SEMI_TO_KEY_FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

function transposeKey(keyName, semis, preferFlats) {
    const base = KEY_TO_SEMI[keyName];
    if (base === undefined) return keyName; // fallback
    const t = ((base + semis) % 12 + 12) % 12;
    return preferFlats ? SEMI_TO_KEY_FLAT[t] : SEMI_TO_KEY_SHARP[t];
}
