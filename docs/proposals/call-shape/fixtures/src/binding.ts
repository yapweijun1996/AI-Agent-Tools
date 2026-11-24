import { saveOrder } from './orders';
import { writeOrder as persist } from './barrel';

saveOrder({ tenantId: 'demo' });
persist({});
{
  const saveOrder = (_options: object): void => {};
  saveOrder({});
}
