import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import AiPoolPills from './AiPoolPills';
import { _resetAiPoolForTests, getPreferredPool } from '../services/aiPool';
import { _resetEntitlementsForTests, PREMIUM_DEV_OVERRIDE_KEY } from '../game/entitlements';

afterEach(() => { localStorage.clear(); _resetEntitlementsForTests(); _resetAiPoolForTests(); });

describe('AiPoolPills (shared Free/Premium pool selector)', () => {
  it('a free account sees the locked Premium pill and cannot pick it', () => {
    const { getByText, queryByText } = render(<AiPoolPills />);
    expect(getByText('⚡ Free AI')).toBeTruthy();
    expect(getByText('🔒 Premium AI')).toBeTruthy();
    expect(queryByText('✨ Premium AI')).toBeNull();
  });

  it('a member sees a selectable Premium pill and clicking it sets the pool', () => {
    localStorage.setItem(PREMIUM_DEV_OVERRIDE_KEY, 'true');
    _resetEntitlementsForTests();
    const { getByText } = render(<AiPoolPills />);
    fireEvent.click(getByText('✨ Premium AI'));
    expect(getPreferredPool()).toBe('premium');
  });
});
