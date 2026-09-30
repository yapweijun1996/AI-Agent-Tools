import { calculateTotal } from "./math";

export function InvoiceView({ value }: { value: number }): JSX.Element {
  return <div>{calculateTotal(value)}</div>;
}
