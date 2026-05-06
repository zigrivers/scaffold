// Severity rank: P0=0 (most severe) ... P3=3 (least severe).
export type Severity = 'P0' | 'P1' | 'P2' | 'P3'
export const SEVERITY_RANK: Record<Severity, number> = { P0: 0, P1: 1, P2: 2, P3: 3 }
export function severityRank(s: Severity): number { return SEVERITY_RANK[s] }

export type Verdict = 'pass' | 'degraded-pass' | 'blocked'

// ─── Events ─────────────────────────────────────────────────────────────
export type EventType =
  | 'task_claimed'
  | 'task_completed'
  | 'decision_recorded'
  | 'blocker_hit'
  | 'blocker_resolved'
  | 'pr_opened'
  | 'progress_heartbeat'
  | 'finding_acknowledged'

export interface BaseEvent {
  event_id: string         // ULID — globally unique, time-sortable
  worktree_id: string      // UUID from .scaffold/identity.json
  actor_label: string
  branch: string
  task_id: string | null
  type: EventType
  ts: string               // ISO 8601 UTC
}

export interface TaskClaimedPayload {
  task_title: string; story_id?: string; wave?: string; unplanned?: boolean
}
// 'merged' is not agent-recordable — it's derived from the gh adapter
export interface TaskCompletedPayload {
  outcome: 'pr_submitted' | 'dropped' | 'superseded'; pr_number?: number; commit_sha?: string
}
export interface DecisionRecordedPayload {
  key: string; summary: string; affects: string[]; links?: string[]
}
export interface BlockerHitPayload {
  kind: 'dependency' | 'ambiguity' | 'external' | 'environment'; summary: string
}
export interface BlockerResolvedPayload { summary: string; references: string[] }
export interface PrOpenedPayload { pr_number: number }
export interface HeartbeatPayload { note: string }
// 'skipped' is engine-set only; user-writable values are 'acknowledged' | 'open'
export interface FindingAckPayload { finding_id: string; status: 'acknowledged' | 'open'; note?: string }

export type Event =
  | (BaseEvent & { type: 'task_claimed';        payload: TaskClaimedPayload })
  | (BaseEvent & { type: 'task_completed';      payload: TaskCompletedPayload })
  | (BaseEvent & { type: 'decision_recorded';   payload: DecisionRecordedPayload })
  | (BaseEvent & { type: 'blocker_hit';         payload: BlockerHitPayload })
  | (BaseEvent & { type: 'blocker_resolved';    payload: BlockerResolvedPayload })
  | (BaseEvent & { type: 'pr_opened';           payload: PrOpenedPayload })
  | (BaseEvent & { type: 'progress_heartbeat';  payload: HeartbeatPayload })
  | (BaseEvent & { type: 'finding_acknowledged'; task_id: null; payload: FindingAckPayload })

// ─── Adapters & availability ────────────────────────────────────────────
export type AdapterId =
  | 'git' | 'gh' | 'pipeline_docs' | 'tests' | 'state' | 'beads' | 'mmr' | 'audit_history'

export interface AdapterStatus {
  status: 'available' | 'degraded' | 'unavailable'
  reason?: string
  evidence_paths?: string[]
}

export interface AvailabilityMap {
  git: AdapterStatus
  gh: AdapterStatus
  pipeline_docs: AdapterStatus
  tests: AdapterStatus
  state: AdapterStatus
  beads: AdapterStatus
  mmr: AdapterStatus
  audit_history: AdapterStatus
  ledger: {
    events_read: number
    malformed_lines: number
    sources: { worktree_id: string; events: number; harvested_at?: string }[]
  }
}

// ─── Findings (used by audit; types now so Plan 2 doesn't change EngineOutput shape) ─
export interface FixHint {
  kind: 'edit_doc' | 'add_test' | 'rename_token' | 'record_decision' | 'open_task'
  target: string
  patch?: string
  prompt?: string
}

export type Evidence =
  | { kind: 'missing_node'; graph_query: string; expected: string }
  | { kind: 'orphan_node'; graph_query: string; node_id: string }
  | { kind: 'rule_violation'; rule_id: string; file: string; lines?: [number, number] }
  | { kind: 'ac_not_covered'; story_id: string; ac_id: string; missing_tests: string[] }
  | { kind: 'doc_disagreement'; left_doc: string; right_doc: string; conflict: string }
  | { kind: 'lens_skipped'; reason: 'adapter_unavailable' | 'insufficient_data'; needed: string[] }

export interface Finding {
  id: string
  lens_id: string
  severity: Severity
  title: string
  description: string
  source_doc: string
  evidence: Evidence
  fix_hint?: FixHint
  confidence: 'high' | 'medium' | 'low'
  first_seen: string
  last_seen: string
  status: 'open' | 'acknowledged' | 'skipped'
  ack_note?: string
}

export interface FindingsSummary {
  total: number
  by_severity: Record<Severity, number>
  by_severity_status: Record<Severity, { open: number; acknowledged: number; skipped: number }>
  blocking: number
  acknowledged: number
  skipped_lenses: number
}

// ─── Snapshot ───────────────────────────────────────────────────────────
export interface ActiveAgent {
  worktree_id: string
  actor_label: string
  branch: string
  current_task: { id: string | null; title: string; claimed_at: string } | null
  open_pr: { number: number; url: string; opened_at: string } | null
}
export interface TaskCompletion {
  task_id: string | null
  task_title: string
  outcome: 'pr_submitted' | 'merged' | 'dropped' | 'superseded'
  pr_number?: number
  merged_at?: string
  by: string
}
export interface TaskInFlight {
  task_id: string | null
  task_title: string
  story_id?: string
  by: string
  claimed_at: string
  age_hours: number
  branch: string
  pr_number?: number
}
export interface BlockedTask {
  task_id: string
  task_title: string
  blocker_kind: BlockerHitPayload['kind']
  reason: string
  blocked_at: string
  age_hours: number
}
export interface UpcomingTask {
  task_id: string
  task_title: string
  story_id?: string
  ready: boolean
  blocked_by: string[]
  wave?: string
}
export interface DecisionSummary {
  decision_id: string
  key: string
  summary: string
  recorded_at: string
  affects: string[]
}
export interface StoryCoverageRow {
  story_id: string
  story_title: string
  plan_tasks: { id: string; status: 'todo' | 'in_flight' | 'done' }[]
  playbook_tasks: { id: string; status: 'todo' | 'in_flight' | 'done' }[]
  acs_total: number
  acs_with_tests: number
  acs_test_passing: number
}
export interface Snapshot {
  current_phase: string
  active_agents: ActiveAgent[]
  completed_in_window: TaskCompletion[]
  in_flight: TaskInFlight[]
  blocked: BlockedTask[]
  upcoming: UpcomingTask[]
  recent_decisions: DecisionSummary[]
  story_coverage: StoryCoverageRow[]
}

// ─── Replay ─────────────────────────────────────────────────────────────
export interface ReplayEvent {
  sort_id: string
  correlation_id: string | null
  ts: string
  source: 'ledger' | 'git' | 'gh' | 'tests' | 'mmr' | 'state'
  kind: string
  actor_label?: string
  task_id?: string
  summary: string
  link?: string
}
export interface ReplayTimeline {
  window: { from: string; to: string }
  events: ReplayEvent[]
}

// ─── Stall detection ────────────────────────────────────────────────────
export type NeedsAttentionSignal =
  | 'task_stale' | 'pr_stale' | 'pr_review_stale'
  | 'blocker_unaddressed' | 'audit_findings_unresolved' | 'lens_skipped_repeatedly'

export interface NeedsAttentionItem {
  signal: NeedsAttentionSignal
  ref: { kind: 'task' | 'pr' | 'finding' | 'lens'; id: string }
  age_hours: number
  threshold_hours: number
  summary: string
}

// ─── Graph stats (populated by Plan 2 once doc-graph exists) ────────────
export interface GraphStats {
  nodes_by_kind: Record<string, number>
  edges_by_kind: Record<string, number>
  orphans_by_kind: Record<string, number>
  unsanctioned_uses: number
  ad_hoc_token_uses: number
}

// ─── Engine output (the unified shape all renderers consume) ────────────
export interface EngineOutput {
  schema_version: '1.0'
  invocation: {
    command: 'progress' | 'audit'
    args: Record<string, unknown>
    started_at: string
    completed_at: string
    scaffold_version: string
  }
  availability: AvailabilityMap
  snapshot: Snapshot | null
  replay: ReplayTimeline | null
  findings: Finding[]
  needs_attention: NeedsAttentionItem[]
  graph_stats: GraphStats
  fix_threshold: Severity
  verdict: Verdict
  summary: FindingsSummary
}

// ─── Identity file ──────────────────────────────────────────────────────
export interface WorktreeIdentity {
  worktree_id: string
  worktree_label: string
  created_at: string
}

// ─── Doc-graph node types (Plan 2) ──────────────────────────────────────
export interface Feature {
  id: string
  title: string
  priority: 'must' | 'should' | 'could' | 'wont'
  source_anchor: string
  prose?: string
}

export interface Story {
  id: string
  title: string
  priority: 'must' | 'should' | 'could' | 'wont'
  kind?: 'ui' | 'api' | 'data' | 'infra' | 'doc'
  feature_id?: string
  source_anchor: string
}

export interface AcceptanceCriterion {
  id: string
  story_id: string
  text: string
  source_anchor: string
}

export interface PlanTask {
  id: string
  title: string
  status: 'todo' | 'in_flight' | 'done' | 'skipped'
  story_id?: string
  wave?: string
  source_anchor: string
}

export interface PlaybookTask {
  id: string
  title: string
  status: 'todo' | 'in_flight' | 'done' | 'skipped'
  story_id?: string
  plan_task_id?: string
  source_anchor: string
}

export interface Rule {
  id: string
  description: string
  pattern?: string
  forbidden?: string[]
  match?: string
  language?: string
  severity?: string
  enforce_via?: string
  source_anchor: string
}

export interface SanctionedComponent {
  id: string
  package_or_url: string
  layer?: string
  source_anchor: string
}

export interface DesignToken {
  id: string
  category: 'color' | 'spacing' | 'typography' | 'shadow' | 'radius' | 'motion'
  value: string
  priority: 'must' | 'should' | 'could' | 'wont'
  source_anchor: string
}

export interface Decision {
  id: string
  key: string
  summary: string
  affects: string[]
  superseded_by?: string
  source_anchor: string
  recorded_at: string
}

export interface Test {
  id: string
  name: string
  file_path: string
  framework: 'vitest' | 'jest' | 'pytest' | 'go-test' | 'bats'
  last_status?: 'pass' | 'fail' | 'skip' | 'unknown'
}

export interface FileNode {
  id: string
  path: string
}

export interface PullRequest {
  id: string
  number: number
  url: string
  title?: string
  state?: 'open' | 'closed' | 'merged'
}

export type EdgeKind =
  | 'feature_to_story'
  | 'story_to_ac'
  | 'ac_to_test'
  | 'test_to_file'
  | 'story_to_plan_task'
  | 'plan_task_to_playbook'
  | 'playbook_task_to_story'
  | 'playbook_task_to_pr'
  | 'pr_to_file'
  | 'file_to_token_use'
  | 'file_to_component_use'
  | 'decision_supersedes'
  | 'decision_links_doc'
  | 'decision_to_file'

export interface Edge {
  kind: EdgeKind
  from: string
  to: string
  property?: string
}

export interface DocGraph {
  cwd: string
  features: Feature[]
  stories: Story[]
  acceptance_criteria: AcceptanceCriterion[]
  plan_tasks: PlanTask[]
  playbook_tasks: PlaybookTask[]
  tests: Test[]
  pull_requests: PullRequest[]
  files: FileNode[]
  rules: Rule[]
  components: SanctionedComponent[]
  tokens: DesignToken[]
  decisions: Decision[]
  edges: Edge[]
  provenance: Record<string, string>
  unresolved_globs: Array<{ decision_id: string; glob: string }>
}
