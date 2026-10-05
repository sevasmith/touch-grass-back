import 'dotenv/config';
import { DataSource } from 'typeorm';

// ts-node loads this file as .ts (src/), the production image as .js (dist/).
// Matching only that extension also keeps the globs from picking up .d.ts files.
const ext = __filename.endsWith('.ts') ? 'ts' : 'js';

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  entities: [__dirname + `/../**/*.entity.${ext}`],
  migrations: [__dirname + `/migrations/*.${ext}`],
});
