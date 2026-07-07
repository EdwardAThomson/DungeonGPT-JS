// Profile-page redemption UX (#6 first slice): the redeem form's four states
// (success, invalid, already redeemed, rate limited), the tier refresh after a
// successful redemption, and the grant end date on the Membership row.

// jest-dom matchers are per-file here: the repo has no global setupTests.js.
import '@testing-library/jest-dom';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import Profile from './Profile';
import { useAuth } from '../contexts/AuthContext';
import { redeemCode, RedemptionError } from '../services/redemptionApi';

jest.mock('../contexts/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('react-router-dom', () => ({
  useNavigate: () => jest.fn(),
}));

jest.mock('../services/redemptionApi', () => {
  class RedemptionError extends Error {
    constructor(message, code) {
      super(message);
      this.code = code;
    }
  }
  return { redeemCode: jest.fn(), RedemptionError };
});

const USER = {
  id: 'user-1',
  email: 'player@example.com',
  created_at: '2026-01-01T00:00:00Z',
  last_sign_in_at: '2026-07-01T00:00:00Z',
};

function mockAuth(overrides = {}) {
  const auth = {
    user: USER,
    tier: 'free',
    tierExpiresAt: null,
    refreshTier: jest.fn().mockResolvedValue('member'),
    signOut: jest.fn(),
    ...overrides,
  };
  useAuth.mockReturnValue(auth);
  return auth;
}

function typeAndRedeem(code = 'ABCD-EFGH-JKLM') {
  fireEvent.change(screen.getByLabelText(/redeem a code/i), { target: { value: code } });
  fireEvent.click(screen.getByRole('button', { name: /^redeem$/i }));
}

describe('Profile redemption', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('success: confirms the granted tier and end date, and refreshes the tier state', async () => {
    const auth = mockAuth();
    redeemCode.mockResolvedValue({ tier: 'member', expiresAt: '2026-08-06T12:00:00.000Z' });
    render(<Profile />);

    typeAndRedeem('abcd efgh jklm');

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/code redeemed: member unlocked/i);
    });
    expect(screen.getByRole('status')).toHaveTextContent(
      new RegExp(`membership active until ${new Date('2026-08-06T12:00:00.000Z').toLocaleDateString()}`, 'i')
    );
    expect(redeemCode).toHaveBeenCalledWith('abcd efgh jklm');
    // Gates unlock without re-login: the same re-resolve sign-in uses.
    expect(auth.refreshTier).toHaveBeenCalledTimes(1);
    // The input clears for the next code.
    expect(screen.getByLabelText(/redeem a code/i)).toHaveValue('');
  });

  it('invalid code: one friendly line covering expired/disabled/exhausted/unknown', async () => {
    mockAuth();
    redeemCode.mockRejectedValue(new RedemptionError('That code is not valid', 'code_invalid'));
    render(<Profile />);

    typeAndRedeem();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/that code is not valid/i);
    });
    expect(useAuth().refreshTier).not.toHaveBeenCalled();
  });

  it('already redeemed: its own distinct message', async () => {
    mockAuth();
    redeemCode.mockRejectedValue(new RedemptionError('already', 'already_redeemed'));
    render(<Profile />);

    typeAndRedeem();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        /already redeemed this code on this account/i
      );
    });
  });

  it('rate limited: "too many attempts today"', async () => {
    mockAuth();
    redeemCode.mockRejectedValue(new RedemptionError('slow down', 'rate_limited'));
    render(<Profile />);

    typeAndRedeem();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/too many attempts today/i);
    });
  });

  it('shows the grant end date on the Membership row when the tier is grant-backed', () => {
    mockAuth({ tier: 'member', tierExpiresAt: '2026-08-06T12:00:00.000Z' });
    render(<Profile />);

    expect(screen.getByText('🔱 Member')).toBeInTheDocument();
    expect(
      screen.getByText(
        new RegExp(`active until ${new Date('2026-08-06T12:00:00.000Z').toLocaleDateString()}`)
      )
    ).toBeInTheDocument();
  });

  it('shows no end date for a stored (not time-boxed) tier', () => {
    mockAuth({ tier: 'premium', tierExpiresAt: null });
    render(<Profile />);

    expect(screen.getByText('💎 Premium')).toBeInTheDocument();
    expect(screen.queryByText(/active until/i)).not.toBeInTheDocument();
  });

  it('disables the Redeem button while the input is empty', () => {
    mockAuth();
    render(<Profile />);
    expect(screen.getByRole('button', { name: /^redeem$/i })).toBeDisabled();
  });
});
