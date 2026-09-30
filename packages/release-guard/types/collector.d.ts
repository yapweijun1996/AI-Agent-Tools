export const COLLECTION_LIMITS: Readonly<Record<string, number>>;
export function publicAddress(address: string): boolean;
export function collectEvidence(request: unknown): Promise<{bundle: Record<string, unknown>; provenance: Record<string, unknown>; diagnostics: Array<Record<string, unknown>>}>;
