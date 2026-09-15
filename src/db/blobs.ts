import { v4 as uuid } from 'uuid';
import { db } from './db';

export async function storeBlob(blob: Blob): Promise<string> {
  const key = uuid();
  await db.blobs.put({ key, blob });
  return key;
}

export async function getBlob(key: string): Promise<Blob | undefined> {
  const record = await db.blobs.get(key);
  return record?.blob;
}

export async function deleteBlobByKey(key: string): Promise<void> {
  await db.blobs.delete(key);
}
