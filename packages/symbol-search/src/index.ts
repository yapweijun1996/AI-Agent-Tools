import { errorResult, SymbolSearchEngine } from "./core/engine";
import type { CapabilitiesRequest, EngineOptions, Request, Result, SearchRequest, SemanticRequest, SymbolsRequest } from "./types";

export * from "./types";
export { SymbolSearchEngine, getCapabilitiesData } from "./core/engine";
export { validateCapabilities, validateRequest, validateResult } from "./core/validation";

export function createEngine(options: EngineOptions = {}): SymbolSearchEngine {
  return new SymbolSearchEngine(options);
}

export function execute(request: Request, options: EngineOptions = {}): Result {
  return new SymbolSearchEngine(options).execute(request);
}

function withOperation<T extends object>(operation: Request["operation"], input: T & Partial<Pick<Request, "operation">>): Request {
  return { ...input, operation } as unknown as Request;
}

type OperationInput<T extends Request> = Omit<T, "operation"> & { operation?: T["operation"] };
type SemanticInput<O extends SemanticRequest["operation"]> = OperationInput<SemanticRequest & { operation: O }>;

function executeOperation<T extends object>(operation: Request["operation"], request: T & Partial<Pick<Request, "operation">>, options: EngineOptions): Result {
  if ("operation" in request && request.operation !== operation) {
    return errorResult([{ code: "INVALID_REQUEST", message: `This helper only accepts operation ${operation}`, severity: "error" }]);
  }
  return new SymbolSearchEngine(options).execute(withOperation(operation, request));
}

export function getCapabilities(rootOrRequest: string | OperationInput<CapabilitiesRequest>, options: EngineOptions = {}): Result {
  return executeOperation("capabilities", typeof rootOrRequest === "string" ? { root: rootOrRequest } : rootOrRequest, options);
}

export function searchSymbols(request: OperationInput<SearchRequest>, options: EngineOptions = {}): Result {
  return executeOperation("search", request, options);
}

export function findDefinition(request: SemanticInput<"definition">, options: EngineOptions = {}): Result {
  return executeOperation("definition", request, options);
}

export function findReferences(request: SemanticInput<"references">, options: EngineOptions = {}): Result {
  return executeOperation("references", request, options);
}

export function findImplementations(request: SemanticInput<"implementations">, options: EngineOptions = {}): Result {
  return executeOperation("implementations", request, options);
}

export function listSymbols(request: OperationInput<SymbolsRequest>, options: EngineOptions = {}): Result {
  return executeOperation("symbols", request, options);
}
