import { createDatabase, type Database } from './database-driver';

export const database = await createDatabase();
export type { Database };
export { createDatabase, databaseProvider, databaseUrl, migrateDatabase } from './database-driver';

