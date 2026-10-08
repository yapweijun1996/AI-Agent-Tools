// Unexecuted branch used only by the real coverage-failure regression fixture.
export function unused(value) {
  if (value) {
    return 'uncovered';
  }
  return 'also uncovered';
}
