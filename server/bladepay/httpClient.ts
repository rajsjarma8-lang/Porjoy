import { BladePayError } from './errors.js';

export interface HttpClientOptions {
  baseUrl?: string;
  apiToken?: string;
  timeout?: number;
}

interface BladePayEnvelope<T> {
  code?: number;
  msg?: string;
  error?: string;
  data?: T;
}

/**
 * Lightweight, zero-dependency HTTP Client using native Node.js fetch
 */
export class HttpClient {
  public readonly baseUrl: string;
  public readonly apiToken?: string;
  public readonly timeout: number;

  constructor({ baseUrl, apiToken, timeout = 15000 }: HttpClientOptions) {
    this.baseUrl = (baseUrl || 'http://localhost:4009').replace(/\/+$/, '');
    this.apiToken = apiToken;
    this.timeout = timeout;
  }

  async request<T = unknown>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    data: Record<string, unknown> | null = null,
    query: Record<string, unknown> | null = null
  ): Promise<BladePayEnvelope<T>> {
    let url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;

    if (query && typeof query === 'object') {
      const searchParams = new URLSearchParams();
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null && v !== '') {
          searchParams.append(k, String(v));
        }
      }
      const qs = searchParams.toString();
      if (qs) {
        url += (url.includes('?') ? '&' : '?') + qs;
      }
    }

    const headers: Record<string, string> = {
      Accept: 'application/json',
    };

    if (this.apiToken) {
      headers.Authorization = `Bearer ${this.apiToken}`;
    }

    const upperMethod = method.toUpperCase() as 'GET' | 'POST' | 'PUT' | 'DELETE';
    const fetchOptions: RequestInit = {
      method: upperMethod,
      headers,
    };

    if (data && (upperMethod === 'POST' || upperMethod === 'PUT')) {
      headers['Content-Type'] = 'application/json';
      fetchOptions.body = JSON.stringify(data);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);
    fetchOptions.signal = controller.signal;

    try {
      const res = await fetch(url, fetchOptions);
      clearTimeout(timer);

      const contentType = res.headers.get('content-type') || '';
      let resBody: BladePayEnvelope<T>;

      if (contentType.includes('application/json')) {
        resBody = (await res.json()) as BladePayEnvelope<T>;
      } else {
        const text = await res.text();
        try {
          resBody = JSON.parse(text) as BladePayEnvelope<T>;
        } catch {
          resBody = {
            code: res.ok ? 0 : 1,
            msg: text,
            data: text as unknown as T,
          };
        }
      }

      if (!res.ok) {
        const errMsg =
          resBody?.msg || resBody?.error || `HTTP ${res.status} ${res.statusText}`;
        const errCode = Number(resBody?.code || res.status);
        throw new BladePayError(
          errMsg,
          errCode,
          res.status,
          resBody?.data || resBody
        );
      }

      if (resBody && typeof resBody.code === 'number' && resBody.code !== 0) {
        throw new BladePayError(
          resBody.msg || 'API returned non-zero code',
          resBody.code,
          res.status,
          resBody.data
        );
      }

      return resBody;
    } catch (err) {
      clearTimeout(timer);

      if (err instanceof BladePayError) {
        throw err;
      }

      if (err instanceof Error && err.name === 'AbortError') {
        throw new BladePayError(
          `Request timed out after ${this.timeout}ms`,
          408,
          408
        );
      }

      const msg = err instanceof Error ? err.message : String(err);
      throw new BladePayError(`Connection error: ${msg}`, 500, 500, err);
    }
  }

  get<T = unknown>(path: string, query: Record<string, unknown> | null = null) {
    return this.request<T>('GET', path, null, query);
  }

  post<T = unknown>(path: string, data: Record<string, unknown> | null = null) {
    return this.request<T>('POST', path, data, null);
  }
}
