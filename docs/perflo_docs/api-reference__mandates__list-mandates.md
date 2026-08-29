> ## Documentation Index
> Fetch the complete documentation index at: https://docs.perflo.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# List mandates

> Lists the customer's mandates. Admits a customer token and answers synchronously. The list covers authority created and approved as a mandate; an automatic-payment grant made directly on the Perflo account is published by GET /v1/mandates/beneficiary-grants instead. A beneficiary mandate's remaining allowance counts only the payments made under the mandate, so it is an upper bound on what its Perflo grant can still spend. Each listed mandate is cross-checked against the account's own grants on every read, so a grant that expired, exhausted its payments, or was revoked elsewhere reads with the matching local state. Any reconciliation failure leaves that cross-check undone and answers the local list unchanged, preserving the audit and revocation surface for service mandates with no grant behind them. Connection failures remain visible through onboarding and GET /v1/mandates/beneficiary-grants.



## OpenAPI

````yaml /api-reference/openapi.json get /v1/mandates
openapi: 3.1.0
info:
  summary: >-
    Canonical API for customer onboarding, accounts, remittance, mandates, and
    cards.
  title: Perflo Finance API
  version: 0.1.0
servers:
  - description: Perflo Finance API
    url: https://api-gateway.perflo.ai
security: []
tags:
  - description: >-
      The caller's verified identity and the one-use confirmation intents that
      sensitive customer mutations spend.
    name: Identity
  - description: >-
      The customer's own state and the lifecycle of the Perflo device link that
      every account route depends on. Customer bearer tokens only.
    name: Onboarding
  - description: >-
      Transparent proxies for the seven Perflo CLI device-token and signing
      operations. None of the relayed token or signing payloads are stored.
    name: Perflo device tokens
  - description: >-
      The normalized identity-verification status and the hosted verification
      hand-off. Customer bearer tokens only.
    name: KYC
  - description: >-
      The customer's fiat deposit accounts and the coordinates for funding them.
      Customer bearer tokens only.
    name: Accounts
  - description: >-
      A customer-wide activity projection merged from two sources of movement.
      It is not a per-account ledger. Customer bearer tokens only.
    name: Activity
  - description: >-
      The payees this customer can send to, and the country and payout-form
      catalogue for creating them. Customer bearer tokens only.
    name: Beneficiaries
  - description: >-
      Indicative quotes and the one customer-instructed money movement offered
      here. Customer bearer tokens only.
    name: Transfers
  - description: >-
      The customer's own tracker for asynchronous writes: one record per queued
      mutation, its approval hand-off, and its settled outcome. Customer tokens
      read their own operations; an agent token reads only the operations its
      own actor identity recorded.
    name: Operations
  - description: >-
      Bounded payment authority a customer delegates through an agent pairing or
      rule, and the one agent-initiated payment that spends it. Customer tokens
      manage mandates; a paired agent token executes them.
    name: Mandates
  - description: >-
      Customer and mandate-bound agent discovery, quoting and purchase of live
      services through the Perflo agent surface.
    name: Services
  - description: >-
      Customer-only reads and withdrawals for Perflo's held spending funds,
      promotional credit and owed position.
    name: Spending
  - description: >-
      The customer's cards, their transactions, and the hosted hand-off for
      viewing card details. Customer bearer tokens only.
    name: Cards
  - description: >-
      Customer-owned webhook subscriptions for operation state transitions,
      including one-time secret issuance and revocation.
    name: Webhooks
paths:
  /v1/mandates:
    get:
      tags:
        - Mandates
      summary: List mandates
      description: >-
        Lists the customer's mandates. Admits a customer token and answers
        synchronously. The list covers authority created and approved as a
        mandate; an automatic-payment grant made directly on the Perflo account
        is published by GET /v1/mandates/beneficiary-grants instead. A
        beneficiary mandate's remaining allowance counts only the payments made
        under the mandate, so it is an upper bound on what its Perflo grant can
        still spend. Each listed mandate is cross-checked against the account's
        own grants on every read, so a grant that expired, exhausted its
        payments, or was revoked elsewhere reads with the matching local state.
        Any reconciliation failure leaves that cross-check undone and answers
        the local list unchanged, preserving the audit and revocation surface
        for service mandates with no grant behind them. Connection failures
        remain visible through onboarding and GET
        /v1/mandates/beneficiary-grants.
      operationId: mandates
      responses:
        '200':
          content:
            application/json:
              schema:
                items:
                  $ref: '#/components/schemas/MandateView'
                title: Response Mandates
                type: array
          description: Successful Response
        '400':
          content:
            application/problem+json:
              schema:
                $ref: '#/components/schemas/ProblemDetails'
          description: Malformed or invalid request semantics
        '401':
          content:
            application/problem+json:
              schema:
                $ref: '#/components/schemas/ProblemDetails'
          description: Authentication required
        '403':
          content:
            application/problem+json:
              schema:
                $ref: '#/components/schemas/ProblemDetails'
          description: Action not permitted
        '404':
          content:
            application/problem+json:
              schema:
                $ref: '#/components/schemas/ProblemDetails'
          description: Resource not found
        '409':
          content:
            application/problem+json:
              schema:
                $ref: '#/components/schemas/ProblemDetails'
          description: State or idempotency conflict
        '422':
          content:
            application/problem+json:
              schema:
                $ref: '#/components/schemas/ProblemDetails'
          description: Request validation failed
        '429':
          content:
            application/problem+json:
              schema:
                $ref: '#/components/schemas/ProblemDetails'
          description: Rate limit exceeded
        '500':
          content:
            application/problem+json:
              schema:
                $ref: '#/components/schemas/ProblemDetails'
          description: Internal server error
        '502':
          content:
            application/problem+json:
              schema:
                $ref: '#/components/schemas/ProblemDetails'
          description: Invalid response
        '503':
          content:
            application/problem+json:
              schema:
                $ref: '#/components/schemas/ProblemDetails'
          description: Capability unavailable
        '504':
          content:
            application/problem+json:
              schema:
                $ref: '#/components/schemas/ProblemDetails'
          description: Timed out
      security:
        - BearerAuth: []
components:
  schemas:
    MandateView:
      additionalProperties: false
      description: >-
        Bounded payment authority delegated through an agent pairing or rule.


        Every cap is a Perflo cash United States dollar amount. This record
        covers

        authority created and approved as a mandate; a beneficiary grant made
        directly on

        the account is published by GET /v1/mandates/beneficiary-grants instead.
      properties:
        allowed_capabilities:
          anyOf:
            - items:
                type: string
              type: array
            - type: 'null'
          description: The allowed service capabilities; null means unrestricted.
          title: Allowed Capabilities
        allowed_services:
          anyOf:
            - items:
                type: string
              type: array
            - type: 'null'
          description: The allowed service identifiers; null means unrestricted.
          title: Allowed Services
        authorized_clients:
          description: The append-only history of pairings for this mandate.
          items:
            $ref: '#/components/schemas/AgentPairingView'
          title: Authorized Clients
          type: array
        authorized_rules:
          description: The bare agent rule identifiers allowed to execute this mandate.
          items:
            type: string
          title: Authorized Rules
          type: array
        beneficiary_id:
          anyOf:
            - type: string
            - type: 'null'
          description: >-
            The beneficiary for payment authority; null for service-purchase
            authority.
          title: Beneficiary Id
        created_at:
          description: When the mandate was recorded.
          format: date-time
          title: Created At
          type: string
        daily_max:
          $ref: '#/components/schemas/Money'
          description: >-
            The most a rolling day may debit; capacity is reserved atomically
            before every execution.
        destination_currency:
          anyOf:
            - type: string
            - type: 'null'
          description: The payout currency; null for service-purchase authority.
          title: Destination Currency
        expires_at:
          description: When the authority ends.
          format: date-time
          title: Expires At
          type: string
        id:
          description: The identifier for the mandate.
          title: Id
          type: string
        kind:
          description: The class of delegated authority this mandate carries.
          enum:
            - beneficiary_payment
            - service_purchase
          title: Kind
          type: string
        monthly_max:
          $ref: '#/components/schemas/Money'
          description: >-
            The most a rolling month may debit; capacity is reserved atomically
            before every execution.
        payment_count:
          description: The most payments this mandate may make.
          title: Payment Count
          type: integer
        per_payment_max:
          $ref: '#/components/schemas/Money'
          description: The most one payment may debit.
        purpose_code:
          anyOf:
            - type: string
            - type: 'null'
          description: >-
            The purpose code, which comes from the beneficiary; null when none
            is required.
          title: Purpose Code
        remaining_daily_max:
          anyOf:
            - $ref: '#/components/schemas/NonNegativeMoney'
            - type: 'null'
          description: >-
            The trailing 24 hours' remaining capacity; null when usage cannot be
            computed for the mandate. For a beneficiary mandate this counts only
            the payments made under the mandate, so it is the most that can
            remain rather than an exact figure: the Perflo grant behind it can
            also be spent by another client holding the same account.
        remaining_monthly_max:
          anyOf:
            - $ref: '#/components/schemas/NonNegativeMoney'
            - type: 'null'
          description: >-
            The trailing 30 days' remaining capacity; null when usage cannot be
            computed for the mandate. For a beneficiary mandate this counts only
            the payments made under the mandate, so it is the most that can
            remain rather than an exact figure: the Perflo grant behind it can
            also be spent by another client holding the same account.
        remaining_payment_count:
          anyOf:
            - type: integer
            - type: 'null'
          description: >-
            The payments this mandate may still make; null when usage cannot be
            computed for the mandate. For a beneficiary mandate this counts only
            the payments made under the mandate, so it is the most that can
            remain rather than an exact figure: the Perflo grant behind it can
            also be spent by another client holding the same account.
          title: Remaining Payment Count
        remaining_total_cap:
          anyOf:
            - $ref: '#/components/schemas/NonNegativeMoney'
            - type: 'null'
          description: >-
            The mandate's remaining total capacity; null when usage cannot be
            computed for the mandate. For a beneficiary mandate this counts only
            the payments made under the mandate, so it is the most that can
            remain rather than an exact figure: the Perflo grant behind it can
            also be spent by another client holding the same account.
        remaining_weekly_max:
          anyOf:
            - $ref: '#/components/schemas/NonNegativeMoney'
            - type: 'null'
          description: >-
            The trailing 7 days' remaining capacity; null when usage cannot be
            computed for the mandate. For a beneficiary mandate this counts only
            the payments made under the mandate, so it is the most that can
            remain rather than an exact figure: the Perflo grant behind it can
            also be spent by another client holding the same account.
        state:
          description: >-
            pending_approval awaits browser approval, approval_failed records a
            denied or expired approval, active is usable, revocation_pending
            stops the mandate while a revoke is in flight, revocation_failed
            records a revoke that did not complete, revoked is settled, expired
            passed its expiry, and exhausted consumed its payment count or total
            cap.
          enum:
            - pending_approval
            - approval_failed
            - active
            - revocation_pending
            - revocation_failed
            - revoked
            - expired
            - exhausted
          title: State
          type: string
        total_cap:
          $ref: '#/components/schemas/Money'
          description: The most every payment under this mandate may debit together.
        weekly_max:
          $ref: '#/components/schemas/Money'
          description: >-
            The most a rolling week may debit; capacity is reserved atomically
            before every execution.
      required:
        - id
        - kind
        - beneficiary_id
        - destination_currency
        - purpose_code
        - per_payment_max
        - total_cap
        - payment_count
        - daily_max
        - weekly_max
        - monthly_max
        - expires_at
        - authorized_clients
        - authorized_rules
        - allowed_capabilities
        - allowed_services
        - state
        - created_at
        - remaining_payment_count
        - remaining_daily_max
        - remaining_weekly_max
        - remaining_monthly_max
        - remaining_total_cap
      title: MandateView
      type: object
    ProblemDetails:
      additionalProperties: false
      description: The problem document every non-2xx response carries.
      properties:
        code:
          description: >-
            The stable machine-readable identifier to branch on; title and
            detail are human text and can be reworded.
          title: Code
          type: string
        detail:
          description: A human-readable explanation of this particular occurrence.
          title: Detail
          type: string
        fields:
          anyOf:
            - items:
                additionalProperties: true
                type: object
              type: array
            - type: 'null'
          description: >-
            The per-field validation failures, each naming the path that failed;
            null when the problem is not a field-level validation failure.
          title: Fields
        instance:
          description: A URI identifying the request that failed.
          title: Instance
          type: string
        refresh_onboarding:
          description: >-
            True when a cached onboarding read is stale and GET /v1/onboarding
            should be read again.
          title: Refresh Onboarding
          type: boolean
        request_id:
          description: The request identifier to quote when correlating with server logs.
          title: Request Id
          type: string
        retryable:
          description: True when repeating the identical request can succeed.
          title: Retryable
          type: boolean
        status:
          description: >-
            The HTTP status code, repeated here so the document reads on its
            own.
          title: Status
          type: integer
        submission_uncertain:
          description: >-
            True when a write may already have landed, so repeating the request
            risks a duplicate.
          title: Submission Uncertain
          type: boolean
        title:
          description: A short human-readable summary of the problem class.
          title: Title
          type: string
        type:
          description: A URI naming the class of problem this response reports.
          title: Type
          type: string
      required:
        - type
        - title
        - status
        - detail
        - instance
        - code
        - request_id
        - retryable
        - submission_uncertain
        - refresh_onboarding
      title: ProblemDetails
      type: object
    AgentPairingView:
      additionalProperties: false
      description: A customer-approved agent pairing for one mandate.
      properties:
        display_name:
          description: The agent's self-asserted display name.
          title: Display Name
          type: string
        id:
          description: The pairing identifier used for authorization and audit.
          title: Id
          type: string
        revoked_at:
          anyOf:
            - format: date-time
              type: string
            - type: 'null'
          description: When the customer revoked this pairing.
          title: Revoked At
        verified:
          const: false
          default: false
          description: 'Always false: a self-asserted agent name is never verified.'
          title: Verified
          type: boolean
      required:
        - id
        - display_name
        - revoked_at
      title: AgentPairingView
      type: object
    Money:
      additionalProperties: false
      description: >-
        An amount greater than zero and the currency it is denominated in.


        The amount travels as a decimal string rather than as a JSON number, so
        no

        precision is lost in transit.
      properties:
        amount:
          description: The amount, greater than zero, carried as a decimal string.
          examples:
            - '125.50'
          pattern: ^\+?(?:\d*[1-9]\d*(?:\.\d*)?|\d*\.\d*[1-9]\d*)(?:[eE][+-]?\d+)?$
          title: Amount
          type: string
        currency:
          description: The ISO 4217 alphabetic currency code, normalized to upper case.
          examples:
            - AED
          pattern: ^[A-Za-z]{3}$
          title: Currency
          type: string
      required:
        - currency
        - amount
      title: Money
      type: object
    NonNegativeMoney:
      additionalProperties: false
      description: >-
        An amount of zero or more and the currency it is denominated in.


        The amount travels as a decimal string rather than as a JSON number, so
        no

        precision is lost in transit.
      properties:
        amount:
          description: >-
            The amount, zero or more, carried as a decimal string; a zero is
            canonicalized unsigned.
          examples:
            - '0.00'
          pattern: ^\+?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$
          title: Amount
          type: string
        currency:
          description: The ISO 4217 alphabetic currency code, normalized to upper case.
          examples:
            - AED
          pattern: ^[A-Za-z]{3}$
          title: Currency
          type: string
      required:
        - currency
        - amount
      title: NonNegativeMoney
      type: object
  securitySchemes:
    BearerAuth:
      description: >-
        A Perflo customer access token or a pfa_ pairing token, as required by
        the operation.
      scheme: bearer
      type: http

````