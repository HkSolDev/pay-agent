> ## Documentation Index
> Fetch the complete documentation index at: https://docs.perflo.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# List deposit accounts

> Lists the customer's fiat deposit accounts with the coordinates for funding them. Admits a customer token and answers synchronously. Rows that are not deposit accounts are omitted. A deposit-routing account is a transfer-routing record rather than a stored-value account, so its null balances are a settled answer rather than a failed read.



## OpenAPI

````yaml /api-reference/openapi.json get /v1/accounts
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
  /v1/accounts:
    get:
      tags:
        - Accounts
      summary: List deposit accounts
      description: >-
        Lists the customer's fiat deposit accounts with the coordinates for
        funding them. Admits a customer token and answers synchronously. Rows
        that are not deposit accounts are omitted. A deposit-routing account is
        a transfer-routing record rather than a stored-value account, so its
        null balances are a settled answer rather than a failed read.
      operationId: accounts
      responses:
        '200':
          content:
            application/json:
              schema:
                items:
                  $ref: '#/components/schemas/AccountView'
                title: Response Accounts
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
    AccountView:
      additionalProperties: false
      description: A fiat deposit account the customer can be paid into.
      properties:
        available_balance:
          anyOf:
            - $ref: '#/components/schemas/NonNegativeMoney'
            - type: 'null'
          description: >-
            The balance available to spend. Null keeps one meaning: no such
            balance is stated for this account. A deposit-routing account is a
            transfer-routing record rather than stored value, so null there is a
            settled answer and not a transient read failure.
        balance:
          anyOf:
            - $ref: '#/components/schemas/NonNegativeMoney'
            - type: 'null'
          description: >-
            The account's balance. Null keeps one meaning: no such balance is
            stated for this account. A deposit-routing account is a
            transfer-routing record rather than stored value, so null there is a
            settled answer and not a transient read failure.
        bank_details:
          anyOf:
            - $ref: '#/components/schemas/BankDetails'
            - type: 'null'
          description: The coordinates for funding this account; null when none are stated.
        currency:
          description: The account's ISO 4217 alphabetic currency code.
          pattern: ^[A-Za-z]{3}$
          title: Currency
          type: string
        id:
          description: The identifier for the account.
          title: Id
          type: string
        observed_at:
          description: When the account was last read.
          format: date-time
          title: Observed At
          type: string
        owner_type:
          anyOf:
            - type: string
            - type: 'null'
          description: How the account's owner is classified; null when it is not stated.
          title: Owner Type
        pending_balance:
          anyOf:
            - $ref: '#/components/schemas/NonNegativeMoney'
            - type: 'null'
          description: >-
            The balance still settling. Null keeps one meaning: no such balance
            is stated for this account. A deposit-routing account is a
            transfer-routing record rather than stored value, so null there is a
            settled answer and not a transient read failure.
        status:
          description: >-
            The account's own status, with casing folded away and normalized to
            unknown when no status is stated, so the vocabulary is open.
          title: Status
          type: string
        type:
          anyOf:
            - type: string
            - type: 'null'
          description: How the account is classified; null when it is not stated.
          title: Type
      required:
        - id
        - currency
        - status
        - balance
        - available_balance
        - pending_balance
        - observed_at
      title: AccountView
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
    BankDetails:
      additionalProperties: false
      description: The coordinates for funding an account the customer owns.
      properties:
        account_holder_name:
          anyOf:
            - type: string
            - type: 'null'
          description: >-
            The holder of an account the customer owns — never a payee, which is
            what BeneficiaryView means. Null when it is not stated.
          title: Account Holder Name
        account_number:
          anyOf:
            - type: string
            - type: 'null'
          description: >-
            The account number, in full, for an account this customer owns —
            readable only with that customer's own token. Null when it is not
            stated.
          title: Account Number
        bank_address:
          anyOf:
            - type: string
            - type: 'null'
          description: The bank's address; null when it is not stated.
          title: Bank Address
        bank_country:
          anyOf:
            - type: string
            - type: 'null'
          description: The bank's country; null when it is not stated.
          title: Bank Country
        bank_name:
          anyOf:
            - type: string
            - type: 'null'
          description: The bank's name; null when it is not stated.
          title: Bank Name
        iban:
          anyOf:
            - type: string
            - type: 'null'
          description: >-
            The IBAN, in full, for an account this customer owns — readable only
            with that customer's own token. Null when it is not stated.
          title: Iban
      title: BankDetails
      type: object
  securitySchemes:
    BearerAuth:
      description: >-
        A Perflo customer access token or a pfa_ pairing token, as required by
        the operation.
      scheme: bearer
      type: http

````