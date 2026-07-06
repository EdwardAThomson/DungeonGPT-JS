// AiEngineSettings pool chips (backlog #7): the Premium AI chip is locked for
// guests/free exactly as before, goes live for member+, persists the selection,
// and quietly surfaces premium-cap fallbacks.

import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { AiEngineSettings } from './Modals';
import {
    getPreferredPool,
    setPreferredPool,
    recordPoolOutcome,
    _resetAiPoolForTests,
} from '../services/aiPool';
import { setUserTier, _resetEntitlementsForTests } from '../game/entitlements';

const renderSettings = () =>
    render(
        <AiEngineSettings
            selectedProvider="cf-workers"
            setSelectedProvider={jest.fn()}
            selectedModel="@cf/openai/gpt-oss-120b"
            setSelectedModel={jest.fn()}
            assistantProvider="cf-workers"
            setAssistantProvider={jest.fn()}
            assistantModel="@cf/openai/gpt-oss-120b"
            setAssistantModel={jest.fn()}
        />
    );

describe('AiEngineSettings pool chips', () => {
    beforeEach(() => {
        localStorage.clear();
        _resetAiPoolForTests();
        _resetEntitlementsForTests();
    });

    test('guest: Premium chip is locked (disabled), Free chip is checked', () => {
        renderSettings();
        const premiumChip = screen.getByRole('radio', { name: /premium ai/i, hidden: true });
        expect(premiumChip).toBeDisabled();
        expect(screen.getByText(/🔒 Premium AI/)).toBeInTheDocument();

        const freeChip = screen.getByRole('radio', { name: /free ai/i });
        expect(freeChip).toHaveAttribute('aria-checked', 'true');
    });

    test('guest: clicking around never enables premium requests', () => {
        renderSettings();
        const premiumChip = screen.getByRole('radio', { name: /premium ai/i, hidden: true });
        fireEvent.click(premiumChip); // disabled: no-op
        expect(getPreferredPool()).toBe('free');
    });

    test('member: Premium chip is enabled and selecting it persists the preference', () => {
        setUserTier('member');
        renderSettings();

        const premiumChip = screen.getByRole('radio', { name: /premium ai/i });
        expect(premiumChip).not.toBeDisabled();
        expect(premiumChip).toHaveAttribute('aria-checked', 'false');

        fireEvent.click(premiumChip);
        expect(premiumChip).toHaveAttribute('aria-checked', 'true');
        expect(screen.getByRole('radio', { name: /free ai/i })).toHaveAttribute('aria-checked', 'false');
        expect(getPreferredPool()).toBe('premium');
    });

    test('member: switching back to Free persists too', () => {
        setUserTier('member');
        setPreferredPool('premium');
        renderSettings();

        fireEvent.click(screen.getByRole('radio', { name: /free ai/i }));
        expect(getPreferredPool()).toBe('free');
        expect(screen.getByRole('radio', { name: /free ai/i })).toHaveAttribute('aria-checked', 'true');
    });

    test('member with premium selected: premium_cap outcome shows the quiet fallback notice', () => {
        setUserTier('member');
        setPreferredPool('premium');
        renderSettings();

        act(() => {
            recordPoolOutcome({ requestedPool: 'premium', usedPool: 'free', reason: 'premium_cap' });
        });

        expect(screen.getByTestId('pool-status')).toHaveTextContent(/premium allowance is used up/i);
    });

    test('member with premium selected: successful premium response reports the pool used', () => {
        setUserTier('member');
        setPreferredPool('premium');
        renderSettings();

        act(() => {
            recordPoolOutcome({ requestedPool: 'premium', usedPool: 'premium', reason: null });
        });

        expect(screen.getByTestId('pool-status')).toHaveTextContent(/served by: premium ai/i);
    });

    test('free selection shows no pool status line', () => {
        setUserTier('member');
        renderSettings();
        expect(screen.queryByTestId('pool-status')).toBeNull();
    });
});
