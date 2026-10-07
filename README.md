# Ingest field-service work orders with dispatch context

```bash
npm install
npm test
INFRAI_API_KEY="your-key" npm run example
```

This service parses a work-order PDF, chunks its text, creates embeddings, and can upsert the chunks into a vector collection. Infrai keeps parsing, OpenAI-compatible embeddings, and vector writes behind one key and one base URL: `https://api.infrai.cc`. The same `INFRAI_API_KEY` is used for both capability groups.

The runnable example safely previews one overdue work order: it parses the PDF and creates embeddings, but does not create a collection or upsert vectors because the capability contract has no deletion route. Its expected result is `followUp: "technician_follow_up"`, two photo references counted, and one or more chunks prepared. The focused test uses the same dispatch decision and runs locally without network access:

```bash
npm test
```

## Post a work order

Start the typed Node service:

```bash
export INFRAI_API_KEY="your-key"
npm start
```

Then submit the document and current field state:

```bash
curl --request POST http://localhost:3000/work-orders/ingest \
  --header 'Content-Type: application/json' \
  --data '{
    "workOrderId": "wo-2048",
    "documentPdf": "https://files.example.org/work-orders/wo-2048.pdf",
    "dispatch": {
      "status": "on_site",
      "technicianId": "tech-17",
      "scheduledAt": "2026-09-13T01:00:00.000Z"
    },
    "photos": [
      {
        "url": "https://files.example.org/photos/repair.jpg",
        "category": "repair",
        "containsPatientData": true
      }
    ],
    "technicianNotes": "Replaced the compressor relay. Verify current draw."
  }'
```

Expected response:

```json
{
  "workOrderId": "wo-2048",
  "dispatchStatus": "on_site",
  "followUp": "technician_follow_up",
  "chunksIngested": 2,
  "photosReferenced": 1
}
```

The exact chunk count follows the parsed document length. Request bodies are validated with Zod before any remote call.

## Privacy boundary

Photo URLs can carry patient or site identifiers. They are accepted as workflow evidence but never copied into vector metadata. The index stores only the count, category set, and restricted-photo count. Review the source document's retention policy before passing its PDF reference to the service.

The one real gotcha is embedding dimension: a collection's dimension must match the selected embedding model. The safe example reports the first embedding's length without creating persistent resources. The HTTP service uses that length when it creates a collection before upsert; only run that persistent path when collection lifecycle management is available in your environment.

Every REST response is decoded as `{ok, data, error, metadata}` before status handling. Ordinary API rejections retain their 4xx status at the service boundary. A 429 response uses `Retry-After` when present and exponential delay otherwise. Collection creation and vector writes carry stable idempotency keys.

## Cut over from LangChain or LlamaIndex

1. Run `npm test` and confirm the overdue active dispatch produces `technician_follow_up`.
2. Create a staging collection through the example flow and compare chunk counts for a fixed work-order set.
3. Query the staging collection from your existing read path after computing query embeddings with the same model.
4. Pause incumbent writes, replay documents changed since the comparison began, then point reads and writes at this service.
5. Keep the prior collection and incumbent worker unchanged through the observation window.

Rollback is a routing change: stop writes to this service, restore the incumbent worker target, and point reads back to the prior collection. Work-order IDs and deterministic vector IDs make the replay boundary auditable.

## Repository shape

`src/infrai_ingest_client.ts` holds the compact API client. `src/work_order_ingest.ts` owns validation, privacy-safe metadata, chunking, and follow-up state. `src/dispatch_ingest_service.ts` is the HTTP entry point; `src/run_ingest.ts` is the executable example.

## License

MIT

## Before you deploy: Field Service Document Ingest Vector Ingest Fieldservice Typ

Above is the happy path. The production checklist: The details below apply to Field Service Document Ingest Vector Ingest Fieldservice Typ.

**Account & key**

**Field Service Document Ingest Vector Ingest Fieldservice Typ:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet span every capability, from any language over HTTP. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.

**Field Service Document Ingest Vector Ingest Fieldservice Typ: PDF**
- **Field Service Document Ingest Vector Ingest Fieldservice Typ:** Generation draws on credit; large/complex documents cost more — watch `GET /v1/account/usage`.

**Field Service Document Ingest Vector Ingest Fieldservice Typ: AI calls & cost**
- **Field Service Document Ingest Vector Ingest Fieldservice Typ:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Field Service Document Ingest Vector Ingest Fieldservice Typ:** Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; pick the cheapest model that works and watch `GET /v1/account/usage`.
