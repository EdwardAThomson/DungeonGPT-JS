// Content-audit CI gate.
//
// Runs the full audit and FAILS on any error-severity result (status === 'fail').
// Warnings never fail the build; they are console.logged so they stay visible in
// CI output. This test is the enforcement half of the suite; `npm run audit` is the
// friendly always-passing report.

import { runAudit } from './index';

describe('content integrity audit', () => {
  const { results, summary } = runAudit();

  const failures = results.filter((r) => r.status === 'fail');
  const warnings = results.filter((r) => r.status === 'warn');

  it('surfaces the warnings (non-blocking)', () => {
    if (warnings.length === 0) {
      // eslint-disable-next-line no-console
      console.log('Content audit: no warnings.');
    } else {
      // eslint-disable-next-line no-console
      console.log(`Content audit warnings (non-blocking): ${warnings.length} check(s)`);
      for (const w of warnings) {
        // eslint-disable-next-line no-console
        console.log(`  ⚠ ${w.id} ${w.title} (${w.violations.length})`);
        for (const v of w.violations) {
          // eslint-disable-next-line no-console
          console.log(`      - ${v.message} [${v.location}]`);
        }
      }
    }
    expect(warnings.length).toBeGreaterThanOrEqual(0); // always passes; keeps the block runnable
  });

  it('has no error-severity content failures', () => {
    if (failures.length > 0) {
      const detail = failures
        .map((f) => {
          const lines = f.violations.map((v) => `      - ${v.message} [${v.location}]`);
          return `  ✗ ${f.id} ${f.title} (${f.violations.length})\n${lines.join('\n')}`;
        })
        .join('\n');
      throw new Error(
        `Content audit found ${failures.length} error-severity failure(s):\n${detail}\n` +
          `Summary: ${summary.passed} passed, ${summary.warnings} warnings, ${summary.failed} failed.`
      );
    }
    expect(failures).toHaveLength(0);
  });
});
