> ## Documentation Index
> Fetch the complete documentation index at: https://docs.perflo.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Poll a Perflo CLI signing approval

> Relays a Perflo sign poll with both per-address and per-sid rate limits. The session ID is the capability: treat it as a short-lived bearer secret.



## OpenAPI

````yaml /api-reference/openapi.json post /cli/sign/poll
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
  /cli/sign/poll:
    post:
      tags:
        - Perflo device tokens
      summary: Poll a Perflo CLI signing approval
      description: >-
        Relays a Perflo sign poll with both per-address and per-sid rate limits.
        The session ID is the capability: treat it as a short-lived bearer
        secret.
      operationId: poll_sign
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CliSignPollRequest'
        required: true
      responses:
        '200':
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/CliSignPollResponse'
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
          description: >-
            An address or session rate limit, or one Perflo returns. Perflo
            responses keep their JSON envelope; all other responses use
            ProblemDetails.
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
    CliSignPollRequest:
      additionalProperties: false
      description: The signing session to poll.
      properties:
        sid:
          description: >-
            The opaque session returned by sign start; it is the capability and
            must be treated as a short-lived bearer secret.
          title: Sid
          type: string
      required:
        - sid
      title: CliSignPollRequest
      type: object
    CliSignPollResponse:
      additionalProperties: false
      description: Perflo's sign-poll success envelope.
      properties:
        data:
          anyOf:
            - discriminator:
                mapping:
                  complete:
                    $ref: '#/components/schemas/CliSignPollComplete'
                  denied:
                    $ref: '#/components/schemas/CliSignPollPending'
                  expired:
                    $ref: '#/components/schemas/CliSignPollPending'
                  pending:
                    $ref: '#/components/schemas/CliSignPollPending'
                propertyName: status
              oneOf:
                - $ref: '#/components/schemas/CliSignPollPending'
                - $ref: '#/components/schemas/CliSignPollComplete'
            - type: 'null'
          description: The current signing result.
          title: Data
        success:
          anyOf:
            - type: boolean
            - type: 'null'
          description: Whether Perflo accepted the poll.
          title: Success
      title: CliSignPollResponse
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
    CliSignPollComplete:
      additionalProperties: false
      description: A completed signing approval and its transaction result.
      properties:
        result:
          $ref: '#/components/schemas/CliSignResult'
          description: The signed submission's transaction result.
        status:
          const: complete
          description: The completed signing state.
          title: Status
          type: string
      required:
        - status
        - result
      title: CliSignPollComplete
      type: object
    CliSignPollPending:
      additionalProperties: false
      description: A signing approval that has not completed.
      properties:
        status:
          description: The current non-complete signing state.
          enum:
            - pending
            - denied
            - expired
          title: Status
          type: string
      required:
        - status
      title: CliSignPollPending
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
    CliSignResult:
      additionalProperties: false
      description: The transaction evidence for a completed signature.
      properties:
        status:
          description: The transaction status of the signed submission.
          enum:
            - submitted
            - processing
            - executing
            - success
            - failed
          title: Status
          type: string
        txHash:
          description: The transaction hash of the signed submission.
          title: Txhash
          type: string
      required:
        - txHash
        - status
      title: CliSignResult
      type: object

````