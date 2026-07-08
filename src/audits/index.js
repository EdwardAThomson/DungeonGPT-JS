// Content-audit runner.
//
// Aggregates every domain module's checks and runs them against a shared context.
// Two consumers:
//   - scripts/content-audit.mjs  -> friendly `npm run audit` report (never fails)
//   - src/audits/contentAudit.test.js -> Jest CI gate (fails on error severity)
//
// To add a domain: implement src/audits/<domain>.js (default-export an array of
// checks, see ./items.js for the pattern), import it below, and add it to
// DOMAIN_CHECKS. Add its data to ./context.js and its rows to docs/CONTENT_AUDIT.md.

import { runCheck, STATUS } from './types';
import { buildAuditContext } from './context';

// Implemented domains
import itemsChecks from './items';
import buildingsChecks from './buildings';
import npcsChecks from './npcs';
import milestonesChecks from './milestones';

// Stub domains — empty arrays today; later agents fill these in.
// (Contributing checks the moment their array is non-empty; no runner change needed.)
import encountersChecks from './encounters';
import mapChecks from './map';
import displayChecks from './display';

// Order here is the order domains appear in the report.
const DOMAIN_CHECKS = [
  ...itemsChecks,
  ...buildingsChecks,
  ...npcsChecks,
  ...milestonesChecks,
  ...encountersChecks,
  ...mapChecks,
  ...displayChecks
];

/**
 * Every registered check, without running any of them.
 * Used by the report and the master-checklist generator.
 * @returns {Array<object>} array of Check objects
 */
export function getAllChecks() {
  return DOMAIN_CHECKS.slice();
}

/**
 * Run the full audit.
 * @param {object} [ctx] - override context (defaults to a freshly built one)
 * @returns {{ results: object[], summary: { passed:number, warnings:number, failed:number, total:number } }}
 */
export function runAudit(ctx = buildAuditContext()) {
  const results = getAllChecks().map((check) => runCheck(check, ctx));

  const summary = { passed: 0, warnings: 0, failed: 0, total: results.length };
  for (const r of results) {
    if (r.status === STATUS.FAIL) summary.failed += 1;
    else if (r.status === STATUS.WARN) summary.warnings += 1;
    else summary.passed += 1;
  }

  return { results, summary };
}

export { buildAuditContext };
export default runAudit;
