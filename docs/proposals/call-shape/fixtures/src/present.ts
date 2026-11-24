import { saveOrder } from './orders';
declare const tenantId: string, id: string, opts: Record<string, unknown>;

saveOrder({ tenantId: undefined });
saveOrder({ tenantId, ...opts });
saveOrder({ ['tenantId']: id });
