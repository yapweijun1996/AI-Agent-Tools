import type { InvoiceContract } from "./contracts";

export class InvoiceImplementation implements InvoiceContract {
  public total(value: number): number {
    return value;
  }
}
