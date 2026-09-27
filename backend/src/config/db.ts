import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { env } from './env';

let embedded: { stop: () => Promise<boolean> } | null = null;

function mask(uri: string) {
  return uri.replace(/\/\/([^@]+)@/, '//***@');
}

export async function connectDb(): Promise<void> {
  mongoose.set('strictQuery', true);

  // Tests reconnect before every case; an already-open connection must be reused,
  // otherwise a second mongod would fight for the same dbPath lock.
  if (mongoose.connection.readyState === 1 || mongoose.connection.readyState === 2) return;

  if (env.MONGODB_URI) {
    try {
      await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 2500 });
      console.log(`[db] connected to ${mask(env.MONGODB_URI)}`);
      return;
    } catch (err) {
      if (env.isProd) throw err;
      console.warn('[db] MONGODB_URI unreachable — using embedded MongoDB for development');
    }
  }

  if (env.isProd) {
    throw new Error('MONGODB_URI is required in production');
  }

  const { MongoMemoryServer } = await import('mongodb-memory-server');
  const dataDir = path.resolve(process.cwd(), '.data', env.isTest ? 'mongo-test' : 'mongo');
  fs.mkdirSync(dataDir, { recursive: true });
  const server = await MongoMemoryServer.create({
    instance: { dbPath: dataDir, storageEngine: 'wiredTiger' },
  });
  embedded = server;
  await mongoose.connect(server.getUri(env.isTest ? 'sizzle-test' : 'sizzle'));
  console.log(`[db] embedded MongoDB started (data persists in ${path.relative(process.cwd(), dataDir)})`);
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
  if (embedded) {
    await embedded.stop();
    embedded = null;
  }
}
