// ArcDetailModal tests (#73 phase 1). The load-bearing one is the STUB
// regression: production crash 2026-07-07, guest mode, where the old template
// detail modal read t.settings.shortDescription on a shop-window teaser stub
// (which has NO settings) and hit the error boundary. The arc modal must be
// stub-tolerant by construction: render a settings-less teaser chapter with
// its blurb and lock state, and no goal/milestone/tone rows, without throwing.

import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import ArcDetailModal, { chapterChip, levelFitCopy } from './ArcDetailModal';
import { getStoryArcs } from '../game/storyArcs';
import { storyTemplates } from '../data/storyTemplates';
import { _resetEntitlementsForTests } from '../game/entitlements';

// entitlements -> entitlementsApi -> supabaseClient would construct a real client
// when .env credentials are present; keep this suite hermetic.
jest.mock('../services/supabaseClient', () => ({ supabase: null }));

afterEach(() => {
  localStorage.clear();
  _resetEntitlementsForTests();
});

const arcFor = (themeId) =>
  getStoryArcs(storyTemplates).find((a) => a.id === themeId);

describe('regression: settings-less teaser stubs never crash the modal (guest)', () => {
  it('renders the tidewater arc (all shop-window stubs) for a signed-out free user', () => {
    const arc = arcFor('tidewater');
    expect(arc.chapters.every((c) => !c.template.settings)).toBe(true); // the crash precondition

    expect(() =>
      render(
        <ArcDetailModal
          arc={arc}
          selectedChapterId="tidewater-t1"
          isSignedIn={false}
          onClose={() => {}}
        />
      )
    ).not.toThrow();

    // The blurb (the stub's top-level shortDescription) shows: once as the arc
    // tagline (derived from chapter 1) and once as the selected chapter's body.
    expect(screen.getAllByText(/barnacled bell fragment/i).length).toBeGreaterThanOrEqual(1);
    // ...and the settings-backed rows are hidden entirely.
    expect(screen.queryByText(/Campaign Goal/i)).toBeNull();
    expect(screen.queryByText(/Quest Milestones/i)).toBeNull();
    expect(screen.queryByText(/Grimness/)).toBeNull();
  });

  it('renders the ladder with lock chips for every stub chapter', () => {
    const arc = arcFor('tidewater');
    render(<ArcDetailModal arc={arc} isSignedIn={false} onClose={() => {}} />);
    // Free/guest user: tidewater is premium-gated, so every row is a lock chip.
    expect(screen.getAllByText('🔒 Premium')).toHaveLength(3);
  });
});

describe('chapter picker behaviour', () => {
  it('shows the selected chapter\'s structure only (milestones of one chapter at a time)', () => {
    const arc = arcFor('heroic-fantasy');
    render(
      <ArcDetailModal
        arc={arc}
        selectedChapterId="heroic-fantasy-t1"
        isSignedIn
        onClose={() => {}}
      />
    );
    expect(screen.getByText(/Quest Milestones \(4\)/)).toBeInTheDocument();
    // Chapter 1's milestones show; chapter 2's do not (titles-only ladder).
    expect(screen.getByText(/goblin scout's map/i)).toBeInTheDocument();
    expect(screen.queryByText(/hidden map in the archives/i)).toBeNull();
    // Chapter 2 is still VISIBLE as a ladder row (title + band).
    expect(screen.getByText('Crown of Sunfire')).toBeInTheDocument();
  });

  it('clicking a startable ladder row selects it; comingSoon rows are inert', () => {
    const arc = arcFor('grimdark-survival');
    const onSelectChapter = jest.fn();
    render(
      <ArcDetailModal
        arc={arc}
        selectedChapterId="grimdark-survival-t1"
        onSelectChapter={onSelectChapter}
        isSignedIn
        onClose={() => {}}
      />
    );
    fireEvent.click(screen.getByTestId('arc-chapter-row-grimdark-survival-t2'));
    expect(onSelectChapter).toHaveBeenCalledWith('grimdark-survival-t2');
    onSelectChapter.mockClear();
    fireEvent.click(screen.getByTestId('arc-chapter-row-grimdark-survival-t3')); // coming soon
    expect(onSelectChapter).not.toHaveBeenCalled();
    expect(screen.getByText('Coming soon')).toBeInTheDocument();
  });

  it('a startable selected chapter offers Begin This Campaign, and Next once applied', () => {
    const arc = arcFor('heroic-fantasy');
    const onApplyChapter = jest.fn();
    const { rerender } = render(
      <ArcDetailModal
        arc={arc}
        selectedChapterId="heroic-fantasy-t1"
        onApplyChapter={onApplyChapter}
        isSignedIn
        onClose={() => {}}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Begin This Campaign/i }));
    expect(onApplyChapter).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'heroic-fantasy-t1' })
    );
    rerender(
      <ArcDetailModal
        arc={arc}
        selectedChapterId="heroic-fantasy-t1"
        selectedTemplateId="heroic-fantasy-t1"
        isSignedIn
        onClose={() => {}}
      />
    );
    expect(screen.getByRole('button', { name: /Next: Select Heroes/i })).toBeInTheDocument();
  });

  it('shows the honest level-fit note when a fresh party picks a t2 chapter directly', () => {
    const arc = arcFor('heroic-fantasy');
    render(
      <ArcDetailModal
        arc={arc}
        selectedChapterId="heroic-fantasy-t2"
        partyMaxLevel={1}
        isSignedIn
        onClose={() => {}}
      />
    );
    expect(screen.getByTestId('arc-level-fit').textContent).toMatch(/made for Lv 3-5/);
  });
});

describe('teaser rows: guest vs signed-in copy (ruling B)', () => {
  it('signed OUT: a free-gated stub chapter says sign in to play, never a tier upsell', () => {
    const arc = arcFor('heroic-fantasy'); // t3 is the free-gated Shattered Throne stub
    const onTeaser = jest.fn();
    render(
      <ArcDetailModal
        arc={arc}
        selectedChapterId="heroic-fantasy-t3"
        isSignedIn={false}
        onTeaserChapterClick={onTeaser}
        onClose={() => {}}
      />
    );
    // Chip and footer both say sign-in; no Members/Premium lock anywhere on the row.
    expect(screen.getAllByText(/Sign in to play/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('🔒 Members')).toBeNull();
    // The footer button is disabled signed-out (the fix is the sign-in flow).
    expect(screen.getByRole('button', { name: /Sign in to play/i })).toBeDisabled();
  });

  it('signed IN: the teaser row invites loading and clicking it triggers the self-heal', () => {
    const arc = arcFor('heroic-fantasy');
    const onTeaser = jest.fn();
    render(
      <ArcDetailModal
        arc={arc}
        selectedChapterId="heroic-fantasy-t3"
        isSignedIn
        onTeaserChapterClick={onTeaser}
        onClose={() => {}}
      />
    );
    expect(screen.getByText('Tap to load')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('arc-chapter-row-heroic-fantasy-t3'));
    expect(onTeaser).toHaveBeenCalledWith(expect.objectContaining({ id: 'heroic-fantasy-t3' }));
    fireEvent.click(screen.getByRole('button', { name: /Load My Content/i }));
    expect(onTeaser).toHaveBeenCalledTimes(2);
  });

  it('shows the loading state on the retried row', () => {
    const arc = arcFor('heroic-fantasy');
    render(
      <ArcDetailModal
        arc={arc}
        selectedChapterId="heroic-fantasy-t3"
        isSignedIn
        retryingChapterId="heroic-fantasy-t3"
        onClose={() => {}}
      />
    );
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Loading your content/i })).toBeDisabled();
  });

  it('renders the in-modal notice line when given one', () => {
    const arc = arcFor('heroic-fantasy');
    render(<ArcDetailModal arc={arc} notice="A notice line." isSignedIn onClose={() => {}} />);
    expect(screen.getByTestId('arc-modal-notice')).toHaveTextContent('A notice line.');
  });
});

describe('chapterChip / levelFitCopy helpers', () => {
  it('chip precedence: comingSoon > locked > loading > teaser > band', () => {
    expect(chapterChip({ comingSoon: true, locked: true }).kind).toBe('coming-soon');
    expect(chapterChip({ locked: true, teaser: true, gateTier: 'premium' })).toEqual({ label: '🔒 Premium', kind: 'locked' });
    expect(chapterChip({ teaser: true }, { isSignedIn: true, isRetrying: true }).kind).toBe('loading');
    expect(chapterChip({ teaser: true }, { isSignedIn: true }).label).toBe('Tap to load');
    expect(chapterChip({ teaser: true }, { isSignedIn: false }).label).toBe('Sign in to play');
    expect(chapterChip({ levelRange: [3, 5] }).label).toBe('Lv 3-5');
  });

  it('levelFitCopy is null for t1, in-band parties, or band-less templates', () => {
    expect(levelFitCopy({ tier: 1, levelRange: [1, 2] }, 1)).toBeNull();
    expect(levelFitCopy({ tier: 2, levelRange: [3, 5] }, 4)).toBeNull();
    expect(levelFitCopy({ tier: 2 }, 1)).toBeNull();
    expect(levelFitCopy({ tier: 2, levelRange: [3, 5], settings: { milestones: [{ id: 1 }] } }, 1)).toMatch(/within reach/);
    expect(levelFitCopy({ tier: 2, levelRange: [3, 5], settings: { milestones: [{ id: 1, minLevel: 3 }] } }, 1)).toMatch(/brutal/);
  });
});
