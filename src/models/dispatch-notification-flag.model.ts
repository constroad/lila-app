import { Schema, type Model } from 'mongoose';
import { getSharedConnection } from '../database/sharedConnection.js';

const dispatchNotificationFlagSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    companyId: { type: String, required: true },
    createdAt: {
      type: Date,
      default: Date.now,
      expires: 60 * 60 * 48,
    },
  },
  {
    collection: 'dispatch_notification_flags',
  }
);

let dispatchNotificationFlagModel: Model<Record<string, unknown>> | null = null;

export async function getDispatchNotificationFlagModel() {
  if (dispatchNotificationFlagModel) {
    return dispatchNotificationFlagModel;
  }

  const conn = await getSharedConnection();
  dispatchNotificationFlagModel =
    (conn.models.DispatchNotificationFlag as Model<Record<string, unknown>>) ||
    conn.model<Record<string, unknown>>(
      'DispatchNotificationFlag',
      dispatchNotificationFlagSchema
    );

  return dispatchNotificationFlagModel;
}
