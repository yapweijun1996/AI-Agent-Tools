interface NamespacePort {}
abstract class NamespaceBase {
  abstract namespaceRun(input: string): string;
}

declare namespace AmbientNamespace {
  class NamespaceAdapter implements NamespacePort {}

  class NamespaceChild extends NamespaceBase {
    namespaceRun(input: string): string;
  }
}

interface ModulePort {}
abstract class ModuleBase {
  abstract moduleRun(input: string): string;
}

declare module "ambient-module" {
  class ModuleAdapter implements ModulePort {}

  class ModuleChild extends ModuleBase {
    moduleRun(input: string): string;
  }
}
