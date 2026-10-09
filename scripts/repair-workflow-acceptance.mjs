// Independent module-level acceptance. Never supplied to repair participants.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const root = process.env.REPAIR_PROJECT;
const require = createRequire(path.join(process.env.REPAIR_DEPS, 'package.json'));
const MarkdownIt = require('markdown-it');
const ts = createRequire(import.meta.url)(process.env.REPAIR_TYPESCRIPT);
const escape = value => String(value).replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[c]);

async function renderers({ error = null, objectUrl = null } = {}) {
  const context = vm.createContext({ console, Date, Promise });
  const cache = new Map();
  let initializeCount = 0;
  function synthetic(id, exports) {
    const module = new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
    }, { context, identifier: id });
    cache.set(id, module);
    return module;
  }
  synthetic('react', { default: {}, useEffect() {}, useMemo() {}, useRef() {}, useState() {} });
  synthetic('markdown-it', { default: MarkdownIt });
  synthetic('imageCache.js', {
    isInternalImageUri: value => /^mdimg:\/\//.test(value),
    imageIdFromUri: value => value.slice(8), getObjectUrl: () => objectUrl,
    ensureLoaded: () => Promise.resolve(),
  });
  synthetic('mathRenderer.js', { renderMathInHtml: value => Promise.resolve(value), markdownHasMath: () => false });
  synthetic('mermaid', { default: {
    initialize(options) { assert.equal(options.securityLevel, 'strict'); initializeCount++; },
    async render() { if (error !== null) throw new Error(error); return { svg: '<svg>safe diagram</svg>' }; },
  } });
  async function load(filename) {
    if (cache.has(filename)) return cache.get(filename);
    let source = fs.readFileSync(filename, 'utf8');
    if (filename.endsWith('MarkdownPreview.jsx')) {
      source = ts.transpileModule(source + '\nexport { md as studyRenderer };\n', {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React },
        fileName: filename,
      }).outputText;
    }
    const module = new vm.SourceTextModule(source, { context, identifier: filename,
      importModuleDynamically: async specifier => {
        const dynamic = cache.get(specifier);
        assert.ok(dynamic, 'Only the registered lazy Mermaid dependency is supported');
        if (dynamic.status === 'unlinked') await dynamic.link(() => { throw Error('Unexpected dependency'); });
        if (dynamic.status === 'linked') await dynamic.evaluate();
        return dynamic;
      },
    });
    cache.set(filename, module);
    await module.link(async (specifier, parent) => {
      if (cache.has(specifier)) return cache.get(specifier);
      const basename = path.basename(specifier);
      if (['imageCache.js', 'mathRenderer.js'].includes(basename)) return cache.get(basename);
      return load(path.resolve(path.dirname(parent.identifier), specifier));
    });
    return module;
  }
  const preview = await load(path.join(root, 'src/preview/MarkdownPreview.jsx'));
  await preview.evaluate();
  const mermaid = cache.get(path.join(root, 'src/preview/mermaidRenderer.js'));
  const wrappers = [];
  context.document = { createElement: () => {
    const wrapper = { className: '', innerHTML: '' }; wrappers.push(wrapper); return wrapper;
  } };
  return { md: preview.namespace.studyRenderer, mermaid: mermaid.namespace, wrappers,
    initializeCount: () => initializeCount };
}

const samples = ['<img src=x onerror="inert">', '&lt;tag&gt; & named', '"double" \'single\'', 'plain 中文 & >'];
for (let i = 0; i < samples.length; i++) {
  test(`image-boundary-${i + 1}`, async () => {
    const { md } = await renderers();
    const token = { content: samples[i], attrGet: () => 'mdimg://missing', attrSet() {} };
    const result = md.renderer.rules.image([token], 0, {}, {}, { renderToken: () => 'unexpected' });
    assert.equal(result, `<span class="image-loading" aria-label="Loading image">${escape(samples[i])}</span>`);
  });
  test(`mermaid-boundary-${i + 1}`, async () => {
    const { mermaid, wrappers, initializeCount } = await renderers({ error: samples[i] });
    const pre = { dataset: {}, replaceWith() {} };
    const block = { parentElement: pre, textContent: 'invalid diagram' };
    await mermaid.hydrateMermaidBlocks({ querySelectorAll: () => [block] });
    assert.equal(wrappers[0].innerHTML, `<div class="mermaid-error">Mermaid error: ${escape(samples[i])}</div>`);
    assert.equal(initializeCount(), 1);
    await mermaid.hydrateMermaidBlocks({ querySelectorAll: () => [block] });
    assert.equal(wrappers.length, 1, 'Already hydrated blocks must remain stable');
  });
}

test('ordinary-image-fallback-and-object-url', async () => {
  const { md } = await renderers({ objectUrl: 'blob:owned' });
  for (const uri of ['https://example.test/image.png', 'mdimg://known']) {
    const attributes = {};
    const token = { content: 'ordinary', attrGet: () => uri, attrSet: (key, value) => { attributes[key] = value; } };
    assert.equal(md.renderer.rules.image([token], 0, {}, {}, { renderToken: () => '<img safe>' }), '<img safe>');
    assert.equal(attributes.src, uri.startsWith('mdimg:') ? 'blob:owned' : undefined);
  }
});

test('empty-alt-and-ordinary-markdown', async () => {
  const { md } = await renderers();
  const token = { content: '', attrGet: () => 'mdimg://missing', attrSet() {} };
  assert.match(md.renderer.rules.image([token], 0, {}, {}, {}), /Loading image…<\/span>$/);
  assert.match(md.render('[safe](https://example.test)'), /target="_blank" rel="noopener noreferrer"/);
  assert.match(md.render('| A | B |\n|---|---|\n| 1 | 2 |'), /<div class="table-wrap"><table>/);
  assert.match(md.render('```mermaid\nA & <B>\n```'), /A &amp; &lt;B&gt;/);
});

test('successful-svg-and-empty-root', async () => {
  const { mermaid, wrappers, initializeCount } = await renderers();
  await mermaid.hydrateMermaidBlocks(null);
  await mermaid.hydrateMermaidBlocks({ querySelectorAll: () => [] });
  assert.equal(initializeCount(), 0, 'Mermaid remains lazy');
  const pre = { dataset: {}, replaceWith() {} };
  await mermaid.hydrateMermaidBlocks({ querySelectorAll: () => [{ parentElement: pre, textContent: 'graph A' }] });
  assert.equal(wrappers[0].innerHTML, '<svg>safe diagram</svg>');
});
