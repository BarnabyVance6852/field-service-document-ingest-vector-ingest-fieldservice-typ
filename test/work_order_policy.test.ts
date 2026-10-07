import assert from "node:assert/strict";
import test from "node:test";
import type { InfraiIngestClient } from "../src/infrai_ingest_client.js";
import { decideFollowUp, previewWorkOrder, workOrderRequest } from "../src/work_order_ingest.js";

test("an overdue active dispatch requires technician follow-up without exposing photo URLs", () => {
  const order = workOrderRequest.parse({
    workOrderId: "wo-2048",
    documentPdf: "https://files.example.org/work-orders/wo-2048.pdf",
    dispatch: {
      status: "on_site",
      technicianId: "tech-17",
      scheduledAt: "2026-09-13T01:00:00.000Z",
    },
    photos: [
      { url: "https://files.example.org/photos/repair.jpg", category: "repair", containsPatientData: true },
    ],
    technicianNotes: "Relay replaced.",
  });

  assert.equal(decideFollowUp(order, new Date("2026-09-13T02:00:00.000Z")), "technician_follow_up");
  assert.equal(JSON.stringify({ count: order.photos.length, category: order.photos[0].category }).includes("repair.jpg"), false);
});

test("a completed dispatch needs no follow-up", () => {
  const order = workOrderRequest.parse({
    workOrderId: "wo-2049",
    documentPdf: "https://files.example.org/work-orders/wo-2049.pdf",
    dispatch: {
      status: "completed",
      technicianId: "tech-18",
      scheduledAt: "2026-09-13T01:00:00.000Z",
    },
    photos: [],
  });
  assert.equal(decideFollowUp(order, new Date("2026-09-13T03:00:00.000Z")), "none");
});

test("the runnable preview does not create a collection or upsert vectors", async () => {
  const calls: string[] = [];
  const client = {
    async parsePdf() {
      calls.push("parsePdf");
      return { text: "Compressor relay replacement completed." };
    },
    async embed(texts: string[]) {
      calls.push("embed");
      return texts.map(() => [0.1, 0.2, 0.3]);
    },
    async createCollection() {
      calls.push("createCollection");
    },
    async upsert() {
      calls.push("upsert");
    },
  } as unknown as InfraiIngestClient;

  const result = await previewWorkOrder({
    workOrderId: "wo-preview",
    documentPdf: "https://files.example.org/work-orders/preview.pdf",
    dispatch: {
      status: "on_site",
      technicianId: "tech-17",
      scheduledAt: "2026-09-13T01:00:00.000Z",
    },
    photos: [],
  }, client, new Date("2026-09-13T02:00:00.000Z"));

  assert.deepEqual(calls, ["parsePdf", "embed"]);
  assert.equal(result.chunksPrepared, 1);
  assert.equal(result.embeddingDimension, 3);
});
