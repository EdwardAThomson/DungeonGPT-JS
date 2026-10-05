// Adventure Log grouping by location visit. Entering a town or explorable site stamps the
// log line with `visit: { id, name, phase: 'enter' }`; leaving (or being carried out after
// a party wipe) stamps `visit: { phase: 'leave' }`. Everything from an enter marker up to
// and including its leave marker renders as one collapsible block. Pure, view-only: old
// saves without markers simply render ungrouped, and re-entering a place opens a new visit.

let visitCounter = 0;

// A unique id for a visit; persisted in the save with the marker message.
export const newVisitId = () => `v${Date.now().toString(36)}${(visitCounter++).toString(36)}`;

export const visitEnterMessage = (content, name) => ({
  role: 'system',
  content,
  visit: { id: newVisitId(), name, phase: 'enter' },
});

export const visitLeaveMessage = (content) => ({
  role: 'system',
  content,
  visit: { phase: 'leave' },
});

/**
 * Split a conversation into top-level items: plain messages, and visit groups.
 * A group ends at its leave marker, or (if that never came, e.g. a save from before
 * markers on the way out) at the next enter marker. The last group stays open while the
 * party is still inside.
 *
 * @param {Array} conversation
 * @returns {Array<{type:'msg', msg, index} | {type:'visit', id, name, items:Array<{msg,index}>, closed:boolean}>}
 */
export const groupLogByVisit = (conversation) => {
  const out = [];
  let open = null;
  (conversation || []).forEach((msg, index) => {
    const phase = msg?.visit?.phase;
    if (phase === 'enter') {
      if (open) open.closed = true; // a new place begins: the previous visit is over
      open = { type: 'visit', id: msg.visit.id || `idx${index}`, name: msg.visit.name || 'Unknown place', items: [{ msg, index }], closed: false };
      out.push(open);
      return;
    }
    if (open) {
      open.items.push({ msg, index });
      if (phase === 'leave') { open.closed = true; open = null; }
      return;
    }
    out.push({ type: 'msg', msg, index });
  });
  return out;
};
