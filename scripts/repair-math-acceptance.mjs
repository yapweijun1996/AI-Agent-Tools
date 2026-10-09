// Frozen independent behavior cases, withheld from repair participants.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

async function renderer({ cssUnavailable = false } = {}) {
  const filename = path.join(process.env.REPAIR_PROJECT, 'src/preview/mathRenderer.js');
  const context = vm.createContext({ console, Promise });
  const calls = [];
  const modules = new Map();
  const require = createRequire(filename);
  async function dependency(specifier) {
    if (cssUnavailable && specifier.endsWith('.css')) throw Error('CSS unavailable');
    if (!modules.has(specifier)) {
      const exports = specifier === 'katex' ? { default: {
        renderToString(source, options) {
          calls.push({ source, displayMode: options.displayMode });
          return '<span class="katex">rendered equation</span>';
        },
      } } : specifier.endsWith('.css') ? {} : await import(
        specifier.startsWith('node:') ? specifier : pathToFileURL(require.resolve(specifier)).href);
      const module = new vm.SyntheticModule(Object.keys(exports), function () {
        for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
      }, { context, identifier: specifier });
      await module.link(() => { throw Error('Unexpected synthetic dependency'); });
      await module.evaluate();
      modules.set(specifier, module);
    }
    return modules.get(specifier);
  }
  const module = new vm.SourceTextModule(fs.readFileSync(filename, 'utf8'), {
    context, identifier: filename, importModuleDynamically: dependency,
  });
  await module.link(dependency);
  await module.evaluate();
  return { ...module.namespace, calls };
}

for (const [name, input, expected] of [
  ['empty', '', false], ['ordinary', 'Ordinary prose', false],
  ['inline', 'Formula $x^2$', true], ['display', 'Formula\n\n$$x^2$$', true],
  ['escaped', 'Escaped \\$x$', false], ['currency', 'Cost $5 and $6', false],
  ['inline-code', 'Code: `$x$`', false],
  ['backtick-fence', '```js\n$x$\n```', false],
  ['tilde-fence', '~~~text\n$$x$$\n~~~', false],
]) {
  test(`detect-${name}`, async () => {
    const module = await renderer();
    assert.equal(module.markdownHasMath(input), expected);
    assert.equal(module.calls.length, 0);
  });
}

for (const [name, html] of [
  ['code', '<p><code>$x$</code></p>'],
  ['pre', '<pre><code>$$x$$</code></pre>'],
  ['attribute', '<p data-value="$x$">plain</p>'],
  ['currency', '<p>Cost $5 and $6</p>'],
  ['already-rendered', '<span class="katex">$x$</span>'],
]) {
  test(`preserve-${name}`, async () => {
    const module = await renderer();
    assert.equal(await module.renderMathInHtml(html), html);
    assert.equal(module.calls.length, 0);
  });
}

test('visible-inline-with-protected-neighbors', async () => {
  const module = await renderer();
  const output = await module.renderMathInHtml('<p><code>$code$</code> <span data-x="$attribute$">$visible$</span></p>');
  assert.match(output, /<code>\$code\$<\/code>/);
  assert.match(output, /data-x="\$attribute\$"/);
  assert.match(output, /class="katex"/);
  assert.deepEqual(module.calls, [{ source: 'visible', displayMode: false }]);
});
test('display-equation-mode', async () => {
  const module = await renderer();
  assert.match(await module.renderMathInHtml('<p>$$ x^2 $$</p>'), /class="math-block"/);
  assert.deepEqual(module.calls, [{ source: 'x^2', displayMode: true }]);
});
test('decode-markdown-html-entities-once', async () => {
  const module = await renderer();
  await module.renderMathInHtml('<p>$x &lt; y &amp; z$</p>');
  assert.deepEqual(module.calls, [{ source: 'x < y & z', displayMode: false }]);
});
test('css-failure-preserves-rendering', async () => {
  const module = await renderer({ cssUnavailable: true });
  assert.match(await module.renderMathInHtml('<p>$x$</p>'), /class="katex"/);
  assert.deepEqual(module.calls, [{ source: 'x', displayMode: false }]);
});
