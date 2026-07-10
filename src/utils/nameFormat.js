// nameFormat.js
// Small display-layer helpers for composing player-facing place names.

/**
 * Prefix a place name with the definite article without doubling it.
 *
 * Authored names may or may not already carry the article ("The Rimefang Peaks"
 * vs "Grey Moors"). Callers used to hard-code `The ${name}` / `the ${name}`, which
 * produced "The The Rimefang Peaks" for names that already began with "The". This
 * helper is robust to both forms: it strips any leading article(s) already on the
 * name, then prepends a single "The ", so the result never doubles the article.
 *
 * Examples:
 *   theName('Rimefang Peaks')      -> 'The Rimefang Peaks'
 *   theName('The Rimefang Peaks')  -> 'The Rimefang Peaks'
 *   theName('the The Rimefang Peaks') -> 'The Rimefang Peaks'
 *
 * @param {string} name - place name (with or without a leading article)
 * @returns {string} the name prefixed with exactly one "The "
 */
export const theName = (name) => {
  const trimmed = String(name == null ? '' : name).trim();
  if (!trimmed) return trimmed;
  // Collapse any accidental leading article(s) before re-adding a single one.
  const bare = trimmed.replace(/^(the\s+)+/i, '');
  return bare ? `The ${bare}` : trimmed;
};
