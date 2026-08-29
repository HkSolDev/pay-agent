> ## Documentation Index
> Fetch the complete documentation index at: https://docs.perflo.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Read onboarding state

> Returns the single who-am-I-and-what-can-I-do view: the local customer record, the Perflo link state, the linked account identifier in full, and one capability boolean per surface. Admits a customer token, answers synchronously from local state with no remote read. Verification status is deliberately absent from this view: GET /v1/kyc is its single source.



## OpenAPI

````yaml /api-reference/openapi.json get /v1/onboarding
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
  /v1/onboarding:
    get:
      tags:
        - Onboarding
      summary: Read onboarding state
      description: >-
        Returns the single who-am-I-and-what-can-I-do view: the local customer
        record, the Perflo link state, the linked account identifier in full,
        and one capability boolean per surface. Admits a customer token, answers
        synchronously from local state with no remote read. Verification status
        is deliberately absent from this view: GET /v1/kyc is its single source.
      operationId: onboarding
      responses:
        '200':
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/OnboardingView'
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
    OnboardingView:
      additionalProperties: false
      description: |-
        The single "who am I and what can I do" read.

        KYC status is not here: GET /v1/kyc is its single source.
      properties:
        capabilities:
          $ref: '#/components/schemas/PerfloCapabilitiesView'
          description: The deployment's capabilities; connection readiness is separate.
        customer:
          $ref: '#/components/schemas/CustomerView'
          description: The customer record.
        kyc_session_available:
          description: >-
            Whether a hosted verification session can be started; mirrors
            capabilities.kyc_session.
          title: Kyc Session Available
          type: boolean
        perflo_account_identifier:
          anyOf:
            - type: string
            - type: 'null'
          description: >-
            The identifier for the linked Perflo account, in full — readable
            only with the linked customer's own token. Null when no account is
            linked.
          title: Perflo Account Identifier
        perflo_connection:
          description: >-
            The state of the customer's Perflo link: pending while a device link
            is in flight, connected once credentials are stored,
            reconnect_required when the stored credentials no longer work, and
            not_connected when no device is linked, either because none ever was
            or because the customer disconnected.
          enum:
            - pending
            - connected
            - reconnect_required
            - not_connected
          title: Perflo Connection
          type: string
      required:
        - customer
        - perflo_connection
        - kyc_session_available
        - capabilities
      title: OnboardingView
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
    PerfloCapabilitiesView:
      additionalProperties: false
      description: >-
        One boolean per surface this deployment can serve.


        False means the surface is unavailable in this deployment and the
        matching

        route answers 503 rather than an empty result.
      properties:
        accounts:
          description: Whether this deployment can list the customer's deposit accounts.
          title: Accounts
          type: boolean
        activity:
          description: Whether this deployment can report the customer's activity.
          title: Activity
          type: boolean
        asset_registry:
          description: Whether this deployment can resolve exact service-asset minor units.
          title: Asset Registry
          type: boolean
        beneficiaries:
          description: Whether this deployment can list the customer's beneficiaries.
          title: Beneficiaries
          type: boolean
        beneficiary_create:
          description: Whether this deployment can record a new beneficiary.
          title: Beneficiary Create
          type: boolean
        card_create:
          description: Whether this deployment can issue a card.
          title: Card Create
          type: boolean
        card_lifecycle:
          description: Whether this deployment can freeze, unfreeze or close a card.
          title: Card Lifecycle
          type: boolean
        card_reveal:
          description: Whether this deployment can start a hosted card-detail hand-off.
          title: Card Reveal
          type: boolean
        card_transactions:
          description: Whether this deployment can list a card's ledger entries.
          title: Card Transactions
          type: boolean
        cards:
          description: Whether this deployment can list the customer's cards.
          title: Cards
          type: boolean
        display_preferences:
          description: >-
            Whether this deployment can report the account's display currency
            and its conversion rate.
          title: Display Preferences
          type: boolean
        kyc_session:
          description: Whether this deployment can start a hosted verification session.
          title: Kyc Session
          type: boolean
        kyc_status:
          description: Whether this deployment can report verification status.
          title: Kyc Status
          type: boolean
        mandates:
          description: Whether this deployment can hold delegated payment authority.
          title: Mandates
          type: boolean
        purchases:
          description: Whether this deployment can buy a service.
          title: Purchases
          type: boolean
        quotes:
          description: Whether this deployment can price a transfer.
          title: Quotes
          type: boolean
        recipient_metadata:
          description: >-
            Whether this deployment can read the payout countries and payout
            schemas a beneficiary is created against.
          title: Recipient Metadata
          type: boolean
        service_catalogue:
          description: Whether this deployment can discover purchasable services.
          title: Service Catalogue
          type: boolean
        service_mandates:
          description: Whether this deployment can enforce bounded service authority.
          title: Service Mandates
          type: boolean
        service_quotes:
          description: Whether this deployment can price a service call.
          title: Service Quotes
          type: boolean
        spending_account:
          description: >-
            Whether this deployment can read held funds, promotional credit and
            debt.
          title: Spending Account
          type: boolean
        spending_withdrawals:
          description: Whether this deployment can withdraw held spending funds.
          title: Spending Withdrawals
          type: boolean
        transfers:
          description: Whether this deployment can send a transfer.
          title: Transfers
          type: boolean
      required:
        - kyc_status
        - kyc_session
        - accounts
        - activity
        - beneficiaries
        - recipient_metadata
        - beneficiary_create
        - quotes
        - transfers
        - mandates
        - cards
        - card_transactions
        - card_create
        - card_lifecycle
        - card_reveal
        - service_catalogue
        - asset_registry
        - service_quotes
        - purchases
        - service_mandates
        - spending_account
        - spending_withdrawals
        - display_preferences
      title: PerfloCapabilitiesView
      type: object
    CustomerView:
      additionalProperties: false
      description: The customer record kept for the signed-in person.
      properties:
        created_at:
          description: When the customer was first recorded.
          format: date-time
          title: Created At
          type: string
        email:
          anyOf:
            - type: string
            - type: 'null'
          description: The customer's email address; null when none is recorded.
          title: Email
        id:
          description: The identifier for the customer.
          title: Id
          type: string
        locale:
          description: The customer's locale, which drives display formatting.
          title: Locale
          type: string
        status:
          description: >-
            The customer record's status. The value stays an open string because
            it is an extension point rather than a lifecycle: there is no
            customer suspend or close transition.
          title: Status
          type: string
      required:
        - id
        - email
        - locale
        - status
        - created_at
      title: CustomerView
      type: object
  securitySchemes:
    BearerAuth:
      description: >-
        A Perflo customer access token or a pfa_ pairing token, as required by
        the operation.
      scheme: bearer
      type: http

````