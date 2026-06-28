import { clampPenaltyGold } from './encounterResolver';

// Safeguard: the displayed gold loss must never exceed the gold the hero actually has, so the
// player can't see "Lost 44 gold" with 0 gold (the actual party deduction is clamped too).

describe('clampPenaltyGold', () => {
  test('clamps gold loss to available and rewrites the message', () => {
    const penalties = { messages: ['Serious injuries sustained', 'Lost 44 gold in the chaos'], goldLoss: 44, itemsLost: [] };
    const result = clampPenaltyGold(penalties, 0);
    expect(result.goldLoss).toBe(0);
    expect(result.messages).toEqual(['Serious injuries sustained']); // no "Lost N gold" when 0
  });

  test('partial clamp keeps an accurate message', () => {
    const penalties = { messages: ['Reputation damaged', 'Lost 44 gold'], goldLoss: 44, itemsLost: [] };
    const result = clampPenaltyGold(penalties, 10);
    expect(result.goldLoss).toBe(10);
    expect(result.messages).toContain('Lost 10 gold');
    expect(result.messages).toContain('Reputation damaged');
    expect(result.messages.some((m) => /Lost 44 gold/.test(m))).toBe(false);
  });

  test('no change when available gold covers the loss', () => {
    const penalties = { messages: ['Lost 5 gold'], goldLoss: 5, itemsLost: [] };
    expect(clampPenaltyGold(penalties, 100)).toBe(penalties); // same reference, untouched
  });

  test('unknown gold (not a number) leaves the penalty unchanged', () => {
    const penalties = { messages: ['Lost 9 gold'], goldLoss: 9, itemsLost: [] };
    expect(clampPenaltyGold(penalties, undefined)).toBe(penalties);
  });

  test('null penalties pass through', () => {
    expect(clampPenaltyGold(null, 10)).toBeNull();
  });
});
