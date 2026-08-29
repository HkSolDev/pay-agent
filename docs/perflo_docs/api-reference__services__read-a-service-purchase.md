> ## Documentation Index
> Fetch the complete documentation index at: https://docs.perflo.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Read a service purchase

> Returns a customer's purchase or the exact purchase created by the calling agent client. This read does not require the originating mandate to remain active.



## OpenAPI

````yaml /api-reference/openapi.json get /v1/purchases/{purchase_id}
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
  /v1/purchases/{purchase_id}:
    get:
      tags:
        - Services
      summary: Read a service purchase
      description: >-
        Returns a customer's purchase or the exact purchase created by the
        calling agent client. This read does not require the originating mandate
        to remain active.
      operationId: get_purchase
      parameters:
        - in: path
          name: purchase_id
          required: true
          schema:
            title: Purchase Id
            type: string
      responses:
        '200':
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/PurchaseView'
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
    PurchaseView:
      additionalProperties: false
      description: The durable status and result of one service purchase.
      properties:
        completed_at:
          anyOf:
            - format: date-time
              type: string
            - type: 'null'
          description: When the purchase reached a terminal state; null while open.
          title: Completed At
        created_at:
          description: When the purchase was accepted.
          format: date-time
          title: Created At
          type: string
        failure_code:
          anyOf:
            - type: string
            - type: 'null'
          description: A stable failure code; null when no failure is recorded.
          title: Failure Code
        failure_detail:
          anyOf:
            - type: string
            - type: 'null'
          description: A safe failure explanation; null when no failure is recorded.
          title: Failure Detail
        id:
          description: The identifier for the purchase.
          title: Id
          type: string
        max_price:
          $ref: '#/components/schemas/Money'
          description: The USD cap reserved before submission.
        next_reconcile_at:
          anyOf:
            - format: date-time
              type: string
            - type: 'null'
          description: >-
            When the purchase will next be reconciled; null when no automatic
            reconciliation remains scheduled.
          title: Next Reconcile At
        operation_id:
          description: The operation tracking the submission.
          title: Operation Id
          type: string
        price:
          anyOf:
            - $ref: '#/components/schemas/NonNegativeMoney'
            - type: 'null'
          description: The reported USD price; null until one is reported.
        price_cap_enforcement:
          description: >-
            When the cap binds: at_charge means it is applied to the charge
            itself, preflight means the price is checked immediately before and
            after instead. A catalogued service or a quoted endpoint is
            at_charge; a natural-language query target is preflight, so its
            ceiling is advisory at the moment of charge.
          enum:
            - at_charge
            - preflight
          title: Price Cap Enforcement
          type: string
        result:
          anyOf:
            - {}
            - type: 'null'
          description: The service result; null until one is available.
          title: Result
        service_id:
          anyOf:
            - type: string
            - type: 'null'
          description: >-
            The exact selected catalogue service; null for query and endpoint
            targets.
          title: Service Id
        status:
          description: The purchase lifecycle status.
          enum:
            - queued
            - running
            - settling
            - completed
            - input_required
            - no_service_available
            - services_failed
            - expired
            - blocked
            - confirmation_required
            - settlement_uncertain
            - cancelled
            - failed
          title: Status
          type: string
        submission_uncertain:
          description: >-
            Whether Perflo may have accepted a write without a definitive
            response.
          title: Submission Uncertain
          type: boolean
        target:
          description: The target this purchase requested.
          discriminator:
            mapping:
              endpoint:
                $ref: '#/components/schemas/EndpointTarget'
              query:
                $ref: '#/components/schemas/QueryTarget'
              service:
                $ref: '#/components/schemas/ServiceTarget'
            propertyName: kind
          oneOf:
            - $ref: '#/components/schemas/QueryTarget'
            - $ref: '#/components/schemas/ServiceTarget'
            - $ref: '#/components/schemas/EndpointTarget'
          title: Target
      required:
        - id
        - operation_id
        - target
        - status
        - submission_uncertain
        - next_reconcile_at
        - price
        - max_price
        - price_cap_enforcement
        - result
        - service_id
        - failure_code
        - failure_detail
        - created_at
        - completed_at
      title: PurchaseView
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
    EndpointTarget:
      additionalProperties: false
      description: An exact endpoint validated by a fresh purchase quote.
      properties:
        kind:
          const: endpoint
          description: Selects an exact quoted endpoint.
          title: Kind
          type: string
        method:
          description: The HTTP method the quoted endpoint requires.
          enum:
            - GET
            - POST
          title: Method
          type: string
        url:
          description: The HTTPS endpoint the purchase quote validated.
          format: uri
          maxLength: 2083
          minLength: 1
          title: Url
          type: string
      required:
        - kind
        - url
        - method
      title: EndpointTarget
      type: object
    QueryTarget:
      additionalProperties: false
      description: A natural-language request whose exact service Perflo selects.
      properties:
        kind:
          const: query
          description: Selects natural-language service discovery.
          title: Kind
          type: string
        query:
          description: The task Perflo should find and buy a service to complete.
          maxLength: 2000
          minLength: 1
          title: Query
          type: string
      required:
        - kind
        - query
      title: QueryTarget
      type: object
    ServiceTarget:
      additionalProperties: false
      description: One service selected from the catalogue.
      properties:
        kind:
          const: service
          description: Selects a catalogued service.
          title: Kind
          type: string
        service_id:
          description: The exact service identifier returned by the catalogue.
          maxLength: 255
          minLength: 1
          title: Service Id
          type: string
      required:
        - kind
        - service_id
      title: ServiceTarget
      type: object
  securitySchemes:
    BearerAuth:
      description: >-
        A Perflo customer access token or a pfa_ pairing token, as required by
        the operation.
      scheme: bearer
      type: http

````