# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [4.0.0-beta.9] - 2026-11-17

### Fixed

- COD transactions stay `pending` after checkout again, as documented since 4.0.0-beta.7. `confirmOrder` now calls the ecommerce plugin's `finalizeOrder`, which sets every transaction to `succeeded`; the adapter puts the status back to `pending` so a cash order no longer reads as paid before the cash is collected. Your application sets `succeeded` when it records the collection.
- A repeated confirmation of a finished checkout returns the existing order instead of waiting on `finalizeOrder`, whose wait loop only recognises `succeeded`.
- If a concurrent confirmation of the same checkout created the order first, the other call returns that order instead of failing with "Transaction settlement did not complete in time."

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
