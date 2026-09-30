import { calculateTotal } from "./math";

export function createInvoice(value: number): number {
  return calculateTotal(value);
}
