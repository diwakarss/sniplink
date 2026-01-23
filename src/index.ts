import express from 'express';
import { config } from './config';
import { initDb } from './db';
import { healthRouter } from './routes/health';

const app = express();

// Middleware
app.use(express.json());

// Routes
app.use('/health', healthRouter);

// Start server function
async function startServer() {
  try {
    // Initialize database before accepting requests
    initDb();
    console.log('Database initialized');

    // Start listening
    app.listen(config.port, () => {
      console.log(`Server running on port ${config.port}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Only start server if this is the main module (not imported for testing)
if (require.main === module) {
  startServer();
}

export { app };
