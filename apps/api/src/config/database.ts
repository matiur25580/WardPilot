import mongoose from 'mongoose';
import { env } from './env';

export async function connectDatabase(): Promise<void> {
  await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 5_000 });
}
export async function disconnectDatabase(): Promise<void> { await mongoose.disconnect(); }
export function isDatabaseReady(): boolean { return mongoose.connection.readyState === 1; }
