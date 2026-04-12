import { StateManager } from './dist/state/state-manager.js';
import { resolvePipeline } from './dist/core/pipeline/resolver.js';
import { loadPipelineContext } from './dist/core/pipeline/context.js';
import { findProjectRoot } from './dist/cli/middleware/project-root.js';

const root = findProjectRoot(process.cwd());
const context = loadPipelineContext(root);
const pipeline = resolvePipeline(context, { output: console });

const stateManager = new StateManager(root, pipeline.computeEligible);
stateManager.setInProgress('create-vision', 'test');
stateManager.clearInProgress();

const state = stateManager.loadState();
console.log("Status of create-vision:", state.steps['create-vision'].status);
console.log("In progress record:", state.in_progress);
console.log("Eligible:", pipeline.computeEligible(state.steps));
