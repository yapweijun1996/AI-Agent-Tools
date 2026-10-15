import { Core } from './core.js';
import type { CommandRequest, CoreReply } from './shared.js';

export { AngitError } from './shared.js';
export type { CommandRequest, CoreReply } from './shared.js';

/** Production metadata API uses canonical native services; it exposes no state-root override. */
export async function execute(request: CommandRequest, repoPath: string): Promise<CoreReply> {
  return new Core().execute(request, repoPath);
}
