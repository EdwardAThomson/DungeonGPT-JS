// The saved-games list is metadata only (the server skips conversation_data and summary),
// so the details pop-up must fetch the full save to show the DM memory index and summary.

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import SavedGameDetailsModal from './SavedGameDetailsModal';
import { conversationsApi } from '../services/conversationsApi';
import { getIndexStatus } from '../game/ragEngine';

jest.mock('../services/conversationsApi', () => ({ conversationsApi: { getById: jest.fn() } }));
jest.mock('../game/ragEngine', () => ({ getIndexStatus: jest.fn(), backfill: jest.fn() }));
jest.mock('../services/ragStore', () => ({ ragStore: { clearSession: jest.fn() } }));

const listRow = { sessionId: 's1', conversation_name: 'Goblin Hunt', timestamp: '2026-10-01T10:00:00Z', game_settings: '{}', selected_heroes: '[]' };

describe('SavedGameDetailsModal', () => {
  beforeEach(() => jest.clearAllMocks());

  it('fetches the full save for a metadata-only row and shows the memory index and summary', async () => {
    conversationsApi.getById.mockResolvedValue({ ...listRow, summary: 'The party met Ulric.', conversation_data: [{ role: 'ai', content: 'a' }, { role: 'ai', content: 'b' }] });
    getIndexStatus.mockResolvedValue({ status: 'partial', indexed: 1, total: 2 });
    render(<SavedGameDetailsModal isOpen onClose={() => {}} conversation={listRow} formatDate={(d) => d} />);
    expect(await screen.findByText('DM memory index')).toBeTruthy();
    expect(screen.getByText(/1 of 2 events indexed/)).toBeTruthy();
    expect(screen.getByText('The party met Ulric.')).toBeTruthy();
    expect(conversationsApi.getById).toHaveBeenCalledWith('s1');
    expect(getIndexStatus).toHaveBeenCalledWith('s1', expect.arrayContaining([{ role: 'ai', content: 'a' }]));
  });

  it('uses a row that already carries its messages without refetching', async () => {
    getIndexStatus.mockResolvedValue({ status: 'current', indexed: 1, total: 1 });
    render(<SavedGameDetailsModal isOpen onClose={() => {}} conversation={{ ...listRow, conversation_data: '[{"role":"ai","content":"x"}]' }} formatDate={(d) => d} />);
    expect(await screen.findByText('Fully indexed')).toBeTruthy();
    expect(conversationsApi.getById).not.toHaveBeenCalled();
  });

  it('omits the section quietly when the save cannot be fetched', async () => {
    conversationsApi.getById.mockRejectedValue(new Error('offline'));
    render(<SavedGameDetailsModal isOpen onClose={() => {}} conversation={listRow} formatDate={(d) => d} />);
    await waitFor(() => expect(conversationsApi.getById).toHaveBeenCalled());
    expect(screen.queryByText('DM memory index')).toBeNull();
  });
});
