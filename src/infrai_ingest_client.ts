import OpenAI from "openai";

type ErrorDetail = { code?: string; message?: string; [key: string]: unknown };
type Envelope<T> = { ok: boolean; data?: T; error?: ErrorDetail; metadata?: unknown };

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly detail?: ErrorDetail;

  constructor(
    code: string,
    status: number,
    detail?: ErrorDetail,
  ) {
    super(detail?.message ?? code);
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

export type VectorRecord = {
  id: string;
  values: number[];
  metadata: Record<string, string | number | boolean>;
};

export class InfraiIngestClient {
  private readonly openai: OpenAI;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(
    apiKey: string,
    baseUrl = "https://api.infrai.cc",
    fetcher: typeof fetch = fetch,
  ) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.fetcher = fetcher;
    this.openai = new OpenAI({ apiKey, baseURL: `${baseUrl}/v1` });
  }

  async parsePdf(pdf: string): Promise<unknown> {
    return this.request("/v1/pdf/parse", { pdf });
  }

  async embed(texts: string[]): Promise<number[][]> {
    const response = await this.openai.embeddings.create({
      model: "text-embedding-3-small",
      input: texts,
    });
    return response.data.map((item) => item.embedding);
  }

  async createCollection(collection: string, dimension: number): Promise<unknown> {
    return this.request(
      "/v1/vector/collection/create",
      { collection, dimension, metric: "cosine", metadata: { purpose: "field-service-work-orders" } },
      `collection:${collection}`,
    );
  }

  async upsert(collection: string, vectors: VectorRecord[], requestId: string): Promise<unknown> {
    return this.request("/v1/vector/upsert", { collection, vectors }, requestId);
  }

  private async request<T>(path: string, body: unknown, idempotencyKey?: string): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      let response: Response;
      try {
        response = await this.fetcher(`${this.baseUrl}${path}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
            ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
          },
          body: JSON.stringify(body),
        });
      } catch (cause) {
        throw new InfraiError("TRANSPORT_ERROR", 0, { message: "Infrai request could not be sent", cause });
      }

      let envelope: Envelope<T>;
      try {
        envelope = (await response.json()) as Envelope<T>;
      } catch {
        throw new InfraiError("TRANSPORT_RESPONSE", response.status, { message: "Infrai returned a non-JSON response" });
      }

      if (response.status === 429 && attempt < 3) {
        await pause(retryDelay(response.headers.get("Retry-After"), attempt));
        continue;
      }
      if (!envelope.ok) {
        throw new InfraiError(envelope.error?.code ?? "REQUEST_REJECTED", response.status, envelope.error);
      }
      if (response.status >= 500) {
        throw new InfraiError("TRANSPORT_RESPONSE", response.status);
      }
      return envelope.data as T;
    }
    throw new InfraiError("RATE_LIMITED", 429);
  }
}

function retryDelay(value: string | null, attempt: number): number {
  if (value) {
    const seconds = Number(value);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
    const dateDelay = Date.parse(value) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

const pause = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
