import crypto from 'crypto';

/**
 * Webhook Verification Service
 * Handles MD5 signature calculation and validation for incoming asynchronous callbacks.
 */
export class WebhookService {
  private readonly defaultApiToken: string;

  constructor(defaultApiToken: string = '') {
    this.defaultApiToken = defaultApiToken;
  }

  generateSignature(data: Record<string, unknown>, apiToken: string = ''): string {
    const secret = apiToken || this.defaultApiToken;
    if (!secret) {
      throw new Error('Merchant API Token is required to generate signature');
    }

    const sortedKeys = Object.keys(data).filter((k) => k !== 'sign').sort();
    const pairs: string[] = [];

    for (const key of sortedKeys) {
      const val = data[key];
      if (val !== '' && val !== null && val !== undefined) {
        pairs.push(`${key}=${val}`);
      }
    }

    const stringToSign = `${pairs.join('&')}&key=${secret}`;
    return crypto
      .createHash('md5')
      .update(stringToSign, 'utf8')
      .digest('hex')
      .toLowerCase();
  }

  verifySignature(payload: Record<string, unknown> | null | undefined, apiToken: string = ''): boolean {
    if (!payload || typeof payload !== 'object') return false;

    const { sign, ...data } = payload;
    if (!sign || typeof sign !== 'string') return false;

    const secret = apiToken || this.defaultApiToken;
    if (!secret) return false;

    const expectedSign = this.generateSignature(data, secret);

    try {
      const a = Buffer.from(sign.toLowerCase(), 'utf8');
      const b = Buffer.from(expectedSign, 'utf8');
      if (a.length !== b.length) return false;
      return crypto.timingSafeEqual(a, b);
    } catch {
      return sign.toLowerCase() === expectedSign;
    }
  }
}
