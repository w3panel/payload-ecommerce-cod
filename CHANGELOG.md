# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[1.0.0]: https://github.com/technewwings/payload-ecommerce-cod/releases/tag/v1.0.0
