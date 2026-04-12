import { StateManager } from './dist/state/state-manager.js';
import { resolvePipeline } from './dist/core/pipeline/resolver.js';
import { loadPipelineContext } from './dist/core/pipeline/context.js';
import { findProjectRoot } from './dist/cli/middleware/project-root.js';

const root = findProjectRoot(process.cwd());
const context = loadPipelineContext(root);
const pipeline = resolvePipeline(context, { output: console });

const stateManager = new StateManager(root, pipeline.computeEligible);
const state = stateManager.loadState();

console.log("Eligible:", pipeline.computeEligible(state.steps));
