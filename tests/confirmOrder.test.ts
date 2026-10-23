import { describe, it, expect, vi, beforeEach } from 'vitest'
import { confirmOrder } from '../src/confirmOrder'

const mockPayload = {
  find: vi.fn(),
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
    expect((transactionUpdate![0] as { data?: Record<string, unknown> }).data).not.toHaveProperty(
      'status',
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
})
