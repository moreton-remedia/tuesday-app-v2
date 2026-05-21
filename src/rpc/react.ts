import { createORPCReactQueryUtils } from '@orpc/react-query';
import { client } from '@/rpc/client';

export const orpcUtils = createORPCReactQueryUtils(client);
export { client as orpcClient };

