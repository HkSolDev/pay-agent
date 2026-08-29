> ## Documentation Index
> Fetch the complete documentation index at: https://docs.perflo.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Change a card label

> Changes or clears the customer's private label for one card. Admits a customer token and answers synchronously. Null or a blank value clears the label.



## OpenAPI

````yaml /api-reference/openapi.json patch /v1/cards/{card_id}
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
  /v1/cards/{card_id}:
    patch:
      tags:
        - Cards
      summary: Change a card label
      description: >-
        Changes or clears the customer's private label for one card. Admits a
        customer token and answers synchronously. Null or a blank value clears
        the label.
      operationId: set_card_nickname
      parameters:
        - in: path
          name: card_id
          required: true
          schema:
            title: Card Id
            type: string
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CardNicknameUpdate'
        required: true
      responses:
        '200':
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/CardView'
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
    CardNicknameUpdate:
      additionalProperties: false
      description: The request that changes or clears a card's private label.
      properties:
        nickname:
          anyOf:
            - maxLength: 80
              type: string
            - type: 'null'
          description: >-
            The new private label, trimmed and at most 80 characters; null or a
            blank value clears it.
          title: Nickname
      required:
        - nickname
      title: CardNicknameUpdate
      type: object
    CardView:
      additionalProperties: false
      description: A card issued to the customer.
      properties:
        balance:
          $ref: '#/components/schemas/NonNegativeMoney'
          description: >-
            The card's balance, always present: a card that has never been
            funded reads as zero rather than as absent.
        created_at:
          description: When the card was recorded.
          format: date-time
          title: Created At
          type: string
        id:
          description: The identifier for the card.
          title: Id
          type: string
        last4:
          anyOf:
            - type: string
            - type: 'null'
          description: >-
            The last four digits of the card number, the only fragment of it
            published here; null until they are stated. Neither the full number
            nor any verification value is ever published.
          title: Last4
        nickname:
          anyOf:
            - type: string
            - type: 'null'
          description: The customer's private label; null when the card carries none.
          title: Nickname
        observed_at:
          anyOf:
            - format: date-time
              type: string
            - type: 'null'
          description: When the card was last read.
          title: Observed At
        status:
          description: >-
            Where the card stands. pending, active, frozen, failed, closed and
            expired are the card's own. freeze_pending, unfreeze_pending and
            close_pending are in-flight states held while a card write is
            submitted. indeterminate is what a transport-uncertain write leaves
            behind, and such a write is never repeated automatically.
          enum:
            - pending
            - active
            - frozen
            - failed
            - closed
            - expired
            - freeze_pending
            - unfreeze_pending
            - close_pending
            - indeterminate
          title: Status
          type: string
      required:
        - id
        - nickname
        - status
        - last4
        - balance
        - created_at
      title: CardView
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