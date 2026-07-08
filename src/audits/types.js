// Content-audit check contract.
//
// This module defines the shape every audit check produces. Keep it plain data:
// no classes, no side effects, so check modules stay pure and trivially testable.
//
// A DOMAIN MODULE (items.js, buildings.js, ...) default-exports an ARRAY of Check
// objects. Exporting an array (rather than running the checks on import) lets the
// runner enumerate every check without executing it, which the report and the
// master-checklist doc both rely on.
//
// ---------------------------------------------------------------------------
// Check          — the authored unit of verification
//   {
//     id:       string   e.g. 'ITEM-01' (stable, unique, used in the doc table)
//     domain:   string   e.g. 'items'   (groups checks in the report)
//     title:    string   one-line human description
//     severity: 'error' | 'warn'
//     run:      (ctx) => Violation[]     // pure; [] means the check passed
//   }
//
// Violation      — one concrete problem found by a check
//   {
//     message:  string   what is wrong, naming the offending id
//     location: string   where it lives (template id, milestone id, catalog key…)
//   }
//
// CheckResult    — what the runner turns each Check into
//   {
//     id, domain, title, severity,      // copied from the Check
//     status:     'pass' | 'warn' | 'fail',
//     violations: Violation[]
//   }
// status derivation: no violations -> 'pass'; otherwise 'fail' if severity is
// 'error', 'warn' if severity is 'warn'.
// ---------------------------------------------------------------------------

export const SEVERITY = Object.freeze({ ERROR: 'error', WARN: 'warn' });

export const STATUS = Object.freeze({ PASS: 'pass', WARN: 'warn', FAIL: 'fail' });

/**
 * Execute one check against a context and normalize it into a CheckResult.
 * A check that throws is reported as a failing violation rather than crashing
 * the whole audit, so one broken domain never hides the others.
 *
 * @param {object} check - a Check ({ id, domain, title, severity, run })
 * @param {object} ctx   - the audit context from buildAuditContext()
 * @returns {object} CheckResult
 */
export function runCheck(check, ctx) {
  let violations;
  try {
    violations = check.run(ctx) || [];
  } catch (err) {
    violations = [{
      message: `check threw an error: ${err && err.message ? err.message : String(err)}`,
      location: check.id
    }];
  }

  let status = STATUS.PASS;
  if (violations.length > 0) {
    status = check.severity === SEVERITY.ERROR ? STATUS.FAIL : STATUS.WARN;
  }

  return {
    id: check.id,
    domain: check.domain,
    title: check.title,
    severity: check.severity,
    status,
    violations
  };
}
