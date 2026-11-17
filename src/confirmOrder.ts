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

      // Get shipping address from billing address or transaction data
      const shippingAddress = transaction.billingAddress

      const record = transaction as Record<string, unknown>
      const alreadyLinked = relationshipID(record.order) !== null
      // A repeated confirmation of a checkout this adapter already finished: the order is
      // linked and the status is back to `pending`. The ecommerce endpoint requires every
      // confirmation to go through finalizeOrder, whose wait loop only accepts a linked
      // transaction as finished when it is `succeeded`. Mark it so for the length of this call
      // with a raw write (no hooks, inside the request's database transaction), then restore.
      // Only inside a database transaction (e.g. Postgres): there the temporary status is never
      // visible to other requests and is rolled back if anything fails. Without one (e.g. D1)
      // a repeat is left to finalizeOrder, which then times out, rather than briefly showing
      // an unpaid order as paid.
      const inDatabaseTransaction = Boolean(await req.transactionID)
      const isRepeatOfPendingCOD =
        alreadyLinked && record.status === 'pending' && inDatabaseTransaction
      const markSucceeded = () =>
        payload.db.updateOne({
          id: transaction.id,
          collection: transactionsSlug,
          data: { status: 'succeeded' },
          req,
        })
      // Restore only what this call changed: if the application recorded the cash collection
      // meanwhile (which sets `succeeded` with `cod.paymentCollected`), keep it.
      const restorePending = () =>
        payload.db.updateOne({
          collection: transactionsSlug,
          data: { status: 'pending' },
          req,
          where: {
            and: [
              { id: { equals: transaction.id } },
              { status: { equals: 'succeeded' } },
              {
                or: [
                  { 'cod.paymentCollected': { equals: false } },
                  { 'cod.paymentCollected': { exists: false } },
                ],
              },
            ],
          },
        })

      if (isRepeatOfPendingCOD) await markSucceeded()

      // finalizeOrder claims the transaction, creates the order, marks the cart purchased and
      // decrements inventory. It also sets the transaction status to `succeeded`, which for
      // COD is wrong: no money has been received yet. The status is put back below.
      let order: Awaited<ReturnType<typeof finalizeOrder>>
      try {
        order = await finalizeOrder({
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
      } catch (error) {
        // Without a database transaction (e.g. D1) the temporary status would stay behind.
        if (isRepeatOfPendingCOD) await restorePending().catch(() => undefined)
        throw error
      }

      const orderID = relationshipID(order?.id)
      if (orderID === null) {
        throw new Error('COD order settlement did not return an order')
      }

      const confirmed: ConfirmOrderReturnType = {
        message: 'COD order confirmed successfully',
        orderID: orderID as string,
        transactionID: transaction.id as string,
      }

      if (isRepeatOfPendingCOD) {
        await restorePending()
        return confirmed
      }

      // Already linked and not pending: a transaction from before 4.0.0-beta.9, or one the
      // application has since marked collected. Leave it exactly as it is.
      if (alreadyLinked) return confirmed

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

      return confirmed
    } catch (error) {
      payload.logger.error(error, 'Error confirming COD order')

      throw new Error(error instanceof Error ? error.message : 'Unknown error confirming COD order')
    }
  }
