import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AiPoolPills from './AiPoolPills';
import { _resetAiPoolForTests, getPreferredPool } from '../services/aiPool';
import { _resetEntitlementsForTests, PREMIUM_DEV_OVERRIDE_KEY } from '../game/entitlements';

// AiPoolPills renders a react-router <Link> (the membership nudge for non-members),
// so it must be mounted inside a Router.
const renderInRouter = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>);

afterEach(() => { localStorage.clear(); _resetEntitlementsForTests(); _resetAiPoolForTests(); });

describe('AiPoolPills (shared Free/Premium pool selector)', () => {
  it('a free account sees the locked Premium pill, cannot pick it, and gets the membership nudge', () => {
    const { getByText, queryByText } = renderInRouter(<AiPoolPills />);
    expect(getByText('⚡ Free AI')).toBeTruthy();
    expect(getByText('🔒 Premium AI')).toBeTruthy();
    expect(queryByText('✨ Premium AI')).toBeNull();
    const nudge = getByText('✨ Unlock Premium AI with Membership →');
    expect(nudge).toBeTruthy();
    expect(nudge.getAttribute('href')).toBe('/membership');
  });

  it('a member sees a selectable Premium pill, no nudge, and clicking it sets the pool', () => {
    localStorage.setItem(PREMIUM_DEV_OVERRIDE_KEY, 'true');
    _resetEntitlementsForTests();
    const { getByText, queryByText } = renderInRouter(<AiPoolPills />);
    expect(queryByText('✨ Unlock Premium AI with Membership →')).toBeNull();
    fireEvent.click(getByText('✨ Premium AI'));
    expect(getPreferredPool()).toBe('premium');
  });
});
