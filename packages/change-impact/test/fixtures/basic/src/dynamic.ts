const moduleName = "./math";
export async function loadModule(): Promise<unknown> {
  return import(moduleName);
}
