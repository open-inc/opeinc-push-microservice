import { collections } from './mongo.js';
import { hashApiKey } from '../common/crypto.js';

export const ensureClientApp = async (name: string, apiKey: string): Promise<void> => {
  const now = new Date();
  const apiKeyHash = hashApiKey(apiKey);

  await collections.clientApps().updateOne(
    { apiKeyHash },
    {
      $setOnInsert: {
        name,
        apiKeyHash,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
    },
    { upsert: true },
  );
};
