import { HttpClient } from './httpClient.js';
import { PayinService } from './PayinService.js';
import { PayoutService } from './PayoutService.js';
import { AccountService } from './AccountService.js';
import { WebhookService } from './WebhookService.js';

export interface BladePayOptions {
  apiToken?: string;
  baseUrl?: string;
  timeout?: number;
}

/**
 * BladePay Payment Gateway SDK Client
 */
export class BladePay {
  public readonly http: HttpClient;
  public readonly payin: PayinService;
  public readonly payout: PayoutService;
  public readonly account: AccountService;
  public readonly webhooks: WebhookService;

  constructor(options: BladePayOptions = {}) {
    const apiToken = options.apiToken || process.env.BLADEPAY_API_TOKEN || '';
    const baseUrl =
      options.baseUrl || process.env.BLADEPAY_BASE_URL || 'http://localhost:4009';
    const timeout = options.timeout || 15000;

    this.http = new HttpClient({ baseUrl, apiToken, timeout });
    this.payin = new PayinService(this.http);
    this.payout = new PayoutService(this.http);
    this.account = new AccountService(this.http);
    this.webhooks = new WebhookService(apiToken);
  }
}
