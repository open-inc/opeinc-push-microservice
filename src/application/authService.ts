import { hashApiKey } from '../common/crypto.js';
import type { ClientApp } from '../domain/types.js';
import { clientAppRepository } from '../persistence/repositories.js';

export class AuthService {
  async authenticate(apiKey: string | undefined): Promise<ClientApp> {
    if (!apiKey) {
      throw new Error('Missing API key');
    }

    const app = await clientAppRepository.findByApiKeyHash(hashApiKey(apiKey));

    if (!app || app.status !== 'active') {
      throw new Error('Invalid API key');
    }

    return app;
  }
}
