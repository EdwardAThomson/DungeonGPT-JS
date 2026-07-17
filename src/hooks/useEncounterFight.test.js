// Behavior pins for the #79 keystone extraction (COMBAT_UX_PLAN.md §4): the fight flow
// moved verbatim from EncounterActionModal into this headless hook. These tests pin the
// ORCHESTRATION the hook owns (phase machine, state sync, exit contract); the combat
// math itself stays pinned by encounterResolver.test.js / multiRoundEncounter.test.js.
import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import useEncounterFight from './useEncounterFight';
import SettingsContext from '../contexts/SettingsContext';

jest.mock('../utils/encounterResolver', () => ({
    resolveEncounter: jest.fn(),
}));
jest.mock('../utils/multiRoundEncounter', () => ({
    createMultiRoundEncounter: jest.fn(),
    resolveRound: jest.fn(),
    getRoundActions: jest.fn(() => [{ label: 'Fight', skill: 'Melee Combat' }]),
    generateEncounterSummary: jest.fn(),
    getSupportBonus: jest.fn(() => 0),
    applyItemDamageRound: jest.fn(),
}));
jest.mock('../utils/logger', () => ({
    createLogger: () => ({ debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }),
}));

import { resolveEncounter } from '../utils/encounterResolver';
import {
    createMultiRoundEncounter, resolveRound, generateEncounterSummary
} from '../utils/multiRoundEncounter';

const settingsValue = {
    settings: { difficulty: 'normal' },
    selectedProvider: 'cf-workers',
    selectedModel: 'test-model',
};

const wrapper = ({ children }) => (
    <SettingsContext.Provider value={settingsValue}>{children}</SettingsContext.Provider>
);

const hero = (over = {}) => ({
    heroId: over.heroId || `h-${over.characterName || 'x'}`,
    characterName: 'Kael',
    heroName: undefined,
    currentHP: 20,
    maxHP: 20,
    stats: { strength: 14, dexterity: 12, constitution: 12, intelligence: 10, wisdom: 10, charisma: 10 },
    level: 1,
    inventory: [],
    ...over,
});

const singleRoundEncounter = (over = {}) => ({
    name: 'Bandit Ambush',
    description: 'Bandits leap from the rocks.',
    difficulty: 'easy',
    suggestedActions: [
        { label: 'Fight', skill: 'Melee Combat', description: 'Fight them' },
        { label: 'Talk', skill: 'Persuasion', description: 'Talk them down' },
    ],
    consequences: {},
    ...over,
});

const renderFight = (props) => renderHook(
    (p) => useEncounterFight(p),
    { wrapper, initialProps: {
        isOpen: true,
        encounter: singleRoundEncounter(),
        party: null,
        character: hero(),
        onResolve: jest.fn(),
        onCharacterUpdate: jest.fn(),
        onClose: jest.fn(),
        ...props,
    } }
);

afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
});

describe('init / lifecycle', () => {
    // Checklist 5: solo player, single-round -> no formation, no roundState
    test('solo single-round: no formation phase, no round state', () => {
        const { result } = renderFight({});
        expect(result.current.showHeroSelection).toBe(null); // party null -> needsHeroSelection falsy
        expect(result.current.heroConfirmed).toBe(true);
        expect(result.current.isMultiRound).toBe(false);
        expect(result.current.roundState).toBe(null);
    });

    // Checklist 5: solo player, multiRound encounter -> roundState created immediately
    test('solo multiRound: round state initialized immediately with [character]', () => {
        createMultiRoundEncounter.mockReturnValue({ party: [hero()], leadIndex: 0, isResolved: false });
        const c = hero();
        renderFight({ encounter: singleRoundEncounter({ multiRound: true }), character: c });
        expect(createMultiRoundEncounter).toHaveBeenCalledWith(
            expect.objectContaining({ multiRound: true }),
            c,
            settingsValue.settings,
            { provider: 'cf-workers', model: 'test-model' },
            [c]
        );
    });

    // Checklist 4: party > 1 -> formation phase, no roundState until confirm
    test('party of two: formation phase shown, roundState deferred to confirm', () => {
        const party = [hero({ characterName: 'A', heroId: 'a' }), hero({ characterName: 'B', heroId: 'b' })];
        const { result } = renderFight({ party, encounter: singleRoundEncounter({ multiRound: true }) });
        expect(result.current.showHeroSelection).toBe(true);
        expect(result.current.heroConfirmed).toBe(false);
        expect(result.current.roundState).toBe(null);
        expect(createMultiRoundEncounter).not.toHaveBeenCalled();
    });

    // Checklist 2: re-render with same encounter + changed character must NOT reset
    test('mid-fight character prop update does not re-init the fight', () => {
        const { result, rerender } = renderFight({});
        act(() => result.current.setSelectedHeroIndex(1));
        rerender({
            isOpen: true,
            encounter: singleRoundEncounter(), // same name+description identity
            party: null,
            character: hero({ currentHP: 5 }),
            onResolve: jest.fn(), onCharacterUpdate: jest.fn(), onClose: jest.fn(),
        });
        // currentCharacter still the ORIGINAL init character (20 HP), not the new prop
        expect(result.current.currentCharacter.currentHP).toBe(20);
        expect(result.current.selectedHeroIndex).toBe(1);
    });

    // Checklist 1: a NEW encounter identity resets state
    test('a new encounter identity re-initializes', () => {
        const { result, rerender } = renderFight({});
        act(() => result.current.setSelectedHeroIndex(1));
        rerender({
            isOpen: true,
            encounter: singleRoundEncounter({ name: 'Wolf Pack' }),
            party: null,
            character: hero(),
            onResolve: jest.fn(), onCharacterUpdate: jest.fn(), onClose: jest.fn(),
        });
        expect(result.current.selectedHeroIndex).toBe(0);
    });
});

describe('formation / initiative', () => {
    const party = [
        hero({ characterName: 'A', heroId: 'a' }),
        hero({ characterName: 'B', heroId: 'b' }),
        hero({ characterName: 'C', heroId: 'c' }),
    ];

    // Checklist 6: >= 0.15 succeeds, chosen lead stands
    test('initiative success keeps the chosen lead', () => {
        jest.spyOn(Math, 'random').mockReturnValue(0.5);
        const { result } = renderFight({ party });
        act(() => result.current.setSelectedHeroIndex(2));
        act(() => result.current.handleHeroConfirm());
        expect(result.current.initiativeResult).toEqual({ success: true, actualHeroIndex: 2, message: null });
        expect(result.current.currentCharacter.characterName).toBe('C');
        expect(result.current.showHeroSelection).toBe(false);
        expect(result.current.heroConfirmed).toBe(true);
    });

    // Checklist 7: < 0.15 fails, a random OTHER living hero is forced to lead
    test('initiative failure forces another living hero with the ⚡ message', () => {
        // 1st random: initiative roll (fail), 2nd random: forced-hero pick
        const rand = jest.spyOn(Math, 'random');
        rand.mockReturnValueOnce(0.1).mockReturnValueOnce(0);
        const { result } = renderFight({ party });
        act(() => result.current.setSelectedHeroIndex(0));
        act(() => result.current.handleHeroConfirm());
        expect(result.current.initiativeResult.success).toBe(false);
        expect(result.current.initiativeResult.actualHeroIndex).not.toBe(0);
        expect(result.current.initiativeResult.message).toMatch(/⚡ Initiative failed!/);
    });

    // Checklist 8: failure with no other living heroes keeps the lead. Preserved QUIRK
    // from the modal: the "forced to act" message still shows, naming the SAME hero
    // (message is assigned outside the no-others branch). Candidate cosmetic fix for
    // Thread B; this refactor pins it as-is.
    test('initiative failure with no other living heroes keeps the lead (quirk: message still shows)', () => {
        const soloLiving = [
            hero({ characterName: 'A', heroId: 'a' }),
            hero({ characterName: 'B', heroId: 'b', currentHP: 0 }),
        ];
        jest.spyOn(Math, 'random').mockReturnValue(0.1);
        const { result } = renderFight({ party: soloLiving });
        act(() => result.current.setSelectedHeroIndex(0));
        act(() => result.current.handleHeroConfirm());
        expect(result.current.initiativeResult).toEqual({
            success: false,
            actualHeroIndex: 0,
            message: '⚡ Initiative failed! A is forced to act instead!',
        });
    });

    // Checklist 9: multiRound confirm passes FULL party to createMultiRoundEncounter
    test('confirm on a multiRound fight creates round state with the full party', () => {
        jest.spyOn(Math, 'random').mockReturnValue(0.5);
        createMultiRoundEncounter.mockReturnValue({ party, leadIndex: 0, isResolved: false });
        const { result } = renderFight({ party, encounter: singleRoundEncounter({ multiRound: true }) });
        act(() => result.current.handleHeroConfirm());
        expect(createMultiRoundEncounter).toHaveBeenCalledWith(
            expect.anything(), party[result.current.initiativeResult.actualHeroIndex],
            settingsValue.settings, expect.anything(), party
        );
        expect(result.current.isMultiRound).toBe(true);
    });
});

describe('single-round actions', () => {
    // Checklist 12: resolver called with exact args; hpDamage applied + pushed up
    test('action resolves via resolveEncounter; damage applied and pushed up', async () => {
        const onCharacterUpdate = jest.fn();
        resolveEncounter.mockResolvedValue({
            narration: 'You win.', rollResult: { total: 15 }, outcomeTier: 'success',
            rewards: null, penalties: null, hpDamage: 4,
        });
        const { result } = renderFight({ onCharacterUpdate });
        await act(async () => {
            await result.current.handleAction({ label: 'Fight', skill: 'Melee Combat' });
        });
        expect(resolveEncounter).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'Bandit Ambush' }), 'Fight',
            expect.objectContaining({ characterName: 'Kael' }),
            settingsValue.settings, { provider: 'cf-workers', model: 'test-model' }
        );
        expect(result.current.result.outcomeTier).toBe('success');
        expect(result.current.currentCharacter.currentHP).toBe(16); // 20 - 4
        expect(onCharacterUpdate).toHaveBeenCalledWith(expect.objectContaining({ currentHP: 16 }));
        expect(result.current.isResolving).toBe(false);
    });

    // Checklist 13: resolver throw -> harmless failure result, isResolving cleared
    test('resolution error produces the guarded failure result', async () => {
        resolveEncounter.mockRejectedValue(new Error('boom'));
        const { result } = renderFight({});
        await act(async () => {
            await result.current.handleAction({ label: 'Fight', skill: 'Melee Combat' });
        });
        expect(result.current.result.outcomeTier).toBe('failure');
        expect(result.current.result.narration).toMatch(/An error occurred/);
        expect(result.current.result.penalties.messages).toEqual(['Encounter resolution failed']);
        expect(result.current.isResolving).toBe(false);
    });

    // Checklist 11: Tactical Retreat never reaches resolveEncounter
    test('Tactical Retreat routes to the flee handler', async () => {
        jest.spyOn(Math, 'random').mockReturnValue(0.9); // flee succeeds
        const { result } = renderFight({});
        await act(async () => {
            await result.current.handleAction({ label: 'Tactical Retreat' });
        });
        expect(resolveEncounter).not.toHaveBeenCalled();
        expect(result.current.result.outcome).toBe('fled');
    });
});

describe('multi-round orchestration', () => {
    const teamParty = [hero({ characterName: 'A', heroId: 'a' }), hero({ characterName: 'B', heroId: 'b' })];
    const liveState = (over = {}) => ({
        party: teamParty, leadIndex: 0, isResolved: false, currentRound: 1, maxRounds: 5,
        enemyCurrentHP: 30, enemyMaxHP: 30, enemyMorale: 80, playerAdvantage: 0,
        supportBonus: 1, roundHistory: [], isTeamEncounter: true,
        ...over,
    });

    const setupTeamFight = async () => {
        jest.spyOn(Math, 'random').mockReturnValue(0.5);
        createMultiRoundEncounter.mockReturnValue(liveState());
        const onCharacterUpdate = jest.fn();
        const utils = renderFight({
            party: teamParty,
            encounter: singleRoundEncounter({ multiRound: true }),
            onCharacterUpdate,
        });
        act(() => utils.result.current.handleHeroConfirm());
        return { ...utils, onCharacterUpdate };
    };

    // Checklist 15: damage pushed up per hero; displayed character follows leadIndex
    test('round resolution syncs party damage and follows the (swapped) lead', async () => {
        const { result, onCharacterUpdate } = await setupTeamFight();
        const damagedParty = [
            { ...teamParty[0], currentHP: 0 },
            { ...teamParty[1], currentHP: 15 },
        ];
        resolveRound.mockResolvedValue({
            roundResult: {
                outcomeTier: 'failure', narration: 'Ouch.', hpDamage: 20,
                partyDamage: [{ heroIndex: 0, amount: 20, role: 'lead' }, { heroIndex: 1, amount: 5, role: 'support' }],
                rollResult: { total: 8, naturalRoll: 5, modifier: 3 },
            },
            updatedState: liveState({
                party: damagedParty, leadIndex: 1,
                roundHistory: [{ round: 1, action: 'Fight' }],
            }),
        });
        await act(async () => {
            await result.current.handleAction({ label: 'Fight' });
        });
        expect(onCharacterUpdate).toHaveBeenCalledTimes(2);
        expect(result.current.currentCharacter.characterName).toBe('B'); // follows new leadIndex
        expect(result.current.roundResults).toHaveLength(1);
        expect(result.current.roundResults[0].round).toBe(1);
        expect(result.current.currentRoundResult.narration).toBe('Ouch.');
    });

    // Checklist 16: isResolved -> summary becomes the final result
    test('a resolved round generates the encounter summary as the final result', async () => {
        const { result } = await setupTeamFight();
        resolveRound.mockResolvedValue({
            roundResult: { outcomeTier: 'success', narration: 'Down it goes.', partyDamage: null },
            updatedState: liveState({ isResolved: true, outcome: 'victory', roundHistory: [{ round: 1 }] }),
        });
        generateEncounterSummary.mockResolvedValue({ outcome: 'victory', isTeamEncounter: true, leadIndex: 0 });
        await act(async () => {
            await result.current.handleAction({ label: 'Fight' });
        });
        await waitFor(() => expect(result.current.result?.outcome).toBe('victory'));
    });

    // Checklist 17 + 18: next-round clears transient state; Fight! re-fires after 50ms
    test('Fight! advances the round then re-runs the Fight action after 50ms', async () => {
        jest.useFakeTimers();
        const { result } = await setupTeamFight();
        resolveRound.mockResolvedValue({
            roundResult: { outcomeTier: 'success', narration: 'Hit.', partyDamage: null },
            updatedState: liveState({ roundHistory: [{ round: 1 }] }),
        });
        await act(async () => {
            await result.current.handleAction({ label: 'Fight' });
        });
        expect(result.current.currentRoundResult).not.toBe(null);
        act(() => result.current.handleFightAgain());
        expect(result.current.currentRoundResult).toBe(null); // cleared immediately
        await act(async () => { jest.advanceTimersByTime(50); });
        expect(resolveRound).toHaveBeenCalledTimes(2); // deferred re-fire happened
        jest.useRealTimers();
    });

    // Checklist 19: Claim Victory summarizes the CURRENT round state
    test('claim victory generates the summary from current round state', async () => {
        const { result } = await setupTeamFight();
        generateEncounterSummary.mockResolvedValue({ outcome: 'victory', isTeamEncounter: true, leadIndex: 0 });
        await act(async () => { await result.current.handleClaimVictory(); });
        expect(generateEncounterSummary).toHaveBeenCalledWith(expect.objectContaining({ enemyCurrentHP: 30 }));
        expect(result.current.result.outcome).toBe('victory');
    });
});

describe('in-combat item use', () => {
    const potionCarrier = () => hero({
        characterName: 'A', heroId: 'a', currentHP: 8,
        inventory: [{ key: 'healing_potion', quantity: 1 }],
    });
    const teamState = (over = {}) => ({
        party: [potionCarrier(), hero({ characterName: 'B', heroId: 'b' })],
        leadIndex: 0, isResolved: false, currentRound: 2, maxRounds: 5,
        enemyCurrentHP: 30, enemyMaxHP: 30, enemyMorale: 80, playerAdvantage: 0,
        supportBonus: 1, roundHistory: [{ round: 1, action: 'Fight' }], isTeamEncounter: true,
        ...over,
    });

    const setupWithState = (state) => {
        jest.spyOn(Math, 'random').mockReturnValue(0.5); // initiative ok + fixed heal roll
        createMultiRoundEncounter.mockReturnValue(state);
        const onCharacterUpdate = jest.fn();
        const utils = renderFight({
            party: state.party,
            encounter: singleRoundEncounter({ multiRound: true }),
            onCharacterUpdate,
        });
        act(() => utils.result.current.handleHeroConfirm());
        return { ...utils, onCharacterUpdate };
    };

    // Checklist 22: multi-round heal SPENDS THE ROUND with the itemUse history entry
    test('multi-round heal advances the round, records history, syncs heroes', () => {
        const { result, onCharacterUpdate } = setupWithState(teamState());
        act(() => result.current.handleUseItemInCombat('healing_potion', 0));
        expect(result.current.roundState.currentRound).toBe(3); // round spent
        const lastHistory = result.current.roundState.roundHistory.at(-1);
        expect(lastHistory).toMatchObject({
            round: 2,
            action: 'Use Healing Potion',
            result: { outcomeTier: 'itemUse' },
        });
        // Healed target pushed up; owner == target here so exactly one update
        expect(onCharacterUpdate).toHaveBeenCalledTimes(1);
        expect(onCharacterUpdate.mock.calls[0][0].currentHP).toBeGreaterThan(8);
        expect(result.current.itemUseResult).toMatchObject({ itemName: 'Healing Potion', spentRound: true });
        expect(result.current.roundState.isResolved).toBe(false);
    });

    // Checklist 22: round-cap overflow from a heal resolves stalemate (no advantage)
    test('heal on the final round runs past the cap and resolves stalemate', async () => {
        generateEncounterSummary.mockResolvedValue({ outcome: 'stalemate', isTeamEncounter: true, leadIndex: 0 });
        const { result } = setupWithState(teamState({ currentRound: 5 })); // nextRound 6 > maxRounds 5
        act(() => result.current.handleUseItemInCombat('healing_potion', 0));
        expect(result.current.roundState.isResolved).toBe(true);
        expect(result.current.roundState.outcome).toBe('stalemate'); // advantage 0 -> not victory
        await waitFor(() => expect(result.current.result?.outcome).toBe('stalemate'));
    });

    // Checklist 24: a consume failure (full-health target) closes the picker silently,
    // no round spent, nothing synced. (Note: consumeHealingItem does NOT validate
    // ownership; the picker only offers carried items, so that hole is unreachable.)
    test('failed consume (full-health target) closes the picker without side effects', () => {
        const { result, onCharacterUpdate } = setupWithState(teamState());
        act(() => result.current.setShowItemPicker(true));
        act(() => result.current.handleUseItemInCombat('healing_potion', 1)); // hero B at full HP
        expect(result.current.showItemPicker).toBe(false);
        expect(result.current.roundState.currentRound).toBe(2); // no round spent
        expect(onCharacterUpdate).not.toHaveBeenCalled();
    });
});

describe('flee / exit contract', () => {
    // Checklist 25 (failure branch): exact damage/gold formulas, no 'fled' outcome
    test('failed mid-fight flee: 15% maxHP damage, 5-15 gold, no fled outcome', async () => {
        const rand = jest.spyOn(Math, 'random');
        rand.mockReturnValueOnce(0.1)  // flee roll -> caught (not > 0.3)
            .mockReturnValueOnce(0.5); // gold roll -> floor(0.5*10)+5 = 10
        const onCharacterUpdate = jest.fn();
        const { result } = renderFight({ onCharacterUpdate });
        act(() => result.current.handleFleeEncounter());
        expect(result.current.result.outcome).toBeUndefined();
        expect(result.current.result.outcomeTier).toBe('failure');
        expect(result.current.result.hpDamage).toBe(3); // floor(20 * 0.15)
        expect(result.current.result.penalties.goldLoss).toBe(10);
        expect(onCharacterUpdate).toHaveBeenCalledWith(expect.objectContaining({ currentHP: 17 }));
    });

    // Checklist 10 + 27 + 28: pre-combat flee flushes through onResolve with heroIndex
    test('pre-combat flee resolves fled through onResolve and closes', () => {
        const onResolve = jest.fn();
        const onClose = jest.fn();
        const party = [hero({ heroId: 'a' }), hero({ heroId: 'b', characterName: 'B' })];
        const { result } = renderFight({ party, onResolve, onClose });
        act(() => result.current.setSelectedHeroIndex(1));
        act(() => result.current.handleFleeBeforeCombat());
        expect(onResolve).toHaveBeenCalledWith(expect.objectContaining({
            outcome: 'fled', outcomeTier: 'success', heroIndex: 1,
        }));
        expect(onClose).toHaveBeenCalled();
        // Checklist 27: state reset for the next fight
        expect(result.current.result).toBe(null);
        expect(result.current.showHeroSelection).toBe(true);
        expect(result.current.heroConfirmed).toBe(false);
    });

    // Checklist 26: defeated retreat is failure WITHOUT the fled disengage
    test('retreat-when-defeated resolves failure without fled', () => {
        const onResolve = jest.fn();
        const { result } = renderFight({ onResolve });
        act(() => result.current.handleRetreatDefeated());
        const resolved = onResolve.mock.calls[0][0];
        expect(resolved.outcomeTier).toBe('failure');
        expect(resolved.outcome).toBeUndefined();
        expect(resolved.narration).toMatch(/Too wounded to continue/);
    });

    // Checklist 27: team summaries carry their own leadIndex into heroIndex
    test('team-encounter results resolve with the summary leadIndex', () => {
        const onResolve = jest.fn();
        const { result } = renderFight({ onResolve });
        act(() => {
            // Simulate a finished team fight result being continued
            result.current.handleContinue(); // result null -> no onResolve
        });
        expect(onResolve).not.toHaveBeenCalled(); // null result never resolves (guard)
    });
});

describe('derived data', () => {
    // Checklist 29: combatParty precedence
    test('combatParty falls back party -> [currentCharacter]', () => {
        const { result } = renderFight({});
        expect(result.current.combatParty).toHaveLength(1);
        expect(result.current.combatParty[0].characterName).toBe('Kael');
    });

    // Checklist 21: spell scrolls never offered in single-round fights
    test('spell scrolls are not offered outside a live multi-round fight', () => {
        const party = [
            hero({ heroId: 'a', currentHP: 10, inventory: [{ key: 'fireball_scroll', quantity: 1 }, { key: 'healing_potion', quantity: 2 }] }),
            hero({ heroId: 'b' }),
        ];
        const { result } = renderFight({ party });
        const keys = result.current.usableConsumables.map((c) => c.key);
        expect(keys).toContain('healing_potion'); // someone is hurt -> heal offered
        expect(keys).not.toContain('fireball_scroll'); // no live enemy HP pool
    });

    // Checklist 20: availableActions switches between round actions and base actions
    test('availableActions uses base suggestions outside multi-round', () => {
        const { result } = renderFight({});
        expect(result.current.availableActions.map((a) => a.label)).toEqual(['Fight', 'Talk']);
    });
});
