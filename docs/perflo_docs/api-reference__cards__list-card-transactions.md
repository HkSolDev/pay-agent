> ## Documentation Index
> Fetch the complete documentation index at: https://docs.perflo.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# List card transactions

> Lists one card's ledger entries. Admits a customer token and answers synchronously. Paging is one-based and page_size is capped at 100. An entry amount is signed, a debit negative and a credit positive, and its fee is carried separately as a non-negative amount.



## OpenAPI

````yaml /api-reference/openapi.json get /v1/cards/{card_id}/transactions
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
  /v1/cards/{card_id}/transactions:
    get:
      tags:
        - Cards
      summary: List card transactions
      description: >-
        Lists one card's ledger entries. Admits a customer token and answers
        synchronously. Paging is one-based and page_size is capped at 100. An
        entry amount is signed, a debit negative and a credit positive, and its
        fee is carried separately as a non-negative amount.
      operationId: card_transactions
      parameters:
        - in: path
          name: card_id
          required: true
          schema:
            title: Card Id
            type: string
        - in: query
          name: page
          required: false
          schema:
            default: 1
            minimum: 1
            title: Page
            type: integer
        - in: query
          name: page_size
          required: false
          schema:
            default: 25
            maximum: 100
            minimum: 1
            title: Page Size
            type: integer
      responses:
        '200':
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/CardTransactionPage'
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
    CardTransactionPage:
      additionalProperties: false
      description: One page of a card's ledger entries.
      properties:
        items:
          description: The entries on this page.
          items:
            $ref: '#/components/schemas/CardTransactionView'
          title: Items
          type: array
        page:
          description: The one-based page number this response carries.
          minimum: 1
          title: Page
          type: integer
        page_size:
          description: How many entries a page carries, capped at 100.
          maximum: 100
          minimum: 1
          title: Page Size
          type: integer
        total:
          description: How many entries the whole result set carries.
          minimum: 0
          title: Total
          type: integer
        total_pages:
          description: How many pages the whole result set spans.
          minimum: 0
          title: Total Pages
          type: integer
      required:
        - items
        - page
        - page_size
        - total
        - total_pages
      title: CardTransactionPage
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
    CardTransactionView:
      additionalProperties: false
      description: One entry on a card's ledger.
      properties:
        amount:
          $ref: '#/components/schemas/SignedMoney'
          description: >-
            The entry's amount, signed: a debit is negative and a credit
            positive. The fee is carried separately.
        authorized_at:
          description: When the entry was authorized.
          format: date-time
          title: Authorized At
          type: string
        card_id:
          description: The card the entry belongs to.
          title: Card Id
          type: string
        description:
          description: Display text for the entry, as supplied.
          title: Description
          type: string
        fee:
          $ref: '#/components/schemas/NonNegativeMoney'
          description: >-
            The fee charged for the entry, separate from amount and never
            negative.
        id:
          description: The identifier for the entry.
          title: Id
          type: string
        settled_at:
          anyOf:
            - format: date-time
              type: string
            - type: 'null'
          description: >-
            When the entry settled; null while the authorization is still
            outstanding.
          title: Settled At
        status:
          description: >-
            The entry's own transaction status, passed through unchanged, so the
            vocabulary is open.
          title: Status
          type: string
      required:
        - id
        - card_id
        - description
        - amount
        - status
        - authorized_at
        - settled_at
        - fee
      title: CardTransactionView
      type: object
    SignedMoney:
      additionalProperties: false
      description: >-
        An amount of either sign and the currency it is denominated in.


        Card ledger entries carry direction in the amount's sign and have no
        kind

        field to move it to, so this is the one signed money shape. The amount

        travels as a decimal string rather than as a JSON number, so no
        precision is

        lost in transit.
      properties:
        amount:
          description: >-
            The amount, carried as a decimal string, whose sign carries the
            direction: a debit is negative and a credit positive.
          examples:
            - '-18.75'
          pattern: ^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$
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
      title: SignedMoney
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