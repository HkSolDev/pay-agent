> ## Documentation Index
> Fetch the complete documentation index at: https://docs.perflo.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Create a transfer quote

> Creates an indicative estimate for a transfer to one beneficiary. Admits a customer token, answers synchronously, and records no operation. A quote is never executable on its own: POST /v1/transfers spends it, and it carries a confirm_by deadline after which it is refused rather than repriced. Answers 503 when the customer's cash is not held in a form that can fund the payout.



## OpenAPI

````yaml /api-reference/openapi.json post /v1/quotes
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
  /v1/quotes:
    post:
      tags:
        - Transfers
      summary: Create a transfer quote
      description: >-
        Creates an indicative estimate for a transfer to one beneficiary. Admits
        a customer token, answers synchronously, and records no operation. A
        quote is never executable on its own: POST /v1/transfers spends it, and
        it carries a confirm_by deadline after which it is refused rather than
        repriced. Answers 503 when the customer's cash is not held in a form
        that can fund the payout.
      operationId: create_quote
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/QuoteCreate'
        required: true
      responses:
        '201':
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/QuoteView'
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
    QuoteCreate:
      additionalProperties: false
      description: The request that prices one transfer.
      properties:
        beneficiary_id:
          description: The beneficiary to price the transfer to.
          title: Beneficiary Id
          type: string
        source:
          $ref: '#/components/schemas/Money'
          description: The amount the customer asks to send.
      required:
        - beneficiary_id
        - source
      title: QuoteCreate
      type: object
    QuoteView:
      additionalProperties: false
      description: |-
        An indicative estimate for one transfer.

        A quote is never an executable instrument on its own: POST /v1/transfers
        names it, and the estimated amounts can be revised at execution.
      properties:
        beneficiary_id:
          description: The beneficiary this quote pays.
          title: Beneficiary Id
          type: string
        confirm_by:
          description: The deadline for turning this quote into a transfer.
          format: date-time
          title: Confirm By
          type: string
        estimated_at:
          description: When the estimate was taken.
          format: date-time
          title: Estimated At
          type: string
        estimated_destination:
          $ref: '#/components/schemas/Money'
          description: >-
            The estimated amount the beneficiary receives, which can be revised
            at execution.
        estimated_fee:
          $ref: '#/components/schemas/NonNegativeMoney'
          description: >-
            The estimated fee, billed in the destination currency, which can be
            revised at execution.
        estimated_payout_rate:
          description: >-
            The estimated payout rate: multiply perflo_cash_debit.amount by this
            and subtract estimated_fee.amount to get
            estimated_destination.amount, to within this rate's own decimal
            precision.
          pattern: ^\+?(?:\d*[1-9]\d*(?:\.\d*)?|\d*\.\d*[1-9]\d*)(?:[eE][+-]?\d+)?$
          title: Estimated Payout Rate
          type: string
        executable:
          const: false
          default: false
          description: 'Always false: a quote never executes on its own.'
          title: Executable
          type: boolean
        id:
          description: The value to send as TransferCreate.quote_id.
          title: Id
          type: string
        local_units_per_usd:
          description: >-
            Requested source currency units per United States dollar, a
            unit-free rate.
          pattern: ^\+?(?:\d*[1-9]\d*(?:\.\d*)?|\d*\.\d*[1-9]\d*)(?:[eE][+-]?\d+)?$
          title: Local Units Per Usd
          type: string
        perflo_cash_debit:
          $ref: '#/components/schemas/Money'
          description: The exact United States dollar cash debit the transfer takes.
        requested_source:
          $ref: '#/components/schemas/Money'
          description: The amount the customer asked to send.
      required:
        - id
        - beneficiary_id
        - requested_source
        - perflo_cash_debit
        - estimated_destination
        - estimated_fee
        - local_units_per_usd
        - estimated_payout_rate
        - estimated_at
        - confirm_by
      title: QuoteView
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