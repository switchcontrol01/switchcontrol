---
title: Information Disclosure
---
Public endpoints that expose operational or payment-related data without sufficient access control.

Vulnerabilities to fix:

1. [Low] Public Stripe Session Lookup Leaks Purchaser Email and Payment Metadata
  The payment-success lookup endpoint returns purchaser email and payment metadata to anyone who knows a Stripe checkout session ID. This exposes private billing information without requiring login.

`GET /api/stripe/session` in `server/routes.ts` has no authentication check:

```ts
app.get("/api/stripe/session", async (req, res) => {
  const { session_id } = req.query;
  const session = await stripe.checkout.sessions.retrieve(session_id);
  res.json({
    id: session.id,
    payment_status: session.payment_status,
    status: session.status,
    customer_email: session.customer_details?.email,
    amount_total: session.amount_total,
    currency: session.currency,
  });
});
```

The returned fields include `customer_email`, payment status, amount, and currency. Session IDs are not guessable at scale, which keeps severity low, but they do appear in checkout success URLs and can leak through browser history, screenshots, copied links, analytics, or logs.

This is a straightforward information-disclosure issue. The route should require authentication and, ideally, verify that the authenticated user matches the Stripe session owner before revealing billing data.
  Files: server/routes.ts

2. [Low] Public Telemetry Endpoints Reveal Host Hardware and Live Server Metrics
  The cloud API exposes detailed hardware and live performance information about the host running the service. Anyone on the internet can query it without logging in.

`server/routes.ts` exposes both endpoints without authentication:

```ts
app.get("/api/telemetry", async (req, res) => { ... });
app.get("/api/specs", async (req, res) => { ... });
```

These responses include CPU and GPU model information, RAM totals and usage, OS and architecture, disk details, process counts, network throughput, and the server hostname. In a local desktop app this data would describe the user's own machine, but in the production cloud deployment it describes backend infrastructure that should not be publicly enumerable.

The direct impact is reconnaissance rather than account compromise, so severity is low. Even so, the endpoints leak enough environment detail to help an attacker fingerprint the host, correlate deployments, and tailor follow-on attacks or denial-of-service timing.
  Files: server/routes.ts, server/lib/telemetry.ts