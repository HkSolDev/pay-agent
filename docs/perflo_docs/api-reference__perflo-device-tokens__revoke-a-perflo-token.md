> ## Documentation Index
> Fetch the complete documentation index at: https://docs.perflo.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Revoke a Perflo token

> Relays the authenticated Perflo CLI token-revocation request and response.



## OpenAPI

````yaml /api-reference/openapi.json post /cli/token/revoke
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
  /cli/token/revoke:
    post:
      tags:
        - Perflo device tokens
      summary: Revoke a Perflo token
      description: >-
        Relays the authenticated Perflo CLI token-revocation request and
        response.
      operationId: revoke_token
      requestBody:
        content:
          application/json:
            schema:
              anyOf:
                - $ref: '#/components/schemas/CliTokenRevokeRequest'
                - type: 'null'
              title: Payload
      responses:
        '200':
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/CliTokenRevokeResponse'
          description: Successful Response
        '401':
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/CliErrorResponse'
            application/problem+json:
              schema:
                $ref: '#/components/schemas/ProblemDetails'
          description: An authentication problem, or a failure Perflo returns.
        '422':
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/CliErrorResponse'
            application/problem+json:
              schema:
                $ref: '#/components/schemas/ProblemDetails'
          description: A validation problem, or a failure Perflo returns.
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
      security:
        - BearerAuth: []
components:
  schemas:
    CliTokenRevokeRequest:
      additionalProperties: false
      description: An optional request to revoke one device rather than every token.
      properties:
        deviceId:
          anyOf:
            - type: string
            - type: 'null'
          description: The device to revoke; omitted to revoke the default device.
          title: Deviceid
      title: CliTokenRevokeRequest
      type: object
    CliTokenRevokeResponse:
      additionalProperties: true
      description: The successful token-revocation body, whose shape is not specified.
      title: CliTokenRevokeResponse
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
  securitySchemes:
    BearerAuth:
      description: >-
        A Perflo customer access token or a pfa_ pairing token, as required by
        the operation.
      scheme: bearer
      type: http

````