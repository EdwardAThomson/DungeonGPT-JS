// Account chip in the redesign nav: a long username is rendered once (not "E edward..."
// as plain text), next to a round initial, with the full address kept accessible.
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RedesignNav from './RedesignNav';

jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { email: 'averyveryverylongadventurername@example.com' }, signOut: jest.fn() }),
}));

test('signed-in nav shows an initial badge and the username once', () => {
  render(<MemoryRouter><RedesignNav isDebugEnabled={false} /></MemoryRouter>);
  const toggle = screen.getByRole('button', { name: 'Account (averyveryverylongadventurername) menu' });
  expect(toggle.querySelector('.rd-avatar')).toHaveTextContent('A');
  expect(toggle.querySelector('.rd-account-name')).toHaveTextContent('averyveryverylongadventurername');
  expect(toggle.querySelector('.rd-account')).toHaveAttribute('title', 'averyveryverylongadventurername@example.com');
  // the username appears exactly once in the toggle (the old label repeated it after the initial)
  expect(toggle.textContent.match(/averyveryverylongadventurername/g)).toHaveLength(1);
});
