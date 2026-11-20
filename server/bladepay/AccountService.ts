import { HttpClient } from './httpClient.js';

export interface BladePayBalance {
  merchantId: string;
  availableBalance: number;
  pendingBalance: number;
  totalPayinVolume: number;
  totalPayoutVolume: number;
  totalFeeCollected: number;
}

/**
 * Account, Wallet & Ledger Service
 */
export class AccountService {
  private readonly http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
  }

  async getBalance(): Promise<BladePayBalance> {
    const res = await this.http.get<BladePayBalance>('/merchant/api/balance');
    return res.data as BladePayBalance;
  }

  async getAccount<T = Record<string, unknown>>(): Promise<T> {
    const res = await this.http.get<T>('/merchant/api/account');
    return res.data as T;
  }

  async getProfile<T = Record<string, unknown>>(): Promise<T> {
    const res = await this.http.get<T>('/merchant/api/auth/me');
    return res.data as T;
  }

  async getLedger(params: { limit?: number; offset?: number } = { limit: 50, offset: 0 }) {
    const res = await this.http.get<{ ledger: Array<Record<string, unknown>>; total: number }>(
      '/merchant/api/ledger',
      params as Record<string, unknown>
    );
    return res.data!;
  }
}
