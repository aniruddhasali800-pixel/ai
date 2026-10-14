import { resolve } from 'node:path';
import { env } from './env';
import { startStore } from '../store';

/**
 * The restaurant's records are folders of JSON lines on this machine, so "connecting" means reading
 * that tree into memory once, before the first request is served. There is no server to reach and
 * nothing to fall back to: if the folder cannot be read, the process must say so rather than start
 * and answer with an empty restaurant.
 */
export async function connectDb(): Promise<void> {
  const dir = resolve(process.cwd(), env.ARCHIVE_DIR);
  const { files, documents } = await startStore(dir);
  if (documents) console.log(`[store] ${documents} records across ${files} files in ${dir}`);
  else console.log(`[store] the archive is empty — ${dir}`);
}

export async function disconnectDb(): Promise<void> {
  // Writes are flushed as they happen, so there is no buffer to drain here.
}
