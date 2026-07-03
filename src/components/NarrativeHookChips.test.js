import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import NarrativeHookChips from './NarrativeHookChips';
import GameMainPanel from './GameMainPanel';

const hiddenCache = {
  name: 'Hidden Cache',
  image: '/assets/encounters/hidden_cache.webp',
  suggestedActions: [
    { label: 'Investigate', skill: 'Investigation', description: 'Take a closer look' },
    { label: 'Dig It Out', skill: 'Athletics', description: 'Retrieve whatever is buried' },
    { label: 'Leave It', skill: null, description: 'Walk away' }
  ]
};

describe('NarrativeHookChips (#35/#37)', () => {
  it('renders a chip per suggested action plus an Ignore chip', () => {
    render(<NarrativeHookChips encounter={hiddenCache} onAction={() => {}} onIgnore={() => {}} />);
    expect(screen.getByRole('button', { name: 'Investigate' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dig It Out' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Leave It' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ignore' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /Hidden Cache/ })).toBeInTheDocument();
  });

  it('shows the encounter image when present (#37) and omits it when absent', () => {
    const { rerender } = render(
      <NarrativeHookChips encounter={hiddenCache} onAction={() => {}} onIgnore={() => {}} />
    );
    const img = screen.getByAltText('Hidden Cache');
    expect(img).toHaveAttribute('src', '/assets/encounters/hidden_cache.webp');

    const { image, ...noImage } = hiddenCache;
    rerender(<NarrativeHookChips encounter={noImage} onAction={() => {}} onIgnore={() => {}} />);
    expect(screen.queryByAltText('Hidden Cache')).not.toBeInTheDocument();
  });

  it('fires onAction with the tapped action, and onIgnore for the Ignore chip', () => {
    const onAction = jest.fn();
    const onIgnore = jest.fn();
    render(<NarrativeHookChips encounter={hiddenCache} onAction={onAction} onIgnore={onIgnore} />);

    fireEvent.click(screen.getByRole('button', { name: 'Dig It Out' }));
    expect(onAction).toHaveBeenCalledWith(hiddenCache.suggestedActions[1]);

    fireEvent.click(screen.getByRole('button', { name: 'Ignore' }));
    expect(onIgnore).toHaveBeenCalledTimes(1);
  });

  it('renders nothing without an encounter, and tolerates missing suggestedActions', () => {
    const { container } = render(<NarrativeHookChips encounter={null} onAction={() => {}} onIgnore={() => {}} />);
    expect(container).toBeEmptyDOMElement();

    render(<NarrativeHookChips encounter={{ name: 'Bare' }} onAction={() => {}} onIgnore={() => {}} />);
    expect(screen.getByRole('button', { name: 'Ignore' })).toBeInTheDocument();
  });
});

describe('GameMainPanel narrative-hook chips wiring (#35)', () => {
  // Chips are keyed by MESSAGE OBJECT IDENTITY from transient state; nothing is
  // stored on the saved message, so a reloaded conversation (new objects, same
  // content) must render chip-free.
  const hookMessage = { role: 'ai', content: 'A metallic glint catches your eye.' };
  const olderMessage = { role: 'ai', content: 'You cross the windswept hills.' };

  const renderPanel = (props = {}) => render(
    <MemoryRouter>
      <GameMainPanel
        worldPosition={{ x: 3, y: 4 }}
        currentBiome="hills"
        conversation={[olderMessage, hookMessage]}
        hasAdventureStarted
        isLoading={false}
        userInput=""
        onInputChange={() => {}}
        onSubmit={(e) => e.preventDefault()}
        {...props}
      />
    </MemoryRouter>
  );

  it('renders chips only under the message carrying the hook', () => {
    renderPanel({ hookChips: { message: hookMessage, encounter: hiddenCache, hookMoves: 0 } });

    expect(screen.getByRole('button', { name: 'Investigate' })).toBeInTheDocument();
    // The chips block lives inside the hook message's bubble, not the older one.
    const chipGroup = screen.getByRole('group', { name: /Hidden Cache/ });
    expect(chipGroup.closest('.message')).toHaveTextContent('A metallic glint catches your eye.');
    expect(screen.getAllByRole('group', { name: /Hidden Cache/ })).toHaveLength(1);
  });

  it('renders no chips when hookChips is absent (default prop)', () => {
    renderPanel();
    expect(screen.queryByRole('button', { name: 'Investigate' })).not.toBeInTheDocument();
  });

  it('renders no chips for a reloaded conversation whose message content matches but identity differs', () => {
    // Simulates load-from-save: same text, different object; chips must NOT attach.
    const reloadedTwin = { ...hookMessage };
    renderPanel({ hookChips: { message: reloadedTwin, encounter: hiddenCache, hookMoves: 0 } });
    expect(screen.queryByRole('button', { name: 'Investigate' })).not.toBeInTheDocument();
  });
});
