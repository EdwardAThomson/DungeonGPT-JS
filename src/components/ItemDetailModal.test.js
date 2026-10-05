import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ModalProvider, useModal } from '../contexts/ModalContext';
import ItemDetailModal from './ItemDetailModal';

// jsdom has no layout, so focus-trap finds no tabbable node; render the trap transparently.
jest.mock('focus-trap-react', () => ({ __esModule: true, default: ({ children }) => children }));

const remedy = { key: 'herbal_remedy', name: 'Herbal Remedy', rarity: 'common', effect: 'heal', amount: '1d6', type: 'consumable', value: 5 };

// Opens the item modal the way the Adventure Book does (it is a child of adventureBook).
const Opener = ({ data }) => {
  const book = useModal('adventureBook');
  const detail = useModal('itemDetail');
  return (
    <>
      <button onClick={() => book.open()}>book</button>
      <button onClick={() => detail.open(data)}>detail</button>
    </>
  );
};

const openWith = (data) => {
  render(<ModalProvider><Opener data={data} /><ItemDetailModal /></ModalProvider>);
  fireEvent.click(screen.getByText('book'));
  fireEvent.click(screen.getByText('detail'));
};

describe('ItemDetailModal Use action', () => {
  it('shows Use when the caller passes onUse, and hands off after closing', () => {
    const onUse = jest.fn();
    openWith({ item: remedy, onUse });
    fireEvent.click(screen.getByRole('button', { name: 'Use' }));
    expect(onUse).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Herbal Remedy')).toBeNull();
  });

  it('has no Use button without onUse', () => {
    openWith({ item: remedy });
    expect(screen.getByText('Herbal Remedy')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Use' })).toBeNull();
  });
});
