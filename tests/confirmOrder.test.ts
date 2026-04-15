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
    const handler = confirmOrder({})
    const result = await handler({
      data: {
        customerEmail: 'test@example.com',
        orderID: 'COD-123456',
      },
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
      where: {
        'cod.orderID': {
          equals: 'COD-123456',
        },
      },
    })

    expect(mockPayload.create).toHaveBeenCalledWith({
      collection: 'orders',
      data: expect.objectContaining({
        amount: 5000,
        currency: 'USD',
        status: 'processing',
      }),
    })

    expect(mockPayload.update).toHaveBeenCalledTimes(2)

    const transactionUpdate = mockPayload.update.mock.calls.find(
      (call) => (call[0] as { collection?: string }).collection === 'transactions',
    )
    expect(transactionUpdate).toBeDefined()
    expect((transactionUpdate![0] as { data?: Record<string, unknown> }).data).toEqual(
      expect.objectContaining({
        order: 'order-123',
        cod: expect.objectContaining({ validationStatus: 'validated' }),
      }),
    )
    expect((transactionUpdate![0] as { data?: Record<string, unknown> }).data).not.toHaveProperty(
      'status',
    )
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
