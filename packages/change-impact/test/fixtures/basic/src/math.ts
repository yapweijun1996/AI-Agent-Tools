export function calculateTotal(value: number): number {
  return value * 2;
}

export class Calculator {
  public total(value: number): number {
    return calculateTotal(value);
  }
}
