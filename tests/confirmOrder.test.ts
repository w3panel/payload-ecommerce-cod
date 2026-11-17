import { describe, it, expect, vi, beforeEach } from 'vitest'
import { confirmOrder } from '../src/confirmOrder'

const mockPayload = {
  find: vi.fn(),
  db: { updateOne: vi.fn() },
  create: vi.fn(),
  update: vi.fn(),
  logger: {
    error: vi.fn(),
  },
}

const mockReq = {
  payload: mockPayload,
  user: { id: 'user-123' },
} as any

const mockTransaction = {
  id: 'transaction-123',
  cart: 'cart-123',
  amount: 5000,
  currency: 'USD',
  items: [
    {
      product: 'product-123',
      quantity: 2,
    },
  ],
  billingAddress: {
    street: '123 Main St',
    city: 'Test City',
    country: 'US',
  },
  cod: {
    orderID: 'COD-123456',
    validationStatus: 'pending',
  },
}

describe('confirmOrder', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPayload.find.mockResolvedValue({
      docs: [mockTransaction],
      totalDocs: 1,
    })
    mockPayload.create.mockResolvedValue({
      id: 'order-123',
    })
    mockPayload.update.mockResolvedValue({})
  })

  it('should successfully confirm a COD order', async () => {
    const finalizeOrder = vi.fn().mockResolvedValue({ id: 'order-123' })
    const handler = confirmOrder({})
    const result = await handler({
      data: {
        customerEmail: 'test@example.com',
        orderID: 'COD-123456',
      },
      finalizeOrder,
      req: mockReq,
      ordersSlug: 'orders',
      cartsSlug: 'carts',
      transactionsSlug: 'transactions',
    })

    expect(result).toEqual({
      message: 'COD order confirmed successfully',
      orderID: 'order-123',
      transactionID: 'transaction-123',
    })

    expect(mockPayload.find).toHaveBeenCalledWith({
      collection: 'transactions',
      overrideAccess: true,
      req: mockReq,
      where: {
        'cod.orderID': {
          equals: 'COD-123456',
        },
      },
    })

    expect(finalizeOrder).toHaveBeenCalledWith({
      orderData: expect.objectContaining({
        amount: 5000,
        currency: 'USD',
        customer: 'user-123',
        status: 'processing',
      }),
      transactionID: 'transaction-123',
    })
    expect(mockPayload.create).not.toHaveBeenCalled()
    expect(mockPayload.update).toHaveBeenCalledTimes(1)

    const transactionUpdate = mockPayload.update.mock.calls.find(
      (call) => (call[0] as { collection?: string }).collection === 'transactions',
    )
    expect(transactionUpdate).toBeDefined()
    expect((transactionUpdate![0] as { data?: Record<string, unknown> }).data).toEqual(
      expect.objectContaining({
        cod: expect.objectContaining({ validationStatus: 'validated' }),
      }),
    )
    expect((transactionUpdate![0] as { data?: Record<string, unknown> }).data).toEqual(
      expect.objectContaining({ status: 'pending' }),
    )
    expect((transactionUpdate![0] as { data?: Record<string, unknown> }).data).not.toHaveProperty(
      'order',
    )
  })

  it('keeps the guest email when nobody is signed in', async () => {
    const finalizeOrder = vi.fn().mockResolvedValue({ id: 'order-123' })
    const handler = confirmOrder({})
    await handler({
      data: {
        customerEmail: 'guest@example.com',
        orderID: 'COD-123456',
      },
      finalizeOrder,
      req: { ...mockReq, user: undefined },
      ordersSlug: 'orders',
      cartsSlug: 'carts',
      transactionsSlug: 'transactions',
    })

    expect(finalizeOrder).toHaveBeenCalledWith({
      orderData: expect.objectContaining({
        customerEmail: 'guest@example.com',
      }),
      transactionID: 'transaction-123',
    })
    expect(finalizeOrder.mock.calls[0]?.[0].orderData).not.toHaveProperty('customer')
  })

  it('should throw error if orderID is missing', async () => {
    const handler = confirmOrder({})

    await expect(
      handler({
        data: {
          customerEmail: 'test@example.com',
        },
        req: mockReq,
        ordersSlug: 'orders',
        cartsSlug: 'carts',
        transactionsSlug: 'transactions',
      }),
    ).rejects.toThrow('COD Order ID is required')
  })

  it('should throw error if transaction not found', async () => {
    const handler = confirmOrder({})
    mockPayload.find.mockResolvedValue({
      docs: [],
      totalDocs: 0,
    })

    await expect(
      handler({
        data: {
          customerEmail: 'test@example.com',
          orderID: 'COD-INVALID',
        },
        req: mockReq,
        ordersSlug: 'orders',
        cartsSlug: 'carts',
        transactionsSlug: 'transactions',
      }),
    ).rejects.toThrow('No transaction found for the provided COD Order ID')
  })
  describe('with a finalizeOrder that follows the ecommerce plugin', () => {
    // Mirrors finalizeTransactionOrder / waitForCanonicalOrder in
    // @payloadcms/plugin-ecommerce: the claim needs an unlinked pending transaction, success
    // sets `succeeded`, and a linked transaction counts as finished only when `succeeded`.
    type Row = { order?: string; status: string }
    let row: Row
    let ordersCreated: number

    const coreFinalizeOrder = vi.fn(async () => {
      if (row.status === 'pending' && !row.order) {
        ordersCreated += 1
        row.order = `order-${ordersCreated}`
        row.status = 'succeeded'
        return { id: row.order }
      }
      if (row.status === 'succeeded' && row.order) return { id: row.order }
      throw new Error('Transaction settlement did not complete in time.')
    })

    const confirm = () =>
      confirmOrder({})({
        data: { customerEmail: 'test@example.com', orderID: 'COD-123456' },
        finalizeOrder: coreFinalizeOrder,
        req: mockReq,
        ordersSlug: 'orders',
        cartsSlug: 'carts',
        transactionsSlug: 'transactions',
      } as any)

    beforeEach(() => {
      row = { status: 'pending' }
      ordersCreated = 0
      coreFinalizeOrder.mockClear()
      mockPayload.find.mockImplementation(async () => ({
        docs: [{ ...mockTransaction, ...row }],
        totalDocs: 1,
      }))
      mockPayload.update.mockImplementation(async ({ data }: { data: Partial<Row> }) => {
        if (data.status) row.status = data.status
        return {}
      })
      mockPayload.db.updateOne.mockImplementation(async ({ data }: { data: Partial<Row> }) => {
        if (data.status) row.status = data.status
        return {}
      })
    })

    it('leaves a new COD transaction pending with its order linked', async () => {
      const result = await confirm()

      expect(result.orderID).toBe('order-1')
      expect(row).toEqual({ order: 'order-1', status: 'pending' })
      expect(coreFinalizeOrder).toHaveBeenCalledTimes(1)
    })

    it('confirms a repeated checkout through finalizeOrder without a second order', async () => {
      await confirm()
      mockPayload.update.mockClear()

      const again = await confirm()

      expect(again.orderID).toBe('order-1')
      expect(ordersCreated).toBe(1)
      expect(coreFinalizeOrder).toHaveBeenCalledTimes(2)
      expect(row).toEqual({ order: 'order-1', status: 'pending' })
      // Raw writes only: no hooks, so no payment timeline entries for the repeat.
      expect(mockPayload.update).not.toHaveBeenCalled()
      expect(mockPayload.db.updateOne.mock.calls.map((call) => call[0].data.status)).toEqual([
        'succeeded',
        'pending',
      ])
    })

    it('leaves an older succeeded transaction untouched on a repeat', async () => {
      row = { order: 'order-7', status: 'succeeded' }

      const result = await confirm()

      expect(result.orderID).toBe('order-7')
      expect(row).toEqual({ order: 'order-7', status: 'succeeded' })
      expect(mockPayload.update).not.toHaveBeenCalled()
      expect(mockPayload.db.updateOne).not.toHaveBeenCalled()
    })

    it('restores pending when finalizeOrder fails on a repeat', async () => {
      row = { order: 'order-1', status: 'pending' }
      coreFinalizeOrder.mockImplementationOnce(async () => {
        throw new Error('Order settlement did not complete successfully.')
      })

      await expect(confirm()).rejects.toThrow('Order settlement did not complete successfully.')
      expect(row.status).toBe('pending')
    })

    it('rethrows a finalize error on a first confirmation without writing', async () => {
      coreFinalizeOrder.mockImplementationOnce(async () => {
        throw new Error('Inventory item could not be updated.')
      })

      await expect(confirm()).rejects.toThrow('Inventory item could not be updated.')
      expect(mockPayload.update).not.toHaveBeenCalled()
      expect(mockPayload.db.updateOne).not.toHaveBeenCalled()
    })

    it('fails when finalizeOrder returns no order id', async () => {
      coreFinalizeOrder.mockImplementationOnce(async () => ({}) as never)

      await expect(confirm()).rejects.toThrow('COD order settlement did not return an order')
    })
  })
})
