import express from 'express';
import { config } from './config';
import { initDb } from './db';
import { healthRouter } from './routes/health';
import { urlsRouter } from './routes/urls';
import { authRouter } from './routes/auth';
import { redirectRouter } from './routes/redirect';

const app = express();

// Middleware
app.use(express.json());

// Error handling for malformed JSON
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({ error: 'Invalid JSON' });
    return;
  }
  next(err);
});

// Routes (order matters: specific routes before catch-all)
app.use('/health', healthRouter);
app.use('/api/urls', urlsRouter);
app.use('/api/auth', authRouter);
app.use('/', redirectRouter); // Must be last - catches /:code

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
