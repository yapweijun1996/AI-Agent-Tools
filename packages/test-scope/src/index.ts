import { errorResult, TestScopeEngine } from "./core/engine.js";
import type { CapabilitiesRequest, DiscoverRequest, EngineOptions, ExplainRequest, PlanRequest, Request, Result } from "./types.js";

export * from "./types.js";
export { TestScopeEngine, getCapabilitiesData } from "./core/engine.js";
export { validateRequest, validateResult } from "./core/validation.js";

export function createEngine(options: EngineOptions = {}): TestScopeEngine {
  return new TestScopeEngine(options);
}

export function execute(request: Request, options: EngineOptions = {}): Result {
  return new TestScopeEngine(options).execute(request);
}

function executeOperation<T extends object>(operation: Request["operation"], request: T & Partial<Pick<Request, "operation">>, options: EngineOptions): Result {
  if ("operation" in request && request.operation !== operation) {
    return errorResult([{ code: "INVALID_REQUEST", message: `This helper only accepts operation ${operation}`, severity: "error" }]);
  }
  return new TestScopeEngine(options).execute({ ...request, operation });
}

type OperationInput<T extends Request> = Omit<T, "operation"> & { operation?: T["operation"] };

export function getCapabilities(rootOrRequest: string | OperationInput<CapabilitiesRequest>, options: EngineOptions = {}): Result {
  return executeOperation("capabilities", typeof rootOrRequest === "string" ? { root: rootOrRequest } : rootOrRequest, options);
}

export function discoverTests(request: OperationInput<DiscoverRequest>, options: EngineOptions = {}): Result {
  return executeOperation("discover", request, options);
}

export function planTestScope(request: OperationInput<PlanRequest>, options: EngineOptions = {}): Result {
  return executeOperation("plan", request, options);
}

export function explainRecommendation(request: OperationInput<ExplainRequest>, options: EngineOptions = {}): Result {
  return executeOperation("explain", request, options);
}
