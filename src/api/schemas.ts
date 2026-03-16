import { z } from 'zod';

export const registerEndpointSchema = z.object({
  channel: z.enum(['webpush', 'fcm', 'apns', 'email']),
  externalRef: z.string().optional(),
  tokenOrSubscription: z.string().min(1),
  platformMetadata: z.record(z.string(), z.unknown()).optional(),
});

export const updateEndpointSchema = z.object({
  tokenOrSubscription: z.string().min(1).optional(),
  platformMetadata: z.record(z.string(), z.unknown()).optional(),
  status: z.enum(['active', 'invalid', 'unsubscribed']).optional(),
});

export const sendNotificationSchema = z.object({
  endpointIds: z.array(z.string()).min(1).optional(),
  externalRefs: z.array(z.string()).min(1).optional(),
  payload: z.object({
    title: z.string().min(1),
    body: z.string().min(1),
    data: z.record(z.string(), z.unknown()).optional(),
    ttl: z.number().int().positive().optional(),
    priority: z.enum(['low', 'normal', 'high']).optional(),
    collapseKey: z.string().optional(),
    webpush: z.record(z.string(), z.unknown()).optional(),
    fcm: z.record(z.string(), z.unknown()).optional(),
    apns: z.record(z.string(), z.unknown()).optional(),
    email: z
      .object({
        from: z.string().email().optional(),
        replyTo: z.string().email().optional(),
        html: z.string().optional(),
        subject: z.string().optional(),
      })
      .optional(),
  }),
});

export type RegisterEndpointInput = z.infer<typeof registerEndpointSchema>;
export type UpdateEndpointInput = z.infer<typeof updateEndpointSchema>;
export type SendNotificationInput = z.infer<typeof sendNotificationSchema>;
