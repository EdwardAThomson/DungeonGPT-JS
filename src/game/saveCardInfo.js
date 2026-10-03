// saveCardInfo: display facts for a saved-game row, shared by Your Games and the /play
// dashboard so both show the same art, party, progress and "played" label.

import { getCampaignProgress } from './milestoneEngine';
import { resolveCompletedTemplateId } from './campaignChain';
import { storyTemplates } from '../data/storyTemplates';

const FALLBACK_ART = '/assets/redesign/hero.jpg';

const parseMaybe = (v) => {
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch (e) { return null; }
};

// "3 hours ago" style label; falls back to a date after a week.
export const timeAgo = (timestamp, now = Date.now()) => {
  const then = new Date(timestamp);
  const mins = Math.round((now - then.getTime()) / 60000);
  if (!Number.isFinite(mins)) return '';
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  return then.toLocaleDateString();
};

// Campaign art is keyed by template id. Saves from before templateId was stamped
// (2026-07-03) resolve it from their templateName label instead (the resolver returns the
// raw label when nothing matches), and a realm-only label ("Heroic Fantasy", no chapter)
// gets that realm's first chapter art. Custom tales, saves with no label, and
// server-delivered templates without a card fall back to the generic scene.
export const templateIdForSettings = (settings) => {
  const resolvedId = resolveCompletedTemplateId(settings);
  if (/^[a-z0-9-]+$/.test(resolvedId || '')) return resolvedId === 'custom' ? null : resolvedId;
  return storyTemplates.find((t) => t.name === settings?.templateName)?.id || null;
};

// CSS background-image value: the campaign card, layered over the generic scene so a
// missing file still shows art.
export const artForSettings = (settings) => {
  const id = templateIdForSettings(settings);
  return id ? `url('/assets/templates/${id}.webp'), url('${FALLBACK_ART}')` : `url('${FALLBACK_ART}')`;
};

export const saveCardInfo = (conversation) => {
  const heroes = (conversation?.selected_heroes && parseMaybe(conversation.selected_heroes)) || [];
  const settings = (conversation?.game_settings && parseMaybe(conversation.game_settings)) || null;
  const milestones = Array.isArray(settings?.milestones) ? settings.milestones : [];
  return {
    heroes: Array.isArray(heroes) ? heroes : [],
    settings,
    // Quest-chaining record: currentChapter, or chain.chapter from the retired linked-save build.
    chapter: settings?.currentChapter || settings?.chain?.chapter || null,
    progress: milestones.length ? getCampaignProgress(milestones) : null,
    art: artForSettings(settings),
  };
};

// Newest first (the lists come back in store order).
export const sortSavesNewestFirst = (rows) =>
  [...(rows || [])].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
