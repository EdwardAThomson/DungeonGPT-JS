import React from 'react';

// Small, always-present save sync indicator shown next to the manual Save button.
// It surfaces the existing save ack (see deriveSaveIndicatorState in
// useGamePersistence) so the player can SEE whether progress is durably saved,
// only saved locally (pending cloud sync), or having trouble.
const COPY = {
  saving: { label: 'Saving...', title: 'Saving your progress...', icon: null },
  saved: { label: 'Saved', title: 'Your progress is saved.', icon: '✓' },
  local: {
    label: 'Saved locally',
    title: 'Saved on this device. It will sync to your account when reconnected.',
    icon: '⚠'
  },
  error: {
    label: 'Save issue',
    title: 'Your last save did not complete cleanly. It will retry automatically.',
    icon: '⚠'
  }
};

const SaveSyncIndicator = ({ status = 'idle', isSaving = false, signedIn = false }) => {
  // A save in flight always shows "Saving...", whatever the previous resolved state.
  let effective = isSaving ? 'saving' : status;

  // Nothing to report yet.
  if (effective === 'idle' || !COPY[effective]) return null;

  // A guest's local store IS their save, so a local-only result reads as a plain
  // "Saved", not the degraded "Saved locally" (which only makes sense when a
  // signed-in player's cloud push fell back to this device).
  if (effective === 'local' && !signedIn) effective = 'saved';

  const copy = COPY[effective];
  // Signed-in durable saves can say a little more in the tooltip.
  const title = effective === 'saved' && signedIn ? 'Saved to your account.' : copy.title;

  return (
    <span
      className={`save-sync-indicator save-sync-${effective}`}
      role="status"
      aria-live="polite"
      aria-label={`Save status: ${copy.label}`}
      title={title}
    >
      {effective === 'saving' ? (
        <span className="save-sync-spinner" aria-hidden="true" />
      ) : (
        <span className="save-sync-icon" aria-hidden="true">{copy.icon}</span>
      )}
      <span className="save-sync-label">{copy.label}</span>
    </span>
  );
};

export default SaveSyncIndicator;
