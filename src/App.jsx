import React, { useState, useEffect, useRef, useCallback } from "react";

/* ============================== CONSTANTS ============================== */

const SUITS = ["S", "H", "D", "C"];
const SUIT_SYMBOL = { S: "♠", H: "♥", D: "♦", C: "♣" };
const SUIT_COLOR = { S: "#1c1c1c", H: "#a23b2e", D: "#a23b2e", C: "#1c1c1c" };
const RANK_LABEL = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const NAMES = ["You", "Priya", "Sam", "Wei", "Diego", "Mara"];

const FELT_DARK = "#1c1109";
const RAIL = "#c9a15a";
const RAIL_DIM = "#8f7238";
const IVORY = "#f3ecdc";
const WOOD_BG = `
  radial-gradient(ellipse at 50% -10%, rgba(0,0,0,0.4), transparent 55%),
  radial-gradient(ellipse at 50% 110%, rgba(0,0,0,0.45), transparent 55%),
  repeating-linear-gradient(180deg, rgba(0,0,0,0.22) 0px, rgba(0,0,0,0.22) 2px, transparent 2px, transparent 128px),
  repeating-linear-gradient(89deg, rgba(255,255,255,0.035) 0px, transparent 4px, transparent 11px),
  repeating-linear-gradient(91deg, rgba(0,0,0,0.05) 0px, transparent 3px, transparent 14px),
  linear-gradient(120deg, #8a5a34 0%, #75491f 40%, #5c3618 75%, #4a2b12 100%)
`;

/* ============================== DECK HELPERS ============================== */

export function freshDeckHalf(deckIdx) {
  const cards = [];
  SUITS.forEach((suit) => {
    for (let rank = 1; rank <= 13; rank++) {
      cards.push({ id: `${deckIdx}-${suit}-${rank}`, suit, rank, isPrintedJoker: false });
    }
  });
  for (let j = 0; j < 2; j++) {
    cards.push({ id: `${deckIdx}-joker-${j}`, suit: null, rank: null, isPrintedJoker: true });
  }
  return cards;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function isWild(card, wildRank) {
  return card.isPrintedJoker || card.rank === wildRank;
}

export function pointValue(card, wildRank) {
  if (isWild(card, wildRank)) return 0;
  if (card.rank === 1) return 1;
  if (card.rank >= 11) return 10;
  return card.rank;
}

function cardKey(c) {
  return c.id;
}

/* ============================== MELD VALIDATION ============================== */

// Returns { type: 'set'|'sequence', pure: bool } or null if invalid
export function validateGroup(cards, wildRank) {
  if (!cards || cards.length < 3) return null;
  const wilds = cards.filter((c) => isWild(c, wildRank));
  const nonWilds = cards.filter((c) => !isWild(c, wildRank));
  if (nonWilds.length === 0) return null;

  const sameRank = nonWilds.every((c) => c.rank === nonWilds[0].rank);
  if (sameRank) {
    const suits = nonWilds.map((c) => c.suit);
    if (new Set(suits).size !== suits.length) return null;
    if (cards.length > 4) return null;
    return { type: "set", pure: wilds.length === 0 };
  }

  const sameSuit = nonWilds.every((c) => c.suit === nonWilds[0].suit);
  if (!sameSuit) return null;

  // A sequence can run low (A-2-3-...) or high (...-J-Q-K-A). Try both.
  for (const aceHigh of [false, true]) {
    const ranks = nonWilds.map((c) => (aceHigh && c.rank === 1 ? 14 : c.rank));
    if (new Set(ranks).size !== ranks.length) continue;
    const minR = Math.min(...ranks);
    const maxR = Math.max(...ranks);
    const span = maxR - minR + 1;
    if (cards.length !== span) continue;
    return { type: "sequence", pure: wilds.length === 0 };
  }
  return null;
}

export function validateDeclare(groups, wildRank) {
  if (groups.length === 0) return { valid: false, reason: "No melds formed yet." };
  for (const g of groups) {
    if (g.cards.length < 3) return { valid: false, reason: "Every meld needs at least 3 cards." };
  }
  const seqCount = groups.filter((g) => g.type === "sequence").length;
  const pureCount = groups.filter((g) => g.type === "sequence" && g.pure).length;
  if (pureCount < 1) return { valid: false, reason: "You need at least one pure sequence (no jokers)." };
  if (seqCount < 2) return { valid: false, reason: "You need at least two sequences total." };
  return { valid: true };
}

/* ============================== AI AUTO-GROUPING ============================== */

function autoGroup(cards, wildRank) {
  const nonWilds = cards.filter((c) => !isWild(c, wildRank));
  const wilds = cards.filter((c) => isWild(c, wildRank));
  const usedIds = new Set();
  const groups = [];

  // Pure sequences by suit (try Ace-low and Ace-high, keep whichever covers more cards)
  const findRunsForSuit = (suit, aceHigh) => {
    const list = nonWilds
      .filter((c) => c.suit === suit && !usedIds.has(c.id))
      .map((c) => ({ card: c, r: aceHigh && c.rank === 1 ? 14 : c.rank }))
      .sort((a, b) => a.r - b.r)
      .filter((x, i, arr) => i === 0 || x.r !== arr[i - 1].r);
    let run = [];
    const runs = [];
    const flush = () => {
      if (run.length >= 3) runs.push(run.map((x) => x.card));
      run = [];
    };
    for (let i = 0; i < list.length; i++) {
      if (run.length && list[i].r !== run[run.length - 1].r + 1) flush();
      run.push(list[i]);
    }
    flush();
    return runs;
  };
  SUITS.forEach((suit) => {
    const lowRuns = findRunsForSuit(suit, false);
    const highRuns = findRunsForSuit(suit, true);
    const lowCount = lowRuns.reduce((s, r) => s + r.length, 0);
    const highCount = highRuns.reduce((s, r) => s + r.length, 0);
    const chosen = highCount > lowCount ? highRuns : lowRuns;
    chosen.forEach((run) => {
      groups.push({ cards: run, type: "sequence", pure: true });
      run.forEach((c) => usedIds.add(c.id));
    });
  });

  // Sets by rank
  const rankMap = {};
  nonWilds.filter((c) => !usedIds.has(c.id)).forEach((c) => {
    (rankMap[c.rank] = rankMap[c.rank] || []).push(c);
  });
  Object.values(rankMap).forEach((arr) => {
    const distinct = [];
    const seen = new Set();
    arr.forEach((c) => {
      if (!seen.has(c.suit)) {
        seen.add(c.suit);
        distinct.push(c);
      }
    });
    if (distinct.length >= 3) {
      groups.push({ cards: distinct, type: "set", pure: true });
      distinct.forEach((c) => usedIds.add(c.id));
    }
  });

  let wildPool = [...wilds];

  // Wildcard-assisted sequences
  SUITS.forEach((suit) => {
    const list = nonWilds
      .filter((c) => c.suit === suit && !usedIds.has(c.id))
      .sort((a, b) => a.rank - b.rank);
    for (let i = 0; i < list.length - 1 && wildPool.length > 0; i++) {
      const a = list[i];
      const b = list[i + 1];
      if (usedIds.has(a.id) || usedIds.has(b.id)) continue;
      if (b.rank - a.rank <= 2) {
        const w = wildPool.pop();
        groups.push({ cards: [a, b, w], type: "sequence", pure: false });
        usedIds.add(a.id);
        usedIds.add(b.id);
      }
    }
  });

  // Wildcard-assisted sets
  const rankMap2 = {};
  nonWilds.filter((c) => !usedIds.has(c.id)).forEach((c) => {
    (rankMap2[c.rank] = rankMap2[c.rank] || []).push(c);
  });
  Object.values(rankMap2).forEach((arr) => {
    if (arr.length >= 2 && wildPool.length > 0) {
      const w = wildPool.pop();
      const pick = arr.slice(0, 2);
      groups.push({ cards: [...pick, w], type: "set", pure: false });
      pick.forEach((c) => usedIds.add(c.id));
    }
  });

  const leftover = [...nonWilds.filter((c) => !usedIds.has(c.id)), ...wildPool];
  return { groups, leftover };
}

/* ============================== GAME INIT ============================== */

const DEFAULT_MATCH_LIMIT = 321;
const MATCH_LIMIT_OPTIONS = [101, 201, 321, 501];
const NO_PURE_SEQUENCE_PENALTY = 80;

function initGame(activeIds = [0, 1, 2, 3, 4, 5], playerName = "You") {
  let deck = shuffle([...freshDeckHalf(0), ...freshDeckHalf(1)]);
  const players = NAMES.map((name, i) => ({
    id: i,
    name: i === 0 ? playerName || "You" : name,
    isHuman: i === 0,
    active: activeIds.includes(i),
    hand: [],
    groups: [],
  }));

  for (let round = 0; round < 13; round++) {
    for (let p = 0; p < 6; p++) {
      if (players[p].active) players[p].hand.push(deck.shift());
    }
  }

  let indicator;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    indicator = deck.shift();
    if (!indicator.isPrintedJoker) break;
    deck.push(indicator);
  }
  const wildRank = indicator.rank;

  const discard = [deck.shift()];
  players[0].hand = sortHand(players[0].hand);

  return {
    deck,
    discard,
    players,
    turn: activeIds[0] ?? 0,
    phase: "draw", // 'draw' | 'action' | 'gameover'
    wildRank,
    wildIndicator: indicator,
    selected: [],
    winner: null,
    log: ["The table is set. Wild joker revealed. You're up first."],
    declareError: "",
    roundStarted: false,
    scoreApplied: false,
  };
}

const TONE_FREQ = { draw: 520, discard: 320, declare: 760, fold: 200 };

function playTone(type, enabled) {
  if (!enabled) return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = TONE_FREQ[type] || 440;
    gain.gain.value = 0.05;
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
    osc.onended = () => ctx.close();
  } catch (e) {
    // audio unavailable in this environment — fail silently
  }
}

function nextActiveTurn(state, from) {
  let idx = from;
  for (let i = 0; i < 6; i++) {
    idx = (idx + 1) % 6;
    if (state.players[idx].active) return idx;
  }
  return from;
}

function sortHand(hand) {
  const order = { S: 0, H: 1, D: 2, C: 3 };
  return [...hand].sort((a, b) => {
    if (a.isPrintedJoker || b.isPrintedJoker) return a.isPrintedJoker ? 1 : b.isPrintedJoker ? -1 : 0;
    if (a.suit !== b.suit) return order[a.suit] - order[b.suit];
    return a.rank - b.rank;
  });
}

/* ============================== CARD UI ============================== */

function CardFace({ card, wildRank, small }) {
  const wild = wildRank != null && isWild(card, wildRank);
  const w = small ? "w-11 h-16" : "w-14 h-20 sm:w-16 sm:h-24";
  if (card.isPrintedJoker) {
    return (
      <div
        className={`${w} rounded-lg flex flex-col items-center justify-center shrink-0 shadow-md`}
        style={{ background: "linear-gradient(160deg,#3b2a52,#1c1430)", border: "2px solid #7a5fae" }}
      >
        <span className="text-lg sm:text-xl">🃏</span>
        <span className="text-[9px] sm:text-[10px] font-bold text-purple-200 tracking-wide">JOKER</span>
      </div>
    );
  }
  const color = SUIT_COLOR[card.suit];
  return (
    <div
      className={`${w} rounded-lg flex flex-col items-center justify-center shrink-0 shadow-md relative`}
      style={{
        background: IVORY,
        border: wild ? `2px solid ${RAIL}` : "2px solid #d8cfb8",
      }}
    >
      {wild && (
        <span
          className="absolute -top-2 -right-2 text-[9px] font-bold px-1 rounded-full"
          style={{ background: RAIL, color: FELT_DARK }}
        >
          WILD
        </span>
      )}
      <span className={`${small ? "text-sm" : "text-base sm:text-lg"} font-bold font-serif`} style={{ color }}>
        {RANK_LABEL[card.rank]}
      </span>
      <span className={small ? "text-base" : "text-lg sm:text-xl"} style={{ color }}>
        {SUIT_SYMBOL[card.suit]}
      </span>
    </div>
  );
}

const DECK_SKIN = {
  red: { base: "#7a1620", light: "#8f1c28", dark: "#6e131d", boxGrad: "linear-gradient(150deg,#a3283a,#6e1420 70%)", boxShadow: "#5c0f18", label: "#6e1420" },
  black: { base: "#17181c", light: "#26282e", dark: "#101114", boxGrad: "linear-gradient(150deg,#3a3d45,#15161a 70%)", boxShadow: "#0c0d10", label: "#1a1a1a" },
};

function deckVariant(card) {
  return card.id.startsWith("0-") ? "red" : "black";
}

function CardBack({ small, variant = "red" }) {
  const skin = DECK_SKIN[variant] || DECK_SKIN.red;
  const w = small ? "w-8 h-12" : "w-10 h-14";
  return (
    <div className={`${w} rounded-md shrink-0 shadow-lg relative overflow-hidden`} style={{ background: skin.base, border: "2px solid #f3ecdc" }}>
      <div
        className="absolute inset-[3px] rounded-sm"
        style={{
          background: `repeating-linear-gradient(45deg, ${skin.light} 0px, ${skin.light} 4px, ${skin.dark} 4px, ${skin.dark} 8px), repeating-linear-gradient(-45deg, rgba(255,255,255,0.06) 0px, rgba(255,255,255,0.06) 2px, transparent 2px, transparent 8px)`,
          border: "1px solid rgba(243,236,220,0.55)",
        }}
      />
    </div>
  );
}

function DeckBox({ count, variant = "red" }) {
  const skin = DECK_SKIN[variant] || DECK_SKIN.red;
  return (
    <div className="relative w-14 h-20 shrink-0">
      {/* stacked shadow cards peeking behind the box for depth */}
      <div className="absolute inset-0 translate-x-1 translate-y-1 rounded-sm" style={{ background: skin.boxShadow, border: "1px solid rgba(0,0,0,0.4)" }} />
      <div className="absolute inset-0 rounded-sm shadow-lg" style={{ background: skin.boxGrad, border: "1px solid rgba(0,0,0,0.45)" }}>
        <div
          className="absolute rounded-[3px] flex flex-col items-center justify-center gap-0.5"
          style={{ inset: "4px", background: "rgba(243,236,220,0.94)", border: `1px solid ${skin.label}` }}
        >
          <span className="text-[6.5px] font-bold tracking-widest" style={{ color: skin.label }}>
            PLAYING
          </span>
          <span className="text-base leading-none" style={{ color: skin.label }}>
            ♠
          </span>
          <span className="text-[6.5px] font-bold tracking-widest" style={{ color: skin.label }}>
            CARDS
          </span>
        </div>
      </div>
      {count != null && (
        <span
          className="absolute -top-2 -right-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow"
          style={{ background: RAIL, color: FELT_DARK }}
        >
          {count}
        </span>
      )}
    </div>
  );
}

/* ============================== MAIN APP ============================== */

function GameTable({ playerName = "You", matchLimit = DEFAULT_MATCH_LIMIT, soundOn = true, onQuit }) {
  const [g, setG] = useState(() => initGame([0, 1, 2, 3, 4, 5], playerName));
  const [scores, setScores] = useState([0, 0, 0, 0, 0, 0]);
  const [lastRoundPoints, setLastRoundPoints] = useState({});
  const [matchOver, setMatchOver] = useState(null);
  const [toast, setToast] = useState("");
  const aiTimer = useRef(null);
  const toastTimer = useRef(null);

  const pushLog = useCallback((msg) => {
    setG((prev) => ({ ...prev, log: [msg, ...prev.log].slice(0, 6) }));
  }, []);

  const showToast = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2600);
  }, []);

  /* ---------- AI turn ---------- */
  useEffect(() => {
    if (g.phase === "gameover") return;
    const current = g.players[g.turn];
    if (current.isHuman) return;

    aiTimer.current = setTimeout(() => {
      setG((prev) => runAiTurn(prev));
    }, 1000);
    return () => clearTimeout(aiTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g.turn, g.phase]);

  /* ---------- Apply deadwood scoring once per round ---------- */
  useEffect(() => {
    if (g.winner == null || g.scoreApplied) return;
    const breakdown = {};
    setScores((prev) => {
      const next = [...prev];
      g.players.forEach((p, i) => {
        if (!p.active) return;
        if (i === g.winner) {
          breakdown[i] = 0;
          return;
        }
        const { groups, leftover } = autoGroup(p.hand, g.wildRank);
        const hasPureSequence = groups.some((gr) => gr.type === "sequence" && gr.pure);
        const pts = hasPureSequence
          ? leftover.reduce((s, c) => s + pointValue(c, g.wildRank), 0)
          : NO_PURE_SEQUENCE_PENALTY;
        breakdown[i] = pts;
        next[i] += pts;
      });
      return next;
    });
    setLastRoundPoints(breakdown);
    setG((prev) => ({ ...prev, scoreApplied: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g.winner, g.scoreApplied]);

  /* ---------- Elimination / match-over check ---------- */
  useEffect(() => {
    if (matchOver) return;
    if (scores[0] >= matchLimit) {
      setMatchOver({ reason: "human_eliminated" });
      return;
    }
    const stillIn = scores.map((s, i) => (s < matchLimit ? i : null)).filter((x) => x !== null);
    if (stillIn.length <= 1) {
      setMatchOver({ reason: "last_player_standing", winnerId: stillIn[0] ?? 0 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scores, matchOver]);

  function runAiTurn(prev) {
    const state = structuredCloneLite(prev);
    const idx = state.turn;
    const player = state.players[idx];
    const wildRank = state.wildRank;

    // Decide draw source
    let drawn;
    let tookDiscard = false;
    const topDiscard = state.discard[state.discard.length - 1];
    if (topDiscard && state.discard.length > 0) {
      const withDiscard = autoGroup([...player.hand, topDiscard], wildRank);
      const withoutDiscard = autoGroup(player.hand, wildRank);
      if (withDiscard.leftover.length < withoutDiscard.leftover.length) {
        drawn = state.discard.pop();
        tookDiscard = true;
      }
    }
    if (!drawn) {
      if (state.deck.length === 0) reshuffleDeck(state);
      drawn = state.deck.shift();
    }
    player.hand.push(drawn);

    let { groups, leftover } = autoGroup(player.hand, wildRank);

    // If nothing left to discard, pull one card back out of the largest group
    if (leftover.length === 0) {
      let biggest = null;
      groups.forEach((gr) => {
        if (gr.cards.length > 3 && (!biggest || gr.cards.length > biggest.cards.length)) biggest = gr;
      });
      if (biggest) {
        const card = biggest.cards.pop();
        leftover.push(card);
      } else if (groups.length > 0) {
        const gr = groups[groups.length - 1];
        const card = gr.cards.pop();
        leftover.push(card);
        if (gr.cards.length < 3) groups.pop();
      }
    }

    const check = validateDeclare(groups, wildRank);
    const totalGrouped = groups.reduce((s, gr) => s + gr.cards.length, 0);

    if (check.valid && leftover.length === 1 && totalGrouped === 13) {
      state.discard.push(leftover[0]);
      player.hand = player.hand.filter((c) => c.id !== leftover[0].id);
      state.winner = idx;
      state.phase = "gameover";
      state.finalGroups = { ...state.finalGroups, [idx]: groups };
      state.log = [`${player.name} declares and wins the round!`, ...state.log].slice(0, 6);
      return state;
    }

    // discard the weakest leftover, avoid discarding wildcards if possible
    const candidates = leftover.filter((c) => !isWild(c, wildRank));
    const pool = candidates.length > 0 ? candidates : leftover;
    pool.sort((a, b) => pointValue(b, wildRank) - pointValue(a, wildRank));
    const toDiscard = pool[0];
    player.hand = player.hand.filter((c) => c.id !== toDiscard.id);
    state.discard.push(toDiscard);

    const label = toDiscard.isPrintedJoker ? "a Joker" : `${RANK_LABEL[toDiscard.rank]}${SUIT_SYMBOL[toDiscard.suit]}`;
    state.log = [
      `${player.name} ${tookDiscard ? "took the discard" : "drew from stock"} and discarded ${label}.`,
      ...state.log,
    ].slice(0, 6);

    state.turn = nextActiveTurn(state, idx);
    state.phase = "draw";
    return state;
  }

  function reshuffleDeck(state) {
    // Keep the top discard, shuffle the rest of the discard pile back into stock
    const top = state.discard.pop();
    state.deck = shuffle(state.discard);
    state.discard = top ? [top] : [];
  }

  /* ---------- Human actions ---------- */

  function humanDraw(fromDiscard) {
    playTone("draw", soundOn);
    setG((prev) => {
      if (prev.phase !== "draw" || !prev.players[prev.turn].isHuman) return prev;
      const state = structuredCloneLite(prev);
      const human = state.players[0];
      let card;
      if (fromDiscard) {
        if (state.discard.length === 0) return prev;
        card = state.discard.pop();
      } else {
        if (state.deck.length === 0) reshuffleDeck(state);
        card = state.deck.shift();
      }
      human.hand.push(card);
      state.phase = "action";
      state.selected = [];
      state.declareError = "";
      state.roundStarted = true;
      state.log = [`You drew ${fromDiscard ? "the discard" : "from the stock"}.`, ...state.log].slice(0, 6);
      return state;
    });
  }

  function toggleSelect(id) {
    setG((prev) => {
      if (prev.phase !== "action") return prev;
      const sel = prev.selected.includes(id) ? prev.selected.filter((x) => x !== id) : [...prev.selected, id];
      return { ...prev, selected: sel, declareError: "" };
    });
  }

  function looseCards(state) {
    const human = state.players[0];
    const groupedIds = new Set(human.groups.flatMap((g) => g.cards.map((c) => c.id)));
    return human.hand.filter((c) => !groupedIds.has(c.id));
  }

  function groupSelected() {
    setG((prev) => {
      const state = structuredCloneLite(prev);
      const human = state.players[0];
      const loose = looseCards(state);
      const selectedCards = loose.filter((c) => state.selected.includes(c.id));
      if (selectedCards.length < 3) {
        showToast("Select at least 3 cards to form a meld.");
        return prev;
      }
      const meta = validateGroup(selectedCards, state.wildRank);
      if (!meta) {
        showToast("That's not a valid set or sequence.");
        return prev;
      }
      human.groups.push({ cards: selectedCards, ...meta });
      state.selected = [];
      return state;
    });
  }

  function ungroup(groupIdx) {
    setG((prev) => {
      const state = structuredCloneLite(prev);
      const human = state.players[0];
      human.groups.splice(groupIdx, 1);
      return state;
    });
  }

  function discardSelected() {
    setG((prev) => {
      if (prev.phase !== "action") return prev;
      const state = structuredCloneLite(prev);
      const human = state.players[0];
      const loose = looseCards(state);
      const chosen = loose.filter((c) => state.selected.includes(c.id));
      if (chosen.length !== 1) {
        showToast("Select exactly one ungrouped card to discard.");
        return prev;
      }
      human.hand = human.hand.filter((c) => c.id !== chosen[0].id);
      state.discard.push(chosen[0]);
      state.selected = [];
      state.declareError = "";
      state.turn = nextActiveTurn(state, 0);
      state.phase = "draw";
      state.log = [`You discarded ${RANK_LABEL[chosen[0].rank] || ""}${SUIT_SYMBOL[chosen[0].suit] || "Joker"}.`, ...state.log].slice(0, 6);
      playTone("discard", soundOn);
      return state;
    });
  }

  function declare() {
    setG((prev) => {
      const state = structuredCloneLite(prev);
      const human = state.players[0];
      const loose = looseCards(state);
      const totalGrouped = human.groups.reduce((s, g) => s + g.cards.length, 0);

      if (loose.length !== 1 || totalGrouped !== 13) {
        state.declareError = `You need exactly 13 cards melded and 1 card left to discard. Right now you have ${totalGrouped} melded and ${loose.length} ungrouped.`;
        return state;
      }
      const check = validateDeclare(human.groups, state.wildRank);
      if (!check.valid) {
        state.declareError = check.reason;
        return state;
      }
      human.hand = human.hand.filter((c) => c.id !== loose[0].id);
      state.discard.push(loose[0]);
      state.winner = 0;
      state.phase = "gameover";
      state.finalGroups = { ...state.finalGroups, 0: human.groups };
      state.log = ["You declare — Rummy! You win the round.", ...state.log].slice(0, 6);
      playTone("declare", soundOn);
      return state;
    });
  }

  function activePlayerIds() {
    return scores.map((s, i) => (s < matchLimit ? i : null)).filter((x) => x !== null);
  }

  function newGame() {
    setG(initGame(activePlayerIds(), playerName));
  }

  function foldRound() {
    if (g.phase === "gameover") return;
    const penalty = g.roundStarted ? 40 : 20;
    setScores((prev) => prev.map((v, i) => (i === 0 ? v + penalty : v)));
    setLastRoundPoints({ 0: penalty });
    playTone("fold", soundOn);
    showToast(`You folded — +${penalty} points. Reshuffling for a new round.`);
    const next = initGame(activePlayerIds(), playerName);
    next.log = [
      `You folded ${g.roundStarted ? "mid-round" : "before play began"} (+${penalty} pts added to your score).`,
      ...next.log,
    ].slice(0, 6);
    setG(next);
  }

  function startNewMatch() {
    setScores([0, 0, 0, 0, 0, 0]);
    setLastRoundPoints({});
    setMatchOver(null);
    setG(initGame([0, 1, 2, 3, 4, 5], playerName));
  }

  /* ---------- Derived ---------- */
  const human = g.players[0];
  const loose = looseCards(g);
  const isHumanTurn = g.players[g.turn].isHuman && g.phase !== "gameover";
  const topDiscard = g.discard[g.discard.length - 1];

  return (
    <div
      className="w-full min-h-screen flex flex-col items-center px-3 py-4 sm:px-6"
      style={{
        background: WOOD_BG,
        fontFamily: "ui-sans-serif, system-ui",
      }}
    >
      {/* Header */}
      <div className="w-full max-w-5xl flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          {onQuit && (
            <button onClick={onQuit} className="text-xs sm:text-sm underline mr-1" style={{ color: RAIL }}>
              ⟵ Menu
            </button>
          )}
          <div className="hidden sm:flex items-end -space-x-3 scale-75 opacity-90">
            <div className="-rotate-6">
              <DeckBox variant="red" />
            </div>
            <div className="rotate-6">
              <DeckBox variant="black" />
            </div>
          </div>
          <h1 className="font-serif text-xl sm:text-2xl font-bold tracking-wide" style={{ color: IVORY }}>
            Six-Hand Rummy
          </h1>
        </div>
        <div className="text-xs sm:text-sm px-3 py-1 rounded-full" style={{ background: FELT_DARK, color: RAIL, border: `1px solid ${RAIL_DIM}` }}>
          {g.phase === "gameover" ? "Round over" : isHumanTurn ? (g.phase === "draw" ? "Your turn — draw" : "Your turn — arrange & discard") : `${g.players[g.turn].name} is playing…`}
        </div>
      </div>

      {/* Scoreboard */}
      <div className="w-full max-w-5xl flex items-center justify-between gap-2 mb-3 px-3 py-1.5 rounded-xl flex-wrap" style={{ background: "rgba(0,0,0,0.2)" }}>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[11px] uppercase tracking-wider" style={{ color: RAIL }}>
            Scores (lower is better)
          </span>
          {g.players.map((p) => (
            <span key={p.id} className="text-xs font-mono" style={{ color: p.isHuman ? IVORY : "rgba(243,236,220,0.8)" }}>
              {p.name}: {scores[p.id]}
            </span>
          ))}
        </div>
        <button
          onClick={() => {
            startNewMatch();
            showToast("Scores reset for a new match.");
          }}
          className="text-[11px] underline"
          style={{ color: RAIL }}
        >
          Reset Match
        </button>
      </div>

      {/* Elimination note under scoreboard */}
      <div className="w-full max-w-5xl -mt-2 mb-3 px-3 text-[11px]" style={{ color: "rgba(240,165,160,0.85)" }}>
        Reaching {matchLimit} points eliminates a player from the match. No natural (pure) sequence when someone declares costs a flat {NO_PURE_SEQUENCE_PENALTY}. Ace runs low (A-2-3) or high (J-Q-K-A).
      </div>

      {/* AI opponents arc */}
      <div className="w-full max-w-5xl flex justify-center gap-3 sm:gap-6 mb-4 flex-wrap">
        {g.players.slice(1).map((p, i) => (
          <div
            key={p.id}
            className="flex flex-col items-center rounded-xl px-3 py-2"
            style={{
              background: FELT_DARK,
              border: g.turn === p.id ? `2px solid ${RAIL}` : "1px solid rgba(201,161,90,0.25)",
              transform: `translateY(${Math.abs(i - 2) * 4}px)`,
              opacity: p.active ? 1 : 0.5,
            }}
          >
            <div className="text-sm font-semibold" style={{ color: IVORY }}>
              {p.name}
            </div>
            <div className="text-[10px] font-mono" style={{ color: scores[p.id] >= matchLimit ? "#f0a5a0" : RAIL }}>
              {scores[p.id]} pts{scores[p.id] >= matchLimit ? " — OUT" : ""}
            </div>
            {p.active ? (
              <>
                <div className="flex -space-x-4 mt-1 mb-1">
                  {p.hand.slice(0, 6).map((c) => (
                    <CardBack key={c.id} small variant={deckVariant(c)} />
                  ))}
                </div>
                <div className="text-[11px]" style={{ color: RAIL }}>
                  {p.hand.length} cards
                </div>
                {g.turn === p.id && g.phase !== "gameover" && (
                  <div className="text-[10px] mt-0.5 animate-pulse" style={{ color: RAIL }}>
                    thinking…
                  </div>
                )}
              </>
            ) : (
              <div className="text-[11px] mt-2 mb-1" style={{ color: "rgba(243,236,220,0.5)" }}>
                sitting out
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Table center: wild indicator, stock, discard */}
      <div className="w-full max-w-5xl flex items-center justify-center gap-6 sm:gap-10 mb-5 rounded-2xl py-4" style={{ background: "rgba(0,0,0,0.15)" }}>
        <div className="flex flex-col items-center">
          <span className="text-[10px] uppercase tracking-wider mb-1" style={{ color: RAIL }}>
            Tonight's Wild
          </span>
          <CardFace card={g.wildIndicator} wildRank={g.wildRank} />
        </div>

        <button
          onClick={() => isHumanTurn && g.phase === "draw" && humanDraw(false)}
          disabled={!(isHumanTurn && g.phase === "draw")}
          className="flex flex-col items-center focus:outline-none"
        >
          <span className="text-[10px] uppercase tracking-wider mb-1" style={{ color: RAIL }}>
            Stock
          </span>
          <div className="relative flex items-end">
            <div className="opacity-90 -mr-6 -mb-1">
              <DeckBox variant="black" />
            </div>
            <DeckBox count={g.deck.length} variant="red" />
            {isHumanTurn && g.phase === "draw" && (
              <span
                className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
                style={{ background: RAIL, color: FELT_DARK }}
              >
                Draw
              </span>
            )}
          </div>
        </button>

        <button
          onClick={() => isHumanTurn && g.phase === "draw" && humanDraw(true)}
          disabled={!(isHumanTurn && g.phase === "draw") || !topDiscard}
          className="flex flex-col items-center focus:outline-none"
        >
          <span className="text-[10px] uppercase tracking-wider mb-1" style={{ color: RAIL }}>
            Discard ({g.discard.length})
          </span>
          <div className="relative">
            {topDiscard ? <CardFace card={topDiscard} wildRank={g.wildRank} /> : <div className="w-14 h-20" />}
            {isHumanTurn && g.phase === "draw" && topDiscard && (
              <span
                className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
                style={{ background: RAIL, color: FELT_DARK }}
              >
                Take
              </span>
            )}
          </div>
        </button>
      </div>

      {g.phase !== "gameover" && (
        <div className="w-full max-w-5xl flex items-center justify-center gap-3 -mt-2 mb-4">
          <span className="text-xs" style={{ color: "rgba(243,236,220,0.7)" }}>
            {g.roundStarted ? "Want to give up this hand?" : "Not happy with your hand?"}
          </span>
          <button
            onClick={foldRound}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold"
            style={{ background: "transparent", color: "#f0a5a0", border: "1px solid #7a1f2b" }}
          >
            Fold (+{g.roundStarted ? 40 : 20} pts)
          </button>
        </div>
      )}

      {/* Log */}
      <div className="w-full max-w-5xl mb-3 text-xs sm:text-sm px-3" style={{ color: "rgba(243,236,220,0.75)" }}>
        {g.log[0]}
      </div>

      {/* Human panel */}
      <div className="w-full max-w-5xl rounded-2xl p-3 sm:p-4" style={{ background: FELT_DARK, border: `1px solid ${RAIL_DIM}` }}>
        <div className="flex items-center justify-between mb-2">
          <span className="font-serif font-bold" style={{ color: IVORY }}>
            Your Hand
          </span>
          <span className="text-xs" style={{ color: RAIL }}>
            {human.hand.length} cards
          </span>
        </div>

        {/* Melds */}
        {human.groups.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {human.groups.map((gr, idx) => (
              <div key={idx} className="flex flex-col items-start p-2 rounded-lg" style={{ border: `1px dashed ${RAIL}` }}>
                <div className="flex justify-between w-full mb-1">
                  <span className="text-[10px] uppercase" style={{ color: RAIL }}>
                    {gr.type === "sequence" ? (gr.pure ? "Pure Sequence" : "Sequence") : "Set"}
                  </span>
                  <button onClick={() => ungroup(idx)} className="text-[10px] underline ml-3" style={{ color: RAIL }}>
                    ungroup
                  </button>
                </div>
                <div className="flex gap-1">
                  {gr.cards.map((c) => (
                    <CardFace key={c.id} card={c} wildRank={g.wildRank} small />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Loose cards */}
        <div className="flex flex-wrap gap-2 mb-3">
          {loose.map((c) => (
            <div
              key={c.id}
              onClick={() => g.phase === "action" && toggleSelect(c.id)}
              className="cursor-pointer transition-transform"
              style={{ transform: g.selected.includes(c.id) ? "translateY(-8px)" : "none" }}
            >
              <div style={{ boxShadow: g.selected.includes(c.id) ? `0 0 0 3px ${RAIL}` : "none", borderRadius: 8 }}>
                <CardFace card={c} wildRank={g.wildRank} />
              </div>
            </div>
          ))}
          {loose.length === 0 && human.groups.length === 0 && (
            <span className="text-xs italic" style={{ color: "rgba(243,236,220,0.5)" }}>
              Draw a card to begin arranging your hand.
            </span>
          )}
        </div>

        {/* Actions */}
        {g.phase === "action" && (
          <div className="flex flex-wrap gap-2 items-center">
            <button onClick={groupSelected} className="px-3 py-1.5 rounded-lg text-sm font-semibold" style={{ background: RAIL, color: FELT_DARK }}>
              Group Selected
            </button>
            <button
              onClick={discardSelected}
              className="px-3 py-1.5 rounded-lg text-sm font-semibold"
              style={{ background: "transparent", color: IVORY, border: `1px solid ${RAIL_DIM}` }}
            >
              Discard Selected
            </button>
            <button
              onClick={declare}
              className="px-3 py-1.5 rounded-lg text-sm font-semibold"
              style={{ background: "#7a1f2b", color: IVORY }}
            >
              Declare
            </button>
            {g.declareError && <span className="text-xs ml-2" style={{ color: "#f0a5a0" }}>{g.declareError}</span>}
          </div>
        )}
      </div>

      {toast && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full text-sm font-medium shadow-lg"
          style={{ background: RAIL, color: FELT_DARK }}
        >
          {toast}
        </div>
      )}

      {/* Game over modal (single round) */}
      {g.phase === "gameover" && !matchOver && (
        <div className="fixed inset-0 flex items-center justify-center px-4" style={{ background: "rgba(0,0,0,0.6)" }}>
          <div className="rounded-2xl p-6 max-w-lg w-full" style={{ background: FELT_DARK, border: `2px solid ${RAIL}` }}>
            <h2 className="font-serif text-2xl font-bold mb-2" style={{ color: RAIL }}>
              {g.players[g.winner].name === "You" ? "You win the round! 🎉" : `${g.players[g.winner].name} wins the round.`}
            </h2>
            <p className="text-sm mb-4" style={{ color: "rgba(243,236,220,0.8)" }}>
              {g.log[0]}
            </p>
            <div className="mb-4 rounded-lg p-3" style={{ background: "rgba(0,0,0,0.25)" }}>
              <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: RAIL }}>
                Points this round
              </div>
              {g.players.filter((p) => p.active).map((p) => (
                <div key={p.id} className="flex justify-between text-xs py-0.5" style={{ color: IVORY }}>
                  <span>{p.name}</span>
                  <span className="font-mono">
                    {p.id === g.winner ? "0 (winner)" : `+${lastRoundPoints[p.id] ?? 0}`}
                  </span>
                </div>
              ))}
            </div>
            <button onClick={newGame} className="px-4 py-2 rounded-lg font-semibold" style={{ background: RAIL, color: FELT_DARK }}>
              Deal a New Round
            </button>
          </div>
        </div>
      )}

      {/* Match over modal */}
      {matchOver && (
        <div className="fixed inset-0 flex items-center justify-center px-4" style={{ background: "rgba(0,0,0,0.75)" }}>
          <div className="rounded-2xl p-6 max-w-lg w-full" style={{ background: FELT_DARK, border: `2px solid ${RAIL}` }}>
            <h2 className="font-serif text-2xl font-bold mb-2" style={{ color: RAIL }}>
              {matchOver.reason === "human_eliminated"
                ? `Match over — you reached ${matchLimit} points.`
                : `Match over — ${g.players[matchOver.winnerId].name} takes the match!`}
            </h2>
            <p className="text-sm mb-4" style={{ color: "rgba(243,236,220,0.8)" }}>
              {matchOver.reason === "human_eliminated"
                ? "You've been eliminated. Everyone else's scores are frozen where they stand."
                : "Every other player has crossed the elimination line — last one standing wins."}
            </p>
            <div className="mb-4 rounded-lg p-3" style={{ background: "rgba(0,0,0,0.25)" }}>
              <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: RAIL }}>
                Final scores
              </div>
              {g.players.map((p) => (
                <div key={p.id} className="flex justify-between text-xs py-0.5" style={{ color: scores[p.id] >= matchLimit ? "#f0a5a0" : IVORY }}>
                  <span>{p.name}</span>
                  <span className="font-mono">{scores[p.id]}{scores[p.id] >= matchLimit ? " (out)" : ""}</span>
                </div>
              ))}
            </div>
            <button onClick={startNewMatch} className="px-4 py-2 rounded-lg font-semibold" style={{ background: RAIL, color: FELT_DARK }}>
              Start New Match
            </button>
          </div>
        </div>
      )}

      <div className="w-full max-w-5xl text-center mt-4 mb-1 text-[10px] tracking-widest" style={{ color: "rgba(243,236,220,0.35)" }}>
        OTECH
      </div>
    </div>
  );
}

/* ============================== UTIL ============================== */

function structuredCloneLite(state) {
  return {
    ...state,
    deck: [...state.deck],
    discard: [...state.discard],
    players: state.players.map((p) => ({ ...p, hand: [...p.hand], groups: p.groups.map((g) => ({ ...g, cards: [...g.cards] })) })),
    selected: [...state.selected],
    log: [...state.log],
    finalGroups: state.finalGroups ? { ...state.finalGroups } : {},
  };
}

/* ============================== MENU / SETTINGS / ABOUT ============================== */

function MenuScreen({ onPlay, onSettings, onAbout }) {
  return (
    <div
      className="w-full min-h-screen flex flex-col items-center justify-center px-4"
      style={{ background: WOOD_BG, fontFamily: "ui-sans-serif, system-ui" }}
    >
      <div className="flex items-end -space-x-6 mb-2 scale-90 sm:scale-100">
        <div className="-rotate-12">
          <DeckBox variant="red" />
        </div>
        <div className="rotate-12 mb-4">
          <DeckBox variant="black" />
        </div>
      </div>

      <h1 className="font-serif text-3xl sm:text-5xl font-bold tracking-wide text-center mb-1" style={{ color: IVORY }}>
        Six-Hand Rummy
      </h1>
      <p className="text-sm sm:text-base italic mb-8" style={{ color: RAIL }}>
        Six hands. One shuffled table. No mercy.
      </p>

      <div className="flex flex-col gap-3 w-full max-w-xs">
        <button
          onClick={onPlay}
          className="px-5 py-3 rounded-xl font-serif font-bold text-lg shadow-lg"
          style={{ background: RAIL, color: FELT_DARK }}
        >
          Start Game
        </button>
        <button
          onClick={onSettings}
          className="px-5 py-2.5 rounded-xl font-semibold"
          style={{ background: "transparent", color: IVORY, border: `1px solid ${RAIL_DIM}` }}
        >
          Settings
        </button>
        <button
          onClick={onAbout}
          className="px-5 py-2.5 rounded-xl font-semibold"
          style={{ background: "transparent", color: IVORY, border: `1px solid ${RAIL_DIM}` }}
        >
          About
        </button>
      </div>

      <div className="mt-10 text-[10px] tracking-widest" style={{ color: "rgba(243,236,220,0.4)" }}>
        A TABLE GAME BY OTECH
      </div>
    </div>
  );
}

function ModalShell({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 flex items-center justify-center px-4 z-10" style={{ background: "rgba(0,0,0,0.7)" }}>
      <div className="rounded-2xl p-6 max-w-md w-full" style={{ background: FELT_DARK, border: `2px solid ${RAIL}` }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-serif text-xl font-bold" style={{ color: RAIL }}>
            {title}
          </h2>
          <button onClick={onClose} className="text-sm px-2 py-0.5 rounded" style={{ color: IVORY }}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function SettingsScreen({ settings, onChange, onClose }) {
  return (
    <ModalShell title="Settings" onClose={onClose}>
      <div className="mb-4">
        <label className="text-xs uppercase tracking-wider block mb-1" style={{ color: RAIL }}>
          Your name
        </label>
        <input
          value={settings.playerName}
          onChange={(e) => onChange({ ...settings, playerName: e.target.value.slice(0, 16) })}
          placeholder="You"
          className="w-full px-3 py-2 rounded-lg text-sm"
          style={{ background: IVORY, color: FELT_DARK, border: `1px solid ${RAIL_DIM}` }}
        />
      </div>

      <div className="mb-4">
        <label className="text-xs uppercase tracking-wider block mb-2" style={{ color: RAIL }}>
          Elimination score
        </label>
        <div className="flex gap-2 flex-wrap">
          {MATCH_LIMIT_OPTIONS.map((opt) => (
            <button
              key={opt}
              onClick={() => onChange({ ...settings, matchLimit: opt })}
              className="px-3 py-1.5 rounded-lg text-sm font-semibold"
              style={{
                background: settings.matchLimit === opt ? RAIL : "transparent",
                color: settings.matchLimit === opt ? FELT_DARK : IVORY,
                border: `1px solid ${RAIL_DIM}`,
              }}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-6 flex items-center justify-between">
        <label className="text-xs uppercase tracking-wider" style={{ color: RAIL }}>
          Sound effects
        </label>
        <button
          onClick={() => onChange({ ...settings, soundOn: !settings.soundOn })}
          className="px-4 py-1.5 rounded-full text-sm font-semibold"
          style={{
            background: settings.soundOn ? RAIL : "transparent",
            color: settings.soundOn ? FELT_DARK : IVORY,
            border: `1px solid ${RAIL_DIM}`,
          }}
        >
          {settings.soundOn ? "On" : "Off"}
        </button>
      </div>

      <button onClick={onClose} className="w-full px-4 py-2 rounded-lg font-semibold" style={{ background: RAIL, color: FELT_DARK }}>
        Save &amp; Close
      </button>
    </ModalShell>
  );
}

function AboutScreen({ onClose }) {
  return (
    <ModalShell title="About" onClose={onClose}>
      <div className="flex items-center gap-3 mb-4">
        <div className="scale-75 -rotate-6">
          <DeckBox variant="black" />
        </div>
        <div>
          <div className="font-serif text-lg font-bold" style={{ color: IVORY }}>
            OTECH
          </div>
          <div className="text-xs" style={{ color: RAIL }}>
            Table games, built to last
          </div>
        </div>
      </div>
      <p className="text-sm mb-3" style={{ color: "rgba(243,236,220,0.85)" }}>
        Otech makes small, focused card and table games meant to be picked up in a spare ten minutes and played for
        an evening. Six-Hand Rummy is built around the classic two-deck rummy variant played with six players at
        one table.
      </p>
      <p className="text-sm mb-5" style={{ color: "rgba(243,236,220,0.65)" }}>
        Version 1.0 · No accounts, no ads, no data leaves this device.
      </p>
      <button onClick={onClose} className="w-full px-4 py-2 rounded-lg font-semibold" style={{ background: RAIL, color: FELT_DARK }}>
        Close
      </button>
    </ModalShell>
  );
}

export default function App() {
  const [screen, setScreen] = useState("menu"); // 'menu' | 'game'
  const [overlay, setOverlay] = useState(null); // null | 'settings' | 'about'
  const [settings, setSettings] = useState({
    playerName: "You",
    matchLimit: DEFAULT_MATCH_LIMIT,
    soundOn: true,
  });
  const [gameKey, setGameKey] = useState(0);

  function startGame() {
    setGameKey((k) => k + 1);
    setScreen("game");
  }

  if (screen === "game") {
    return (
      <GameTable
        key={gameKey}
        playerName={settings.playerName || "You"}
        matchLimit={settings.matchLimit}
        soundOn={settings.soundOn}
        onQuit={() => setScreen("menu")}
      />
    );
  }

  return (
    <>
      <MenuScreen onPlay={startGame} onSettings={() => setOverlay("settings")} onAbout={() => setOverlay("about")} />
      {overlay === "settings" && <SettingsScreen settings={settings} onChange={setSettings} onClose={() => setOverlay(null)} />}
      {overlay === "about" && <AboutScreen onClose={() => setOverlay(null)} />}
    </>
  );
}
