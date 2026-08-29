> ## Documentation Index
> Fetch the complete documentation index at: https://docs.perflo.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Refresh a Perflo access token

> Relays the public Perflo CLI token-refresh request and response. The refresh token can rotate, so the exchange is not idempotent: after a lost or ambiguous response, run a new device authorization instead of retrying the old refresh token.



## OpenAPI

````yaml /api-reference/openapi.json post /cli/token/refresh
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
  /cli/token/refresh:
    post:
      tags:
        - Perflo device tokens
      summary: Refresh a Perflo access token
      description: >-
        Relays the public Perflo CLI token-refresh request and response. The
        refresh token can rotate, so the exchange is not idempotent: after a
        lost or ambiguous response, run a new device authorization instead of
        retrying the old refresh token.
      operationId: refresh_token
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CliTokenRefreshRequest'
        required: true
      responses:
        '200':
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/CliTokenRefreshResponse'
          description: Successful Response
        '422':
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/CliErrorResponse'
            application/problem+json:
              schema:
                $ref: '#/components/schemas/ProblemDetails'
          description: A validation problem, or a failure Perflo returns.
        '429':
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/CliErrorResponse'
            application/problem+json:
              schema:
                $ref: '#/components/schemas/ProblemDetails'
          description: An address rate limit, or one Perflo returns.
        default:
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/CliErrorResponse'
            application/problem+json:
              schema:
                $ref: '#/components/schemas/ProblemDetails'
          description: >-
            A problem document, or Perflo's failure status, headers and body
            relayed unchanged.
components:
  schemas:
    CliTokenRefreshRequest:
      additionalProperties: false
      description: The opaque token to exchange for fresh credentials.
      properties:
        refreshToken:
          description: The refresh token.
          title: Refreshtoken
          type: string
      required:
        - refreshToken
      title: CliTokenRefreshRequest
      type: object
    CliTokenRefreshResponse:
      additionalProperties: false
      description: Perflo's token-refresh success envelope.
      properties:
        data:
          anyOf:
            - $ref: '#/components/schemas/CliRefreshedTokens'
            - type: 'null'
          description: The refreshed credentials.
        success:
          anyOf:
            - type: boolean
            - type: 'null'
          description: Whether Perflo accepted the refresh.
          title: Success
      title: CliTokenRefreshResponse
      type: object
    CliErrorResponse:
      additionalProperties: true
      description: A Perflo failure envelope relayed without conversion to problem details.
      properties:
        code:
          anyOf:
            - type: string
            - type: 'null'
          description: A top-level error code, when supplied.
          title: Code
        data:
          anyOf:
            - additionalProperties: true
              type: object
            - type: 'null'
          description: Structured failure context, when supplied.
          title: Data
        details:
          anyOf:
            - additionalProperties: true
              type: object
            - type: 'null'
          description: Additional top-level error context.
          title: Details
        error:
          anyOf:
            - type: string
            - $ref: '#/components/schemas/CliErrorDetail'
            - type: 'null'
          description: The error string or object, when supplied.
          title: Error
        message:
          anyOf:
            - type: string
            - type: 'null'
          description: A top-level error message, when supplied.
          title: Message
        recoverable:
          anyOf:
            - type: boolean
            - type: 'null'
          description: Whether the request can be retried, as stated in the relayed body.
          title: Recoverable
        success:
          anyOf:
            - const: false
              type: boolean
            - type: 'null'
          description: False when a success flag is included.
          title: Success
      title: CliErrorResponse
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
    CliRefreshedTokens:
      additionalProperties: false
      description: The refreshed Perflo credential set.
      properties:
        accessJwt:
          description: The fresh Perflo access token.
          title: Accessjwt
          type: string
        expiresAt:
          description: The Unix time in milliseconds when the access token expires.
          title: Expiresat
          type: number
        refreshToken:
          description: The current opaque refresh token.
          title: Refreshtoken
          type: string
      required:
        - accessJwt
        - refreshToken
        - expiresAt
      title: CliRefreshedTokens
      type: object
    CliErrorDetail:
      additionalProperties: true
      description: A structured error returned by Perflo's CLI endpoints.
      properties:
        code:
          anyOf:
            - type: string
            - type: 'null'
          description: The error code, when supplied.
          title: Code
        details:
          anyOf:
            - additionalProperties: true
              type: object
            - type: 'null'
          description: Additional error context, when supplied.
          title: Details
        message:
          anyOf:
            - type: string
            - type: 'null'
          description: The human-readable error, when supplied.
          title: Message
        recoverable:
          anyOf:
            - type: boolean
            - type: 'null'
          description: Whether the request can be retried, as stated in the relayed body.
          title: Recoverable
      title: CliErrorDetail
      type: object

````