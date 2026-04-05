<!-- eval-wip -->
---
name: game-testing-strategy
description: Simulation logic testing, visual and performance regression, soak testing, balance validation, playtest protocols, and CI integration
topics: [game-dev, testing, playtesting, soak, balance, visual-regression]
---

Game testing spans a far wider range than typical software testing. Beyond unit and integration tests for code, games require visual regression testing (did the shader change break the look of every material?), performance regression testing (did the new particle system push frame time over budget?), soak testing (does the game crash after 48 hours of continuous play?), balance validation (is the new weapon overpowered?), and structured playtesting with real humans. Each testing layer catches a different class of defect, and skipping any layer means shipping that class of bug to players.

## Summary

### Testing Layers for Games

Game testing is organized into layers, each targeting different risk categories:

1. **Simulation Logic Tests** — Automated tests that verify game rules, state machines, inventory calculations, damage formulas, AI decision logic, and other systems that can be isolated from rendering and input. These run fast, headlessly, and in CI. Frame as "simulation logic" rather than "deterministic" — true determinism is nearly impossible when standard Unity/Unreal physics engines introduce floating-point non-determinism across platforms and frame rates.

2. **Integration Tests** — Tests that verify interactions between subsystems: does picking up an item correctly update the inventory UI, play the pickup sound, trigger the quest objective, and despawn the world object? Requires a running game instance but can be automated with scripted input.

3. **Visual Regression Tests** — Screenshot comparison tests that detect unintended visual changes. Capture baseline screenshots of key scenes and compare against new builds pixel-by-pixel (with a threshold for acceptable variation). Catches shader bugs, broken materials, missing textures, and lighting changes.

4. **Performance Regression Tests** — Automated frame timing measurements against budgets. Run standardized benchmark scenarios and fail the build if P95 frame time exceeds the target. Catches performance regressions before they compound.

5. **Soak Tests** — Extended-duration tests (24–72 hours) that detect memory leaks, resource exhaustion, crash bugs, and degradation over time. Essential for live-service games and any game where players leave sessions running.

6. **Balance Validation** — Automated simulation of thousands of combat encounters, economy transactions, or progression paths to detect statistical outliers. Not a substitute for human judgment but catches egregious balance errors before playtesting.

7. **Playtest Sessions** — Structured observation of real players interacting with the game. Captures UX issues, difficulty spikes, confusion points, and emotional responses that no automated test can detect.

8. **Compatibility Testing** — Testing across target hardware configurations, OS versions, driver versions, and peripheral combinations. Console certification testing is a specialized form of compatibility testing.

### Simulation Logic Testing Principles

Simulation logic tests are the backbone of automated game testing. They verify the rules of the game without requiring a running renderer, audio system, or input device.

**What to test as simulation logic:**
- Damage calculations, healing, buff/debuff application and duration
- Inventory operations (add, remove, stack, split, capacity limits)
- Quest state transitions (objectives completed, prerequisites met)
- AI decision trees and utility scores given known inputs
- Crafting recipes (valid combinations, resource consumption, output)
- Economy transactions (buy, sell, trade, currency conversion)
- Spawn rules (wave composition, difficulty scaling, spawn point selection)
- Save/load round-trip fidelity (save state, load state, verify equivalence)

**What is NOT suitable for simulation logic tests:**
- Rendering correctness (use visual regression)
- Input feel and responsiveness (use playtesting)
- Audio mixing and spatialization (use listening sessions)
- Physics emergent behavior (use integration tests with replay)
- Performance characteristics (use performance regression)

### Automated Replay Systems

Replay systems record player input and game state, then replay them to reproduce bugs, run regression tests, and generate screenshots for visual comparison.

## Deep Guidance

### Simulation Logic Test Implementation

The key to testable game logic is separating simulation from presentation. Game logic that depends on MonoBehaviour lifecycle, Update loops, or renderer state is untestable in isolation. Extract logic into plain classes.

```csharp
// GOOD: Testable damage calculation — pure function, no engine dependencies
public static class DamageCalculator
{
    public struct DamageInput
    {
        public float BaseDamage;
        public float AttackerLevel;
        public float DefenderArmor;
        public float DefenderLevel;
        public DamageType Type;
        public float CritMultiplier;  // 1.0 = no crit
        public float[] ActiveBuffMultipliers;
        public float[] ActiveDebuffMultipliers;
    }

    public struct DamageResult
    {
        public float RawDamage;
        public float MitigatedDamage;
        public float FinalDamage;
        public bool WasResisted;
        public bool WasLethal;
    }

    public static DamageResult Calculate(DamageInput input, float defenderCurrentHP)
    {
        // Step 1: Base damage with level scaling
        float levelDelta = input.AttackerLevel - input.DefenderLevel;
        float levelScalar = Mathf.Clamp(1f + (levelDelta * 0.05f), 0.5f, 2.0f);
        float raw = input.BaseDamage * levelScalar * input.CritMultiplier;

        // Step 2: Apply attacker buffs (multiplicative stacking)
        float buffTotal = 1f;
        foreach (float buff in input.ActiveBuffMultipliers)
            buffTotal *= buff;
        raw *= buffTotal;

        // Step 3: Apply defender debuffs
        float debuffTotal = 1f;
        foreach (float debuff in input.ActiveDebuffMultipliers)
            debuffTotal *= debuff;
        raw *= debuffTotal;

        // Step 4: Armor mitigation (diminishing returns formula)
        float armorReduction = input.DefenderArmor / (input.DefenderArmor + 100f);
        float mitigated = raw * (1f - armorReduction);

        // Step 5: Floor at 1 damage (no zero-damage hits)
        float final_dmg = Mathf.Max(1f, mitigated);

        return new DamageResult
        {
            RawDamage = raw,
            MitigatedDamage = mitigated,
            FinalDamage = final_dmg,
            WasResisted = armorReduction > 0.8f,
            WasLethal = final_dmg >= defenderCurrentHP,
        };
    }
}

// Test class — runs in NUnit/xUnit without Unity Editor
[TestFixture]
public class DamageCalculatorTests
{
    [Test]
    public void SameLevelNoCritNoArmor_ReturnsBaseDamage()
    {
        var input = new DamageCalculator.DamageInput
        {
            BaseDamage = 100f,
            AttackerLevel = 10f,
            DefenderLevel = 10f,
            DefenderArmor = 0f,
            CritMultiplier = 1f,
            ActiveBuffMultipliers = new float[0],
            ActiveDebuffMultipliers = new float[0],
        };
        var result = DamageCalculator.Calculate(input, 500f);
        Assert.AreEqual(100f, result.FinalDamage, 0.01f);
        Assert.IsFalse(result.WasLethal);
    }

    [Test]
    public void HighArmor_ReducesDamageWithDiminishingReturns()
    {
        var input = new DamageCalculator.DamageInput
        {
            BaseDamage = 100f,
            AttackerLevel = 10f,
            DefenderLevel = 10f,
            DefenderArmor = 400f,  // 400/(400+100) = 80% reduction
            CritMultiplier = 1f,
            ActiveBuffMultipliers = new float[0],
            ActiveDebuffMultipliers = new float[0],
        };
        var result = DamageCalculator.Calculate(input, 500f);
        Assert.AreEqual(20f, result.FinalDamage, 0.01f);
        Assert.IsTrue(result.WasResisted);  // >80% mitigation
    }

    [Test]
    public void MinimumDamage_NeverBelowOne()
    {
        var input = new DamageCalculator.DamageInput
        {
            BaseDamage = 1f,
            AttackerLevel = 1f,
            DefenderLevel = 50f,
            DefenderArmor = 9999f,
            CritMultiplier = 1f,
            ActiveBuffMultipliers = new float[0],
            ActiveDebuffMultipliers = new float[0],
        };
        var result = DamageCalculator.Calculate(input, 500f);
        Assert.GreaterOrEqual(result.FinalDamage, 1f);
    }
}
```

### Visual Regression Testing

Visual regression tests capture screenshots of specific game scenes and compare them against approved baselines to detect unintended visual changes.

**Implementation approach:**

1. Define a set of "visual test scenes" — minimal scenes that isolate specific visual features (a scene with only the skybox, a scene with a character under standard lighting, a scene with all UI elements visible)
2. Write an automated script that loads each scene, waits for rendering to stabilize, and captures a screenshot at a fixed resolution
3. Compare each screenshot against the approved baseline using a pixel-difference algorithm with a configurable threshold (typically 0.1–1% pixel difference tolerance)
4. Fail the build if any scene exceeds the threshold

**Screenshot comparison pipeline:**

```python
# visual_regression.py — Compare screenshots against baselines
# Requires: Pillow (PIL)

from PIL import Image, ImageChops
import os
import sys
from pathlib import Path

BASELINE_DIR = Path("tests/visual/baselines")
CURRENT_DIR = Path("tests/visual/current")
DIFF_DIR = Path("tests/visual/diffs")
THRESHOLD_PERCENT = 0.5  # Max acceptable pixel difference

def compare_images(baseline_path: Path, current_path: Path) -> tuple[float, Path]:
    """Compare two images, return difference percentage and diff image path."""
    baseline = Image.open(baseline_path).convert("RGB")
    current = Image.open(current_path).convert("RGB")

    if baseline.size != current.size:
        raise ValueError(
            f"Size mismatch: baseline={baseline.size}, current={current.size}"
        )

    diff = ImageChops.difference(baseline, current)
    # Convert to grayscale for simpler analysis
    diff_gray = diff.convert("L")

    # Count pixels that differ by more than a small noise threshold
    pixels = list(diff_gray.getdata())
    total_pixels = len(pixels)
    changed_pixels = sum(1 for p in pixels if p > 10)  # ignore noise < 10/255
    diff_percent = (changed_pixels / total_pixels) * 100

    # Save diff image (amplified for visibility)
    diff_amplified = diff_gray.point(lambda x: min(255, x * 10))
    diff_path = DIFF_DIR / f"diff_{baseline_path.stem}.png"
    diff_amplified.save(diff_path)

    return diff_percent, diff_path

def main():
    DIFF_DIR.mkdir(parents=True, exist_ok=True)
    failures = []

    for baseline_file in sorted(BASELINE_DIR.glob("*.png")):
        current_file = CURRENT_DIR / baseline_file.name
        if not current_file.exists():
            failures.append(f"MISSING: {baseline_file.name} — no current screenshot")
            continue

        try:
            diff_pct, diff_path = compare_images(baseline_file, current_file)
            status = "PASS" if diff_pct <= THRESHOLD_PERCENT else "FAIL"
            print(f"  {status}: {baseline_file.name} — {diff_pct:.2f}% difference")
            if diff_pct > THRESHOLD_PERCENT:
                failures.append(
                    f"{baseline_file.name}: {diff_pct:.2f}% diff "
                    f"(threshold: {THRESHOLD_PERCENT}%) — see {diff_path}"
                )
        except ValueError as e:
            failures.append(f"ERROR: {baseline_file.name} — {e}")

    if failures:
        print("\nVISUAL REGRESSION FAILURES:")
        for f in failures:
            print(f"  {f}")
        print("\nTo update baselines (after visual review):")
        print(f"  cp {CURRENT_DIR}/*.png {BASELINE_DIR}/")
        sys.exit(1)
    else:
        print(f"\nAll {len(list(BASELINE_DIR.glob('*.png')))} visual tests passed.")

if __name__ == "__main__":
    main()
```

### Performance Regression Testing

Performance regression tests run standardized gameplay scenarios and measure frame timing, memory usage, and draw call counts against defined budgets.

**Automated benchmark framework:**

1. Define benchmark scenarios as recorded input sequences or scripted camera paths that exercise specific subsystems (combat encounter, dense environment, UI-heavy screen)
2. Run each scenario for a fixed duration (30–60 seconds) while capturing frame timing data
3. Calculate P50, P95, P99 frame times and compare against per-scenario budgets
4. Track results over time to detect gradual degradation (a 0.5ms regression per week compounds to 2ms over a month)

**Metrics to capture per benchmark:**
- Frame time: P50, P95, P99, max
- CPU time: total and per-subsystem (physics, AI, rendering prep, audio)
- GPU time: total and per-pass (shadows, lighting, post-process)
- Draw calls: average and peak
- Memory: peak allocated, peak committed, GC pause count and duration
- Loading time: scene load duration

**Regression detection:**
- Compare against the previous successful build (catch immediate regressions)
- Compare against a weekly rolling baseline (catch gradual drift)
- Alert on any P95 frame time increase greater than 1ms
- Alert on any memory increase greater than 50MB
- Alert on any draw call increase greater than 500

### Soak Testing

Soak tests run the game continuously for 24–72 hours to detect issues that only manifest over extended play sessions.

**What soak tests catch:**
- Memory leaks (gradual allocation growth that eventually exhausts available memory)
- Handle leaks (file handles, GPU resources, network sockets not properly released)
- Numerical drift (floating-point accumulation errors in world position, camera, or physics)
- State corruption (rare race conditions that require thousands of iterations to trigger)
- Server stability (for multiplayer: connection handling, session management, database growth)

**Soak test implementation:**
1. Create an automated player that loops through core gameplay: load level, play for 10 minutes, return to menu, load next level, repeat
2. Log memory usage, frame time, and error counts every 60 seconds
3. After the soak period, analyze the time-series data for upward trends in memory or downward trends in frame rate
4. Any error or crash during the soak period is a P0 bug — the game must be stable for at least 72 hours

**Soak test analysis:**
- Plot memory usage over time — a linear upward trend indicates a leak
- Plot frame time over time — upward drift indicates resource accumulation
- Count unique error messages — any new error type appearing after hour 1 suggests time-dependent issues
- Monitor GC frequency — increasing GC frequency indicates allocation pressure building

### Balance Validation

Automated balance testing simulates thousands of game scenarios to detect statistical outliers in combat, economy, or progression systems.

**Monte Carlo combat simulation:**
- Simulate 10,000 encounters for each enemy type against a reference player build
- Record win rate, average time-to-kill, average damage taken, healing consumed
- Flag any encounter where win rate deviates more than 10% from the design target
- Flag any weapon/ability where usage rate in simulated optimal play exceeds 60% (dominance indicator)

**Economy simulation:**
- Simulate 1,000 player progression paths through the game's economy
- Track currency accumulation rate, item acquisition rate, and power growth curve
- Flag if any path results in a player being unable to afford required purchases (soft lock)
- Flag if any path results in currency accumulation exceeding 3x the intended rate (exploit indicator)

### Playtest Protocol

Structured playtesting follows a repeatable protocol to produce actionable data.

**Pre-session setup:**
1. Define the playtest goals (e.g., "evaluate onboarding flow for new players" or "assess difficulty of World 3 boss")
2. Prepare the build — stable, no known crashes, telemetry enabled
3. Recruit appropriate testers (new players for onboarding tests, experienced players for difficulty tests, target demographic for overall feel)
4. Prepare observation forms with specific questions to answer

**During the session:**
- Observer does NOT help the player unless they are completely stuck for more than 3 minutes
- Record the session (screen + face cam if consented) for later review
- Note timestamps of confusion, frustration, delight, and surprise
- Track objective metrics: time to complete tutorial, deaths per section, items used

**Post-session:**
- Administer a short questionnaire (5–10 questions, Likert scale + free text)
- Conduct a brief interview asking about specific moments the observer noted
- Aggregate quantitative data across all testers in the session
- Create an actionable report: problems ranked by severity, frequency, and impact

### Compatibility Testing Matrix

Game compatibility testing covers hardware, OS, and peripheral variations.

```yaml
# compatibility_matrix.yaml — Minimum test configurations

pc:
  gpu_vendors: [nvidia, amd, intel]
  gpu_tiers:
    - name: min_spec
      example: "GTX 1060 / RX 580 / Arc A380"
      resolution: 1080p
      settings: low
    - name: recommended
      example: "RTX 3060 / RX 6700 XT"
      resolution: 1440p
      settings: high
    - name: high_end
      example: "RTX 4080 / RX 7900 XTX"
      resolution: 4K
      settings: ultra
  os: ["Windows 10 22H2", "Windows 11 23H2"]
  drivers: ["latest stable", "one version behind"]
  ram: [8GB, 16GB, 32GB]
  storage: [HDD, SATA_SSD, NVMe]

console:
  playstation:
    - PS5 (disc)
    - PS5 (digital)
    - PS5 Pro (if applicable)
  xbox:
    - Xbox Series X
    - Xbox Series S  # Lower GPU, lower memory — often the constraint
  switch:
    - Switch OLED (docked)
    - Switch OLED (handheld)
    - Switch Lite

mobile:
  ios:
    - iPhone 12 (min spec)
    - iPhone 14 (target)
    - iPhone 16 Pro (high end)
    - iPad Air (tablet layout)
  android:
    - Samsung Galaxy A54 (mid-range baseline)
    - Samsung Galaxy S24 (flagship)
    - Pixel 8 (stock Android)
    - Xiaomi device (custom Android skin)

peripherals:
  controllers:
    - Xbox Wireless Controller
    - DualSense (PS5)
    - Nintendo Pro Controller
    - Generic XInput gamepad
  input_devices:
    - Mouse + keyboard
    - Steam Deck controls
    - Touch screen (mobile)
  displays:
    - 16:9 (1080p, 1440p, 4K)
    - 21:9 ultrawide
    - 16:10 (Steam Deck, some laptops)
    - Variable refresh rate (G-Sync/FreeSync)
```

### Console Certification Test Procedures

Console platform holders require games to pass a certification test suite before they can be published. Failing certification delays launch.

**Common certification failure categories:**
- **Stability**: Crashes, hangs, or infinite loading screens during any reachable game state
- **Save data**: Failure to handle corrupted save data gracefully, save data exceeding platform limits, losing progress on unexpected power loss
- **User accounts**: Not handling sign-out during gameplay, not supporting multiple user profiles, not respecting parental controls
- **Network**: Not handling network disconnection gracefully, not displaying appropriate error messages, not respecting NAT types
- **Accessibility**: Missing subtitle options (required on some platforms), missing colorblind modes
- **Performance**: Frame rate below acceptable thresholds, loading times exceeding limits, memory budget violations

**Pre-certification checklist (internal):**
1. Complete a full playthrough with no crashes on each target SKU
2. Test every save/load path, including simulated storage full and corrupt save
3. Test network disconnection at every online-capable game state
4. Test controller disconnection and reconnection during gameplay
5. Test suspend/resume (PS5 rest mode, Xbox Quick Resume, Switch sleep)
6. Verify all required platform features (achievements/trophies, rich presence, cloud saves)
7. Run the platform holder's own pre-certification tool if available (Sony's submission checker, Microsoft's XR validation tool)

### Automated Replay Systems

Replay systems enable reproducible testing by recording and replaying game sessions.

**Recording approach:**
- Record input events (not game state) with frame-accurate timestamps
- Record the random seed used for the session
- Record the build version and content hash
- Store replays as compact binary files (typically 1–5 KB per minute of gameplay)

**Replay determinism challenges:**
- Standard Unity/Unreal physics engines are NOT frame-rate independent in a bit-exact sense — the same inputs at different frame rates produce slightly different outcomes
- Floating-point operations may produce different results across CPU architectures (x86 vs ARM)
- Multithreaded systems introduce ordering non-determinism
- Mitigation: run replays at a fixed timestep matching the recording, accept "close enough" validation rather than bit-exact reproduction, or implement a custom fixed-point simulation layer for competitive games that require exact replay

**Replay uses beyond testing:**
- Kill cam / highlight reel features
- Anti-cheat validation (replay suspicious sessions server-side)
- Player behavior analytics (aggregate replay data to find popular paths, death locations, cheese strategies)
- Regression testing (replay a library of sessions against new builds, flag any that diverge beyond threshold)
