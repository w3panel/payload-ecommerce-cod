import type { PaymentAdapter } from '@payloadcms/plugin-ecommerce/dist/types'
import type { ConfirmOrderReturnType } from './index.js'

type Props = {
  allowedRegions?: string[]
  fixedServiceCharge?: number
  maximumOrder?: number
  minimumOrder?: number
  serviceChargePercentage?: number
  supportedCurrencies?: string[]
}

export const confirmOrder: (props: Props) => NonNullable<PaymentAdapter>['confirmOrder'] =
  (_props) =>
  async ({
    data,
    finalizeOrder,
    req,
    transactionsSlug = 'transactions',
  }) => {
    const payload = req.payload

    const customerEmail = data.customerEmail
    const codOrderID = data.orderID as string

    if (!codOrderID) {
      throw new Error('COD Order ID is required')
    }

    try {
      // Find our existing transaction by the COD order ID
      const transactionsResults = await payload.find({
        collection: transactionsSlug,
        overrideAccess: true,
        req,
        where: {
          'cod.orderID': {
            equals: codOrderID,
          },
        },
      })

      const transaction = transactionsResults.docs[0]

      if (!transactionsResults.totalDocs || !transaction) {
        throw new Error('No transaction found for the provided COD Order ID')
      }

      // Get cart information from the transaction
      const cartID = typeof transaction.cart === 'object' ? transaction.cart.id : transaction.cart
      const cartItemsSnapshot = transaction.items
      const amount = transaction.amount
      const currency = transaction.currency

      if (!cartID) {
        throw new Error('Cart ID not found in the transaction')
      }

      if (!cartItemsSnapshot || !Array.isArray(cartItemsSnapshot)) {
        throw new Error('Cart items snapshot not found or invalid in the transaction')
      }

      // Get shipping address from billing address or transaction data
      const shippingAddress = transaction.billingAddress

      // finalizeOrder claims the transaction, creates or reuses the order, marks the cart
      // purchased, and decrements inventory. It also sets the transaction status to succeeded.
      const order = await finalizeOrder({
        orderData: {
          amount,
          currency,
          ...(req.user ? { customer: req.user.id } : { customerEmail }),
          items: cartItemsSnapshot,
          shippingAddress,
          status: 'processing',
        },
        transactionID: transaction.id,
      })

      const orderID = order.id
      if (typeof orderID !== 'string' && typeof orderID !== 'number') {
        throw new Error('COD order settlement did not return an order')
      }

      await payload.update({
        id: transaction.id,
        collection: transactionsSlug,
        data: {
          cod: {
            ...((transaction as Record<string, unknown>).cod || {}),
            validationStatus: 'validated',
          },
        },
        overrideAccess: true,
        req,
      })

      const returnData: ConfirmOrderReturnType = {
        message: 'COD order confirmed successfully',
        orderID: orderID as string,
        transactionID: transaction.id as string,
      }

      return returnData
    } catch (error) {
      payload.logger.error(error, 'Error confirming COD order')

      throw new Error(error instanceof Error ? error.message : 'Unknown error confirming COD order')
    }
  }
