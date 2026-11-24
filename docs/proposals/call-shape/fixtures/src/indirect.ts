import { saveOrder } from './orders';
import * as orders from './orders';

const f = saveOrder;
f({});
[{}].forEach(saveOrder);
orders.saveOrder({});
