> ## Documentation Index
> Fetch the complete documentation index at: https://docs.perflo.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# TypeScript SDK reference

> Look up the Perflo TypeScript client, generated operations and types, polling helpers, transport methods, and recovery helpers.

This reference covers the production client surface in `@perflo/finance-sdk`. Use the [TypeScript SDK guide](/developers/get-started/typescript-sdk) for installation and task-oriented examples.

## Create a client

`createPerfloClient` returns an isolated client for one customer or agent credential. The package exports the constructor, its option and token types, the client type, and the production origin constant.

```typescript theme={null}
export declare function createPerfloClient(
  options?: PerfloClientOptions,
): PerfloClient;

export declare const PERFLO_API_ORIGIN =
  "https://api-gateway.perflo.ai";

export type PerfloToken =
  | string
  | (() => string | undefined | Promise<string | undefined>);
```

Use these options to configure production clients:

| Option                  | Type                      | Default                     | Behavior                                                                                                                     |
| ----------------------- | ------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `autoRefreshToken`      | `boolean`                 | Enabled when `token` is set | Set to `false` to disable the one-refresh, one-retry policy. Only a sent `pfa_` token can trigger it.                        |
| `fetch`                 | `typeof globalThis.fetch` | `globalThis.fetch`          | Supplies the Fetch implementation for the client.                                                                            |
| `idempotencyKeyFactory` | `() => string`            | None                        | Fills a missing `Idempotency-Key` only for `createPurchaseQuote`. It does not generate keys for other operations.            |
| `token`                 | `PerfloToken`             | None                        | Accepts a token value or a callback resolved before each bearer operation. The callback can return `undefined` or a promise. |

Every client starts with field-style results and `throwOnError: false`. It sends `Accept: application/json, application/problem+json;q=0.9`, omits ambient credentials, never follows redirects, and applies bearer authentication only to protected operations. Redirects are non-ok results. Node.js and Cloudflare Workers preserve the `3xx` status; browsers expose the Fetch-standard opaque redirect response. Read [authentication and token lifecycle](/developers/concepts/authentication) for credential handling.

## Refresh an agent token

`PerfloClient` adds `refreshAgentToken` and fixes shared result configuration so generated return types remain stable. The refresh method accepts no arguments and returns a non-throwing, field-style result:

```typescript theme={null}
type PerfloClientConfigUpdate = Omit<
  Config,
  "responseStyle" | "throwOnError"
> & {
  responseStyle?: "fields";
  throwOnError?: false;
};

type PerfloClientConfig = Omit<
  Config,
  "responseStyle" | "throwOnError"
> & {
  responseStyle: "fields";
  throwOnError: false;
};

type PerfloClient = Omit<Client, "getConfig" | "setConfig"> & {
  getConfig: () => PerfloClientConfig;
  refreshAgentToken: () => RequestResult<
    RefreshAgentTokenResponses,
    RefreshAgentTokenErrors,
    false
  >;
  setConfig: (
    config: PerfloClientConfigUpdate,
  ) => PerfloClientConfig;
};
```

`client.refreshAgentToken()` calls `POST /v1/agent-tokens/refresh`. A valid response updates a client created with a static token. A callback client keeps its credential store authoritative and resolves the callback again on its next bearer request. The method always uses field-style, non-throwing results, matching its declaration.

The generated `refreshAgentToken({ client, ...options })` function also remains available in the operation matrix.

## Call generated operations

Every generated function accepts one options object. The `client` field is always required, while `body`, `path`, `query`, and `headers` appear when the operation data type defines them.

Generated functions share this generic signature:

```typescript theme={null}
export declare const operation: <
  ThrowOnError extends boolean = false,
>(
  options: Options<XData, ThrowOnError>,
) => RequestResult<XResponses, XErrors, ThrowOnError>;
```

```typescript theme={null}
const result = await getIdentity({ client });

const transfer = await createTransfer({
  client,
  body: { quote_id: "confirmed_transfer_quote_id" },
  headers: {
    "Confirmation-Intent-ID": "confirmation_intent_id",
    "Idempotency-Key": "idempotency_key_for_transfer",
  },
});
```

Generated functions use `Options<XData, ThrowOnError>`. The request-group column below marks the outer group as required or optional. Use the exported `XData` type for exact fields and the **API reference** tab for wire-level schemas, status codes, and response bodies.

### Return behavior

Generated operations always use field-style results. Their result type changes with the per-call `throwOnError` option:

| `throwOnError`    | Success                       | HTTP, decode, request-build, or transport failure                                       |
| ----------------- | ----------------------------- | --------------------------------------------------------------------------------------- |
| `false` (default) | `{ data, request, response }` | `{ data: undefined, error: unknown, request?, response? }`                              |
| `true`            | `{ data, request, response }` | Throws the raw parsed HTTP body, decode error, request-build error, or transport error. |

Set `throwOnError` on an individual generated-operation call so TypeScript infers the matching return type. Generated operation options accept only `parseAs: "json"` and `responseStyle: "fields"`; the runtime forces both values after caller options. Shared configuration accepts only `responseStyle: "fields"` and `throwOnError: false`; attempts to change either value throw a `TypeError` before any configuration is updated. Use a direct transport method when you need another response parser, a per-call data response style, or a per-call throwing data result; its signature includes both generics.

The non-throwing `error` field is `unknown` because runtime failures are broader than an operation's declared HTTP error bodies. Narrow it with `isProblemDetails` before reading problem fields. A transport or request-build failure has no `response`. Generated operations decode their declared successful response as JSON. An empty or malformed non-`204` success returns a decode error with its `response`; it never fabricates successful data. In throw mode, the raw decode error is thrown without the response. A field-style `204 No Content` success returns `data: undefined`, while a JSON `null` remains `data: null`.

## Generated operations

This matrix lists every function generated from the current OpenAPI contract. Aliases are additional root exports of the same generated function.

### Identity

| Function                   | Purpose                             | Request groups    | Auth   | HTTP endpoint                   | Generated types                                                                                                                                                                      |
| -------------------------- | ----------------------------------- | ----------------- | ------ | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `createConfirmationIntent` | Create a confirmation intent        | `body` (required) | Bearer | `POST /v1/confirmation-intents` | `CreateConfirmationIntentData`<br />`CreateConfirmationIntentResponse` / `CreateConfirmationIntentResponses`<br />`CreateConfirmationIntentError` / `CreateConfirmationIntentErrors` |
| `getIdentity`              | Read the caller's verified identity | None              | Bearer | `GET /v1/identity`              | `GetIdentityData`<br />`GetIdentityResponse` / `GetIdentityResponses`<br />`GetIdentityError` / `GetIdentityErrors`                                                                  |
| `publicConfig`             | Read sign-in branding               | None              | Public | `GET /v1/public-config`         | `PublicConfigData`<br />`PublicConfigResponse` / `PublicConfigResponses`<br />`PublicConfigError` / `PublicConfigErrors`                                                             |

### Onboarding

| Function                     | Purpose                       | Request groups | Auth   | HTTP endpoint                              | Generated types                                                                                                                                                                                |
| ---------------------------- | ----------------------------- | -------------- | ------ | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `onboarding`                 | Read onboarding state         | None           | Bearer | `GET /v1/onboarding`                       | `OnboardingData`<br />`OnboardingResponse` / `OnboardingResponses`<br />`OnboardingError` / `OnboardingErrors`                                                                                 |
| `startPerfloConnection`      | Start a Perflo connection     | None           | Bearer | `POST /v1/perflo-connections`              | `StartPerfloConnectionData`<br />`StartPerfloConnectionResponse` / `StartPerfloConnectionResponses`<br />`StartPerfloConnectionError` / `StartPerfloConnectionErrors`                          |
| `disconnectPerfloConnection` | Remove the Perflo connection  | None           | Bearer | `DELETE /v1/perflo-connections/current`    | `DisconnectPerfloConnectionData`<br />`DisconnectPerfloConnectionResponse` / `DisconnectPerfloConnectionResponses`<br />`DisconnectPerfloConnectionError` / `DisconnectPerfloConnectionErrors` |
| `pollPerfloConnection`       | Advance the Perflo connection | None           | Bearer | `POST /v1/perflo-connections/current/poll` | `PollPerfloConnectionData`<br />`PollPerfloConnectionResponse` / `PollPerfloConnectionResponses`<br />`PollPerfloConnectionError` / `PollPerfloConnectionErrors`                               |

### Perflo device tokens

| Function       | Purpose                             | Request groups    | Auth   | HTTP endpoint             | Generated types                                                                                                          |
| -------------- | ----------------------------------- | ----------------- | ------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `pollDevice`   | Poll Perflo device authentication   | `body` (required) | Public | `POST /cli/device/poll`   | `PollDeviceData`<br />`PollDeviceResponse` / `PollDeviceResponses`<br />`PollDeviceError` / `PollDeviceErrors`           |
| `startDevice`  | Start Perflo device authentication  | `body` (required) | Public | `POST /cli/device/start`  | `StartDeviceData`<br />`StartDeviceResponse` / `StartDeviceResponses`<br />`StartDeviceError` / `StartDeviceErrors`      |
| `devices`      | List the customer's Perflo devices  | None              | Bearer | `GET /cli/devices`        | `DevicesData`<br />`DevicesResponse` / `DevicesResponses`<br />`DevicesError` / `DevicesErrors`                          |
| `pollSign`     | Poll a Perflo CLI signing approval  | `body` (required) | Public | `POST /cli/sign/poll`     | `PollSignData`<br />`PollSignResponse` / `PollSignResponses`<br />`PollSignError` / `PollSignErrors`                     |
| `startSign`    | Start a Perflo CLI signing approval | `body` (required) | Bearer | `POST /cli/sign/start`    | `StartSignData`<br />`StartSignResponse` / `StartSignResponses`<br />`StartSignError` / `StartSignErrors`                |
| `refreshToken` | Refresh a Perflo access token       | `body` (required) | Public | `POST /cli/token/refresh` | `RefreshTokenData`<br />`RefreshTokenResponse` / `RefreshTokenResponses`<br />`RefreshTokenError` / `RefreshTokenErrors` |
| `revokeToken`  | Revoke a Perflo token               | `body` (optional) | Bearer | `POST /cli/token/revoke`  | `RevokeTokenData`<br />`RevokeTokenResponse` / `RevokeTokenResponses`<br />`RevokeTokenError` / `RevokeTokenErrors`      |

### KYC

| Function           | Purpose                      | Request groups | Auth   | HTTP endpoint           | Generated types                                                                                                                              |
| ------------------ | ---------------------------- | -------------- | ------ | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `kycStatus`        | Read verification status     | None           | Bearer | `GET /v1/kyc`           | `KycStatusData`<br />`KycStatusResponse` / `KycStatusResponses`<br />`KycStatusError` / `KycStatusErrors`                                    |
| `createKycSession` | Start a verification session | None           | Bearer | `POST /v1/kyc/sessions` | `CreateKycSessionData`<br />`CreateKycSessionResponse` / `CreateKycSessionResponses`<br />`CreateKycSessionError` / `CreateKycSessionErrors` |

### Accounts

| Function          | Purpose                            | Request groups | Auth   | HTTP endpoint              | Generated types                                                                                                                         |
| ----------------- | ---------------------------------- | -------------- | ------ | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `accounts`        | List deposit accounts              | None           | Bearer | `GET /v1/accounts`         | `AccountsData`<br />`AccountsResponse` / `AccountsResponses`<br />`AccountsError` / `AccountsErrors`                                    |
| `displayCurrency` | Read the display currency and rate | None           | Bearer | `GET /v1/display-currency` | `DisplayCurrencyData`<br />`DisplayCurrencyResponse` / `DisplayCurrencyResponses`<br />`DisplayCurrencyError` / `DisplayCurrencyErrors` |

### Activity

| Function                              | Purpose               | Request groups     | Auth   | HTTP endpoint      | Generated types                                                                                      |
| ------------------------------------- | --------------------- | ------------------ | ------ | ------------------ | ---------------------------------------------------------------------------------------------------- |
| `activity`<br />Alias: `listActivity` | List account activity | `query` (optional) | Bearer | `GET /v1/activity` | `ActivityData`<br />`ActivityResponse` / `ActivityResponses`<br />`ActivityError` / `ActivityErrors` |

### Beneficiaries

| Function                      | Purpose                            | Request groups                              | Auth   | HTTP endpoint                                  | Generated types                                                                                                                                                                                     |
| ----------------------------- | ---------------------------------- | ------------------------------------------- | ------ | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `beneficiaries`               | List beneficiaries                 | None                                        | Bearer | `GET /v1/beneficiaries`                        | `BeneficiariesData`<br />`BeneficiariesResponse` / `BeneficiariesResponses`<br />`BeneficiariesError` / `BeneficiariesErrors`                                                                       |
| `createBeneficiary`           | Create a beneficiary               | `body` (required)<br />`headers` (required) | Bearer | `POST /v1/beneficiaries`                       | `CreateBeneficiaryData`<br />`CreateBeneficiaryResponse` / `CreateBeneficiaryResponses`<br />`CreateBeneficiaryError` / `CreateBeneficiaryErrors`                                                   |
| `beneficiaryAddressCountries` | List beneficiary address countries | None                                        | Bearer | `GET /v1/beneficiaries/address-countries`      | `BeneficiaryAddressCountriesData`<br />`BeneficiaryAddressCountriesResponse` / `BeneficiaryAddressCountriesResponses`<br />`BeneficiaryAddressCountriesError` / `BeneficiaryAddressCountriesErrors` |
| `beneficiaryByNickname`       | Find a beneficiary by nickname     | `path` (required)                           | Bearer | `GET /v1/beneficiaries/by-nickname/{nickname}` | `BeneficiaryByNicknameData`<br />`BeneficiaryByNicknameResponse` / `BeneficiaryByNicknameResponses`<br />`BeneficiaryByNicknameError` / `BeneficiaryByNicknameErrors`                               |
| `beneficiaryCountries`        | List payout countries              | None                                        | Bearer | `GET /v1/beneficiaries/countries`              | `BeneficiaryCountriesData`<br />`BeneficiaryCountriesResponse` / `BeneficiaryCountriesResponses`<br />`BeneficiaryCountriesError` / `BeneficiaryCountriesErrors`                                    |
| `beneficiarySchemas`          | List payout schemas                | `query` (required)                          | Bearer | `GET /v1/beneficiaries/schemas`                | `BeneficiarySchemasData`<br />`BeneficiarySchemasResponse` / `BeneficiarySchemasResponses`<br />`BeneficiarySchemasError` / `BeneficiarySchemasErrors`                                              |
| `getBeneficiary`              | Read a beneficiary                 | `path` (required)                           | Bearer | `GET /v1/beneficiaries/{beneficiary_id}`       | `GetBeneficiaryData`<br />`GetBeneficiaryResponse` / `GetBeneficiaryResponses`<br />`GetBeneficiaryError` / `GetBeneficiaryErrors`                                                                  |
| `renameBeneficiary`           | Relabel a beneficiary              | `body` (required)<br />`path` (required)    | Bearer | `PATCH /v1/beneficiaries/{beneficiary_id}`     | `RenameBeneficiaryData`<br />`RenameBeneficiaryResponse` / `RenameBeneficiaryResponses`<br />`RenameBeneficiaryError` / `RenameBeneficiaryErrors`                                                   |

### Transfers

| Function         | Purpose                 | Request groups                              | Auth   | HTTP endpoint        | Generated types                                                                                                                    |
| ---------------- | ----------------------- | ------------------------------------------- | ------ | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `createQuote`    | Create a transfer quote | `body` (required)                           | Bearer | `POST /v1/quotes`    | `CreateQuoteData`<br />`CreateQuoteResponse` / `CreateQuoteResponses`<br />`CreateQuoteError` / `CreateQuoteErrors`                |
| `createTransfer` | Send a transfer         | `body` (required)<br />`headers` (required) | Bearer | `POST /v1/transfers` | `CreateTransferData`<br />`CreateTransferResponse` / `CreateTransferResponses`<br />`CreateTransferError` / `CreateTransferErrors` |

### Operations

| Function                   | Purpose                            | Request groups                                                     | Auth   | HTTP endpoint                                            | Generated types                                                                                                                                                                      |
| -------------------------- | ---------------------------------- | ------------------------------------------------------------------ | ------ | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `listOperations`           | List operations                    | `query` (optional)                                                 | Bearer | `GET /v1/operations`                                     | `ListOperationsData`<br />`ListOperationsResponse` / `ListOperationsResponses`<br />`ListOperationsError` / `ListOperationsErrors`                                                   |
| `getOperation`             | Read an operation                  | `path` (required)                                                  | Bearer | `GET /v1/operations/{operation_id}`                      | `GetOperationData`<br />`GetOperationResponse` / `GetOperationResponses`<br />`GetOperationError` / `GetOperationErrors`                                                             |
| `pollOperationApproval`    | Poll an operation approval         | `path` (required)                                                  | Bearer | `POST /v1/operations/{operation_id}/approval/poll`       | `PollOperationApprovalData`<br />`PollOperationApprovalResponse` / `PollOperationApprovalResponses`<br />`PollOperationApprovalError` / `PollOperationApprovalErrors`                |
| `resolveOperationApproval` | Resolve a stuck operation approval | `body` (required)<br />`path` (required)<br />`headers` (required) | Bearer | `POST /v1/operations/{operation_id}/approval/resolution` | `ResolveOperationApprovalData`<br />`ResolveOperationApprovalResponse` / `ResolveOperationApprovalResponses`<br />`ResolveOperationApprovalError` / `ResolveOperationApprovalErrors` |

### Mandates

| Function                   | Purpose                        | Request groups                                                     | Auth   | HTTP endpoint                                              | Generated types                                                                                                                                                                      |
| -------------------------- | ------------------------------ | ------------------------------------------------------------------ | ------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `refreshAgentToken`        | Refresh a paired agent token   | None                                                               | Bearer | `POST /v1/agent-tokens/refresh`                            | `RefreshAgentTokenData`<br />`RefreshAgentTokenResponse` / `RefreshAgentTokenResponses`<br />`RefreshAgentTokenError` / `RefreshAgentTokenErrors`                                    |
| `redeemConnectCode`        | Redeem a connect code          | `body` (required)                                                  | Public | `POST /v1/connect-codes/redeem`                            | `RedeemConnectCodeData`<br />`RedeemConnectCodeResponse` / `RedeemConnectCodeResponses`<br />`RedeemConnectCodeError` / `RedeemConnectCodeErrors`                                    |
| `mandates`                 | List mandates                  | None                                                               | Bearer | `GET /v1/mandates`                                         | `MandatesData`<br />`MandatesResponse` / `MandatesResponses`<br />`MandatesError` / `MandatesErrors`                                                                                 |
| `createMandate`            | Create a mandate               | `body` (required)<br />`headers` (required)                        | Bearer | `POST /v1/mandates`                                        | `CreateMandateData`<br />`CreateMandateResponse` / `CreateMandateResponses`<br />`CreateMandateError` / `CreateMandateErrors`                                                        |
| `mandateBeneficiaryGrants` | List beneficiary grants        | None                                                               | Bearer | `GET /v1/mandates/beneficiary-grants`                      | `MandateBeneficiaryGrantsData`<br />`MandateBeneficiaryGrantsResponse` / `MandateBeneficiaryGrantsResponses`<br />`MandateBeneficiaryGrantsError` / `MandateBeneficiaryGrantsErrors` |
| `spendBeneficiaryGrant`    | Spend a beneficiary grant      | `body` (required)<br />`path` (required)<br />`headers` (required) | Bearer | `POST /v1/mandates/beneficiary-grants/{grant_id}/payments` | `SpendBeneficiaryGrantData`<br />`SpendBeneficiaryGrantResponse` / `SpendBeneficiaryGrantResponses`<br />`SpendBeneficiaryGrantError` / `SpendBeneficiaryGrantErrors`                |
| `revokeBeneficiaryGrant`   | Revoke a beneficiary grant     | `path` (required)<br />`headers` (required)                        | Bearer | `POST /v1/mandates/beneficiary-grants/{grant_id}/revoke`   | `RevokeBeneficiaryGrantData`<br />`RevokeBeneficiaryGrantResponse` / `RevokeBeneficiaryGrantResponses`<br />`RevokeBeneficiaryGrantError` / `RevokeBeneficiaryGrantErrors`           |
| `revokeAllMandates`        | Revoke every agent's authority | `headers` (required)                                               | Bearer | `POST /v1/mandates/revoke-all`                             | `RevokeAllMandatesData`<br />`RevokeAllMandatesResponse` / `RevokeAllMandatesResponses`<br />`RevokeAllMandatesError` / `RevokeAllMandatesErrors`                                    |
| `getMandate`               | Read a mandate                 | `path` (required)                                                  | Bearer | `GET /v1/mandates/{mandate_id}`                            | `GetMandateData`<br />`GetMandateResponse` / `GetMandateResponses`<br />`GetMandateError` / `GetMandateErrors`                                                                       |
| `createConnectCode`        | Mint a connect code            | `path` (required)                                                  | Bearer | `POST /v1/mandates/{mandate_id}/connect-codes`             | `CreateConnectCodeData`<br />`CreateConnectCodeResponse` / `CreateConnectCodeResponses`<br />`CreateConnectCodeError` / `CreateConnectCodeErrors`                                    |
| `executeMandate`           | Execute a mandate payment      | `body` (required)<br />`path` (required)<br />`headers` (required) | Bearer | `POST /v1/mandates/{mandate_id}/executions`                | `ExecuteMandateData`<br />`ExecuteMandateResponse` / `ExecuteMandateResponses`<br />`ExecuteMandateError` / `ExecuteMandateErrors`                                                   |
| `revokeAgentPairing`       | Revoke an agent pairing        | `path` (required)                                                  | Bearer | `DELETE /v1/mandates/{mandate_id}/pairings/{pairing_id}`   | `RevokeAgentPairingData`<br />`RevokeAgentPairingResponse` / `RevokeAgentPairingResponses`<br />`RevokeAgentPairingError` / `RevokeAgentPairingErrors`                               |
| `revokeMandate`            | Revoke a mandate               | `path` (required)<br />`headers` (required)                        | Bearer | `POST /v1/mandates/{mandate_id}/revoke`                    | `RevokeMandateData`<br />`RevokeMandateResponse` / `RevokeMandateResponses`<br />`RevokeMandateError` / `RevokeMandateErrors`                                                        |

### Services

| Function                              | Purpose                    | Request groups                              | Auth   | HTTP endpoint                     | Generated types                                                                                                                                             |
| ------------------------------------- | -------------------------- | ------------------------------------------- | ------ | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createPurchaseQuote`                 | Price a service purchase   | `body` (required)<br />`query` (optional)   | Bearer | `POST /v1/purchase-quotes`        | `CreatePurchaseQuoteData`<br />`CreatePurchaseQuoteResponse` / `CreatePurchaseQuoteResponses`<br />`CreatePurchaseQuoteError` / `CreatePurchaseQuoteErrors` |
| `purchases`                           | List service purchases     | `query` (optional)                          | Bearer | `GET /v1/purchases`               | `PurchasesData`<br />`PurchasesResponse` / `PurchasesResponses`<br />`PurchasesError` / `PurchasesErrors`                                                   |
| `createPurchase`                      | Buy a service              | `body` (required)<br />`headers` (required) | Bearer | `POST /v1/purchases`              | `CreatePurchaseData`<br />`CreatePurchaseResponse` / `CreatePurchaseResponses`<br />`CreatePurchaseError` / `CreatePurchaseErrors`                          |
| `getPurchase`                         | Read a service purchase    | `path` (required)                           | Bearer | `GET /v1/purchases/{purchase_id}` | `GetPurchaseData`<br />`GetPurchaseResponse` / `GetPurchaseResponses`<br />`GetPurchaseError` / `GetPurchaseErrors`                                         |
| `serviceCapabilities`                 | Find service capabilities  | `query` (required)                          | Bearer | `GET /v1/service-capabilities`    | `ServiceCapabilitiesData`<br />`ServiceCapabilitiesResponse` / `ServiceCapabilitiesResponses`<br />`ServiceCapabilitiesError` / `ServiceCapabilitiesErrors` |
| `services`<br />Alias: `listServices` | List purchasable services  | `query` (optional)                          | Bearer | `GET /v1/services`                | `ServicesData`<br />`ServicesResponse` / `ServicesResponses`<br />`ServicesError` / `ServicesErrors`                                                        |
| `getService`                          | Read a purchasable service | `path` (required)<br />`query` (optional)   | Bearer | `GET /v1/services/{service_id}`   | `GetServiceData`<br />`GetServiceResponse` / `GetServiceResponses`<br />`GetServiceError` / `GetServiceErrors`                                              |

### Spending

| Function                   | Purpose                      | Request groups                              | Auth   | HTTP endpoint                                  | Generated types                                                                                                                                                                      |
| -------------------------- | ---------------------------- | ------------------------------------------- | ------ | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `spendingAccount`          | Read the spending account    | None                                        | Bearer | `GET /v1/spending-account`                     | `SpendingAccountData`<br />`SpendingAccountResponse` / `SpendingAccountResponses`<br />`SpendingAccountError` / `SpendingAccountErrors`                                              |
| `createSpendingWithdrawal` | Withdraw held spending funds | `body` (required)<br />`headers` (required) | Bearer | `POST /v1/spending-withdrawals`                | `CreateSpendingWithdrawalData`<br />`CreateSpendingWithdrawalResponse` / `CreateSpendingWithdrawalResponses`<br />`CreateSpendingWithdrawalError` / `CreateSpendingWithdrawalErrors` |
| `getSpendingWithdrawal`    | Read a spending withdrawal   | `path` (required)                           | Bearer | `GET /v1/spending-withdrawals/{withdrawal_id}` | `GetSpendingWithdrawalData`<br />`GetSpendingWithdrawalResponse` / `GetSpendingWithdrawalResponses`<br />`GetSpendingWithdrawalError` / `GetSpendingWithdrawalErrors`                |

### Cards

| Function               | Purpose                       | Request groups                              | Auth   | HTTP endpoint                              | Generated types                                                                                                                                                  |
| ---------------------- | ----------------------------- | ------------------------------------------- | ------ | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cardAccount`          | Read the card account         | None                                        | Bearer | `GET /v1/card-account`                     | `CardAccountData`<br />`CardAccountResponse` / `CardAccountResponses`<br />`CardAccountError` / `CardAccountErrors`                                              |
| `cardDepositAddress`   | Read the card funding address | `query` (optional)                          | Bearer | `GET /v1/card-account/deposit-address`     | `CardDepositAddressData`<br />`CardDepositAddressResponse` / `CardDepositAddressResponses`<br />`CardDepositAddressError` / `CardDepositAddressErrors`           |
| `cardDeposits`         | List card-account deposits    | `query` (optional)                          | Bearer | `GET /v1/card-account/deposits`            | `CardDepositsData`<br />`CardDepositsResponse` / `CardDepositsResponses`<br />`CardDepositsError` / `CardDepositsErrors`                                         |
| `cardKycStatus`        | Read card verification        | None                                        | Bearer | `GET /v1/card-account/kyc`                 | `CardKycStatusData`<br />`CardKycStatusResponse` / `CardKycStatusResponses`<br />`CardKycStatusError` / `CardKycStatusErrors`                                    |
| `createCardKycSession` | Start card verification       | None                                        | Bearer | `POST /v1/card-account/kyc-sessions`       | `CreateCardKycSessionData`<br />`CreateCardKycSessionResponse` / `CreateCardKycSessionResponses`<br />`CreateCardKycSessionError` / `CreateCardKycSessionErrors` |
| `cardWithdrawals`      | List card-account withdrawals | `query` (optional)                          | Bearer | `GET /v1/card-account/withdrawals`         | `CardWithdrawalsData`<br />`CardWithdrawalsResponse` / `CardWithdrawalsResponses`<br />`CardWithdrawalsError` / `CardWithdrawalsErrors`                          |
| `createCardWithdrawal` | Withdraw card-account funds   | `body` (required)<br />`headers` (required) | Bearer | `POST /v1/card-account/withdrawals`        | `CreateCardWithdrawalData`<br />`CreateCardWithdrawalResponse` / `CreateCardWithdrawalResponses`<br />`CreateCardWithdrawalError` / `CreateCardWithdrawalErrors` |
| `cards`                | List cards                    | None                                        | Bearer | `GET /v1/cards`                            | `CardsData`<br />`CardsResponse` / `CardsResponses`<br />`CardsError` / `CardsErrors`                                                                            |
| `createCard`           | Create a card                 | `body` (required)<br />`headers` (required) | Bearer | `POST /v1/cards`                           | `CreateCardData`<br />`CreateCardResponse` / `CreateCardResponses`<br />`CreateCardError` / `CreateCardErrors`                                                   |
| `card`                 | Read a card                   | `path` (required)                           | Bearer | `GET /v1/cards/{card_id}`                  | `CardData`<br />`CardResponse` / `CardResponses`<br />`CardError` / `CardErrors`                                                                                 |
| `setCardNickname`      | Change a card label           | `body` (required)<br />`path` (required)    | Bearer | `PATCH /v1/cards/{card_id}`                | `SetCardNicknameData`<br />`SetCardNicknameResponse` / `SetCardNicknameResponses`<br />`SetCardNicknameError` / `SetCardNicknameErrors`                          |
| `closeCard`            | Close a card                  | `path` (required)<br />`headers` (required) | Bearer | `POST /v1/cards/{card_id}/close`           | `CloseCardData`<br />`CloseCardResponse` / `CloseCardResponses`<br />`CloseCardError` / `CloseCardErrors`                                                        |
| `freezeCard`           | Freeze a card                 | `path` (required)<br />`headers` (required) | Bearer | `POST /v1/cards/{card_id}/freeze`          | `FreezeCardData`<br />`FreezeCardResponse` / `FreezeCardResponses`<br />`FreezeCardError` / `FreezeCardErrors`                                                   |
| `cardRevealSession`    | Start a card reveal session   | `path` (required)<br />`headers` (required) | Bearer | `POST /v1/cards/{card_id}/reveal-sessions` | `CardRevealSessionData`<br />`CardRevealSessionResponse` / `CardRevealSessionResponses`<br />`CardRevealSessionError` / `CardRevealSessionErrors`                |
| `cardTransactions`     | List card transactions        | `path` (required)<br />`query` (optional)   | Bearer | `GET /v1/cards/{card_id}/transactions`     | `CardTransactionsData`<br />`CardTransactionsResponse` / `CardTransactionsResponses`<br />`CardTransactionsError` / `CardTransactionsErrors`                     |
| `unfreezeCard`         | Unfreeze a card               | `path` (required)<br />`headers` (required) | Bearer | `POST /v1/cards/{card_id}/unfreeze`        | `UnfreezeCardData`<br />`UnfreezeCardResponse` / `UnfreezeCardResponses`<br />`UnfreezeCardError` / `UnfreezeCardErrors`                                         |

### Webhooks

| Function             | Purpose                       | Request groups    | Auth   | HTTP endpoint                                        | Generated types                                                                                                                                        |
| -------------------- | ----------------------------- | ----------------- | ------ | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `listSubscriptions`  | List webhook subscriptions    | None              | Bearer | `GET /v1/webhook-subscriptions`                      | `ListSubscriptionsData`<br />`ListSubscriptionsResponse` / `ListSubscriptionsResponses`<br />`ListSubscriptionsError` / `ListSubscriptionsErrors`      |
| `createSubscription` | Create a webhook subscription | `body` (required) | Bearer | `POST /v1/webhook-subscriptions`                     | `CreateSubscriptionData`<br />`CreateSubscriptionResponse` / `CreateSubscriptionResponses`<br />`CreateSubscriptionError` / `CreateSubscriptionErrors` |
| `deleteSubscription` | Delete a webhook subscription | `path` (required) | Bearer | `DELETE /v1/webhook-subscriptions/{subscription_id}` | `DeleteSubscriptionData`<br />`DeleteSubscriptionResponse` / `DeleteSubscriptionResponses`<br />`DeleteSubscriptionError` / `DeleteSubscriptionErrors` |

## Poll purchases and operations

The package exports resource-specific polling helpers and a predicate-driven engine. Each helper returns the complete field-style result from the read that stopped the loop.

### Choose a resource helper

The purchase classifier is exhaustive over `PurchaseView["status"]`, while operation actionability also depends on the operation kind:

```typescript theme={null}
export declare const PURCHASE_STATUS_TERMINALITY: {
  readonly queued: false;
  readonly running: false;
  readonly settling: false;
  readonly completed: true;
  readonly input_required: true;
  readonly no_service_available: true;
  readonly services_failed: true;
  readonly expired: true;
  readonly blocked: true;
  readonly confirmation_required: true;
  readonly settlement_uncertain: true;
  readonly cancelled: true;
  readonly failed: true;
};
```

The exported predicates use that classification:

```typescript theme={null}
export declare function isTerminalPurchaseStatus(
  status: PurchaseView["status"],
): boolean;

export declare function isActionableOperation(
  operation: OperationView,
): boolean;
```

Use the matching wrapper for each resource:

```typescript theme={null}
export declare function pollPurchaseUntilTerminal(options: {
  client: PerfloClient;
  purchaseId: string;
  intervalMs: number;
  timeoutMs: number;
  signal?: AbortSignal;
}): Promise<PollFields<PurchaseView>>;

export declare function pollOperationUntilActionable(options: {
  client: PerfloClient;
  operationId: string;
  intervalMs: number;
  timeoutMs: number;
  signal?: AbortSignal;
}): Promise<PollFields<OperationView>>;
```

The stopping rules are:

| Resource  | Continue                                                                          | Stop                                                                                                                                                                   |
| --------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Purchase  | `queued`, `running`, `settling`                                                   | `completed`, `input_required`, `no_service_available`, `services_failed`, `expired`, `blocked`, `confirmation_required`, `settlement_uncertain`, `cancelled`, `failed` |
| Operation | `accepted`, `submitting`, and `submitted` for every kind except `card_withdrawal` | `requires_action`, `indeterminate`, `succeeded`, `failed`, `cancelled`, and `submitted` when `kind` is `card_withdrawal`                                               |

`pollPurchaseUntilTerminal` calls only `getPurchase`. `pollOperationUntilActionable` calls only `getOperation`; it never opens a hosted action or invokes `pollOperationApproval`, `resolveOperationApproval`, or another mutation. A returned `requires_action` or `indeterminate` operation tells the caller to inspect the full resource. It does not claim that reconciliation has ended.

### Configure the generic engine

`pollUntil<T>` requires the caller to supply a stopping predicate because a generic value has no resource identity:

```typescript theme={null}
export declare function pollUntil<T>(options: {
  poll: (signal: AbortSignal) => Promise<PollFields<T>>;
  shouldStop: (value: T) => boolean;
  intervalMs: number;
  timeoutMs: number;
  signal?: AbortSignal;
}): Promise<PollFields<T>>;
```

Configure every call with these options:

| Option       | Behavior                                                                                       |
| ------------ | ---------------------------------------------------------------------------------------------- |
| `poll`       | Receives a linked child `AbortSignal` and returns a field-style read result.                   |
| `shouldStop` | Returns `true` for a value that ends the loop.                                                 |
| `intervalMs` | Sets the wait after each completed non-terminal read. It must be finite and positive.          |
| `timeoutMs`  | Sets the deadline measured from helper invocation. It must be finite and positive.             |
| `signal`     | Cancels interval sleep and in-flight reads. A signal aborted before invocation causes no read. |

The engine reads immediately, waits between completed reads, and never overlaps them. It rejects invalid interval or timeout values with a `TypeError` before calling `poll`. It does not start a read after the deadline. The child signal reaches normal reads, automatic agent-token refresh, and the authenticated retry.

The engine does not retry a failed read. It returns the ordinary failure result unchanged, including its object identity and any `request` or `response`. The caller remains responsible for backoff, scheduling, hosted actions, mutations, and error mapping.

### Handle control outcomes

Polling uses the same field-style result shape as generated operations:

```typescript theme={null}
export type PollFields<T> =
  | {
      data: T;
      error: undefined;
      request: Request;
      response: Response;
    }
  | {
      data: undefined;
      error: unknown;
      request?: Request;
      response?: Response;
    };
```

Deadline and cancellation outcomes return through the `error` branch:

```typescript theme={null}
export declare class PollDeadlineError<T = unknown> extends Error {
  readonly code: "POLL_DEADLINE_EXCEEDED";
  readonly lastValue?: T;
  readonly outcomeMayStillChange: true;
  readonly timeoutMs: number;
  constructor(timeoutMs: number);
  constructor(timeoutMs: number, lastValue: T);
}

export declare class PollAbortedError<T = unknown> extends Error {
  readonly code: "POLL_ABORTED";
  readonly lastValue?: T;
  readonly reason: unknown;
  constructor(reason: unknown);
  constructor(reason: unknown, lastValue: T);
}
```

Use the structural guards when the error can cross a JavaScript realm:

```typescript theme={null}
export declare function isPollDeadlineError<T = unknown>(
  value: unknown,
): value is PollDeadlineError<T>;

export declare function isPollAbortedError<T = unknown>(
  value: unknown,
): value is PollAbortedError<T>;
```

`PollDeadlineError` includes the last observed resource when one exists and always sets `outcomeMayStillChange` to `true`. `PollAbortedError` preserves the caller's abort reason and the last value when one exists. These guards do not rely on `instanceof`.

A deadline means the resource may still change. It does not alter or infer `submission_uncertain`, and it never authorizes a replacement financial write. Reconcile the existing resource before deciding whether another mutation is safe.

## Use the transport client directly

`PerfloClient` also exposes the generated Fetch transport. These methods retain the client origin, credential, redirect, and operation-authentication policies.

| Surface                 | Signature or members                                                                      | Behavior                                                                                                                                                                                                                                                                                         |
| ----------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Generic request         | `client.request(options)`                                                                 | Sends a request whose options include a required `method`.                                                                                                                                                                                                                                       |
| HTTP verbs              | `client.connect`, `delete`, `get`, `head`, `options`, `patch`, `post`, `put`, `trace`     | Sends a request with the named method.                                                                                                                                                                                                                                                           |
| URL construction        | `client.buildUrl(options)`                                                                | Combines the configured origin, path template values, and serialized query. It does not send a request.                                                                                                                                                                                          |
| Read configuration      | `client.getConfig()`                                                                      | Returns a shallow copy of the current client configuration.                                                                                                                                                                                                                                      |
| Update configuration    | `client.setConfig(config)`                                                                | Merges configuration and returns the updated copy. Shared result configuration is fixed at `responseStyle: "fields"` and `throwOnError: false`; direct transport calls can override either value per call. Fixed origin, credential, redirect, and authentication rules still apply at dispatch. |
| Server-sent events      | `client.sse.connect`, `delete`, `get`, `head`, `options`, `patch`, `post`, `put`, `trace` | Opens a server-sent events (SSE) request with the named method. No generated Perflo operation currently uses SSE.                                                                                                                                                                                |
| Interceptor collections | `client.interceptors.request`, `response`, `error`                                        | Runs request, response, or error middleware at the corresponding transport stage.                                                                                                                                                                                                                |

Each interceptor collection exposes these methods:

| Method               | Return            | Behavior                                                                                       |
| -------------------- | ----------------- | ---------------------------------------------------------------------------------------------- |
| `use(fn)`            | `number`          | Registers an interceptor and returns its numeric ID.                                           |
| `eject(idOrFn)`      | `void`            | Removes the matching ID or function when present.                                              |
| `exists(idOrFn)`     | `boolean`         | Reports whether the matching interceptor is active.                                            |
| `update(idOrFn, fn)` | `idOrFn \| false` | Replaces the matching interceptor and returns the original identifier, or `false` when absent. |
| `clear()`            | `void`            | Removes every interceptor in that collection.                                                  |

Request interceptors must preserve the configured origin, credential mode, redirect policy, and public-versus-bearer operation policy. Violations return or throw a `TypeError` according to `throwOnError`.

## Classify uncertain writes

The package exports a problem-details type guard and two runtime classifiers for deciding whether a replacement financial operation is safe.

```typescript theme={null}
export declare function isProblemDetails(
  error: unknown,
): error is ProblemDetails;

export declare function isSubmissionUncertain(
  error: unknown,
): boolean;

export declare function isDefinitiveNoOperation(
  error: unknown,
): boolean;
```

Use `isProblemDetails(error)` before reading `code`, `detail`, `retryable`, or other problem fields from a generated result.

`isSubmissionUncertain(error)` returns `true` when `error` is a non-null object and either of these values is exactly `true`:

* `error.submission_uncertain`
* `error.problem.submission_uncertain`

`isDefinitiveNoOperation(error)` returns `true` only when every condition holds:

* Neither direct nor nested `submission_uncertain` is `true`.
* `error.status` is an integer from `400` through `499`, excluding `408`.
* A direct problem document exists, or `error.problem` contains one.
* The problem satisfies the complete `ProblemDetails` shape.
* The problem status equals `error.status`.
* The problem code does not start with `idempotency_`.

Every other result requires the recovery policy in [operations and errors](/developers/concepts/operations-errors). A transport-uncertain write may already have taken effect and must not be replaced.

## Check a verification URL

The package exports the verification-URL rule as a type guard.

```typescript theme={null}
export declare function isAllowedVerificationUrl(
  value: unknown,
): value is string;
```

`isAllowedVerificationUrl(value)` returns `true` for an HTTPS URL with no credentials and a host of at least two ASCII labels of letters, digits and inner hyphens, none of them `localhost` and none beginning `xn--`, each label at most 63 characters and the host at most 253, with one trailing dot allowed and a final label that is neither all digits nor `0x` hex. A zero or empty port, a percent sign or bracket in the authority, a backslash, a space or an ASCII control character anywhere, and any non-string value return `false`. It does not check ownership, DNS resolution, or reachability. It is the same rule applied to a `kyc_session` action's `url` in [accounts and KYC](/developers/guides/accounts-kyc), so a TypeScript client calls it instead of re-implementing the rule.

## Read generated type names

All operation types and API model types are exported from the package root. For an operation with the PascalCase name `X`, generated types follow this pattern:

| Type         | Meaning                                                                                                                                                                   |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `XData`      | Input groups accepted by the generated function, excluding `client` and shared transport options.                                                                         |
| `XResponses` | Map from successful HTTP status to the response model for that status.                                                                                                    |
| `XResponse`  | Union of the values in `XResponses`.                                                                                                                                      |
| `XErrors`    | Map from error HTTP status to the error model for that status.                                                                                                            |
| `XError`     | Union of the declared HTTP error bodies in `XErrors`. Runtime `result.error` remains `unknown` because it can also contain decode, request-build, and transport failures. |
| Model types  | Request bodies, response resources, problem documents, enums, and shared value objects referenced by operation types.                                                     |

For example, `CreateTransferData` defines the transfer request groups. `CreateTransferResponses` maps success statuses, while `CreateTransferResponse` is their value union. `CreateTransferErrors` and `CreateTransferError` follow the same pattern for failures.

`PerfloClientOptions` configures the SDK client. The separately generated `ClientOptions` name is an API model and does not configure `createPerfloClient`.

## Related documentation

Use these pages with the SDK reference:

* [TypeScript SDK guide](/developers/get-started/typescript-sdk) for installation and financial workflow examples
* The **API reference** tab for exact HTTP request and response schemas
* [Authentication and token lifecycle](/developers/concepts/authentication) for customer and agent credentials
* [Confirmation and idempotency](/developers/concepts/confirmation-idempotency) for mutation controls
* [Operations and errors](/developers/concepts/operations-errors) for asynchronous state and uncertain-write recovery

<Note>
  Polling reports recorded state. It does not authorize retries or replace confirmation, idempotency, mandate, customer-approval, or compliance controls. A deadline never proves that a financial write failed.
</Note>
