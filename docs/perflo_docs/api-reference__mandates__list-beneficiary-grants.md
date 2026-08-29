> ## Documentation Index
> Fetch the complete documentation index at: https://docs.perflo.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# List beneficiary grants

> Lists the automatic-payment authority made directly on the Perflo account rather than as a mandate. Admits a customer token and answers synchronously. A grant can be revoked with POST /v1/mandates/beneficiary-grants/{grant_id}/revoke, or in the Perflo app. No reservation ledger is kept against it and no mandate records it; POST /v1/mandates/beneficiary-grants/{grant_id}/payments spends one payment from a listed grant on the owner's explicit, separately confirmed instruction. The payout destination is published in full. An empty list means the account carries no such authority at the moment of the read; a read that fails answers a problem document rather than an empty list.



## OpenAPI

````yaml /api-reference/openapi.json get /v1/mandates/beneficiary-grants
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
  /v1/mandates/beneficiary-grants:
    get:
      tags:
        - Mandates
      summary: List beneficiary grants
      description: >-
        Lists the automatic-payment authority made directly on the Perflo
        account rather than as a mandate. Admits a customer token and answers
        synchronously. A grant can be revoked with POST
        /v1/mandates/beneficiary-grants/{grant_id}/revoke, or in the Perflo app.
        No reservation ledger is kept against it and no mandate records it; POST
        /v1/mandates/beneficiary-grants/{grant_id}/payments spends one payment
        from a listed grant on the owner's explicit, separately confirmed
        instruction. The payout destination is published in full. An empty list
        means the account carries no such authority at the moment of the read; a
        read that fails answers a problem document rather than an empty list.
      operationId: mandate_beneficiary_grants
      responses:
        '200':
          content:
            application/json:
              schema:
                items:
                  $ref: '#/components/schemas/BeneficiaryGrantView'
                title: Response Mandate Beneficiary Grants
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
    BeneficiaryGrantView:
      additionalProperties: false
      description: >-
        Automatic-payment authority made directly on the Perflo account rather

        than as a mandate.


        A grant can be revoked with POST

        /v1/mandates/beneficiary-grants/{grant_id}/revoke, or in the Perflo app.
        No

        reservation ledger is kept against it and no mandate records it, so
        concurrent

        spending by another client sharing the account is bounded only by the
        grant's

        own caps. One payment is spent from it on the owner's explicit,
        separately

        confirmed instruction, checked against a live read immediately
        beforehand.
      properties:
        destination:
          anyOf:
            - type: string
            - type: 'null'
          description: >-
            The payout destination this grant can pay, in full — readable only
            with the owning customer's own token. Null when none is stated.
          title: Destination
        expires_at:
          description: When the grant stops being usable.
          format: date-time
          title: Expires At
          type: string
        id:
          description: The identifier for the grant, stable across reads.
          title: Id
          type: string
        payment_count:
          description: How many payments the grant authorizes in total.
          minimum: 1
          title: Payment Count
          type: integer
        per_payment_max:
          $ref: '#/components/schemas/Money'
          description: >-
            The most one payment under this grant may debit, a Perflo cash
            United States dollar ceiling.
        status:
          description: >-
            The grant's own status, passed through with casing folded away, so
            the vocabulary is open.
          title: Status
          type: string
        total_cap:
          $ref: '#/components/schemas/Money'
          description: >-
            The most every payment under this grant may debit together, a Perflo
            cash United States dollar ceiling.
        uses_count:
          anyOf:
            - minimum: 0
              type: integer
            - type: 'null'
          description: >-
            How many payments the grant has already consumed; null when none is
            stated rather than zero.
          title: Uses Count
      required:
        - id
        - destination
        - status
        - per_payment_max
        - total_cap
        - payment_count
        - uses_count
        - expires_at
      title: BeneficiaryGrantView
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
  securitySchemes:
    BearerAuth:
      description: >-
        A Perflo customer access token or a pfa_ pairing token, as required by
        the operation.
      scheme: bearer
      type: http

````