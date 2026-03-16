import { randomUUID } from 'crypto';
import { ObjectId } from 'mongodb';
import {
  type ClientApp,
  type DeliveryAttempt,
  type DispatchJob,
  type DispatchJobStatus,
  type NotificationRequest,
  type PushEndpoint,
} from '../domain/types.js';
import { collections } from './mongo.js';

const now = (): Date => new Date();

const fromId = (id: string): ObjectId => new ObjectId(id);

const normalizeId = <T extends { _id: ObjectId }>(document: T): Omit<T, '_id'> & { id: string } => {
  const { _id, ...rest } = document;
  return { id: _id.toHexString(), ...rest };
};

export const clientAppRepository = {
  async findByApiKeyHash(apiKeyHash: string): Promise<ClientApp | null> {
    const doc = await collections.clientApps().findOne({ apiKeyHash });
    if (!doc) {
      return null;
    }

    return normalizeId(doc as ClientApp & { _id: ObjectId });
  },
};

export const pushEndpointRepository = {
  async create(input: Omit<PushEndpoint, 'id' | 'createdAt' | 'updatedAt'>): Promise<PushEndpoint> {
    const timestamp = now();
    const payload = { ...input, createdAt: timestamp, updatedAt: timestamp };
    const result = await collections.pushEndpoints().insertOne(payload);
    return { id: result.insertedId.toHexString(), ...payload };
  },

  async update(
    endpointId: string,
    clientAppId: string,
    patch: Partial<Omit<PushEndpoint, 'id' | 'clientAppId' | 'createdAt'>>,
  ): Promise<PushEndpoint | null> {
    const timestamp = now();
    const result = await collections
      .pushEndpoints()
      .findOneAndUpdate(
        { _id: fromId(endpointId), clientAppId },
        { $set: { ...patch, updatedAt: timestamp } },
        { returnDocument: 'after' },
      );

    if (!result) {
      return null;
    }

    return normalizeId(result as PushEndpoint & { _id: ObjectId });
  },

  async deactivate(endpointId: string, clientAppId: string): Promise<boolean> {
    const result = await collections
      .pushEndpoints()
      .updateOne(
        { _id: fromId(endpointId), clientAppId },
        { $set: { status: 'unsubscribed', updatedAt: now() } },
      );

    return result.matchedCount > 0;
  },

  async listActiveByClient(clientAppId: string): Promise<PushEndpoint[]> {
    const docs = await collections
      .pushEndpoints()
      .find({ clientAppId, status: 'active' })
      .toArray();

    return docs.map((doc) => normalizeId(doc as PushEndpoint & { _id: ObjectId }));
  },

  async findByIds(ids: string[], clientAppId: string): Promise<PushEndpoint[]> {
    const objectIds = ids.map((id) => fromId(id));
    const docs = await collections
      .pushEndpoints()
      .find({ _id: { $in: objectIds }, clientAppId, status: 'active' })
      .toArray();

    return docs.map((doc) => normalizeId(doc as PushEndpoint & { _id: ObjectId }));
  },

  async markInvalid(endpointId: string): Promise<void> {
    await collections
      .pushEndpoints()
      .updateOne({ _id: fromId(endpointId) }, { $set: { status: 'invalid', updatedAt: now() } });
  },
};

export const notificationRequestRepository = {
  async create(
    input: Omit<NotificationRequest, 'id' | 'createdAt' | 'updatedAt' | 'status'> & {
      status?: NotificationRequest['status'];
    },
  ): Promise<NotificationRequest> {
    const timestamp = now();
    const payload = {
      ...input,
      status: input.status ?? 'accepted',
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    const result = await collections.notificationRequests().insertOne(payload);
    return { id: result.insertedId.toHexString(), ...payload };
  },

  async findById(id: string): Promise<NotificationRequest | null> {
    const doc = await collections.notificationRequests().findOne({ _id: fromId(id) });
    if (!doc) {
      return null;
    }
    return normalizeId(doc as NotificationRequest & { _id: ObjectId });
  },

  async findByIdempotencyKey(
    clientAppId: string,
    idempotencyKey: string,
  ): Promise<NotificationRequest | null> {
    const doc = await collections.notificationRequests().findOne({
      clientAppId,
      idempotencyKey,
    });

    if (!doc) {
      return null;
    }

    return normalizeId(doc as NotificationRequest & { _id: ObjectId });
  },

  async updateStatus(id: string, status: NotificationRequest['status']): Promise<void> {
    await collections
      .notificationRequests()
      .updateOne({ _id: fromId(id) }, { $set: { status, updatedAt: now() } });
  },
};

export const deliveryAttemptRepository = {
  async create(
    input: Omit<DeliveryAttempt, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<DeliveryAttempt> {
    const timestamp = now();
    const payload = {
      ...input,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    const result = await collections.deliveryAttempts().insertOne(payload);
    return { id: result.insertedId.toHexString(), ...payload };
  },

  async listByNotificationRequest(notificationRequestId: string): Promise<DeliveryAttempt[]> {
    const docs = await collections.deliveryAttempts().find({ notificationRequestId }).toArray();
    return docs.map((doc) => normalizeId(doc as DeliveryAttempt & { _id: ObjectId }));
  },
};

export const dispatchJobRepository = {
  async create(notificationRequestId: string): Promise<DispatchJob> {
    const timestamp = now();
    const payload: Omit<DispatchJob, 'id'> = {
      notificationRequestId,
      status: 'pending',
      availableAt: timestamp,
      leaseUntil: undefined,
      attemptCount: 0,
      lastError: undefined,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    const result = await collections.dispatchJobs().insertOne(payload);
    return { id: result.insertedId.toHexString(), ...payload };
  },

  async leaseBatch(batchSize: number, leaseMs: number): Promise<DispatchJob[]> {
    const leased: DispatchJob[] = [];

    for (let index = 0; index < batchSize; index += 1) {
      const timestamp = now();
      const leaseUntil = new Date(timestamp.getTime() + leaseMs);
      const result = await collections.dispatchJobs().findOneAndUpdate(
        {
          status: 'pending',
          availableAt: { $lte: timestamp },
        },
        {
          $set: {
            status: 'leased',
            leaseUntil,
            updatedAt: timestamp,
          },
        },
        {
          sort: { availableAt: 1 },
          returnDocument: 'after',
        },
      );

      if (!result) {
        break;
      }

      leased.push(normalizeId(result as DispatchJob & { _id: ObjectId }));
    }

    return leased;
  },

  async markDone(jobId: string): Promise<void> {
    await this.updateStatus(jobId, 'done');
  },

  async markDead(jobId: string, lastError?: string): Promise<void> {
    await this.updateStatus(jobId, 'dead', { lastError });
  },

  async reschedule(
    jobId: string,
    attemptCount: number,
    availableAt: Date,
    lastError?: string,
  ): Promise<void> {
    await collections.dispatchJobs().updateOne(
      { _id: fromId(jobId) },
      {
        $set: {
          status: 'pending',
          attemptCount,
          availableAt,
          leaseUntil: undefined,
          lastError,
          updatedAt: now(),
        },
      },
    );
  },

  async updateStatus(
    jobId: string,
    status: DispatchJobStatus,
    extra: Partial<Pick<DispatchJob, 'lastError' | 'attemptCount'>> = {},
  ): Promise<void> {
    await collections.dispatchJobs().updateOne(
      { _id: fromId(jobId) },
      {
        $set: {
          status,
          leaseUntil: undefined,
          updatedAt: now(),
          ...extra,
        },
      },
    );
  },

  async pendingCount(): Promise<number> {
    return collections.dispatchJobs().countDocuments({ status: 'pending' });
  },

  generateIdempotencyFallback(): string {
    return randomUUID();
  },
};
