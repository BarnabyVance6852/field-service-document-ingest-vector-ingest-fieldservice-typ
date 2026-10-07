import { createHash } from "node:crypto";
import { z } from "zod";
import type { InfraiIngestClient, VectorRecord } from "./infrai_ingest_client.js";

export const workOrderRequest = z.object({
  workOrderId: z.string().min(1),
  documentPdf: z.string().min(1),
  dispatch: z.object({
    status: z.enum(["assigned", "en_route", "on_site", "completed"]),
    technicianId: z.string().min(1),
    scheduledAt: z.string().datetime(),
  }),
  photos: z.array(z.object({
    url: z.string().url(),
    category: z.enum(["arrival", "equipment", "repair", "completion"]),
    containsPatientData: z.boolean(),
  })).max(20),
  technicianNotes: z.string().max(8_000).default(""),
});

export type WorkOrderRequest = z.infer<typeof workOrderRequest>;
export type FollowUp = "none" | "technician_follow_up";

export function decideFollowUp(order: WorkOrderRequest, now: Date): FollowUp {
  const overdue = new Date(order.dispatch.scheduledAt).getTime() < now.getTime();
  return overdue && order.dispatch.status !== "completed" ? "technician_follow_up" : "none";
}

export function chunkText(text: string, maxWords = 180): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const chunks: string[] = [];
  for (let start = 0; start < words.length; start += maxWords) {
    chunks.push(words.slice(start, start + maxWords).join(" "));
  }
  return chunks;
}

export function parsedText(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  for (const key of ["text", "content", "markdown"]) {
    if (typeof record[key] === "string") return record[key];
  }
  return "";
}

export async function ingestWorkOrder(
  raw: unknown,
  client: InfraiIngestClient,
  collection: string,
  now = new Date(),
) {
  const prepared = await prepareWorkOrder(raw, client, now);
  await client.createCollection(collection, prepared.embeddings[0].length);
  const vectors: VectorRecord[] = prepared.chunks.map((text, index) => ({
    id: `${prepared.order.workOrderId}:${index}`,
    values: prepared.embeddings[index],
    metadata: {
      work_order_id: prepared.order.workOrderId,
      chunk_index: index,
      text,
      dispatch_status: prepared.order.dispatch.status,
      technician_id: prepared.order.dispatch.technicianId,
      follow_up: prepared.followUp,
      photo_count: prepared.order.photos.length,
      photo_categories: prepared.photoCategories,
      restricted_photo_count: prepared.order.photos.filter((photo) => photo.containsPatientData).length,
    },
  }));
  const digest = createHash("sha256").update(`${prepared.order.workOrderId}:${prepared.source}`).digest("hex");
  await client.upsert(collection, vectors, `work-order:${prepared.order.workOrderId}:${digest}`);

  return {
    workOrderId: prepared.order.workOrderId,
    dispatchStatus: prepared.order.dispatch.status,
    followUp: prepared.followUp,
    chunksIngested: vectors.length,
    photosReferenced: prepared.order.photos.length,
  };
}

export async function previewWorkOrder(
  raw: unknown,
  client: InfraiIngestClient,
  now = new Date(),
) {
  const prepared = await prepareWorkOrder(raw, client, now);
  return {
    workOrderId: prepared.order.workOrderId,
    dispatchStatus: prepared.order.dispatch.status,
    followUp: prepared.followUp,
    chunksPrepared: prepared.chunks.length,
    embeddingDimension: prepared.embeddings[0].length,
    photosReferenced: prepared.order.photos.length,
  };
}

async function prepareWorkOrder(raw: unknown, client: InfraiIngestClient, now: Date) {
  const order = workOrderRequest.parse(raw);
  const parsed = await client.parsePdf(order.documentPdf);
  const documentText = parsedText(parsed);
  const photoCategories = [...new Set(order.photos.map((photo) => photo.category))].join(",");
  const safeNotes = order.technicianNotes.trim();
  const source = [documentText, safeNotes].filter(Boolean).join("\n\n");
  const chunks = chunkText(source);
  if (chunks.length === 0) throw new Error("The work order has no indexable text");

  const embeddings = await client.embed(chunks);
  const followUp = decideFollowUp(order, now);
  return { order, source, chunks, embeddings, followUp, photoCategories };
}
