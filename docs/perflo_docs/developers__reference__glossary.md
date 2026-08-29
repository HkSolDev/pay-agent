> ## Documentation Index
> Fetch the complete documentation index at: https://docs.perflo.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Glossary

> Define the identity, device, operation, mandate, and grant terms used by Perflo Finance API.

<AccordionGroup>
  <Accordion title="Customer token">
    The customer's own Perflo EdDSA access token. An integrator holds it server-side because it is authority over the customer's Perflo account.
  </Accordion>

  <Accordion title="Gateway device">
    The separate Perflo device linked by the gateway for operations on that account. Its credentials are never returned by the public API.
  </Accordion>

  <Accordion title="Pairing token">
    An opaque `pfa_` bearer token returned when an agent redeems a connect code. It belongs to one mandate pairing and must be stored like a password.
  </Accordion>

  <Accordion title="Mandate">
    Customer-created, bounded authority for service purchases or payments to one beneficiary. It carries amount, count, rolling-window, expiry, and optional allowlist constraints.
  </Accordion>

  <Accordion title="Confirmation intent">
    A ten-minute, one-use record bound to one sensitive action and normalized payload. It is payload confirmation, not an independent MFA event.
  </Accordion>

  <Accordion title="Operation">
    The resource representing an asynchronous financial or authority mutation and its current state.
  </Accordion>

  <Accordion title="Indeterminate">
    An operation state used when transport cannot prove whether a write landed. The gateway does not resubmit it automatically.
  </Accordion>

  <Accordion title="Account binding">
    The stable relationship between one customer and the Perflo account the gateway links a device to. It stays the same through ordinary disconnect and reconnect of the same account, including while no device is linked. A separate identity-release procedure can rotate an empty binding; that procedure is outside the ordinary connection lifecycle.
  </Accordion>

  <Accordion title="Beneficiary grant">
    Automatic-payment authority made directly on the Perflo account rather than as a mandate. It is listed by `GET /v1/mandates/beneficiary-grants` and spent one payment at a time; it is revoked with `POST /v1/mandates/beneficiary-grants/{grant_id}/revoke` or in the Perflo app.
  </Accordion>

  <Accordion title="Address country">
    A country accepted in a beneficiary address field. It is independent from residence and payout-destination country lists and carries alpha-2, alpha-3, display-name, and alias values.
  </Accordion>

  <Accordion title="Connect code">
    An 80-bit, single-use code valid for ten minutes that lets an agent create one pairing without receiving customer credentials.
  </Accordion>
</AccordionGroup>
