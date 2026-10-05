import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import BuildingModal from './BuildingModal';

jest.mock('focus-trap-react', () => ({ __esModule: true, default: ({ children }) => children }));

const quest = {
  id: 'singing_cavern', title: 'The Singing Cavern', status: 'available', minLevel: 1,
  giver: { building: 'tavern', hook: 'They say a deep hollow in the cave sings.' },
  milestones: [{ id: 'a', text: 'Reach the hollow', site: { type: 'cave' } }],
};
const tavern = { buildingType: 'tavern', buildingName: 'The Emerald Wizard', x: 13, y: 7 };
const party = [{ heroName: 'Marius', level: 1, currentHP: 20, maxHP: 20, stats: {} }];

describe('BuildingModal quest offers', () => {
  it('accepting anchors the quest to this building in this town', () => {
    const onAccept = jest.fn();
    render(<BuildingModal building={tavern} npcs={[]} onClose={() => {}} party={party}
      sideQuests={[quest]} onAcceptSideQuest={onAccept} townName="Mudhollow" milestones={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Accept Quest' }));
    expect(onAccept).toHaveBeenCalledWith('singing_cavern', { town: 'Mudhollow', buildingName: 'The Emerald Wizard' });
  });
});
