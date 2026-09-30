export interface StorageAdapter {
  get(key: string): string;
}

export abstract class BaseService {
  abstract run(input: string): string;
}

export class FileAdapter implements StorageAdapter {
  public constructor() {}

  public get(key: string): string {
    return `file:${key}`;
  }
}

export class ChildService extends BaseService {
  public run(input: string): string {
    return `child:${input}`;
  }
}

export class StructuralAdapter {
  public get(key: string): string {
    return `structural:${key}`;
  }
}

export interface ExpressionAdapter {
  load(): string;
}

export const ExpressionAdapterImpl = class implements ExpressionAdapter {
  public load(): string {
    return "expression";
  }
};

export class ExpressionBase {}

export const ExpressionChild = class extends ExpressionBase {
  public run(input: string): string {
    return `expression-child:${input}`;
  }
};

export const { bindingValue: exportedBinding } = { bindingValue: "exported" };
const { localValue: localBinding } = { localValue: "local" };
void localBinding;

export function resolveConfig(name: string): string;
export function resolveConfig(name: number): string;
export function resolveConfig(name: string | number): string {
  return `config:${name}`;
}

export const projectName = "agent-symbol-search";
export const projectSnapshot = { projectName };
const localExportSpecifier = "exported-through-specifier";
export { localExportSpecifier };

const commentOnly = "resolveConfig is only text here";
void commentOnly;
