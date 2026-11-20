import { HttpClient } from './httpClient.js';

export interface BankPayoutParams {
  merchantOrderNo: string;
  amount: number | string;
  cashNumber: string;
  ifsc: string;
  cashName?: string;
  cashPhone?: string;
  bankName?: string;
  notifyUrl?: string;
}

export interface UpiPayoutParams {
  merchantOrderNo: string;
  amount: number | string;
  cashNumber: string;
  cashName?: string;
  cashPhone?: string;
  notifyUrl?: string;
}

export interface PayoutCreateResult {
  merchantOrderNo: string;
  gatewayOrderNo: string;
  amount: string;
  feeCharged: string;
  settleAmount?: string;
  totalDeducted?: string;
  cashState: number;
}

export interface PayoutStatusResult {
  merchantOrderNo: string;
  gatewayOrderNo: string;
  amount: string;
  feeCharged: string;
  holdAmount: string;
  cashState: number;
  cashStateName: string;
  approvalStatus: string;
  utr: string | null;
  createdAt: string;
  successTime: string | null;
}

/**
 * Payout (Withdrawals) Service
 */
export class PayoutService {
  private readonly http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
  }

  async createBankPayout(params: BankPayoutParams): Promise<PayoutCreateResult> {
    const payload = {
      version: 'V2',
      ...params,
    };
    const res = await this.http.post<PayoutCreateResult>(
      '/merchant/api/payout/create',
      payload as unknown as Record<string, unknown>
    );
    return res.data as PayoutCreateResult;
  }

  async createUpiPayout(params: UpiPayoutParams): Promise<PayoutCreateResult> {
    const payload = {
      version: 'V3',
      ...params,
    };
    const res = await this.http.post<PayoutCreateResult>(
      '/merchant/api/payout/create',
      payload as unknown as Record<string, unknown>
    );
    return res.data as PayoutCreateResult;
  }

  async create(params: Record<string, unknown>): Promise<PayoutCreateResult> {
    const res = await this.http.post<PayoutCreateResult>(
      '/merchant/api/payout/create',
      params
    );
    return res.data as PayoutCreateResult;
  }

  async getStatus(orderNo: string): Promise<PayoutStatusResult> {
    if (!orderNo) throw new Error('orderNo is required to check payout status');
    const res = await this.http.post<PayoutStatusResult>('/merchant/api/payout/query', {
      orderNo,
    });
    return res.data as PayoutStatusResult;
  }

  async query(orderNo: string): Promise<PayoutStatusResult> {
    return this.getStatus(orderNo);
  }

  async list(params: {
    limit?: number;
    offset?: number;
    state?: string | number;
    approvalStatus?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
  } = {}) {
    const res = await this.http.get<{ orders: Array<Record<string, unknown>>; total: number }>(
      '/merchant/api/payout/list',
      params as Record<string, unknown>
    );
    return res.data!;
  }
}
