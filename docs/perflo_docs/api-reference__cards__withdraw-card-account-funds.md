> ## Documentation Index
> Fetch the complete documentation index at: https://docs.perflo.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Withdraw card-account funds

> Records an idempotent card-account withdrawal and answers 202 with the operation that tracks it. Admits a customer token carrying a fresh iat, a Confirmation-Intent-ID naming the confirmed intent for this action, and an Idempotency-Key. A definitively accepted submission rests at submitted and carries the withdrawal identifier as external_reference. Read GET /v1/card-account/withdrawals for its status, transaction hash and completion. When card withdrawals are not available, the submission fails with card_withdrawal_unavailable. The Idempotency-Key header binds for at least the replay window published by GET /v1/identity. Inside that guaranteed window an equal replay returns the same operation with Idempotent-Replayed set to true. A client with an unresolved response must stop before the window ends and reconcile operation history rather than retry later. A transport-uncertain write leaves the operation indeterminate and is never repeated.



## OpenAPI

````yaml /api-reference/openapi.json post /v1/card-account/withdrawals
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
  /v1/card-account/withdrawals:
    post:
      tags:
        - Cards
      summary: Withdraw card-account funds
      description: >-
        Records an idempotent card-account withdrawal and answers 202 with the
        operation that tracks it. Admits a customer token carrying a fresh iat,
        a Confirmation-Intent-ID naming the confirmed intent for this action,
        and an Idempotency-Key. A definitively accepted submission rests at
        submitted and carries the withdrawal identifier as external_reference.
        Read GET /v1/card-account/withdrawals for its status, transaction hash
        and completion. When card withdrawals are not available, the submission
        fails with card_withdrawal_unavailable. The Idempotency-Key header binds
        for at least the replay window published by GET /v1/identity. Inside
        that guaranteed window an equal replay returns the same operation with
        Idempotent-Replayed set to true. A client with an unresolved response
        must stop before the window ends and reconcile operation history rather
        than retry later. A transport-uncertain write leaves the operation
        indeterminate and is never repeated.
      operationId: create_card_withdrawal
      parameters:
        - description: One-use, transaction-bound confirmation.
          in: header
          name: Confirmation-Intent-ID
          required: true
          schema:
            description: One-use, transaction-bound confirmation.
            maxLength: 200
            minLength: 16
            title: Confirmation-Intent-Id
            type: string
        - description: Unique key for one canonical mutation request.
          in: header
          name: Idempotency-Key
          required: true
          schema:
            description: Unique key for one canonical mutation request.
            maxLength: 200
            minLength: 16
            title: Idempotency-Key
            type: string
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CardWithdrawalCreate'
        required: true
      responses:
        '202':
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/OperationView'
          description: Successful Response
          headers:
            Idempotent-Replayed:
              description: >-
                Sent with the literal value true only when this response replays
                a previously accepted request under the same idempotency key.
                Absent on a first acceptance; never sent as false.
              schema:
                enum:
                  - 'true'
                type: string
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
    CardWithdrawalCreate:
      additionalProperties: false
      description: A request to withdraw funds from the customer's card account.
      properties:
        amount:
          $ref: '#/components/schemas/Money'
          description: >-
            The amount to withdraw in United States dollars. It must be exactly
            representable in whole cents and must be no more than
            9007199254740991 cents.
        asset:
          description: >-
            The asset to withdraw, selected from accepted_assets on the card
            deposit address.
          maxLength: 36
          minLength: 1
          title: Asset
          type: string
        card_id:
          description: The customer's own card identifier.
          maxLength: 36
          minLength: 1
          title: Card Id
          type: string
      required:
        - card_id
        - amount
        - asset
      title: CardWithdrawalCreate
      type: object
    OperationView:
      additionalProperties: false
      description: >-
        The asynchronous result record for one mutation.


        Every financial write stores this record and its idempotency record
        before

        the write is submitted, so there is always something to poll.
      properties:
        action_required:
          anyOf:
            - $ref: '#/components/schemas/RedirectAction'
            - type: 'null'
          description: >-
            The hosted approval hand-off to follow while state is
            requires_action; null otherwise.
        approval_resolvable:
          description: >-
            Whether the customer can settle this operation's Perflo approval by
            attesting what the browser hand-off did, through POST
            /v1/operations/{operation_id}/approval/resolution.
          readOnly: true
          title: Approval Resolvable
          type: boolean
        authority_expires_at:
          anyOf:
            - format: date-time
              type: string
            - type: 'null'
          description: >-
            When the authority this operation reserved stops being usable, after
            which it no longer blocks a new approval or disconnecting Perflo;
            null when it holds no reservation.
          title: Authority Expires At
        created_at:
          description: When the operation was recorded.
          format: date-time
          title: Created At
          type: string
        external_reference:
          anyOf:
            - type: string
            - type: 'null'
          description: >-
            The identifier for the write, once evidence names one; null until
            then.
          title: External Reference
        failure_code:
          anyOf:
            - type: string
            - type: 'null'
          description: >-
            A stable identifier for the failure, safe to log; null while the
            operation has not failed.
          title: Failure Code
        failure_detail:
          anyOf:
            - type: string
            - type: 'null'
          description: >-
            A human-readable diagnosis of the failure carrying no credentials;
            null while the operation has not failed.
          title: Failure Detail
        id:
          description: The identifier for the operation.
          title: Id
          type: string
        kind:
          description: >-
            Which mutation the operation performs. The vocabulary is closed:
            every operation carries one of these kinds.
          enum:
            - beneficiary_create
            - beneficiary_grant_payment
            - beneficiary_grant_revoke
            - card_close
            - card_create
            - card_freeze
            - card_unfreeze
            - card_withdrawal
            - mandate_create
            - mandate_revoke
            - mandate_revoke_all
            - mandate_suspend
            - mandate_transfer
            - service_purchase
            - spending_withdrawal
            - transfer
            - transfer_grant_revoke
          title: Kind
          type: string
        next_reconcile_at:
          anyOf:
            - format: date-time
              type: string
            - type: 'null'
          description: >-
            When the worker will next process the operation, either by checking
            on it or applying a time-based transition; null when no processing
            is scheduled.
          title: Next Reconcile At
        resource_id:
          anyOf:
            - type: string
            - type: 'null'
          description: The record the operation created or changed; null until one exists.
          title: Resource Id
        resource_type:
          anyOf:
            - type: string
            - type: 'null'
          description: >-
            The kind of record the operation created or changed; null until one
            exists.
          title: Resource Type
        state:
          description: >-
            Where the operation stands: requires_action awaits a browser
            hand-off, accepted is queued, submitting and submitted are in
            flight, succeeded, failed and cancelled are definitive, and
            indeterminate awaits evidence or customer-assisted approval
            resolution without repeating the write.
          enum:
            - requires_action
            - accepted
            - submitting
            - submitted
            - succeeded
            - failed
            - indeterminate
            - cancelled
          title: State
          type: string
        submission_uncertain:
          description: >-
            True when the write may have been accepted. Such a write is never
            repeated automatically, and a client that resubmits risks a
            duplicate payment.
          title: Submission Uncertain
          type: boolean
        updated_at:
          description: When the operation last changed.
          format: date-time
          title: Updated At
          type: string
      required:
        - id
        - kind
        - state
        - resource_type
        - resource_id
        - next_reconcile_at
        - authority_expires_at
        - created_at
        - updated_at
        - external_reference
        - failure_code
        - failure_detail
        - submission_uncertain
        - approval_resolvable
      title: OperationView
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
    RedirectAction:
      additionalProperties: false
      description: >-
        A hosted hand-off: open url, optionally before expires_at,

        optionally polling for the outcome after poll_after_ms milliseconds.


        card_reveal, grant_approval, and connect actions always carry
        expires_at,

        and grant_approval actions a positive poll_after_ms; a null expires_at

        occurs only on kyc_session, and a null poll_after_ms means no polling

        applies.
      properties:
        expires_at:
          anyOf:
            - format: date-time
              type: string
            - type: 'null'
          description: >-
            When the hand-off stops being usable. Null keeps one meaning: no
            expiry was stated.
          title: Expires At
        kind:
          description: Which hand-off the action performs.
          enum:
            - kyc_session
            - card_reveal
            - grant_approval
            - connect
          title: Kind
          type: string
        poll_after_ms:
          anyOf:
            - exclusiveMinimum: 0
              type: integer
            - type: 'null'
          description: >-
            How long to wait, in milliseconds, before polling for the outcome;
            null when no polling applies.
          title: Poll After Ms
        url:
          description: >-
            The URL for the browser to open. A verification session can use a
            stated HTTPS host of at least two ASCII labels of letters, digits
            and inner hyphens, none of them `localhost`, none beginning `xn--`,
            and a final label that is neither all digits nor `0x` hex;
            ownership, name resolution and reachability are not checked. Every
            other action uses the configured Perflo application origin. Every
            URL published here is within those bounds.
          title: Url
          type: string
      required:
        - kind
        - url
        - expires_at
        - poll_after_ms
      title: RedirectAction
      type: object
  securitySchemes:
    BearerAuth:
      description: >-
        A Perflo customer access token or a pfa_ pairing token, as required by
        the operation.
      scheme: bearer
      type: http

````