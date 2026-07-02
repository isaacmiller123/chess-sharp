import { j as jsxRuntimeExports, E as EngineAvatar, U as UserAvatar, r as reactExports, B as Board, G as GraduationCap, u as useSettings, d as destsFor, t as turnColor, c as checkColor, a as uciToLastMove, o as outcome, b as applyMove, i as isPromotion, I as INITIAL_FEN, p as pieceSetClass } from "./index-Cn9Z-3E3.js";
import { M as MoveList, u as useGameTree, t as treeToPgn } from "./MoveList-T5uSXHCA.js";
import { C as Clock$1, F as Flag, c as chooseBotMove } from "./botStrength-ZtUTgE2Z.js";
import { P as PromotionPicker } from "./PromotionPicker-CL8WgpH3.js";
import { C as ChevronDown, a as CoachHint } from "./CoachHint-D9K9uNTj.js";
import { F as FlipVertical2 } from "./flip-vertical-2-C6hTqwG7.js";
import { R as RotateCcw } from "./rotate-ccw-CXZWFpsH.js";
import { u as useSound } from "./useSound-DTV4T7je.js";
const MIN = 6e4;
const SEC = 1e3;
const TIME_CONTROLS = [
  { id: "unlimited", label: "Unlimited", baseMs: 0, incMs: 0 },
  { id: "1+0", label: "1+0", baseMs: 1 * MIN, incMs: 0 },
  { id: "3+2", label: "3+2", baseMs: 3 * MIN, incMs: 2 * SEC },
  { id: "5+0", label: "5+0", baseMs: 5 * MIN, incMs: 0 },
  { id: "10+0", label: "10+0", baseMs: 10 * MIN, incMs: 0 },
  { id: "15+10", label: "15+10", baseMs: 15 * MIN, incMs: 10 * SEC }
];
const DEFAULT_TIME_CONTROL_ID = "unlimited";
function timeControlById(id) {
  return TIME_CONTROLS.find((t) => t.id === id) ?? TIME_CONTROLS[0];
}
function isTimed(tc) {
  return tc.baseMs > 0;
}
const LOW_TIME_MS = 1e4;
function formatClock(ms) {
  const clamped = Math.max(0, ms);
  if (clamped >= LOW_TIME_MS) {
    const totalSec = Math.ceil(clamped / 1e3);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }
  const tenths = Math.floor(clamped / 100);
  const whole = Math.floor(tenths / 10);
  const frac = tenths % 10;
  return `${whole}.${frac}`;
}
const ELO_MIN = 100;
const ELO_MAX = 3190;
const PRESETS = [
  { label: "Novice", elo: 100 },
  { label: "Beginner", elo: 300 },
  { label: "Improver", elo: 800 },
  { label: "Amateur", elo: 1100 },
  { label: "Casual", elo: 1320 },
  { label: "Intermediate", elo: 1500 },
  { label: "Club", elo: 1800 },
  { label: "Expert", elo: 2100 },
  { label: "Master", elo: 2500 },
  { label: "Max", elo: 3190 }
];
const COLORS = [
  { key: "white", label: "White" },
  { key: "black", label: "Black" },
  { key: "random", label: "Random" }
];
const MODES = [
  { key: "engine", label: "Engine" },
  { key: "persona", label: "Grandmaster style" }
];
function pct(v) {
  return Math.max(0, Math.min(1, v)) * 100;
}
function StyleMeter({ label, value }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "persona-meter", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "persona-meter-label", children: label }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "persona-meter-track", "aria-hidden": true, children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "persona-meter-fill", style: { width: `${pct(value)}%` } }) })
  ] });
}
function PersonaCard({
  persona,
  selected,
  onSelect
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "button",
    {
      type: "button",
      className: `persona-card${selected ? " is-selected" : ""}`,
      onClick: onSelect,
      "aria-pressed": selected,
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "persona-card-head", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(EngineAvatar, { size: 40 }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "persona-card-meta", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "persona-card-name", children: persona.name }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "persona-card-era muted small", children: persona.era })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "eval-chip persona-card-elo", children: persona.peakElo })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "persona-card-bio", children: persona.bio }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "persona-card-style", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(StyleMeter, { label: "Aggression", value: persona.style.aggression }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(StyleMeter, { label: "Risk", value: persona.style.risk })
        ] })
      ]
    }
  );
}
function SetupCard({
  mode,
  elo,
  colorChoice,
  timeControlId,
  personas,
  personasLoading,
  selectedPersonaId,
  onMode,
  onElo,
  onColor,
  onTimeControl,
  onSelectPersona,
  onStart
}) {
  const selectedPersona = personas.find((p) => p.id === selectedPersonaId) ?? null;
  const canStart = mode === "engine" || selectedPersona !== null;
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "setup-grid", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "card setup-card", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "setup-opponent", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(EngineAvatar, { size: 48 }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "setup-opponent-meta", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { children: mode === "persona" ? selectedPersona?.name ?? "Grandmaster style" : "Stockfish" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "muted small", children: mode === "persona" ? selectedPersona ? `In the style of ${selectedPersona.name} · ${selectedPersona.peakElo} Elo` : "Choose a grandmaster to play in their style" : `Strength ${elo} Elo` })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "setup-field", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "setup-label", children: "Opponent" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "segmented mode-row", children: MODES.map((m) => /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          className: `seg${mode === m.key ? " on" : ""}`,
          onClick: () => onMode(m.key),
          children: m.label
        },
        m.key
      )) })
    ] }),
    mode === "engine" ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "setup-field", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "setup-label-row", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "setup-label", children: "Engine strength" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "num elo-readout", children: elo })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "input",
        {
          className: "elo-range",
          type: "range",
          min: ELO_MIN,
          max: ELO_MAX,
          step: 10,
          value: elo,
          "aria-label": "Engine Elo",
          onChange: (e) => onElo(Number(e.target.value))
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "preset-row", children: PRESETS.map((p) => /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          className: `seg${elo === p.elo ? " on" : ""}`,
          onClick: () => onElo(p.elo),
          title: `${p.label} (${p.elo})`,
          children: p.label
        },
        p.label
      )) })
    ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "setup-field", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "setup-label", children: "Grandmaster" }),
      personasLoading ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "persona-empty muted small", children: "Loading grandmasters…" }) : personas.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "persona-empty muted small", children: "No grandmaster styles are available." }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "persona-gallery", children: personas.map((p) => /* @__PURE__ */ jsxRuntimeExports.jsx(
        PersonaCard,
        {
          persona: p,
          selected: p.id === selectedPersonaId,
          onSelect: () => onSelectPersona(p.id)
        },
        p.id
      )) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "setup-field", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "setup-label", children: "Play as" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "segmented color-row", children: COLORS.map((c) => /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          className: `seg${colorChoice === c.key ? " on" : ""}`,
          onClick: () => onColor(c.key),
          children: c.label
        },
        c.key
      )) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "setup-field", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "setup-label", children: "Time control" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "segmented time-row", role: "group", "aria-label": "Time control", children: TIME_CONTROLS.map((tc) => /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          className: `seg${timeControlId === tc.id ? " on" : ""}`,
          "aria-pressed": timeControlId === tc.id,
          onClick: () => onTimeControl(tc.id),
          children: tc.label
        },
        tc.id
      )) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "btn setup-start", onClick: onStart, disabled: !canStart, children: "Start game" })
  ] }) });
}
function PlayerChip({
  kind,
  name,
  sub,
  styleLine,
  avatar = null,
  thinking = false
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "player-chip", children: [
    kind === "user" ? /* @__PURE__ */ jsxRuntimeExports.jsx(UserAvatar, { src: avatar, name, size: 30 }) : /* @__PURE__ */ jsxRuntimeExports.jsx(EngineAvatar, { size: 30 }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "chip-meta", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "chip-name", children: name }),
      styleLine && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "chip-style muted small", children: styleLine }),
      sub && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "chip-sub muted small", children: sub })
    ] }),
    kind === "engine" && thinking && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "chip-thinking", "aria-live": "polite", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "chip-dot" }),
      "thinking"
    ] })
  ] });
}
const TITLE = {
  win: "You won",
  loss: "You lost",
  draw: "Draw"
};
function formatDelta(delta) {
  const rounded = Math.round(delta);
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
}
function ResultBanner({ result, reason, outcomeForUser: outcomeForUser2, delta, newRating, onNewGame }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "result-banner card", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "banner-text", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "banner-title", children: TITLE[outcomeForUser2] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "banner-reason muted small", children: [
        result,
        " · by ",
        reason
      ] })
    ] }),
    delta !== void 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "banner-delta", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `eval-chip ${delta >= 0 ? "pos" : "neg"}`, children: formatDelta(delta) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "muted small", children: [
        "vs-bot rating",
        newRating !== void 0 ? ` ${Math.round(newRating)}` : ""
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "btn banner-new", onClick: onNewGame, children: "New game" })
  ] });
}
function Clock({ ms, active, over, label }) {
  const low = ms < LOW_TIME_MS;
  const flagged = ms <= 0;
  const className = [
    "play-clock",
    active && !over ? "is-active" : "",
    low && !over ? "is-low" : "",
    flagged ? "is-flagged" : ""
  ].filter(Boolean).join(" ");
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "span",
    {
      className,
      role: "timer",
      "aria-label": `${label} clock`,
      "aria-live": active && !over ? "off" : "polite",
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Clock$1, { className: "play-clock-icon", size: 14, "aria-hidden": true }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "play-clock-time num", children: formatClock(ms) })
      ]
    }
  );
}
function GameView({
  fen,
  orientation,
  turn,
  userColor,
  dests,
  lastMove,
  check,
  thinking,
  over,
  atTip,
  pendingPromo,
  nonce,
  boardTheme,
  pieceSetClass: pieceSetClass2,
  showLegal,
  coordinates,
  animation,
  userName,
  userAvatar,
  opponentName: opponentName2,
  opponentSub,
  opponentStyleLine,
  clockActive,
  opponentClock,
  userClock,
  tree,
  banner,
  onMove,
  onPromo,
  onPromoCancel,
  onResign,
  onNewGame,
  onFlip
}) {
  const [coachOpen, setCoachOpen] = reactExports.useState(false);
  const userIsWhite = userColor === "white";
  let umNode = tree.current;
  while (umNode && !(umNode.move && umNode.parent && umNode.ply % 2 === 1 === userIsWhite)) {
    umNode = umNode.parent;
  }
  const coachLastMove = umNode && umNode.move && umNode.parent ? { fenBefore: umNode.parent.fen, played: umNode.move.uci, ply: umNode.ply } : void 0;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "play-view", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "play-board-area", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "play-chip-row", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          PlayerChip,
          {
            kind: "engine",
            name: opponentName2,
            sub: opponentSub,
            styleLine: opponentStyleLine,
            thinking
          }
        ),
        clockActive && /* @__PURE__ */ jsxRuntimeExports.jsx(Clock, { ms: opponentClock.ms, active: opponentClock.active, over, label: opponentName2 })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "board-stage", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `board-wrap board-${boardTheme} ${pieceSetClass2}`, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          Board,
          {
            fen,
            orientation,
            turnColor: turn,
            dests,
            lastMove,
            check,
            movableColor: userColor,
            viewOnly: thinking || over || !atTip,
            showDests: showLegal,
            coordinates,
            animation,
            onMove,
            syncNonce: nonce
          }
        ),
        pendingPromo && /* @__PURE__ */ jsxRuntimeExports.jsx(PromotionPicker, { color: turn, onSelect: onPromo, onCancel: onPromoCancel })
      ] }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "play-chip-row", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(PlayerChip, { kind: "user", name: userName, avatar: userAvatar }),
        clockActive && /* @__PURE__ */ jsxRuntimeExports.jsx(Clock, { ms: userClock.ms, active: userClock.active, over, label: userName })
      ] }),
      banner ? /* @__PURE__ */ jsxRuntimeExports.jsx(
        ResultBanner,
        {
          result: banner.result,
          reason: banner.reason,
          outcomeForUser: banner.outcomeForUser,
          delta: banner.delta,
          newRating: banner.newRating,
          onNewGame
        }
      ) : /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "board-controls", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "icon-btn", onClick: onFlip, title: "Flip board", children: /* @__PURE__ */ jsxRuntimeExports.jsx(FlipVertical2, { size: 18 }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { className: "btn ghost btn-resign", onClick: onResign, disabled: over, title: "Resign", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Flag, { size: 14 }),
          " Resign"
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { className: "btn ghost play-newgame", onClick: onNewGame, title: "New game", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(RotateCcw, { size: 14 }),
          " New game"
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("aside", { className: "play-sidebar", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "panel move-panel", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "panel-head", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "panel-title", children: "Moves" }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(MoveList, { root: tree.root, currentId: tree.current.id, figurineMode: false, onSelect: tree.goTo })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "panel coachhint-panel", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            type: "button",
            className: "panel-head coachhint-toggle",
            onClick: () => setCoachOpen((o) => !o),
            "aria-expanded": coachOpen,
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "panel-title", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(GraduationCap, { size: 15 }),
                " Coach"
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                ChevronDown,
                {
                  size: 16,
                  className: `coachhint-chevron${coachOpen ? " is-open" : ""}`
                }
              )
            ]
          }
        ),
        coachOpen && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "coachhint-panel-body", children: /* @__PURE__ */ jsxRuntimeExports.jsx(CoachHint, { fen, lastMove: coachLastMove }) })
      ] })
    ] })
  ] });
}
function baseTimes(tc) {
  return { white: tc.baseMs, black: tc.baseMs };
}
function useChessClock({
  timeControl,
  gameKey,
  turn,
  running,
  over,
  onFlag,
  onLowTime
}) {
  const active = isTimed(timeControl);
  const [times, setTimes] = reactExports.useState(() => baseTimes(timeControl));
  const remainingRef = reactExports.useRef(baseTimes(timeControl));
  const rafRef = reactExports.useRef(null);
  const lastTsRef = reactExports.useRef(null);
  const flaggedRef = reactExports.useRef(false);
  const lowFiredRef = reactExports.useRef(false);
  const turnRef = reactExports.useRef(turn);
  turnRef.current = turn;
  const onFlagRef = reactExports.useRef(onFlag);
  onFlagRef.current = onFlag;
  const onLowTimeRef = reactExports.useRef(onLowTime);
  onLowTimeRef.current = onLowTime;
  const stopRaf = reactExports.useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    lastTsRef.current = null;
  }, []);
  const addIncrement = reactExports.useCallback(
    (side) => {
      if (!active || timeControl.incMs <= 0) return;
      if (flaggedRef.current) return;
      const next = {
        ...remainingRef.current,
        [side]: remainingRef.current[side] + timeControl.incMs
      };
      remainingRef.current = next;
      setTimes(next);
    },
    [active, timeControl.incMs]
  );
  reactExports.useEffect(() => {
    const fresh = baseTimes(timeControl);
    remainingRef.current = fresh;
    flaggedRef.current = false;
    lowFiredRef.current = false;
    lastTsRef.current = null;
    setTimes(fresh);
  }, [timeControl, gameKey]);
  const live = active && running && !over;
  reactExports.useEffect(() => {
    if (!live) {
      stopRaf();
      return;
    }
    const tick = (ts) => {
      if (flaggedRef.current) {
        lastTsRef.current = ts;
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      if (lastTsRef.current === null) lastTsRef.current = ts;
      const dt = ts - lastTsRef.current;
      lastTsRef.current = ts;
      if (dt > 0) {
        const side = turnRef.current;
        const prev = remainingRef.current[side];
        const nextVal = Math.max(0, prev - dt);
        if (nextVal !== prev) {
          const next = { ...remainingRef.current, [side]: nextVal };
          remainingRef.current = next;
          setTimes(next);
        }
        if (!lowFiredRef.current && nextVal < LOW_TIME_MS) {
          lowFiredRef.current = true;
          onLowTimeRef.current();
        }
        if (nextVal <= 0 && !flaggedRef.current) {
          flaggedRef.current = true;
          onFlagRef.current(side);
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return stopRaf;
  }, [live, stopRaf]);
  reactExports.useEffect(() => stopRaf, [stopRaf]);
  return { times, active, addIncrement };
}
const ROLE_FROM_CHAR = { q: "queen", r: "rook", b: "bishop", n: "knight" };
function yyyymmdd(d = /* @__PURE__ */ new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}.${m}.${day}`;
}
function userScore(result, userColor) {
  if (result === "1/2-1/2") return 0.5;
  const userWon = result === "1-0" && userColor === "white" || result === "0-1" && userColor === "black";
  return userWon ? 1 : 0;
}
function outcomeForUser(result, userColor) {
  const s = userScore(result, userColor);
  return s === 1 ? "win" : s === 0.5 ? "draw" : "loss";
}
function opponentName(o) {
  return o.kind === "persona" ? o.persona.name : "Stockfish";
}
function opponentElo(o) {
  return o.kind === "persona" ? o.persona.peakElo : o.elo;
}
function PlayView() {
  const { settings } = useSettings();
  const { play, playMove } = useSound();
  const [phase, setPhase] = reactExports.useState("setup");
  const [mode, setMode] = reactExports.useState("engine");
  const [elo, setElo] = reactExports.useState(1500);
  const [colorChoice, setColorChoice] = reactExports.useState("white");
  const [timeControlId, setTimeControlId] = reactExports.useState(DEFAULT_TIME_CONTROL_ID);
  const [personas, setPersonas] = reactExports.useState([]);
  const [personasLoading, setPersonasLoading] = reactExports.useState(false);
  const [selectedPersonaId, setSelectedPersonaId] = reactExports.useState(null);
  const [userColor, setUserColor] = reactExports.useState("white");
  const [orientation, setOrientation] = reactExports.useState("white");
  const [opponent, setOpponent] = reactExports.useState({ kind: "engine", elo: 1500 });
  const [timeControl, setTimeControl] = reactExports.useState(() => timeControlById(DEFAULT_TIME_CONTROL_ID));
  const tree = useGameTree();
  const [thinking, setThinking] = reactExports.useState(false);
  const [pendingPromo, setPendingPromo] = reactExports.useState(null);
  const [nonce, setNonce] = reactExports.useState(0);
  const [banner, setBanner] = reactExports.useState(null);
  const [gameKey, setGameKey] = reactExports.useState(0);
  const savedRef = reactExports.useRef(false);
  reactExports.useEffect(() => {
    if (mode !== "persona" || personas.length > 0 || personasLoading) return;
    const api = window.api?.personas;
    if (!api) return;
    let cancelled = false;
    setPersonasLoading(true);
    api.list().then((r) => {
      if (cancelled) return;
      setPersonas(r.personas);
      if (r.personas.length > 0) setSelectedPersonaId((cur) => cur ?? r.personas[0].id);
    }).catch(() => {
      if (!cancelled) setPersonas([]);
    }).finally(() => {
      if (!cancelled) setPersonasLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [mode, personas.length, personasLoading]);
  const fen = tree.currentFen;
  const dests = reactExports.useMemo(() => destsFor(fen), [fen]);
  const turn = turnColor(fen);
  const check = checkColor(fen);
  const lastMove = tree.current.move ? uciToLastMove(tree.current.move.uci) : void 0;
  const over = banner !== null || outcome(fen).over;
  const atTip = tree.current.children.length === 0;
  const oppName = opponentName(opponent);
  const oppElo = opponentElo(opponent);
  const whiteName = userColor === "white" ? settings.username : oppName;
  const blackName = userColor === "white" ? oppName : settings.username;
  const finishGame = reactExports.useCallback(
    async (result, reason) => {
      if (savedRef.current) return;
      savedRef.current = true;
      const isPersona = opponent.kind === "persona";
      const headers = {
        Event: isPersona ? `Play vs ${oppName} style` : "Play vs Stockfish",
        Site: "Chess#",
        Date: yyyymmdd(),
        White: whiteName,
        Black: blackName,
        Result: result
      };
      const pgn = treeToPgn(tree.root, headers);
      await window.api?.games.save({
        pgn,
        userColor,
        result,
        opponentKind: isPersona ? "persona" : "engine",
        opponentLabel: oppName,
        opponentElo: oppElo,
        source: "play"
      });
      const rep = await window.api?.games.reportResult({
        botElo: oppElo,
        score: userScore(result, userColor)
      });
      setBanner({ result, reason, delta: rep?.delta, newRating: rep?.ratingAfter });
      play("gameEnd");
    },
    [opponent, oppName, oppElo, tree.root, userColor, whiteName, blackName, play]
  );
  const onFlag = reactExports.useCallback(
    (loser) => {
      if (savedRef.current) return;
      const result = loser === "white" ? "0-1" : "1-0";
      void finishGame(result, "time");
    },
    [finishGame]
  );
  const onLowTime = reactExports.useCallback(() => play("lowTime"), [play]);
  const clock = useChessClock({
    timeControl,
    gameKey,
    turn,
    // White's clock starts ticking the moment the game is live (standard chess).
    running: phase === "game",
    over,
    onFlag,
    onLowTime
  });
  reactExports.useEffect(() => {
    if (phase !== "game") return;
    if (!atTip) return;
    if (turn === userColor) return;
    if (outcome(fen).over) return;
    let cancelled = false;
    setThinking(true);
    (async () => {
      let bestmove;
      if (opponent.kind === "persona") {
        const res = await window.api?.personas.move({
          fen,
          personaId: opponent.persona.id,
          movetimeMs: settings.playThinkMs
        });
        bestmove = res?.bestmove;
      } else {
        bestmove = await chooseBotMove(
          fen,
          opponent.elo,
          async (req) => window.api ? await window.api.engine.play(req) : null,
          settings.playThinkMs
        ) ?? void 0;
      }
      if (cancelled) return;
      setThinking(false);
      if (savedRef.current || !bestmove) return;
      const uci = bestmove;
      const promo = uci.length > 4 ? ROLE_FROM_CHAR[uci[4]] : void 0;
      const m = applyMove(fen, uci.slice(0, 2), uci.slice(2, 4), promo);
      if (cancelled || !m) return;
      tree.addMove(m);
      clock.addIncrement(turn);
      playMove(m);
      const out = outcome(m.fen);
      if (out.over && out.result) void finishGame(out.result, out.reason ?? "draw");
    })();
    return () => {
      cancelled = true;
    };
  }, [fen, phase, userColor, opponent, atTip]);
  const commit = reactExports.useCallback(
    (orig, dest, promotion) => {
      const m = applyMove(fen, orig, dest, promotion);
      if (!m) {
        setNonce((n) => n + 1);
        return;
      }
      tree.addMove(m);
      clock.addIncrement(turnColor(fen));
      playMove(m);
      const out = outcome(m.fen);
      if (out.over && out.result) void finishGame(out.result, out.reason ?? "draw");
    },
    [fen, tree, finishGame, playMove, clock]
  );
  const onMove = reactExports.useCallback(
    (orig, dest) => {
      if (isPromotion(fen, orig, dest)) setPendingPromo({ orig, dest });
      else commit(orig, dest);
    },
    [fen, commit]
  );
  const onPromo = reactExports.useCallback(
    (role) => {
      if (pendingPromo) commit(pendingPromo.orig, pendingPromo.dest, role);
      setPendingPromo(null);
    },
    [pendingPromo, commit]
  );
  const onPromoCancel = reactExports.useCallback(() => {
    setPendingPromo(null);
    setNonce((n) => n + 1);
  }, []);
  const startGame = reactExports.useCallback(async () => {
    let resolved;
    if (mode === "persona") {
      const persona = personas.find((p) => p.id === selectedPersonaId);
      if (!persona) return;
      resolved = { kind: "persona", persona };
    } else {
      resolved = { kind: "engine", elo };
    }
    setOpponent(resolved);
    const tc = timeControlById(timeControlId);
    setTimeControl(tc);
    const c = colorChoice === "random" ? Math.random() < 0.5 ? "white" : "black" : colorChoice;
    setUserColor(c);
    setOrientation(c);
    savedRef.current = false;
    setBanner(null);
    setPendingPromo(null);
    setThinking(false);
    await window.api?.engine.newGame("play");
    tree.reset(INITIAL_FEN);
    setGameKey((k) => k + 1);
    setPhase("game");
    play("gameStart");
  }, [mode, personas, selectedPersonaId, elo, colorChoice, timeControlId, tree, play]);
  const onResign = reactExports.useCallback(() => {
    if (over) return;
    const result = userColor === "white" ? "0-1" : "1-0";
    void finishGame(result, "resignation");
  }, [over, userColor, finishGame]);
  const onFlip = reactExports.useCallback(() => setOrientation((o) => o === "white" ? "black" : "white"), []);
  const onNewGame = reactExports.useCallback(() => {
    setPhase("setup");
    setBanner(null);
    setPendingPromo(null);
    setThinking(false);
  }, []);
  if (phase === "setup") {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "play-view-shell", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      SetupCard,
      {
        mode,
        elo,
        colorChoice,
        timeControlId,
        personas,
        personasLoading,
        selectedPersonaId,
        onMode: setMode,
        onElo: setElo,
        onColor: setColorChoice,
        onTimeControl: setTimeControlId,
        onSelectPersona: setSelectedPersonaId,
        onStart: () => void startGame()
      }
    ) });
  }
  const gameBanner = banner ? {
    result: banner.result,
    reason: banner.reason,
    outcomeForUser: outcomeForUser(banner.result, userColor),
    delta: banner.delta,
    newRating: banner.newRating
  } : null;
  const opponentSub = `${oppElo} Elo`;
  const opponentStyleLine = opponent.kind === "persona" ? `in the style of ${opponent.persona.name}` : void 0;
  const opponentColor = userColor === "white" ? "black" : "white";
  const clockLive = clock.active && !over;
  const opponentClock = {
    ms: clock.times[opponentColor],
    active: clockLive && turn === opponentColor
  };
  const userClock = {
    ms: clock.times[userColor],
    active: clockLive && turn === userColor
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    GameView,
    {
      fen,
      orientation,
      turn,
      userColor,
      dests,
      lastMove,
      check,
      thinking,
      over,
      atTip,
      pendingPromo,
      nonce,
      boardTheme: settings.boardTheme,
      pieceSetClass: pieceSetClass(settings.pieceSet),
      showLegal: settings.showLegal,
      coordinates: settings.coordinates,
      animation: settings.animation,
      userName: settings.username,
      userAvatar: settings.avatar,
      opponentName: oppName,
      opponentSub,
      opponentStyleLine,
      clockActive: clock.active,
      opponentClock,
      userClock,
      tree,
      banner: gameBanner,
      onMove,
      onPromo,
      onPromoCancel,
      onResign,
      onNewGame,
      onFlip
    }
  );
}
export {
  PlayView,
  PlayView as default
};
