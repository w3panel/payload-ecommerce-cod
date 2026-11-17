import type { PaymentAdapter } from '@payloadcms/plugin-ecommerce/dist/types'
import type { ConfirmOrderReturnType } from './index.js'

/** The id of a relationship value (an id, or a populated document), or null when unset. */
const relationshipID = (value: unknown): number | string | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') return value
  if (value && typeof value === 'object' && 'id' in value) {
    return relationshipID((value as { id?: unknown }).id)
  }
  return null
}

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
  async ({ data, finalizeOrder, req, transactionsSlug = 'transactions' }) => {
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

      const confirmed = (orderID: number | string): ConfirmOrderReturnType => ({
        message: 'COD order confirmed successfully',
        orderID: orderID as string,
        transactionID: transaction.id as string,
      })

      // A repeated confirmation of a finished checkout: the order already exists. Return it
      // without calling finalizeOrder, whose claim only accepts an unlinked pending
      // transaction and whose wait loop only recognises `succeeded`.
      const existingOrderID = relationshipID((transaction as Record<string, unknown>).order)
      if (existingOrderID !== null) return confirmed(existingOrderID)

      // Get shipping address from billing address or transaction data
      const shippingAddress = transaction.billingAddress

      // finalizeOrder claims the transaction, creates the order, marks the cart purchased and
      // decrements inventory. It also sets the transaction status to `succeeded`, which for
      // COD is wrong: no money has been received yet. The status is put back below.
      let orderID: number | string
      try {
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
        const id = relationshipID(order?.id)
        if (id === null) {
          throw new Error('COD order settlement did not return an order')
        }
        orderID = id
      } catch (error) {
        // A concurrent confirmation of the same checkout held the claim. Once it finishes, the
        // transaction is `pending` again with its order linked, which finalizeOrder's wait
        // loop does not recognise, so it times out. Use the linked order if there is one.
        const current = await payload.findByID({
          id: transaction.id,
          collection: transactionsSlug,
          depth: 0,
          overrideAccess: true,
          req,
        })
        const linkedOrderID = relationshipID((current as Record<string, unknown> | null)?.order)
        if (linkedOrderID === null) throw error
        return confirmed(linkedOrderID)
      }

      await payload.update({
        id: transaction.id,
        collection: transactionsSlug,
        data: {
          cod: {
            ...((transaction as Record<string, unknown>).cod || {}),
            validationStatus: 'validated',
          },
          // Cash is collected at the door, so the transaction stays pending until the
          // application records the collection (see the README).
          status: 'pending',
        },
        overrideAccess: true,
        req,
      })

      return confirmed(orderID)
    } catch (error) {
      payload.logger.error(error, 'Error confirming COD order')

      throw new Error(error instanceof Error ? error.message : 'Unknown error confirming COD order')
    }
  }
