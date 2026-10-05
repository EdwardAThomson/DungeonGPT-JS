import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import GameMainPanel from './GameMainPanel';
import { visitEnterMessage, visitLeaveMessage } from '../game/logGroups';

const props = (conversation) => ({
  conversation, hasAdventureStarted: true, isLoading: false, worldPosition: { x: 0, y: 0 },
  currentBiome: 'plains', userInput: '', onInputChange: () => {}, onSubmit: () => {}, aiAvailable: true,
});
const view = (conversation) => <MemoryRouter><GameMainPanel {...props(conversation)} /></MemoryRouter>;

describe('Adventure Log location groups', () => {
  it('folds a visit away on leaving, even after the player opened it by hand', () => {
    const enter = visitEnterMessage('You venture into Mossy Cave.', 'Mossy Cave');
    const inside = [enter, { role: 'system', content: 'A rat squeaks.' }];
    const { rerender } = render(view(inside));
    const head = screen.getByRole('button', { name: /Mossy Cave/ });
    expect(head.getAttribute('aria-expanded')).toBe('true'); // current visit starts open
    fireEvent.click(head); // close
    fireEvent.click(head); // and explicitly open again
    expect(head.getAttribute('aria-expanded')).toBe('true');

    rerender(view([...inside, visitLeaveMessage('You leave Mossy Cave.')]));
    expect(screen.getByRole('button', { name: /Mossy Cave/ }).getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('A rat squeaks.')).toBeNull();

    // A past visit can still be reopened by hand.
    fireEvent.click(screen.getByRole('button', { name: /Mossy Cave/ }));
    expect(screen.getByText('A rat squeaks.')).toBeTruthy();
  });
});
