import config from './drizzle.config';
import { createDatabase, databaseProvider, migrateDatabase } from './src/database/database-driver';

console.log(`Running migrations using ${databaseProvider}...`);
const database = await createDatabase({ migrateLocal: false });
await migrateDatabase(database, config.out);
console.log('Migrations complete!');
process.exit(0);

