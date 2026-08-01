/**
 * Product-stage calibration for the severity rubric.
 *
 * The same defect is worth different things at different stages. A missing test
 * for an internal helper is noise in a prototype and a real gap in production;
 * an inconsistency nobody can reach yet matters less than one shipping to
 * users. Without a stage, the core rubric's own calibration applies unchanged.
 *
 * These presets REPLACE a marker inside the severity section rather than
 * appending advice after it. Advice appended at the end competes with the
 * rubric; text inside it is read as part of the definition, which is what
 * "change what counts as P1 versus P2" requires.
 */
export const STAGES = ['prototype', 'mvp', 'production'] as const

export type Stage = (typeof STAGES)[number]

/**
 * Every preset states which direction it moves findings and names the floor it
 * cannot cross. The floor is not decoration: a stage that could soften a
 * security or data-loss finding would be a vulnerability filter with a
 * configuration flag, and `prototype` is the stage most likely to be set on the
 * codebase least able to absorb one.
 */
const CALIBRATION: Record<Stage, string> = {
  prototype: [
    'Stage: PROTOTYPE. The code is proving an idea works. Nobody depends on it yet,',
    'and most of it will be rewritten or deleted.',
    '',
    'These adjust the GRADING of findings that already clear the Reporting Bar',
    'below. A state nothing can reach is not reported at any stage.',
    '',
    'A correctness finding this stage grades P3 is still REPORTED. The P3 rule',
    '"only report if nothing else found" governs trivia and preference, never a',
    'defect demoted by stage — the stage lowers what it costs to ship, not',
    'whether the reader gets to see it.',
    '',
    '- Grade correctness findings by whether they break the path the code is meant',
    '  to demonstrate. A reachable bug on any other path is P3, not P1.',
    '- Missing tests are P3 unless the logic they would cover is the thing being',
    '  proven.',
    '- Naming, structure, duplication and documentation are P3. Do not spend a P2',
    '  on them.',
    '- Prefer findings that say what to delete over findings that say what to add.',
    '',
    'Unchanged at this stage: security, data loss, and data corruption are graded',
    'exactly as the rubric above defines them. A prototype handling real',
    'credentials or real user data can hurt people as easily as a shipped system,',
    'and this is the stage where that is most often forgotten.',
  ].join('\n'),

  mvp: [
    'Stage: MVP. Real users depend on this, but the system is small and changing',
    'fast, and most code is still cheap to replace.',
    '',
    'These adjust the GRADING of findings that already clear the Reporting Bar',
    'below. A state nothing can reach is not reported at any stage.',
    '',
    'A correctness finding this stage grades P3 is still REPORTED. The P3 rule',
    '"only report if nothing else found" governs trivia and preference, never a',
    'defect demoted by stage — the stage lowers what it costs to ship, not',
    'whether the reader gets to see it.',
    '',
    '- Grade correctness findings by traffic. A bug in a flow users exercise',
    '  routinely is P1; one on a rare or internal-only path is P3.',
    '- Missing tests are P2 for logic users depend on, P3 otherwise.',
    '- Naming, structure and duplication are P3 unless they are already causing',
    '  bugs, in which case grade the bug.',
    '',
    'Unchanged at this stage: security, data loss, and data corruption are graded',
    'exactly as the rubric above defines them.',
  ].join('\n'),

  production: [
    'Stage: PRODUCTION. The system is depended upon, changes are expensive to',
    'reverse, and the cost of a defect is paid by people who did not choose it.',
    '',
    'These adjust the GRADING of findings that already clear the Reporting Bar',
    'below. A state nothing can reach is not reported at any stage.',
    '',
    'A correctness finding this stage grades P3 is still REPORTED. The P3 rule',
    '"only report if nothing else found" governs trivia and preference, never a',
    'defect demoted by stage — the stage lowers what it costs to ship, not',
    'whether the reader gets to see it.',
    '',
    '- Grade correctness findings on impact, not on how often they occur. A rare',
    '  failure in a user-facing path is P1.',
    '- Missing tests for changed behavior are P1 when that behavior is',
    '  user-facing or hard to reverse, and P2 otherwise.',
    '- Inconsistency, unclear naming in long-lived interfaces, and undocumented',
    '  behavior are P2 — they are how the next defect gets written.',
    '- Backward compatibility and migration safety are correctness concerns here,',
    '  not style ones.',
  ].join('\n'),
}

/**
 * The calibration block for a stage, or an empty string when none is set.
 *
 * Empty rather than a default preset: a project that never opts in must get the
 * prompt it got before stages existed, byte for byte.
 */
export function stageCalibration(stage: Stage | undefined): string {
  if (stage === undefined) return ''
  return CALIBRATION[stage]
}
