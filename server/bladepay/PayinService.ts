import { HttpClient } from './httpClient.js';

export interface CreatePayinParams {
  merchantOrderNo: string;
  amount: number | string;
  currency?: string;
  payinName?: string;
  payinPhone?: string;
  payinEmail?: string;
  notifyUrl?: string;
  returnUrl?: string;
  mark?: string;
}

export interface CreatePayinResult {
  merchantOrderNo: string;
  gatewayOrderNo: string;
  cashierUrl: string;
  amount: string;
  payinState: number;
}

export interface PayinStatusResult {
  isPaid: boolean;
  status: string;
  payinState: number;
  payinStateName: string;
  orderNo: string;
  merchantOrderNo: string;
  gatewayOrderNo: string;
  amount: string;
  actualAmount: string;
  feeCharged: string;
  settleAmount: string;
  currency: string;
  utr: string | null;
  cashierUrl: string;
  createdAt: string;
  paidAt: string | null;
}

/**
 * Payin (Collections) Service
 */
export class PayinService {
  private readonly http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
  }

  async create(params: CreatePayinParams): Promise<CreatePayinResult> {
    const res = await this.http.post<CreatePayinResult>(
      '/merchant/api/payin/create',
      params as unknown as Record<string, unknown>
    );
    return res.data as CreatePayinResult;
  }

  async getStatus(orderNo: string): Promise<PayinStatusResult> {
    if (!orderNo) throw new Error('orderNo is required to check order status');
    const res = await this.http.post<PayinStatusResult>('/merchant/api/payin/query', {
      orderNo,
    });
    return res.data as PayinStatusResult;
  }

  async query(orderNo: string): Promise<PayinStatusResult> {
    return this.getStatus(orderNo);
  }

  async submitUtr(merchantOrderNo: string, utr: string): Promise<unknown> {
    if (!merchantOrderNo) throw new Error('merchantOrderNo is required');
    if (!utr) throw new Error('utr is required');
    const res = await this.http.post('/merchant/api/payin/utr/submit', {
      merchantOrderNo,
      utr,
    });
    return res.data;
  }

  async list(params: {
    limit?: number;
    offset?: number;
    state?: string | number;
    startDate?: string;
    endDate?: string;
    search?: string;
  } = {}) {
    const res = await this.http.get<{ orders: Array<Record<string, unknown>>; total: number }>(
      '/merchant/api/payin/list',
      params as Record<string, unknown>
    );
    return res.data!;
  }

  async getSummary() {
    const res = await this.http.get<Record<string, unknown>>('/merchant/api/payin/summary');
    return res.data!;
  }
}
