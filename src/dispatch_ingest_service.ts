import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { z } from "zod";
import { InfraiError, InfraiIngestClient } from "./infrai_ingest_client.js";
import { ingestWorkOrder } from "./work_order_ingest.js";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");

const client = new InfraiIngestClient(apiKey);
const collection = process.env.INFRAI_COLLECTION ?? "field-service-work-orders";
const port = Number(process.env.PORT ?? 3000);

createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/work-orders/ingest") {
    send(response, 404, { error: "Route not found" });
    return;
  }
  try {
    const result = await ingestWorkOrder(await readJson(request), client, collection);
    send(response, 201, result);
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      send(response, 400, { error: "Invalid work-order request" });
    } else if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      send(response, status, { error: error.code, message: error.message });
    } else {
      send(response, 500, { error: error instanceof Error ? error.message : "Ingest failed" });
    }
  }
}).listen(port, () => console.log(`Dispatch ingest service listening on http://localhost:${port}`));

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}
