export function f(..._args: unknown[]): void {}
declare const xs: [number];

f(...xs, {});
f(1, {}, ...xs);
f(1);
