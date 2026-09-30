import { createInvoice } from "./service";

export function postInvoice(value: number): number {
  return createInvoice(value);
}
