---
name: game-performance-budgeting
description: Frame budget allocation, memory budgets per platform, GPU/draw call limits, loading targets, thermal constraints, and profiling tools
topics: [game-dev, performance, frame-budget, memory, gpu, optimization]
---

Performance budgeting is the discipline of allocating fixed time, memory, and GPU resource envelopes to each game subsystem and enforcing those limits throughout development. Unlike web performance where a slow page is merely annoying, a missed frame budget in a game causes visible hitches, input lag, and motion sickness in VR. Budgets must be established at project start, measured continuously with profiling tools, and treated as hard constraints — not aspirational targets.

## Summary

### Frame Budget Fundamentals

Every rendering frame must complete within a fixed time window determined by the target frame rate:

- **60 fps** = 16.67 ms per frame (standard for action games, shooters)
- **30 fps** = 33.33 ms per frame (acceptable for strategy, narrative, some open-world)
- **120 fps** = 8.33 ms per frame (competitive shooters, high-refresh displays)
- **VR targets**: 72 Hz (Quest 2 minimum) = 13.89 ms, 90 Hz (standard) = 11.11 ms, 120 Hz (high-end) = 8.33 ms — missed frames in VR cause motion sickness, making these hard requirements

The frame budget is divided across the CPU and GPU. On modern hardware, CPU and GPU run in parallel — the frame time is the **longer** of the two, not their sum. However, CPU work that feeds GPU work (draw call submission, compute dispatch) creates dependencies that can serialize the pipeline.

A typical 16.67 ms budget breakdown for a 60 fps action game:

- **Game logic / simulation**: 3–4 ms (physics, AI, gameplay scripts, animation)
- **Rendering preparation**: 2–3 ms (culling, sorting, draw call setup)
- **Audio**: 1–2 ms (mixing, DSP, spatial calculations)
- **UI**: 0.5–1 ms (layout, rendering, input processing)
- **Networking**: 0.5–1 ms (send/receive, serialization, prediction)
- **Engine overhead**: 1–2 ms (garbage collection, job scheduling, memory management)
- **Headroom**: 2–4 ms (reserved for spikes, debug builds, min-spec hardware)

The headroom allocation is critical. A budget that uses 100% of the frame time on average will miss the target 50% of the time due to variance.

### Memory Budgets by Platform

Memory budgets vary dramatically across target platforms:

- **PC (mid-range)**: 4–8 GB available to the game (total system RAM 16 GB, shared with OS and other apps)
- **PlayStation 5**: 16 GB unified memory, ~12 GB available to games (rest reserved by OS)
- **Xbox Series X**: 16 GB, split into 10 GB fast (GPU-optimal) and 6 GB standard
- **Nintendo Switch**: 4 GB total, ~3.2 GB available to games (docked and handheld share the same budget)
- **Mobile (mid-range)**: 2–3 GB available (total 4–6 GB, aggressive OS memory management)
- **Mobile (low-end)**: 1–1.5 GB available (devices with 2–3 GB total)

Memory budgets must be subdivided by subsystem: textures (typically 40–60% of total), meshes (10–20%), audio (5–10%), scripts/game state (5–10%), engine overhead (10–15%).

### GPU and Draw Call Budgets

- **Draw calls**: 2,000–5,000 per frame on modern hardware (batching and instancing reduce this)
- **Triangle count**: 2–10 million per frame depending on platform and LOD strategy
- **Texture memory**: Budget per-platform; use streaming and virtual textures for open worlds
- **Shader complexity**: Measure in GPU ms per material; flag any material exceeding 0.5 ms in isolation
- **Post-processing**: Budget 2–4 ms total for all post-process effects combined

### Loading Time Targets

- **Initial boot to menu**: Under 10 seconds on console (platform certification requirement areas)
- **Level load**: Under 15 seconds with SSD, under 30 seconds with HDD
- **Fast travel / respawn**: Under 3 seconds (use streaming, not full loads)
- **Asset streaming during gameplay**: Zero visible pop-in at normal movement speed

### Mobile Thermal and Battery Constraints

Mobile devices throttle CPU and GPU when they overheat. A game that runs at 60 fps for the first five minutes and drops to 30 fps after thermal throttling has a broken performance budget.

- Target sustained performance, not peak performance
- Measure thermal state after 30 minutes of continuous play
- Budget power draw to allow 2–3 hours of gameplay per charge
- Reduce target frame rate to 30 fps on mobile unless the game genre demands 60 fps

## Deep Guidance

### Frame Budget Allocation Template

```yaml
# Frame Budget Allocation — 60 fps target (16.67 ms)
# Assign budgets at project start, enforce via automated profiling

target_fps: 60
frame_budget_ms: 16.67
headroom_ms: 3.0          # Reserve for spikes and min-spec variance
usable_budget_ms: 13.67   # What subsystems share

cpu_budget:
  simulation:
    physics:        1.5   # Rigid bodies, collision detection
    ai:             1.0   # Behavior trees, pathfinding queries (not bake)
    gameplay:       1.5   # Scripts, abilities, damage, spawning
    animation:      0.5   # Blend tree evaluation, IK solving
    subtotal:       4.5

  rendering_prep:
    culling:        0.5   # Frustum + occlusion culling
    sorting:        0.3   # Render queue sorting
    draw_submit:    1.2   # Draw call submission to GPU
    subtotal:       2.0

  audio:
    mix:            0.5   # Final mix, bus processing
    spatial:        0.3   # 3D positioning, HRTF, occlusion
    decode:         0.2   # Streaming decode (Vorbis/Opus)
    subtotal:       1.0

  networking:
    recv_deser:     0.3   # Receive and deserialize packets
    prediction:     0.2   # Client prediction + reconciliation
    send_ser:       0.2   # Serialize and send packets
    subtotal:       0.7

  ui:
    layout:         0.3   # UI layout calculation
    render:         0.2   # UI draw calls
    subtotal:       0.5

  engine:
    gc_memory:      0.5   # Garbage collection / allocator maintenance
    job_scheduler:  0.2   # Job system overhead
    subsystem_tick: 0.3   # Misc engine ticks
    subtotal:       1.0

  # CPU total: 9.7 ms (leaves 3.97 ms headroom — good)

gpu_budget:
  depth_prepass:    1.0   # Z-prepass for early-Z rejection
  gbuffer:         3.0   # Geometry rendering (deferred) or forward pass
  lighting:        2.5   # Direct + indirect lighting, shadows
  post_process:    2.0   # Bloom, tone mapping, AA, motion blur
  ui_overlay:      0.5   # UI rendering on GPU
  particles:       1.0   # VFX / particle rendering
  # GPU total: 10.0 ms (leaves 3.67 ms headroom)

memory_budget_mb:         # Example: console target (12 GB available)
  textures:       5000    # ~42% — streaming pool + resident
  meshes:         2000    # ~17% — vertex/index buffers, LOD chain
  audio:          800     # ~7% — loaded banks + streaming buffers
  animation:      400     # ~3% — skeletal data, blend trees
  physics:        300     # ~2.5% — collision meshes, solver state
  game_state:     500     # ~4% — entity data, scripts, save state
  render_targets: 1500    # ~12.5% — GBuffer, shadow maps, post-FX
  engine:         1000    # ~8% — job system, allocator overhead
  headroom:       500     # ~4% — reserved for spikes
  # Total: 12000 MB
```

### Profiling Tools by Engine

**Unity profiling stack:**
- **Unity Profiler**: Built-in CPU/GPU/memory profiler; use Deep Profile mode sparingly (10x overhead)
- **Frame Debugger**: Step through draw calls one at a time to find redundant draws
- **Memory Profiler package**: Snapshot-based memory analysis; compare snapshots to find leaks
- **Profile Analyzer**: Compare profiler captures across runs to detect regressions
- **Rendering Statistics**: Real-time overlay showing batches, triangles, set-pass calls
- **Platform-specific**: Xcode Instruments (iOS), Android GPU Inspector, RenderDoc (PC)

**Unreal profiling stack:**
- **Unreal Insights**: Modern trace-based profiler replacing the legacy stat system
- **stat commands**: `stat unit`, `stat fps`, `stat gpu`, `stat scenerendering` for real-time overlay
- **GPU Visualizer**: `ProfileGPU` command for per-pass GPU timing
- **Memreport**: Memory reporting by category
- **RenderDoc integration**: Capture and inspect individual frames
- **Platform-specific**: PIX (Xbox/Windows), Razor (PlayStation), Snapdragon Profiler (Android)

**Godot profiling stack:**
- **Built-in Profiler**: CPU time per function, physics, and rendering
- **Monitor panel**: FPS, draw calls, memory, physics bodies
- **Visual Profiler**: GPU frame breakdown
- External tools: RenderDoc, platform-native profilers

**Cross-engine tools:**
- **RenderDoc**: Free, open-source GPU frame capture and analysis (works with Vulkan, D3D11/12, OpenGL)
- **PIX**: Microsoft's GPU profiler for DirectX (Windows and Xbox)
- **Xcode Metal Debugger**: GPU profiling for Apple platforms
- **Tracy**: High-performance C++ profiler with frame-by-frame timeline view
- **Superluminal**: Low-overhead CPU profiler for Windows

### Draw Call Optimization Strategies

Draw calls are the primary CPU-side rendering bottleneck. Each draw call has fixed overhead from API state changes and command buffer submission.

**Batching techniques:**
- **Static batching**: Combine meshes that never move into a single draw call at build time. Costs memory (duplicated vertex data) but eliminates per-frame draw overhead.
- **Dynamic batching**: Combine small meshes (under ~300 vertices in Unity) at runtime. CPU overhead for combining may exceed the draw call savings for complex meshes.
- **GPU instancing**: Render many copies of the same mesh with a single draw call plus an instance buffer. Ideal for vegetation, debris, crowds.
- **Indirect drawing**: GPU-driven rendering where the GPU itself decides what to draw. Used in Nanite (Unreal) and custom engines for massive scene complexity.

**State change reduction:**
- Sort draws by material to minimize shader/texture state changes
- Use texture atlases and texture arrays to reduce texture bind changes
- Merge materials where possible (combine multiple texture maps into channels of a single texture)

**LOD (Level of Detail):**
- Every mesh visible beyond 10 meters should have at least 3 LOD levels
- LOD0: full detail (within 10 m), LOD1: 50% triangles (10–30 m), LOD2: 25% (30–100 m), LOD3: billboard or removed (100 m+)
- Cross-fade or dither between LOD levels to hide transitions
- Measure LOD savings: a scene with proper LODs typically uses 60–80% fewer triangles than LOD0 everywhere

### Memory Leak Detection

Memory leaks in games manifest as gradually increasing memory use over play sessions, eventually causing crashes or OOM kills (especially on mobile).

**Common leak sources:**
- Event listeners not unsubscribed when objects are destroyed
- Loaded assets (textures, audio clips) referenced by destroyed objects preventing GC
- Growing collections (lists, dictionaries) that are appended to but never pruned
- Pooled objects that accumulate component references over their reuse lifecycle
- Native/unmanaged resources (file handles, GPU buffers) not explicitly released

**Detection workflow:**
1. Take a memory snapshot at a known-good state (e.g., main menu after fresh boot)
2. Play through a level, return to main menu
3. Force garbage collection
4. Take a second snapshot
5. Diff the snapshots — any growth is a potential leak
6. Repeat the cycle 3–5 times — true leaks show linear growth

```csharp
// Unity: Automated leak detection in development builds
using UnityEngine;
using UnityEngine.Profiling;
using System.Collections;

public class MemoryLeakDetector : MonoBehaviour
{
    private long _baselineBytes;
    private int _cycleCount;
    private const int WarningThresholdMB = 50;

    public void CaptureBaseline()
    {
        // Force GC before capturing baseline
        System.GC.Collect();
        System.GC.WaitForPendingFinalizers();
        System.GC.Collect();

        _baselineBytes = Profiler.GetTotalAllocatedMemoryLong();
        _cycleCount = 0;
        Debug.Log($"[LeakDetector] Baseline: {_baselineBytes / (1024 * 1024)} MB");
    }

    public void CheckForLeaks()
    {
        System.GC.Collect();
        System.GC.WaitForPendingFinalizers();
        System.GC.Collect();

        long currentBytes = Profiler.GetTotalAllocatedMemoryLong();
        long deltaBytes = currentBytes - _baselineBytes;
        float deltaMB = deltaBytes / (1024f * 1024f);
        _cycleCount++;

        Debug.Log($"[LeakDetector] Cycle {_cycleCount}: " +
                  $"Current={currentBytes / (1024 * 1024)} MB, " +
                  $"Delta={deltaMB:F1} MB from baseline");

        if (deltaMB > WarningThresholdMB)
        {
            Debug.LogError($"[LeakDetector] LEAK SUSPECTED: " +
                           $"{deltaMB:F1} MB growth after {_cycleCount} cycles. " +
                           $"Take a memory snapshot NOW for comparison.");
        }
    }
}
```

### Platform Certification Performance Requirements

Console platform holders enforce performance requirements during certification:

**PlayStation:**
- Game must not drop below target frame rate during normal gameplay for extended periods
- Loading screens must show activity (progress bar, animation) — no static screens over 3 seconds
- Suspend/resume must complete within platform-specified time limits
- Memory must not exceed allocation — OOM crashes are automatic certification failures

**Xbox:**
- Xbox Reliability (XR) requirements specify maximum memory usage per title profile
- Frame rate must be stable at the advertised rate (30 or 60 fps)
- Quick Resume must be supported — game state must survive suspend/resume cycles
- Loading from SSD must meet platform guidance (<2 seconds for fast travel)

**Nintendo Switch:**
- Must run acceptably in both docked (1080p target) and handheld (720p target) modes
- Dynamic resolution scaling is expected — games should lower resolution to maintain frame rate
- Memory budget is tight (~3.2 GB) — aggressive texture compression and streaming required
- Thermal throttling is common — test performance after 30+ minutes of handheld play

**Mobile (App Store / Google Play):**
- No hard certification for performance, but review teams flag severe issues
- ANR (Application Not Responding) on Android triggers if the main thread blocks >5 seconds
- iOS watchdog kills apps that take too long to launch (~20 seconds)
- App size limits: 200 MB for cellular download on iOS; use asset bundles for larger content

### Automated Performance Regression Testing

Manual profiling catches issues reactively. Automated performance tests catch regressions before they ship.

```python
# performance_gate.py — CI script that fails the build on perf regression
# Run after automated playthrough captures profiler data

import json
import sys

# Load profiler output from automated test run
with open("profiler_results.json") as f:
    results = json.load(f)

# Define per-subsystem budgets (in milliseconds)
budgets = {
    "frame_time_p95": 16.67,   # 95th percentile frame time
    "frame_time_p99": 20.0,    # 99th percentile (allow some spikes)
    "physics_avg":    1.5,
    "ai_avg":         1.0,
    "rendering_avg":  3.0,
    "audio_avg":      1.0,
    "gc_max":         2.0,     # Max single GC pause
    "draw_calls_avg": 3000,    # Average draw calls per frame
    "memory_peak_mb": 3200,    # Peak memory (Switch target)
}

failures = []
for metric, budget in budgets.items():
    actual = results.get(metric, 0)
    if actual > budget:
        pct_over = ((actual - budget) / budget) * 100
        failures.append(
            f"  FAIL: {metric} = {actual:.1f} "
            f"(budget: {budget:.1f}, {pct_over:.0f}% over)"
        )

if failures:
    print("PERFORMANCE BUDGET VIOLATIONS:")
    print("\n".join(failures))
    sys.exit(1)
else:
    print("All performance budgets passed.")
    sys.exit(0)
```

### Thermal Profiling for Mobile

Mobile thermal throttling is the single most common cause of "it runs fine in the office" performance failures. Devices heat up during extended play and reduce clock speeds.

**Testing protocol:**
1. Charge the device to 100% and unplug it
2. Close all background apps
3. Run the game for 45 minutes continuously
4. Log frame time, CPU frequency, GPU frequency, and skin temperature every second
5. Plot all four on a timeline — look for the "thermal cliff" where clocks drop
6. The sustained performance after throttling is the real frame budget, not the initial burst

**Mitigation strategies:**
- Reduce simulation quality when thermal state is elevated (lower physics tick rate, simplified AI, reduced particle counts)
- Implement a "thermal budget" system that queries the OS for thermal state (iOS: `ProcessInfo.thermalState`, Android: `PowerManager` thermal API)
- Use lower rendering resolution with upscaling rather than reducing frame rate
- Schedule heavy background work (asset loading, pathfinding bakes) during low-activity gameplay moments
- Test on the oldest supported device in a warm environment (30+ C ambient)

### Profiling Discipline

Performance optimization without profiling data is guesswork. Follow these rules:

1. **Measure first, optimize second** — never optimize based on assumptions about what is slow
2. **Profile on target hardware** — a developer PC with an RTX 4090 tells you nothing about Switch or mobile performance
3. **Profile release builds** — debug builds have 2–10x overhead from assertions, logging, and disabled optimizations
4. **Profile representative content** — the title screen is not representative; profile the most complex gameplay scenario
5. **Track metrics over time** — a single profile session is a snapshot; daily automated profiling catches regressions
6. **Budget from day one** — retrofitting performance into a game that has been running 3x over budget for a year is brutal; establish and enforce budgets from the first playable build

### Common Performance Antipatterns

- **Allocating during gameplay**: Any `new` call or list resize during the game loop risks GC pauses. Pre-allocate and pool everything.
- **Synchronous I/O on the main thread**: File reads, network calls, or asset loads on the main thread cause frame spikes. Use async I/O and streaming.
- **Per-frame string operations**: String concatenation, formatting, and parsing allocate memory every frame. Cache results, use `StringBuilder`, or use integer identifiers instead of strings.
- **Unbounded spatial queries**: "Find all enemies" without a spatial index (quadtree, grid) is O(n^2) and degrades as entity count grows.
- **Overdraw**: Transparent objects rendered back-to-front can cause massive pixel fill rate waste. Sort, z-test, and minimize layered transparency.
- **Shader complexity creep**: Artists add features to materials over time. Each additional texture sample, branch, or math operation costs GPU time multiplied by every pixel that material covers. Audit materials monthly.
- **Excessive raycasts**: Physics raycasts are not free. Budget them (e.g., max 50 per frame for AI line-of-sight checks) and use layers to filter collision masks.
