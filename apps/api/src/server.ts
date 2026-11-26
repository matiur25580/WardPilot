import { app } from './app';
import { connectDatabase, disconnectDatabase } from './config/database';
import { env } from './config/env';

async function start(): Promise<void> {
  try {
    await connectDatabase();
    const server = app.listen(env.API_PORT, env.API_HOST, () => console.info(`WardPilot API listening on http://localhost:${env.API_PORT}`));
    const shutdown = (signal: string) => {
      console.info(`${signal} received; shutting down gracefully.`);
      server.close(() => { void disconnectDatabase().finally(() => process.exit(0)); });
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    console.error('Unable to start WardPilot API:', error);
    process.exit(1);
  }
}
void start();
