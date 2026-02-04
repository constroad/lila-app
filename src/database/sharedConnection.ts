import mongoose, { Connection } from 'mongoose';
import logger from '../utils/logger.js';
import { config } from '../config/environment.js';

let sharedConnection: Connection | null = null;
let connecting: Promise<Connection> | null = null;

export async function getSharedConnection(): Promise<Connection> {
  if (sharedConnection && sharedConnection.readyState === 1) {
    return sharedConnection;
  }

  if (connecting) {
    return connecting;
  }

  logger.info('[SharedDB] Connecting to shared_db...');

  connecting = mongoose
    .createConnection(config.mongodb.portalUri, {
      dbName: config.mongodb.sharedDb,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      maxPoolSize: 5,
      minPoolSize: 1,
      family: 4,
      retryWrites: true,
      heartbeatFrequencyMS: 10000,
    })
    .asPromise()
    .then((conn) => {
      sharedConnection = conn;
      connecting = null;
      logger.info('[SharedDB] Connected');
      return conn;
    })
    .catch((error) => {
      connecting = null;
      logger.error('[SharedDB] Connection failed:', error);
      throw error;
    });

  return connecting;
}

export async function closeSharedConnection(): Promise<void> {
  if (sharedConnection) {
    await sharedConnection.close();
    sharedConnection = null;
  }
}
