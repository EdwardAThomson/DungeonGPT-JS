import { timeAgo, templateIdForSettings, artForSettings, saveCardInfo, sortSavesNewestFirst } from './saveCardInfo';

describe('saveCardInfo', () => {
  it('formats time ago', () => {
    const now = new Date('2026-10-02T12:00:00Z').getTime();
    expect(timeAgo('2026-10-02T11:59:40Z', now)).toBe('just now');
    expect(timeAgo('2026-10-02T09:00:00Z', now)).toBe('3 hours ago');
    expect(timeAgo('2026-09-30T12:00:00Z', now)).toBe('2 days ago');
  });

  it('resolves campaign art from templateId, then the templateName label', () => {
    expect(templateIdForSettings({ templateId: 'grimdark-survival-t1' })).toBe('grimdark-survival-t1');
    expect(templateIdForSettings({ templateName: 'Grimdark Survival — The Blighted Village' })).toBe('grimdark-survival-t1');
    expect(templateIdForSettings({ templateName: 'Heroic Fantasy' })).toBe('heroic-fantasy-t1');
    expect(templateIdForSettings({ templateId: 'custom', templateName: 'Custom Tale' })).toBeNull();
    expect(templateIdForSettings(null)).toBeNull();
    expect(artForSettings({ templateName: 'Custom Tale' })).toBe("url('/assets/redesign/hero.jpg')");
  });

  it('parses stringified rows and reads progress', () => {
    const info = saveCardInfo({
      selected_heroes: JSON.stringify([{ heroName: 'Kael' }]),
      game_settings: JSON.stringify({ templateId: 'heroic-fantasy-t1', currentChapter: 2, milestones: [
        { id: 1, text: 'A', requires: [], completed: true },
        { id: 2, text: 'B', requires: [1] },
      ] }),
    });
    expect(info.heroes).toHaveLength(1);
    expect(info.chapter).toBe(2);
    expect(info.progress.completed).toHaveLength(1);
    expect(info.progress.current.text).toBe('B');
    expect(info.art).toContain('heroic-fantasy-t1');
  });

  it('sorts newest first without mutating the input', () => {
    const rows = [{ timestamp: '2026-01-01' }, { timestamp: '2026-03-01' }];
    expect(sortSavesNewestFirst(rows)[0].timestamp).toBe('2026-03-01');
    expect(rows[0].timestamp).toBe('2026-01-01');
  });
});
