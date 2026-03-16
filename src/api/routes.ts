import type { FastifyPluginAsync } from 'fastify';
import { EndpointService } from '../application/endpointService.js';
import { NotificationService } from '../application/notificationService.js';
import { config } from '../config.js';
import { registerEndpointSchema, sendNotificationSchema, updateEndpointSchema } from './schemas.js';
import { metricsRegistry, metrics } from '../observability/metrics.js';
import { isMongoConnected } from '../persistence/mongo.js';

const endpointService = new EndpointService();
const notificationService = new NotificationService();

export const routes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/webpush/public-key', async (request, reply) => {
    if (!config.WEB_PUSH_VAPID_PUBLIC_KEY) {
      return reply.code(503).send({ error: 'Web Push VAPID public key not configured' });
    }

    return { publicKey: config.WEB_PUSH_VAPID_PUBLIC_KEY };
  });

  fastify.get('/webpush/sw.js', async (request, reply) => {
    reply.header('Content-Type', 'application/javascript; charset=utf-8');
    return `self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    let data = {};
    try {
      data = event.data ? event.data.json() : {};
    } catch {
      data = { payload: event.data ? event.data.text() : '' };
    }

    const payloadValue = typeof data.payload === 'string' ? data.payload : '';
    const title =
      (typeof data.title === 'string' && data.title.length > 0
        ? data.title
        : typeof data.topic === 'string' && data.topic.length > 0
          ? data.topic
          : 'Notification');
    const body =
      (typeof data.body === 'string' && data.body.length > 0
        ? data.body
        : payloadValue);

    await self.registration.showNotification(title, {
      body,
      data: typeof data.data === 'object' && data.data ? data.data : {},
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
});`;
  });

  fastify.get('/webpush/test', async (request, reply) => {
    reply.header('Content-Type', 'text/html; charset=utf-8');
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Web Push Test</title>
    <style>
      body { font-family: Arial, sans-serif; max-width: 860px; margin: 2rem auto; padding: 0 1rem; }
      label { display: block; margin-top: 0.75rem; font-weight: 600; }
      input, textarea { width: 100%; padding: 0.5rem; margin-top: 0.25rem; }
      button { margin-top: 0.75rem; margin-right: 0.5rem; padding: 0.5rem 0.9rem; }
      pre { background: #111; color: #eee; padding: 1rem; border-radius: 6px; white-space: pre-wrap; }
      .row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    </style>
  </head>
  <body>
    <h1>Web Push Test Page</h1>
    <p>This page registers a browser push endpoint and sends a test notification through the REST API.</p>

    <label>API Key (x-api-key)</label>
    <input id="apiKey" type="password" placeholder="Client API key" />

    <label>VAPID Public Key</label>
    <input id="publicKey" type="text" placeholder="Will auto-load from /webpush/public-key" />

    <div class="row">
      <div>
        <label>Notification Title</label>
        <input id="title" type="text" value="Web Push Test" />
      </div>
      <div>
        <label>Notification Body</label>
        <input id="body" type="text" value="Hello from open.INC Push Microservice" />
      </div>
    </div>

    <button id="loadKey">Load Public Key</button>
    <button id="requestPermission">Request Permission</button>
    <button id="registerEndpoint">Register Web Push Endpoint</button>
    <button id="sendNotification">Send Test Notification</button>
    <button id="checkStatus">Check Last Status</button>

    <h3>Runtime State</h3>
    <pre id="state"></pre>

    <h3>Logs</h3>
    <pre id="logs"></pre>

    <script>
      const stateEl = document.getElementById('state');
      const logsEl = document.getElementById('logs');

      const state = {
        endpointId: null,
        notificationId: null,
      };

      const renderState = () => {
        stateEl.textContent = JSON.stringify(state, null, 2);
      };

      const log = (message, data) => {
        const line = data ? message + '\\n' + JSON.stringify(data, null, 2) : message;
        logsEl.textContent = (line + '\\n\\n' + logsEl.textContent).slice(0, 6000);
      };

      const getValue = (id) => document.getElementById(id).value;

      const apiHeaders = () => {
        const apiKey = getValue('apiKey').trim();
        if (!apiKey) {
          throw new Error('API key is required');
        }
        return {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        };
      };

      const urlBase64ToUint8Array = (base64String) => {
        const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
        const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);

        for (let i = 0; i < rawData.length; ++i) {
          outputArray[i] = rawData.charCodeAt(i);
        }

        return outputArray;
      };

      const ensureServiceWorker = async () => {
        if (!('serviceWorker' in navigator)) {
          throw new Error('Service workers are not supported in this browser');
        }

        return navigator.serviceWorker.register('/webpush/sw.js');
      };

      const ensurePermission = async () => {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          throw new Error('Notification permission was not granted');
        }
      };

      const loadPublicKey = async () => {
        const response = await fetch('/webpush/public-key');
        if (!response.ok) {
          throw new Error('Unable to load public key from server');
        }

        const data = await response.json();
        document.getElementById('publicKey').value = data.publicKey;
        log('Loaded VAPID public key');
      };

      const registerEndpoint = async () => {
        await ensurePermission();
        const registration = await ensureServiceWorker();
        const publicKey = getValue('publicKey').trim();

        if (!publicKey) {
          throw new Error('VAPID public key is required');
        }

        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });

        const response = await fetch('/v1/endpoints', {
          method: 'POST',
          headers: apiHeaders(),
          body: JSON.stringify({
            channel: 'webpush',
            tokenOrSubscription: JSON.stringify(subscription),
            platformMetadata: {
              userAgent: navigator.userAgent,
            },
          }),
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error('Endpoint registration failed: ' + JSON.stringify(data));
        }

        state.endpointId = data.id;
        renderState();
        log('Registered endpoint', data);
      };

      const sendNotification = async () => {
        if (!state.endpointId) {
          throw new Error('Register endpoint first');
        }

        const response = await fetch('/v1/notifications/send', {
          method: 'POST',
          headers: {
            ...apiHeaders(),
            'Idempotency-Key': 'webpush-test-' + Date.now(),
          },
          body: JSON.stringify({
            endpointIds: [state.endpointId],
            payload: {
              title: getValue('title') || 'Web Push Test',
              body: getValue('body') || 'Hello from Web Push test page',
              webpush: {
                urgency: 'high',
                ttl: 120,
              },
            },
          }),
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error('Notification send failed: ' + JSON.stringify(data));
        }

        state.notificationId = data.notificationId;
        renderState();
        log('Notification submitted', data);
      };

      const checkStatus = async () => {
        if (!state.notificationId) {
          throw new Error('No notificationId available');
        }

        const response = await fetch('/v1/notifications/' + state.notificationId, {
          headers: {
            'x-api-key': getValue('apiKey').trim(),
          },
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error('Status check failed: ' + JSON.stringify(data));
        }

        log('Notification status', data);
      };

      document.getElementById('loadKey').addEventListener('click', () => {
        loadPublicKey().catch((error) => log(String(error)));
      });

      document.getElementById('requestPermission').addEventListener('click', () => {
        ensurePermission()
          .then(() => log('Notification permission granted'))
          .catch((error) => log(String(error)));
      });

      document.getElementById('registerEndpoint').addEventListener('click', () => {
        registerEndpoint().catch((error) => log(String(error)));
      });

      document.getElementById('sendNotification').addEventListener('click', () => {
        sendNotification().catch((error) => log(String(error)));
      });

      document.getElementById('checkStatus').addEventListener('click', () => {
        checkStatus().catch((error) => log(String(error)));
      });

      renderState();
    </script>
  </body>
</html>`;
  });

  fastify.get('/email/test', async (request, reply) => {
    reply.header('Content-Type', 'text/html; charset=utf-8');
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Email Test</title>
    <style>
      body { font-family: Arial, sans-serif; max-width: 860px; margin: 2rem auto; padding: 0 1rem; }
      label { display: block; margin-top: 0.75rem; font-weight: 600; }
      input, textarea { width: 100%; padding: 0.5rem; margin-top: 0.25rem; }
      button { margin-top: 0.75rem; margin-right: 0.5rem; padding: 0.5rem 0.9rem; }
      pre { background: #111; color: #eee; padding: 1rem; border-radius: 6px; white-space: pre-wrap; }
      .row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    </style>
  </head>
  <body>
    <h1>Email Test Page</h1>
    <p>This page registers an email endpoint and sends a test email through the REST API.</p>

    <label>API Key (x-api-key)</label>
    <input id="apiKey" type="password" placeholder="Client API key" />

    <label>Recipient Email</label>
    <input id="recipient" type="email" placeholder="recipient@example.com" />

    <div class="row">
      <div>
        <label>Subject</label>
        <input id="subject" type="text" value="Email Test" />
      </div>
      <div>
        <label>Reply-To (optional)</label>
        <input id="replyTo" type="email" placeholder="reply@example.com" />
      </div>
    </div>

    <label>Body</label>
    <textarea id="body" rows="4">Hello from open.INC Push Microservice Email test.</textarea>

    <label>HTML Body (optional)</label>
    <textarea id="html" rows="4" placeholder="<p>Hello <strong>HTML</strong></p>"></textarea>

    <button id="registerEndpoint">Register Email Endpoint</button>
    <button id="sendNotification">Send Test Email</button>
    <button id="checkStatus">Check Last Status</button>

    <h3>Runtime State</h3>
    <pre id="state"></pre>

    <h3>Logs</h3>
    <pre id="logs"></pre>

    <script>
      const stateEl = document.getElementById('state');
      const logsEl = document.getElementById('logs');

      const state = {
        endpointId: null,
        notificationId: null,
      };

      const renderState = () => {
        stateEl.textContent = JSON.stringify(state, null, 2);
      };

      const log = (message, data) => {
        const line = data ? message + '\\n' + JSON.stringify(data, null, 2) : message;
        logsEl.textContent = (line + '\\n\\n' + logsEl.textContent).slice(0, 6000);
      };

      const getValue = (id) => document.getElementById(id).value;

      const apiHeaders = () => {
        const apiKey = getValue('apiKey').trim();
        if (!apiKey) {
          throw new Error('API key is required');
        }
        return {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        };
      };

      const registerEndpoint = async () => {
        const recipient = getValue('recipient').trim();
        if (!recipient) {
          throw new Error('Recipient email is required');
        }

        const response = await fetch('/v1/endpoints', {
          method: 'POST',
          headers: apiHeaders(),
          body: JSON.stringify({
            channel: 'email',
            tokenOrSubscription: recipient,
          }),
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error('Endpoint registration failed: ' + JSON.stringify(data));
        }

        state.endpointId = data.id;
        renderState();
        log('Registered endpoint', data);
      };

      const sendNotification = async () => {
        if (!state.endpointId) {
          throw new Error('Register endpoint first');
        }

        const subject = getValue('subject').trim() || 'Email Test';
        const body = getValue('body') || 'Hello from open.INC Push Microservice Email test.';
        const replyTo = getValue('replyTo').trim();
        const html = getValue('html').trim();

        const emailOptions = {
          ...(replyTo ? { replyTo } : {}),
          ...(html ? { html } : {}),
        };

        const response = await fetch('/v1/notifications/send', {
          method: 'POST',
          headers: {
            ...apiHeaders(),
            'Idempotency-Key': 'email-test-' + Date.now(),
          },
          body: JSON.stringify({
            endpointIds: [state.endpointId],
            payload: {
              title: subject,
              body,
              email: emailOptions,
            },
          }),
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error('Notification send failed: ' + JSON.stringify(data));
        }

        state.notificationId = data.notificationId;
        renderState();
        log('Notification submitted', data);
      };

      const checkStatus = async () => {
        if (!state.notificationId) {
          throw new Error('No notificationId available');
        }

        const response = await fetch('/v1/notifications/' + state.notificationId, {
          headers: {
            'x-api-key': getValue('apiKey').trim(),
          },
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error('Status check failed: ' + JSON.stringify(data));
        }

        log('Notification status', data);
      };

      document.getElementById('registerEndpoint').addEventListener('click', () => {
        registerEndpoint().catch((error) => log(String(error)));
      });

      document.getElementById('sendNotification').addEventListener('click', () => {
        sendNotification().catch((error) => log(String(error)));
      });

      document.getElementById('checkStatus').addEventListener('click', () => {
        checkStatus().catch((error) => log(String(error)));
      });

      renderState();
    </script>
  </body>
</html>`;
  });

  fastify.get('/health/live', async () => ({ status: 'ok' }));

  fastify.get('/health/ready', async (request, reply) => {
    if (!isMongoConnected()) {
      reply.code(503);
      return { status: 'not_ready' };
    }

    return { status: 'ready' };
  });

  fastify.get('/metrics', async (request, reply) => {
    reply.header('Content-Type', metricsRegistry.contentType);
    return metricsRegistry.metrics();
  });

  fastify.post('/v1/endpoints', async (request, reply) => {
    const parsed = registerEndpointSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const clientApp = request.clientApp;
    if (!clientApp) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    const endpoint = await endpointService.register(clientApp.id, parsed.data);

    return reply.code(201).send({ id: endpoint.id, status: endpoint.status });
  });

  fastify.patch('/v1/endpoints/:id', async (request, reply) => {
    const parsed = updateEndpointSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const clientApp = request.clientApp;
    if (!clientApp) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    const endpoint = await endpointService.update(
      clientApp.id,
      String((request.params as { id: string }).id),
      parsed.data,
    );

    if (!endpoint) {
      return reply.code(404).send({ error: 'Endpoint not found' });
    }

    return { id: endpoint.id, status: endpoint.status };
  });

  fastify.delete('/v1/endpoints/:id', async (request, reply) => {
    const clientApp = request.clientApp;
    if (!clientApp) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    const success = await endpointService.deactivate(
      clientApp.id,
      String((request.params as { id: string }).id),
    );

    if (!success) {
      return reply.code(404).send({ error: 'Endpoint not found' });
    }

    return reply.code(204).send();
  });

  fastify.post('/v1/notifications/send', async (request, reply) => {
    const parsed = sendNotificationSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const clientApp = request.clientApp;
    if (!clientApp) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    const idempotencyKeyHeader = request.headers['idempotency-key'];
    const idempotencyKey = Array.isArray(idempotencyKeyHeader)
      ? idempotencyKeyHeader[0]
      : idempotencyKeyHeader;

    const result = await notificationService.submit(clientApp.id, parsed.data, idempotencyKey);
    metrics.notificationsAcceptedTotal.inc();

    return reply.code(202).send({ notificationId: result.id, status: result.status });
  });

  fastify.get('/v1/notifications/:id', async (request, reply) => {
    const clientApp = request.clientApp;
    if (!clientApp) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    const notificationId = String((request.params as { id: string }).id);
    const status = await notificationService.status(notificationId);

    if (!status.request || status.request.clientAppId !== clientApp.id) {
      return reply.code(404).send({ error: 'Notification not found' });
    }

    return {
      notification: status.request,
      attempts: status.attempts,
    };
  });
};
