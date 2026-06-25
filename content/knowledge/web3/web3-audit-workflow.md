---
name: web3-audit-workflow
description: >-
  Pre-audit readiness, tooling (Slither, Echidna, Halmos, Certora), CI integration, firm selection, timing, remediation,
  and post-launch bug bounties for protocol teams preparing for a smart-contract audit
topics:
  - web3
  - audit
  - slither
  - echidna
  - halmos
  - security
volatility: fast-moving
last-reviewed: 2026-06-25
version-pin: null
sources:
  - url: https://consensys.github.io/smart-contract-best-practices/
    hash: sha256:c36192265bf3322e75552f73527415de8a6b34b481ec6b2cfa2e12b52b329dbe
    retrieved: 2026-06-25
  - url: https://swcregistry.io/
    hash: sha256:ed54ed99fdbb30267dfb0a4c3d52013f8a873b3dc1e3b29d14e01485b0b64218
    retrieved: 2026-06-25
  - url: https://docs.openzeppelin.com/contracts/5.x/
    hash: sha256:f168332e431c2100829530c37eed1302e93a3367915d1053fcaf72805c6f3d9f
    retrieved: 2026-06-25
---

Audits are expensive ($30k–$500k+) and time-consuming, and the meter starts the day the auditors open your repo — not the day they find their first bug. A team that hands over a half-finished spec, 40% test coverage, and a Slither report full of unaddressed mediums is paying senior security engineers to do the work the team should have done before kickoff. The protocols that get the most out of an audit treat the engagement as a final review against work already proven correct, not as a substitute for it. Maximize value by being ready before the audit starts.

## Summary

Walk into the audit with a written spec, >90% line and >80% branch coverage, a green Slither CI gate, a committed threat model, and a testnet-deployed contract — anything less and you are paying $5k/day for engineers to fill in your gaps. Wire `Slither` into every PR as a blocking check, layer `Echidna` and `Halmos` over invariant tests for the critical paths, and reserve `Certora` for high-TVL functions where formal verification pays for itself. Pick the firm to match the stakes: top-tier (Trail of Bits, OpenZeppelin, Consensys Diligence, Spearbit, Cantina) for serious TVL, competitive platforms (Code4rena, Sherlock, Cantina) for cost-sensitive scope. Book 2–4 months ahead, freeze code 1–2 weeks before kickoff, fix every High and Medium with a test plus an auditor re-verification, then run an `Immunefi` bounty continuously after launch.

## Deep Guidance

### Pre-audit readiness checklist

Work this list in order. Each item is a precondition for the next; skipping one means the auditors spend their hours on what you should have shipped. A useful mental test: pretend you are paying $5,000/day out of your own pocket for each engineer on the audit. Would you rather they spend day one orienting on your README, or finding bugs? Every gap in this checklist trades day-zero engineering hours of your own for day-one auditor hours that cost ten times as much.

1. **Specification document with invariants explicitly listed.** "Total supply equals sum of balances," "no user withdraws more than they deposited," "only governance can change fee tiers," "the protocol is solvent at every block." Auditors cannot tell you whether your code is correct against an undefined target — without invariants they are reduced to pattern-matching for known vulnerabilities, which is the cheapest, lowest-value mode of audit work. The spec also becomes the artifact the audit report references, so a thin spec produces a thin report. Cross-ref `web3-requirements.md` for the spec template and invariant style.
2. **>90% line coverage, >80% branch coverage.** Generated via `forge coverage --report lcov` and enforced in CI. Anything less means auditors are reviewing code paths your tests have never executed, and they will flag those paths as untested rather than as subtly broken — wasting findings on hygiene. Aim higher on the contracts that touch funds (95%+) and accept lower on view-only helpers if the budget is tight. Cross-ref `web3-testing.md` for the fuzz and invariant patterns that make coverage meaningful rather than ceremonial.
3. **`forge test --gas-report` baseline captured.** Commit the report as `gas-snapshot.txt` at the repo root. Auditors flag gas regressions and griefing vectors (loops that scale with user count, unbounded storage growth); without a baseline you cannot tell whether a remediation fix made gas worse, and reviewers cannot tell whether a hot path you claim is "cheap" actually is.
4. **Slither CI gate green.** Zero high/medium findings, or each one annotated with a justification comment that survives review. Auditors who open the repo and see a wall of unaddressed Slither warnings will assume the rest of the codebase is held to the same standard, and price the engagement accordingly. See the next section for the config.
5. **Threat model document committed.** Who are the attackers (MEV searchers, governance attackers, malicious LPs, compromised oracles), what are their capabilities (flashloans, large stake, validator control, social engineering), what assets are at risk (TVL, governance tokens, NFT ownership), and what assumptions does the protocol make about external contracts and oracles. A short doc — one page is fine — that frames the audit conversation and makes implicit assumptions explicit.
6. **Deployment scripts tested on a public testnet.** Sepolia, Base Sepolia, Arbitrum Sepolia — whichever matches your target. Auditors should be able to interact with a live deployment, not just read source. A working testnet deployment also flushes out the deploy-script bugs (mis-ordered constructor args, wrong proxy admin, forgotten role grants) that are easy to miss in unit tests but catastrophic on mainnet.
7. **README with architecture, contracts list, deployment addresses.** A one-paragraph mental model per contract, a diagram of how they call each other, the testnet addresses, and a "how to run the tests" section that works from a clean checkout. Saves the auditors a full day of orientation that you are otherwise paying for.

### Mandatory tooling: Slither

`Slither` is the static-analysis baseline for Solidity. It is free, fast, catches a wide class of footguns (reentrancy, uninitialized storage, shadowed variables, incorrect ERC-20 returns), and runs in under a minute on most repos. Install once, run on every PR, fail the build on regressions.

```bash
pip install slither-analyzer
slither . --config-file .slither.config.json
```

Minimal `.slither.config.json`:

```json
{
  "filter_paths": "lib/|test/|script/",
  "exclude_informational": true,
  "exclude_low": false,
  "fail_high": true,
  "fail_medium": true
}
```

The CI rule is simple: zero high and zero medium findings unless explicitly justified with a `// slither-disable-next-line <detector>` comment naming the detector and the reason. Every disable is a claim the team is making in writing; auditors will read them and push back on weak ones.

Slither also has a `slither-mutate` mode for mutation testing — useful but slow, run it weekly rather than per-PR. The `--print human-summary` flag produces a one-screen overview that is excellent to commit as `slither-summary.txt` for auditors to skim during orientation. Complement Slither with `Aderyn` (Cyfrin's Rust-based static analyzer) for a second-opinion pass; the detectors overlap but each catches a small set the other misses.

### Recommended tooling: Echidna, Halmos, Certora

Static analysis catches patterns; dynamic and symbolic tools catch logic. Each tool answers a different question, and they stack rather than substitute.

- **`Echidna`** — property-based fuzzing from Trail of Bits. Extends Foundry invariant tests with smarter input generation: a maintained corpus that survives between runs, shrinking of failing sequences to minimal reproductions, and coverage-guided exploration that biases toward unvisited branches. Reach for it when your Foundry invariant tests pass too quickly to trust — Echidna will find the input you didn't think to write, and produces a replayable test case when it does. The cost is wiring up a config and learning to write properties in its slightly different style; budget half a day per contract.
- **`Halmos`** — open-source formal verification via symbolic execution from a16z. Where Echidna explores by sampling, Halmos explores by symbolically encoding all input values within a bound and asking an SMT solver whether the property can be violated. Great for path-explosion analysis on small, critical functions: pricing math, share calculations, access-control checks, ERC-4626 share/asset round-trips. Free, fast on bounded loops (it struggles with unbounded ones), and crucially it runs against the same `forge test` signatures you already have — write a `check_*` test that asserts the property, point Halmos at it, and get a proof or a counterexample.
- **`Certora`** — commercial formal verification. The gold standard, used by Aave, Compound, MakerDAO, and Lido. Demands a separate specification language (CVL — Certora Verification Language) and an engagement model where Certora engineers help write the spec, but the result is a machine-checked proof against arbitrary state evolution rather than a sample of cases. Expensive — six figures for a real engagement — and slow to start, so reserve it for the most consequential invariants on a high-TVL protocol where the cost of being wrong dwarfs the cost of being thorough.

The reach order is cumulative, not exclusive: invariant tests on every state-changing function first, Echidna on the critical contracts that handle funds, Halmos on the highest-stakes pure functions (math, accounting), Certora only if TVL or systemic importance justifies the budget. A protocol that ships with all four is rare and signals seriousness to the ecosystem.

### CI integration

Run static analysis, tests, and coverage on every PR — not nightly, not weekly, every PR. Quality gates that run after merge catch bugs after they have already been reviewed by humans operating under the assumption that the suite is green. A representative GitHub Actions snippet:

```yaml
name: audit-readiness
on: [pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { submodules: recursive }
      - uses: foundry-rs/foundry-toolchain@v1
      - uses: actions/setup-python@v5
        with: { python-version: "3.11" }
      - run: pip install slither-analyzer
      - run: forge build --sizes
      - run: forge test -vvv
      - run: forge coverage --report lcov
      - run: slither . --config-file .slither.config.json
      - name: enforce coverage floor
        run: |
          line_pct=$(grep -m1 'lines\.\.\.\.\.\.' lcov.info.summary | awk '{print $2}' | tr -d '%')
          awk "BEGIN { exit !($line_pct >= 90) }" || { echo "coverage below 90%"; exit 1; }
```

Add a coverage threshold check (e.g., `lcov-summary` or the inline script above) so the build fails when line coverage drops below 90%. Coverage that only goes up is the only coverage gate that keeps a test suite honest — a soft target lets a Friday-afternoon PR shave a percent and then never recover. Wire the Slither output to a PR comment so reviewers see new findings inline rather than digging through CI logs; both `crytic/slither-action` and a custom step that posts via `gh pr comment` work fine.

Long-running checks (Echidna campaigns, Halmos runs over the full critical surface) belong on a separate nightly or pre-release workflow, not the PR gate — a 30-minute fuzz run on every push burns CI minutes and trains the team to ignore failures. Keep the PR gate fast (<5 minutes) and reserve the slower campaigns for tagged releases and the final pre-audit freeze.

### What auditors actually do during the engagement

Knowing the workflow on the other side helps you prepare what they need. A typical engagement runs in three phases:

1. **Orientation (days 1–3).** Reading the spec, the README, and the source. Building a mental model, drawing call graphs, identifying trust boundaries. This phase is entirely paid for by your documentation quality — a great spec compresses this to a day, a missing one stretches it to a week.
2. **Active review (days 4 through N−2).** Running tools (Slither, Aderyn, custom semgrep rules, sometimes Echidna or Halmos against the firm's internal property libraries), reading code adversarially against the spec, writing PoC exploits for suspected bugs. This is where bugs are found. Your responsiveness here directly translates to findings.
3. **Reporting (final 2 days).** Writing up findings with severity, impact, recommendation, and PoC. Each finding takes hours to write well; a firm that finds 20 bugs in week one and spends week two writing them up is doing exactly the right thing, even if it looks like they "stopped finding bugs."

If your audit appears to slow down halfway through, that is usually the firm transitioning from phase 2 to phase 3, not running out of material.

A few interaction norms that auditors appreciate and many teams skip: keep the Slack/Discord channel open for the full engagement, not just business hours; do not push code to the audited branch (use a `post-audit-fixes` branch instead); confirm receipt of each finding within a day so the firm knows the report landed; and resist the urge to argue severity in writing — every back-and-forth on "this should be Medium not High" burns hours that could go to finding the next bug. Severity disputes are a small final-call meeting at the end, not a running thread.

### Choosing an audit firm

Match the firm to the stakes. The wrong firm for the wrong protocol wastes money in both directions — overpaying a top-tier firm to review a 200-line vault, or sending a complex cross-chain protocol to a competitive audit that lacks the senior architectural review it needs.

- **High-TVL or novel protocols** — top-tier private engagements: `Trail of Bits`, `OpenZeppelin`, `Consensys Diligence`, `Spearbit`, `Cantina`. Expect $50k–$500k+ for two to six weeks with two or three senior engineers. These firms produce public reports the ecosystem trusts, which is itself a marketing asset on launch day. Each has a flavor: Trail of Bits is rigorous and broad, OpenZeppelin is deep on standards and patterns they helped define, Consensys Diligence is strong on EVM internals, Spearbit and Cantina pool elite independent researchers under a coordinator.
- **Lower TVL or budget-constrained** — competitive audits: `Code4rena`, `Sherlock`, `Cantina` contests. A wide pool of reviewers competes for a fixed prize pool. Cheaper, faster turnaround, more findings by volume, but less narrative analysis of architectural risk — you get a list of bugs, not a coherent picture of how the system might fail. Pair with a short private review if the protocol is non-trivial. Sherlock additionally backs findings with a payout guarantee that functions like insurance.
- **Pre-audit pass** — a one-week private review from a solo security researcher (many ex-firm engineers freelance on Cantina or Twitter) is a cheap way to shake out the obvious bugs before the main audit, so the firm spends its time on the subtle ones rather than the embarrassing ones.

Never rely on a single audit for a complex protocol. Two firms in series, or one firm plus a competitive audit, finds materially more bugs than either alone — the second reviewer sees what the first missed precisely because they came in fresh, and the cost is roughly additive while the bug-discovery rate is more than additive. For high-TVL launches, three layers (private firm → competitive audit → ongoing bounty) is the modern standard.

### Writing the audit RFP

When reaching out to a firm or platform, send a single document with: protocol summary in two paragraphs, line count in scope (split by `cloc src/`), spec + threat model attached, current test coverage numbers, the SHA you intend to freeze on, the launch date you are targeting, and your budget range. Firms reply faster and more concretely to specific asks than to "we'd like to audit our protocol, please send pricing." Naming the specific contracts in scope (not "all contracts") and explicitly excluding test helpers and deploy scripts from the line count keeps the quote tight and honest. If you need an NDA, send it with the first email — the back-and-forth otherwise burns a week.

### Audit timing and process

Book 2–4 months ahead — the firms worth hiring are booked out, and the last-minute slots that do appear come from teams whose contracts slipped, which is not a market you want to be buying into. When you reach out, send the spec, the threat model, the test coverage numbers, and a one-page protocol summary; firms triage proposals by readiness, and a well-prepared inquiry gets a better slot than a vague one even with similar timing.

Code freeze 1–2 weeks before the audit start date: no new features, only documentation, additional tests, and bug fixes against issues you find internally during the freeze. Tag the commit (`v1.0-audit-start`) and share that exact SHA with the firm in writing. Do not change scope mid-audit — every change invalidates findings the auditors already wrote against the prior version and forces them to redo work you are paying for at $5k/day. If a serious bug is discovered internally during the audit, fix it on a side branch and hand the patch to the auditors as a "fix to verify" rather than rebasing main.

During the audit, be responsive. Auditors will ask design questions ("is this rounding direction intentional?"), request access to off-chain components (subgraphs, keeper scripts), and float hypotheses they want confirmed before writing them up. A 24-hour response time is fine; a four-day silence wastes a full senior-engineer-day of audit budget per question. Designate one team member as the audit liaison so questions land in one place and answers come from one source — fragmented responses from three engineers produce contradictory context the auditors then have to reconcile.

### Post-audit remediation

Every High and Medium finding gets three things: a fix, a test that would have caught the bug (regression coverage that lives in the repo forever), and a re-verification pass from the auditor against the actual fix commit. Lows and informationals get triaged — fix the cheap ones, document the rest with a written rationale in a remediation appendix. Do not close a finding because the fix "looks right" or "the test passes" — the auditor's re-verification is the only signal that matters, because most bad fixes pass the obvious test and fail a subtler condition the auditor noticed but did not write up.

Publish the report after fixes land. Do not hide findings — the community can spot a hidden bug from on-chain behavior, and a transparent disclosure with a remediation appendix is a credibility asset that pays back over the protocol's lifetime. Include the commit hash that addressed each finding so anyone can verify the fix independently. Hiding a Critical finding is the worst-case mode: it discredits the team, invalidates the audit's value as a signal, and historically precedes the exploit by weeks.

### Bug bounty post-launch

Audits are a snapshot; bug bounties are continuous. List on `Immunefi` (or Cantina, or both) for protocol-grade payouts with a tiered, TVL-scaled payout table — typical curves are $50k for critical low-TVL bugs, $250k–$500k for mid-TVL, $1M–$2M+ for critical high-TVL findings. A $10k bounty on a $100M protocol is an insult to whitehats and an invitation to blackhats: a sophisticated researcher who finds a critical bug will rationally sell it on the open market unless your bounty pays meaningfully more than the bug is worth exploited.

Run the bounty continuously, not for a launch week and then off — most exploitable bugs are found weeks or months after deployment, by researchers who only look at protocols with live, well-funded, fast-paying programs. Pay quickly when reports land (within days, not weeks), grade reports honestly against the published tier table, and publish post-mortems for valid findings so the next researcher trusts you. A program that ghosts researchers or downgrades findings to underpay loses access to the whitehat community within one cycle.

Define the scope precisely in the bounty listing — which contracts, which networks, which versions, and what is explicitly out-of-scope (frontend bugs, off-chain infra, social engineering). Vague scope produces low-quality reports and disputes over payout. Include a "safe harbor" clause so researchers know exploit-style testing on testnet (or sometimes on a forked mainnet) is welcome rather than legally fraught. Immunefi's template legal language is the de facto industry standard; adapt it rather than writing your own.

### Anti-patterns to avoid

A few patterns reliably destroy audit value, and the firms see them constantly.

- **Booking the audit before the code is ready.** "We'll be done by then" almost never holds. Slipping the freeze date by a week to fit the booked slot leaves a half-finished codebase under review, which produces a half-useful report. Either delay the audit or pay a partial rebooking fee — both are cheaper than a shallow review of unfinished code.
- **Changing scope mid-audit.** Adding a contract on day 4 of a 10-day audit invalidates the threat-model assumptions auditors are reasoning from. Hold new scope until the next engagement.
- **Treating audit findings as optional.** Every High and Medium is a real finding even if "we don't think it's exploitable" — auditors qualify severity, not exploitability under your current threat model, and threat models change post-launch.
- **Hiring the cheapest firm to check a box for investors.** A weak audit from a low-reputation firm is worse than no audit, because it manufactures false confidence. Investors and integrators who know the space recognize the difference; a $20k audit on a $50M protocol reads as negligence, not frugality.
- **Skipping the bounty because "we already audited."** Audits are a snapshot; bounties are continuous. Every protocol that has been exploited had been audited.
- **Ignoring informational findings.** Many of yesterday's High-severity exploits started as last year's "Informational" notes the team didn't bother to fix. An informational finding is still a real signal about your design — treat it as a free pre-warning, not as noise.
- **Auditing the same contracts repeatedly while leaving glue code unaudited.** Deployment scripts, multisig configuration, upgrade procedures, off-chain keepers, and frontend transaction construction are all attack surface. Several high-profile exploits have targeted exactly these — a perfectly audited contract called incorrectly by a buggy frontend or initialized wrong by an unaudited script. Scope at least one engagement around the operational glue.
