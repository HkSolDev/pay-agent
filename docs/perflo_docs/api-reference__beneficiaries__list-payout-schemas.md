> ## Documentation Index
> Fetch the complete documentation index at: https://docs.perflo.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# List payout schemas

> Lists the payout forms available for one ISO 3166-1 alpha-2 country, each naming the inputs POST /v1/beneficiaries must answer. Admits a customer token and answers synchronously. A null purpose_codes means none is declared, and that null is advisory; a non-empty list is authoritative, and POST /v1/beneficiaries is refused unless purpose_code is one of its values.



## OpenAPI

````yaml /api-reference/openapi.json get /v1/beneficiaries/schemas
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
  /v1/beneficiaries/schemas:
    get:
      tags:
        - Beneficiaries
      summary: List payout schemas
      description: >-
        Lists the payout forms available for one ISO 3166-1 alpha-2 country,
        each naming the inputs POST /v1/beneficiaries must answer. Admits a
        customer token and answers synchronously. A null purpose_codes means
        none is declared, and that null is advisory; a non-empty list is
        authoritative, and POST /v1/beneficiaries is refused unless purpose_code
        is one of its values.
      operationId: beneficiary_schemas
      parameters:
        - in: query
          name: country
          required: true
          schema:
            maxLength: 2
            minLength: 2
            pattern: ^[A-Za-z]{2}$
            title: Country
            type: string
      responses:
        '200':
          content:
            application/json:
              schema:
                items:
                  $ref: '#/components/schemas/BeneficiarySchemaView'
                title: Response Beneficiary Schemas
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
    BeneficiarySchemaView:
      additionalProperties: false
      description: The payout form for one country and currency.
      properties:
        country:
          description: The ISO 3166-1 alpha-2 country this schema pays out to.
          title: Country
          type: string
        currency:
          description: The ISO 4217 alphabetic currency this schema pays out in.
          title: Currency
          type: string
        fields:
          description: The inputs to answer in BeneficiaryCreate.details.
          items:
            $ref: '#/components/schemas/BeneficiaryField'
          title: Fields
          type: array
        id:
          description: The value to send as BeneficiaryCreate.payout_schema_id.
          title: Id
          type: string
        label:
          description: The schema's display name.
          title: Label
          type: string
        purpose_codes:
          anyOf:
            - items:
                type: string
              type: array
            - type: 'null'
          description: >-
            Null means no purpose codes are declared for this payout form; that
            null is advisory, while a non-empty list is authoritative and POST
            /v1/beneficiaries is refused unless purpose_code is one of these.
          title: Purpose Codes
      required:
        - id
        - label
        - country
        - currency
        - fields
        - purpose_codes
      title: BeneficiarySchemaView
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
    BeneficiaryField:
      additionalProperties: false
      description: One input of a payout schema.
      properties:
        allowed_values:
          anyOf:
            - items:
                type: string
              type: array
            - type: 'null'
          description: >-
            The closed vocabulary the answer must come from; null when none is
            declared.
          title: Allowed Values
        fields:
          anyOf:
            - items:
                $ref: '#/components/schemas/BeneficiaryField'
              type: array
            - type: 'null'
          description: >-
            The nested sub-inputs of a group; null when the input is not a
            group.
          title: Fields
        key:
          description: The name to send this answer under inside BeneficiaryCreate.details.
          title: Key
          type: string
        required:
          description: >-
            True when the answer must always be supplied, whatever the other
            answers are.
          title: Required
          type: boolean
        required_when:
          anyOf:
            - additionalProperties: true
              type: object
            - type: 'null'
          description: >-
            The other answers that make this input necessary; null when the
            input is not conditional.
          title: Required When
        type:
          description: The kind of input, which states how the answer must be formatted.
          title: Type
          type: string
      required:
        - key
        - type
        - required
      title: BeneficiaryField
      type: object
  securitySchemes:
    BearerAuth:
      description: >-
        A Perflo customer access token or a pfa_ pairing token, as required by
        the operation.
      scheme: bearer
      type: http

````