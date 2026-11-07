import { config } from 'dotenv';

// Las pruebas usan SIEMPRE la base de datos de pruebas (arena_test)
config({ path: '.env.test', override: true });
if (!process.env.DATABASE_URL?.includes('arena_test')) {
  throw new Error('Las pruebas deben ejecutarse contra la base de datos arena_test');
}
