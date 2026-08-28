import { describe, expect, it } from "vitest";
import {
  freshDeckHalf,
  isWild,
  pointValue,
  validateDeclare,
  validateGroup,
} from "./App";

const card = (suit, rank, id = `${suit}-${rank}`) => ({
  id,
  suit,
  rank,
  isPrintedJoker: false,
});

const joker = (id = "joker") => ({
  id,
  suit: null,
  rank: null,
  isPrintedJoker: true,
});

describe("deck and card rules", () => {
  it("creates a 54-card deck half with unique ids", () => {
    const deck = freshDeckHalf(0);

    expect(deck).toHaveLength(54);
    expect(new Set(deck.map((entry) => entry.id)).size).toBe(54);
    expect(deck.filter((entry) => entry.isPrintedJoker)).toHaveLength(2);
  });

  it("treats the wild rank and printed jokers as wild", () => {
    expect(isWild(card("S", 7), 7)).toBe(true);
    expect(isWild(card("S", 8), 7)).toBe(false);
    expect(isWild(joker(), 7)).toBe(true);
  });

  it("calculates rummy point values", () => {
    expect(pointValue(card("S", 1), 7)).toBe(1);
    expect(pointValue(card("S", 10), 7)).toBe(10);
    expect(pointValue(card("S", 13), 7)).toBe(10);
    expect(pointValue(card("S", 7), 7)).toBe(0);
    expect(pointValue(joker(), 7)).toBe(0);
  });
});

describe("meld rules", () => {
  it("accepts a pure same-suit sequence", () => {
    expect(validateGroup([card("H", 3), card("H", 4), card("H", 5)], 7)).toEqual({
      type: "sequence",
      pure: true,
    });
  });

  it("rejects duplicate suits in a set", () => {
    expect(validateGroup([card("S", 9), card("S", 9, "duplicate"), card("H", 9)], 7)).toBeNull();
  });

  it("requires two sequences and one pure sequence to declare", () => {
    const validGroups = [
      { cards: [card("H", 3), card("H", 4), card("H", 5)], type: "sequence", pure: true },
      { cards: [card("S", 8), card("S", 9), joker()], type: "sequence", pure: false },
    ];

    expect(validateDeclare(validGroups, 7)).toEqual({ valid: true });
    expect(validateDeclare([validGroups[1]], 7).valid).toBe(false);
  });
});
