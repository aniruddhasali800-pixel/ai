import http from 'node:http';
import { createApp } from './app';
import { env } from './config/env';
import { connectDb, disconnectDb } from './config/db';
import { initSocket, closeSocket } from './realtime/socket';
import { startScheduler, stopScheduler } from './services/scheduler.service';

async function main() {
  await connectDb();

  const app = createApp();
  const server = http.createServer(app);
  initSocket(server);
  startScheduler();

  await new Promise<void>((resolve) => server.listen(env.PORT, resolve));
  console.log(`[server] Sizzle API ready on http://localhost:${env.PORT} (${env.NODE_ENV})`);

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[server] ${signal} received — shutting down`);
    stopScheduler();
    await closeSocket();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await disconnectDb();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[server] failed to start', err);
  process.exit(1);
});
