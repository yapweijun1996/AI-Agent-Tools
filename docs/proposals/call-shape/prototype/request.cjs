'use strict';

const path = require('node:path');

class Refusal extends Error {}
const refuse = code => { throw new Refusal(code); };
const positive = n => Number.isSafeInteger(n) && n > 0;

function relativeInput(text) {
  if (typeof text !== 'string' || !text) refuse('INVALID_INPUT');
  if (path.win32.isAbsolute(text) || text.split(/[\\/]/).includes('..')) refuse('UNSAFE_PATH');
  if (/[\\:\x00-\x1f]/.test(text) || text.split('/').some(s => !s || s === '.')) refuse('INVALID_INPUT');
  return text;
}

function validateRequest(request) {
  const { root, project, declaration, argument, field } = request ?? {};
  if (typeof root !== 'string' || !root || root.includes('\0') || !declaration ||
      !positive(declaration.line) || !positive(declaration.column) || !positive(argument) ||
      typeof field !== 'string' || !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(field) || field === '__proto__') refuse('INVALID_INPUT');
  relativeInput(project);
  relativeInput(declaration.path);
}

module.exports = { Refusal, refuse, validateRequest };
