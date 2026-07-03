import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import ContinueLegendPicker from './ContinueLegendPicker';

const completedSettings = {
  templateId: 'heroic-fantasy-t1',
  templateName: 'Heroic Fantasy — The Goblin Threat',
  campaignGoal: 'End the goblin threat',
  campaignComplete: true,
};

const party = [{ heroId: 'h1', heroName: 'Vanya', level: 3 }];

describe('ContinueLegendPicker', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <ContinueLegendPicker isOpen={false} onClose={() => {}} settings={completedSettings} party={party} onPick={() => {}} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('lists the same-genre next tier first as the recommended chapter', () => {
    render(
      <ContinueLegendPicker isOpen onClose={() => {}} settings={completedSettings} party={party} onPick={() => {}} />
    );
    const cards = screen.getAllByTestId(/legend-option-/);
    expect(cards[0]).toHaveAttribute('data-testid', 'legend-option-heroic-fantasy-t2');
    expect(screen.getByText('RECOMMENDED NEXT')).toBeInTheDocument();
  });

  it('locks premium templates for free users and never launches them', () => {
    const onPick = jest.fn();
    render(
      <ContinueLegendPicker isOpen onClose={() => {}} settings={completedSettings} party={party} onPick={onPick} />
    );
    expect(screen.getAllByText('🔒 PREMIUM').length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByText('🔒 Unlock with Premium')[0]);
    expect(onPick).not.toHaveBeenCalled();
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
        onPick={onPick}
      />
    );
    expect(screen.getAllByText(/your party is Lv 1/).length).toBeGreaterThan(0);
    // the recommended t2 card still offers the launch button
    const t2Card = screen.getByTestId('legend-option-heroic-fantasy-t2');
    fireEvent.click(t2Card.querySelector('button'));
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0][0].id).toBe('heroic-fantasy-t2');
  });

  it('numbers the next chapter from the chain settings', () => {
    render(
      <ContinueLegendPicker
        isOpen
        onClose={() => {}}
        settings={{ ...completedSettings, chain: { parentSaveId: 'p', chapter: 2 } }}
        party={party}
        onPick={() => {}}
      />
    );
    expect(screen.getAllByText('Begin Chapter 3').length).toBeGreaterThan(0);
  });

  it('shows the celebration header when opened at the campaign-complete moment', () => {
    render(
      <ContinueLegendPicker isOpen celebrate onClose={() => {}} settings={completedSettings} party={party} onPick={() => {}} />
    );
    expect(screen.getByText(/Campaign Complete!/)).toBeInTheDocument();
    expect(screen.getByText('Keep exploring')).toBeInTheDocument();
  });
});
