import { capabilities, encodeResult, exitCode, resolveRules, type ResolveData } from 'agent-rules-resolve';
const result = resolveRules({ root: '.', target: 'src/new.ts', targetKind: 'file', profile: 'agents-chain-v1', includeContent: true, limits: { max_files: 5 } });
if (result.status === 'ok') {
  const data: ResolveData = result.data;
  const hash: string | undefined = data.sources[0]?.sha256;
  const content: string | undefined = data.sources[0]?.content;
  void hash; void content;
} else {
  const data: null = result.data;
  void data;
}
encodeResult(result);
exitCode(result);
encodeResult(capabilities());
// @ts-expect-error A target kind is mandatory, including for a not-yet-created file.
resolveRules({ root: '.', target: 'src/new.ts', profile: 'agents-chain-v1' });
// @ts-expect-error Hidden/global agent precedence is not a supported profile.
resolveRules({ root: '.', target: '.', targetKind: 'directory', profile: 'universal' });
