import { InfraiIngestClient } from "./infrai_ingest_client.js";
import { previewWorkOrder } from "./work_order_ingest.js";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before running the example");

const result = await previewWorkOrder(
  {
    workOrderId: "wo-2048",
    documentPdf: "https://files.example.org/work-orders/wo-2048.pdf",
    dispatch: {
      status: "on_site",
      technicianId: "tech-17",
      scheduledAt: "2026-09-13T01:00:00.000Z",
    },
    photos: [
      { url: "https://files.example.org/photos/arrival.jpg", category: "arrival", containsPatientData: false },
      { url: "https://files.example.org/photos/repair.jpg", category: "repair", containsPatientData: true },
    ],
    technicianNotes: "Replaced the failed compressor relay. Verify stable current draw on follow-up.",
  },
  new InfraiIngestClient(apiKey),
);

console.log(JSON.stringify(result, null, 2));
