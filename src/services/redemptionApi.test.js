// Tests for the redemption-code client hop (#6 first slice): authed POST to the
// Worker, guest fast-fail, and the error contract mapping (RedemptionError.code).

import { redeemCode, RedemptionError } from './redemptionApi';
import { supabase } from './supabaseClient';

jest.mock('./supabaseClient', () => ({
  supabase: { auth: { getSession: jest.fn() } },
}));

const getSession = supabase.auth.getSession;

const sessionPresent = () =>
  getSession.mockResolvedValue({ data: { session: { access_token: 'tok-123' } } });
const sessionAbsent = () =>
  getSession.mockResolvedValue({ data: { session: null } });

describe('redemptionApi', () => {
  beforeEach(() => {
    getSession.mockReset();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    delete global.fetch;
  });

  it('guests fail fast with not_signed_in and NO network call', async () => {
    sessionAbsent();
    await expect(redeemCode('ABCD-EFGH-JKLM')).rejects.toMatchObject({
      code: 'not_signed_in',
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('POSTs the code with the session bearer token and returns the grant', async () => {
    sessionPresent();
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ tier: 'member', expiresAt: '2026-08-06T12:00:00.000Z' }),
    });

    await expect(redeemCode('abcd efgh jklm')).resolves.toEqual({
      tier: 'member',
      expiresAt: '2026-08-06T12:00:00.000Z',
    });

    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toContain('/api/db/redeem-code');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer tok-123');
    // Sent as typed; normalization is the Worker's job.
    expect(JSON.parse(init.body)).toEqual({ code: 'abcd efgh jklm' });
  });

  it.each([
    [400, 'code_invalid'],
    [409, 'already_redeemed'],
    [429, 'rate_limited'],
    [503, 'redeem_unavailable'],
  ])('maps a %s response to RedemptionError code %s', async (status, code) => {
    sessionPresent();
    global.fetch.mockResolvedValue({
      ok: false,
      status,
      json: async () => ({ error: 'server says no', code }),
    });

    const err = await redeemCode('ABCD-EFGH-JKLM').catch((e) => e);
    expect(err).toBeInstanceOf(RedemptionError);
    expect(err.code).toBe(code);
    expect(err.message).toBe('server says no');
  });

  it('falls back to rate_limited on a bare 429 and unknown otherwise', async () => {
    sessionPresent();
    global.fetch.mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => {
        throw new Error('not json');
      },
    });
    await expect(redeemCode('X')).rejects.toMatchObject({ code: 'rate_limited' });

    global.fetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    });
    await expect(redeemCode('X')).rejects.toMatchObject({ code: 'unknown' });
  });
});
