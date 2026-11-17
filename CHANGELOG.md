# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [4.0.0-beta.9] - 2026-11-17

### Fixed

- COD transactions stay `pending` after checkout again, as documented since 4.0.0-beta.7. `confirmOrder` now calls the ecommerce plugin's `finalizeOrder`, which sets every transaction to `succeeded`; the adapter puts the status back to `pending` so a cash order no longer reads as paid before the cash is collected. Your application sets `succeeded` when it records the collection.
- A repeated confirmation of a checkout this adapter already finished still goes through `finalizeOrder` (the ecommerce endpoint requires it) and returns the same order. For the length of the call the transaction is marked `succeeded` with a raw database write (no hooks), because `finalizeOrder`'s wait loop only accepts a linked transaction as finished when it is `succeeded`; it is then restored to `pending`, unless your application recorded the cash collection in the meantime. This needs a database transaction (e.g. Postgres); without one (e.g. D1) the temporary status is not written and a repeat fails as described below, so other requests never see an unpaid order as paid.
- Transactions that are already linked and not `pending` (for example created by 4.0.0-beta.8, or already marked collected by your application) are left untouched by a repeated confirmation.

### Known limitation

- Without a database transaction (e.g. Cloudflare D1), a repeated confirmation of a finished COD checkout fails with "Error confirming order." The order was created by the first confirmation. If the update back to `pending` fails after `finalizeOrder` on such a database, the transaction stays `succeeded` as in 4.0.0-beta.8.
- Two confirmations of the same checkout running at the same moment: the second one waits for `succeeded` and times out with "Error confirming order." The first one creates the order normally. Storefronts that start a new payment for each attempt are not affected.

## [4.0.0-beta.8] - 2026-11-11

### Fixed

- `initiatePayment` creates the COD transaction with `overrideAccess: true`. Payload 4 changed the Local API default to `overrideAccess: false`, so with transactions `create` restricted to admins every customer and guest checkout failed with "You are not allowed to perform this action."

## [4.0.0-beta.7]

### Changed

- **Breaking behavior:** `confirmOrder` no longer sets the transaction `status` to `succeeded` when the order is created. COD transactions remain `pending` until your application marks payment as collected (for example by updating `cod.paymentCollected` and `status` when cash is received at delivery).

## [1.0.0] - 2026-01-21

### Added

- Initial release of COD payment adapter for Payload CMS
- Support for minimum and maximum order validation
- Regional availability controls
- Currency restrictions
- Service charge calculation (percentage and fixed)
- Delivery status tracking
- Payment collection tracking
- Full Payload CMS Ecommerce Plugin compatibility
- Comprehensive unit tests with 80%+ coverage
- TypeScript definitions
- ESM and CommonJS support
- GitHub Actions CI/CD pipeline
- Documentation and examples

[1.0.0]: https://github.com/w3panel/payload-ecommerce-cod/releases/tag/v1.0.0
