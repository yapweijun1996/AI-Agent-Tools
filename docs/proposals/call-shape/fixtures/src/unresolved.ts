import { saveOrder } from './orders';
saveOrder({ tenantId: 'must-not-leak-as-a-partial-row' });
unresolvedCaller({});
