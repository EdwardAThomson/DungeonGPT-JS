import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, within } from '@testing-library/react';
import ContinueLegendPicker from './ContinueLegendPicker';
import { launchCampaign, specFromTemplate } from '../game/campaignLauncher';
import { storyTemplates } from '../data/storyTemplates';

const completedSettings = {
  templateId: 'heroic-fantasy-t1',
  templateName: 'Heroic Fantasy — The Goblin Threat',
  campaignGoal: 'End the goblin threat',
  campaignComplete: true,
};

const party = [{ heroId: 'h1', heroName: 'Vanya', level: 3 }];

// A real t1 world so geography compatibility is exercised end to end.
const t1World = launchCampaign(
  specFromTemplate(storyTemplates.find((t) => t.id === 'heroic-fantasy-t1')),
  { seed: 424242 }
).mapData;

describe('ContinueLegendPicker', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <ContinueLegendPicker isOpen={false} onClose={() => {}} settings={completedSettings} party={party} worldMap={t1World} onPick={() => {}} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('splits options: same-world sequels under "Continue here", others need a new adventure', () => {
    render(
      <ContinueLegendPicker isOpen onClose={() => {}} settings={completedSettings} party={party} worldMap={t1World} onPick={() => {}} />
    );
    expect(screen.getByText(/Continue here/)).toBeInTheDocument();
    expect(screen.getByText(/Requires a new adventure/)).toBeInTheDocument();
    // the re-authored t2 continues in this world
    const t2Card = screen.getByTestId('legend-option-heroic-fantasy-t2');
    expect(within(t2Card).getByText(/Begin Chapter 2/)).toBeInTheDocument();
    // grimdark is set in different lands: hands off to New Game
    const grimCard = screen.getByTestId('legend-option-grimdark-survival-t1');
    expect(within(grimCard).getByText('Start as a New Game')).toBeInTheDocument();
  });

  it('recommends the same-genre next tier first', () => {
    render(
      <ContinueLegendPicker isOpen onClose={() => {}} settings={completedSettings} party={party} worldMap={t1World} onPick={() => {}} />
    );
    const cards = screen.getAllByTestId(/legend-option-/);
    expect(cards[0]).toHaveAttribute('data-testid', 'legend-option-heroic-fantasy-t2');
    expect(screen.getByText('RECOMMENDED NEXT')).toBeInTheDocument();
  });

  it('picking a compatible campaign continues in-save (onPick), never navigates', () => {
    const onPick = jest.fn();
    const onNewAdventure = jest.fn();
    render(
      <ContinueLegendPicker isOpen onClose={() => {}} settings={completedSettings} party={party} worldMap={t1World} onPick={onPick} onNewAdventure={onNewAdventure} />
    );
    const t2Card = screen.getByTestId('legend-option-heroic-fantasy-t2');
    fireEvent.click(within(t2Card).getByText(/Begin Chapter 2/));
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0][0].id).toBe('heroic-fantasy-t2');
    expect(onNewAdventure).not.toHaveBeenCalled();
  });

  it('picking an incompatible campaign hands off to New Game (onNewAdventure)', () => {
    const onPick = jest.fn();
    const onNewAdventure = jest.fn();
    render(
      <ContinueLegendPicker isOpen onClose={() => {}} settings={completedSettings} party={party} worldMap={t1World} onPick={onPick} onNewAdventure={onNewAdventure} />
    );
    const grimCard = screen.getByTestId('legend-option-grimdark-survival-t1');
    fireEvent.click(within(grimCard).getByText('Start as a New Game'));
    expect(onNewAdventure).toHaveBeenCalledTimes(1);
    expect(onNewAdventure.mock.calls[0][0].id).toBe('grimdark-survival-t1');
    expect(onPick).not.toHaveBeenCalled();
  });

  it('locks premium templates for free users and never launches them', () => {
    const onPick = jest.fn();
    const onNewAdventure = jest.fn();
    render(
      <ContinueLegendPicker isOpen onClose={() => {}} settings={completedSettings} party={party} worldMap={t1World} onPick={onPick} onNewAdventure={onNewAdventure} />
    );
    expect(screen.getAllByText('🔒 PREMIUM').length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByText('🔒 Unlock with Premium')[0]);
    expect(onPick).not.toHaveBeenCalled();
    expect(onNewAdventure).not.toHaveBeenCalled();
    expect(screen.getByText(/Premium unlock is coming soon/)).toBeInTheDocument();
  });

  it('warns on under-levelled picks but still allows them', () => {
    const onPick = jest.fn();
    render(
      <ContinueLegendPicker
        isOpen
        onClose={() => {}}
        settings={completedSettings}
        party={[{ heroId: 'h1', level: 1 }]}
        worldMap={t1World}
        onPick={onPick}
      />
    );
    expect(screen.getAllByText(/your party is Lv 1/).length).toBeGreaterThan(0);
    const t2Card = screen.getByTestId('legend-option-heroic-fantasy-t2');
    fireEvent.click(within(t2Card).getByText(/Begin Chapter 2/));
    expect(onPick).toHaveBeenCalledTimes(1);
  });

  it('numbers the next chapter from currentChapter (in-save chain record)', () => {
    render(
      <ContinueLegendPicker
        isOpen
        onClose={() => {}}
        settings={{ ...completedSettings, currentChapter: 2 }}
        party={party}
        worldMap={t1World}
        onPick={() => {}}
      />
    );
    const t2Card = screen.getByTestId('legend-option-heroic-fantasy-t2');
    expect(within(t2Card).getByText('Begin Chapter 3')).toBeInTheDocument();
    expect(screen.queryByText('Begin Chapter 2')).not.toBeInTheDocument();
  });

  it('shows the celebration header when opened at the campaign-complete moment', () => {
    render(
      <ContinueLegendPicker isOpen celebrate onClose={() => {}} settings={completedSettings} party={party} worldMap={t1World} onPick={() => {}} />
    );
    expect(screen.getByText(/Campaign Complete!/)).toBeInTheDocument();
    expect(screen.getByText('Keep exploring')).toBeInTheDocument();
  });
});
