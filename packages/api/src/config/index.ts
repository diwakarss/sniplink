import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

interface Config {
  port: number;
  databasePath: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  nodeEnv: string;
}

function validateConfig(): Config {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const jwtSecret = process.env.JWT_SECRET || 'your-secret-key-here';

  // Validate JWT_SECRET is not default in production
  if (nodeEnv === 'production' && jwtSecret === 'your-secret-key-here') {
    throw new Error(
      'JWT_SECRET must be set to a secure value in production environment'
    );
  }

  return {
    port: parseInt(process.env.PORT || '3000', 10),
    databasePath: process.env.DATABASE_PATH || './data/urlshortener.db',
    jwtSecret,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
    nodeEnv,
  };
}

export const config = validateConfig();
