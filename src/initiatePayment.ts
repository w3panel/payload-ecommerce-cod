import type { PaymentAdapter } from '@payloadcms/plugin-ecommerce/dist/types'
import type { InitiatePaymentReturnType } from './index.js'

type Props = {
  allowedRegions?: string[]
  fixedServiceCharge?: number
  maximumOrder?: number
  minimumOrder?: number
  serviceChargePercentage?: number
  supportedCurrencies?: string[]
}

export const initiatePayment: (props: Props) => NonNullable<PaymentAdapter>['initiatePayment'] =
  (props) =>
  async ({ data, req, transactionsSlug }) => {
    const payload = req.payload
    const {
      allowedRegions,
      fixedServiceCharge,
      maximumOrder,
      minimumOrder,
      serviceChargePercentage,
      supportedCurrencies,
    } = props || {}

    const customerEmail = data.customerEmail
    const currency = data.currency
    const cart = data.cart
    const amount = cart.subtotal
    const billingAddressFromData = data.billingAddress
    const shippingAddressFromData = data.shippingAddress

    if (!currency) {
      throw new Error('Currency is required.')
    }

    if (!cart || !cart.items || cart.items.length === 0) {
      throw new Error('Cart is empty or not provided.')
    }

    if (!customerEmail || typeof customerEmail !== 'string') {
      throw new Error('A valid customer email is required to make a purchase.')
    }

    if (!amount || typeof amount !== 'number' || amount <= 0) {
      throw new Error('A valid amount is required to initiate a payment.')
    }

    // Validate supported currencies
    if (supportedCurrencies && !supportedCurrencies.includes(currency.toUpperCase())) {
      throw new Error(
        `COD is not available for ${currency}. Supported currencies: ${supportedCurrencies.join(', ')}`,
      )
    }

    // Validate minimum order amount
    if (minimumOrder && amount < minimumOrder) {
      throw new Error(
        `Order amount must be at least ${minimumOrder / 100} ${currency} for COD payment.`,
      )
    }

    // Validate maximum order amount
    if (maximumOrder && amount > maximumOrder) {
      throw new Error(
        `Order amount must not exceed ${maximumOrder / 100} ${currency} for COD payment.`,
      )
    }

    // Validate allowed regions
    if (allowedRegions && shippingAddressFromData) {
      const shippingCountry = (shippingAddressFromData as Record<string, unknown>)?.country as
        | string
        | undefined
      if (shippingCountry && !allowedRegions.includes(shippingCountry)) {
        throw new Error(
          `COD is not available in ${shippingCountry}. Available regions: ${allowedRegions.join(', ')}`,
        )
      }
    }

    try {
      // Calculate service charge if configured
      let serviceCharge = 0
      if (serviceChargePercentage) {
        serviceCharge = Math.round((amount * serviceChargePercentage) / 100)
      }
      if (fixedServiceCharge) {
        serviceCharge += fixedServiceCharge
      }

      const totalAmount = amount + serviceCharge

      // Flatten cart items to store IDs only (omit cart line `id` — transactions_items.id is globally unique)
      const flattenedCart = cart.items.map((item) => {
        const productID = typeof item.product === 'object' ? item.product.id : item.product
        const variantID = item.variant
          ? typeof item.variant === 'object'
            ? item.variant.id
            : item.variant
          : undefined

        const quantity =
          typeof item.quantity === 'number' && Number.isFinite(item.quantity) && item.quantity > 0
            ? item.quantity
            : 1

        return {
          product: productID,
          quantity,
          ...(variantID ? { variant: variantID } : {}),
        }
      })

      // Generate a unique order ID for COD
      const orderID = `COD-${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`

      // Create a transaction for the COD payment
      const _transaction = await payload.create({
        collection: transactionsSlug,
        data: {
          ...(req.user ? { customer: req.user.id } : { customerEmail }),
          amount: totalAmount,
          billingAddress: billingAddressFromData,
          cart: cart.id,
          currency: currency.toUpperCase(),
          items: flattenedCart,
          paymentMethod: 'cod',
          status: 'pending',
          cod: {
            orderID,
            validationStatus: 'pending',
            deliveryStatus: 'preparing',
            paymentCollected: false,
          },
        },
      })

      const returnData: InitiatePaymentReturnType = {
        message: 'COD order initiated successfully',
        orderID,
        ...(serviceCharge > 0 ? { serviceCharge } : {}),
      }

      return returnData
    } catch (error) {
      payload.logger.error(error, 'Error initiating COD payment')

      throw new Error(
        error instanceof Error ? error.message : 'Unknown error initiating COD payment',
      )
    }
  }
