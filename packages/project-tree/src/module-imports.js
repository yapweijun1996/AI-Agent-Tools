function tokensFor(source) {
  const tokens = [];
  const templates = [];
  const parentheses = [];
  let regexAllowed = true;
  let i = 0;
  const emit = (kind, value) => {
    tokens.push({ kind, value });
    regexAllowed = kind === 'word' ? /^(return|throw|case|delete|void|typeof|new|yield|await|else|do|in|of)$/.test(value)
      : kind === 'punct' && ![')', ']', '}', '.'].includes(value);
  };
  while (i < source.length) {
    const frame = templates.at(-1);
    if (frame?.text) {
      if (source[i] === '\\') i += 2;
      else if (source[i] === '`') { templates.pop(); i++; emit('opaque', ''); }
      else if (source[i] === '$' && source[i + 1] === '{') { frame.text = false; frame.depth = 1; i += 2; emit('punct', '{'); }
      else i++;
      continue;
    }
    const character = source[i];
    if (/\s/.test(character)) { i++; continue; }
    if (character === '/' && source[i + 1] === '/') {
      i += 2; while (i < source.length && !/[\r\n]/.test(source[i])) i++;
      continue;
    }
    if (character === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2); i = end < 0 ? source.length : end + 2;
      continue;
    }
    if (character === '"' || character === "'") {
      const quote = character;
      let value = '', supported = true, closed = false;
      i++;
      while (i < source.length) {
        const next = source[i++];
        if (next === quote) { closed = true; break; }
        if (next === '\\') {
          const escaped = source[i++];
          if (!['\\', '"', "'", '/'].includes(escaped)) supported = false;
          else value += escaped;
        } else if (next === '\n' || next === '\r') { supported = false; break; }
        else value += next;
      }
      // Literal contents stay opaque; only a literal in module syntax is used.
      emit(closed && supported ? 'string' : 'opaque', value);
      continue;
    }
    if (character === '`') { templates.push({ text: true, depth: 0 }); i++; emit('opaque', ''); continue; }
    if (/[0-9]/.test(character)) {
      i++; while (/[A-Za-z0-9_.]/.test(source[i] ?? '')) i++;
      emit('opaque', ''); continue;
    }
    if (character === '/' && regexAllowed) {
      let bracket = false;
      i++;
      while (i < source.length && !/[\r\n]/.test(source[i])) {
        const next = source[i++];
        if (next === '\\') i++;
        else if (next === '[') bracket = true;
        else if (next === ']') bracket = false;
        else if (next === '/' && !bracket) break;
      }
      while (/[A-Za-z]/.test(source[i] ?? '')) i++;
      emit('opaque', ''); continue;
    }
    if (/[A-Za-z_$]/.test(character)) {
      const start = i++;
      while (/[A-Za-z0-9_$]/.test(source[i] ?? '')) i++;
      emit('word', source.slice(start, i)); continue;
    }
    if (frame && character === '{') frame.depth++;
    if (frame && character === '}' && --frame.depth === 0) frame.text = true;
    if (character === '(') parentheses.push(tokens.at(-2)?.value !== '.' && /^(if|while|for|with|switch|catch)$/.test(tokens.at(-1)?.value ?? ''));
    const afterCondition = character === ')' && parentheses.pop();
    i++; emit('punct', character);
    if (afterCondition) regexAllowed = true;
  }
  return tokens;
}

export function extractJsImports(source) {
  const tokens = tokensFor(source);
  const imports = new Set();
  const add = token => { if (token?.kind === 'string' && token.value.startsWith('.')) imports.add(token.value); };
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.kind !== 'word' || !['import', 'export', 'require'].includes(token.value) || tokens[i - 1]?.value === '.') continue;
    const next = tokens[i + 1];
    if (token.value !== 'export' && next?.value === '(') { add(tokens[i + 2]); continue; }
    if (token.value === 'require' || next?.value === '.') continue;
    if (token.value === 'import' && next?.kind === 'string') { add(next); continue; }
    if (token.value === 'export' && !['{', '*', 'type'].includes(next?.value)) continue;
    let braces = 0;
    for (let j = i + 1; j < tokens.length && tokens[j].value !== ';'; j++) {
      if (braces === 0 && j > i + 1 && tokens[j].kind === 'word' && ['import', 'export'].includes(tokens[j].value)) break;
      if (tokens[j].value === '{') braces++;
      if (tokens[j].value === '}') braces--;
      if (tokens[j].kind === 'word' && tokens[j].value === 'from' && tokens[j + 1]?.kind === 'string') { add(tokens[j + 1]); break; }
      if (tokens[j].kind === 'opaque') break;
    }
  }
  return [...imports].sort();
}
