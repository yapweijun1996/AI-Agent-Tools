import { saveOrder } from './orders';
declare const opts: Record<string, unknown>, key: string, id: string;

saveOrder(opts);
saveOrder({ ...opts });
saveOrder({ [key]: id });
