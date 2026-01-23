import Database from 'better-sqlite3';
import { readFileSync, mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';
import { config } from '../config';

let db: Database.Database;

/**
 * Initialize the SQLite database with schema
 */
export function initDb(): Database.Database {
  try {
    // Ensure the database directory exists
    const dbDir = dirname(config.databasePath);
    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true });
    }

    // Create database connection
    db = new Database(config.databasePath);

    // Enable foreign keys
    db.pragma('foreign_keys = ON');

    // Read and execute schema
    const schemaPath = `${__dirname}/schema.sql`;
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    console.log(`Database initialized at ${config.databasePath}`);
    return db;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to initialize database: ${message}`);
  }
}

/**
 * Get the database instance
 */
export function getDb(): Database.Database {
  if (!db) {
    return initDb();
  }
  return db;
}

/**
 * Close the database connection
 */
export function closeDb(): void {
  if (db) {
    db.close();
  }
}

export { db };
