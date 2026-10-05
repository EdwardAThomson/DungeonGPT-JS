import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ModalProvider } from '../contexts/ModalContext';
import PartyInventoryContent from './PartyInventoryModal';

jest.mock('focus-trap-react', () => ({ __esModule: true, default: ({ children }) => children }));

const hero = (over = {}) => ({ heroId: 'h1', heroName: 'Marius', heroClass: 'Fighter', level: 3, xp: 900, gold: 0, currentHP: 20, maxHP: 20, inventory: [], ...over });
const view = (heroes, onClaim) => render(
  <ModalProvider><PartyInventoryContent selectedHeroes={heroes} onUseItem={() => {}} onClaimStarterKit={onClaim} /></ModalProvider>
);

describe('Inventory: claim the starter kit (existing saves)', () => {
  it('offers the claim to gearless heroes and calls back on click', () => {
    const onClaim = jest.fn();
    view([hero(), hero({ heroId: 'h2', heroName: 'Dahlia' })], onClaim);
    expect(screen.getByText(/A starter kit is waiting for Marius, Dahlia/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Claim starter kit' }));
    expect(onClaim).toHaveBeenCalledTimes(1);
  });

  it('hides once everyone has had it or carries gear', () => {
    view([hero({ starterKitGranted: true }), hero({ heroId: 'h2', inventory: ['silver_dagger'], equipment: { weapon: 'silver_dagger' } })], jest.fn());
    expect(screen.queryByRole('button', { name: 'Claim starter kit' })).toBeNull();
  });
});
