import { capabilities, encodeResult, exitCode, packContext, type PackData } from 'agent-context-pack';
const result = packContext({ root: '.', manifest: 'manifest.json', limits: { max_items: 5 } });
if (result.status === 'ok') {
  const data: PackData = result.data;
  const used: number = data.budget.used;
  const first: Record<string, unknown> | undefined = data.included[0]?.data;
  const trust: 'untrusted-data' = data.content_trust;
  void used; void first; void trust;
} else {
  const data: null = result.data;
  void data;
}
encodeResult(result);
exitCode(result);
encodeResult(capabilities());
// @ts-expect-error A manifest path is mandatory; artifacts are never discovered implicitly.
packContext({ root: '.' });
// @ts-expect-error Token budgets need a pinned tokenizer and are not a supported limit.
packContext({ root: '.', manifest: 'manifest.json', limits: { max_tokens: 100 } });
