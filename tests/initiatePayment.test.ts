import { describe, it, expect, vi, beforeEach } from 'vitest'
import { initiatePayment } from '../src/initiatePayment'

const mockPayload = {
  create: vi.fn(),
  logger: {
    error: vi.fn(),
  },
}

const mockReq = {
  payload: mockPayload,
  user: { id: 'user-123' },
} as any

const baseData = {
  customerEmail: 'test@example.com',
  currency: 'USD',
  cart: {
    id: 'cart-123',
    subtotal: 5000,
    items: [
      {
        id: 'item-1',
        product: 'product-123',
        quantity: 2,
      },
    ],
  },
  billingAddress: {
    street: '123 Main St',
    city: 'Test City',
    country: 'US',
  },
  shippingAddress: {
    street: '123 Main St',
    city: 'Test City',
    country: 'US',
  },
}

describe('initiatePayment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPayload.create.mockResolvedValue({
      id: 'transaction-123',
      amount: 5000,
      currency: 'USD',
    })
  })

  it('should successfully initiate a COD payment', async () => {
    const handler = initiatePayment({})
    const result = await handler({
      data: baseData,
      req: mockReq,
      transactionsSlug: 'transactions',
    })

    expect(result).toHaveProperty('message', 'COD order initiated successfully')
    expect(result).toHaveProperty('orderID')
    expect(result.orderID).toMatch(/^COD-/)
    expect(mockPayload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'transactions',
        data: expect.objectContaining({
          paymentMethod: 'cod',
          status: 'pending',
          currency: 'USD',
          amount: 5000,
        }),
      }),
    )
  })

  it('should not copy cart line item ids into transaction items', async () => {
    const handler = initiatePayment({})
    await handler({
      data: baseData,
      req: mockReq,
      transactionsSlug: 'transactions',
    })

    const createCall = mockPayload.create.mock.calls[0]?.[0] as {
      data?: { items?: Array<Record<string, unknown>> }
    }
    expect(createCall?.data?.items).toEqual([{ product: 'product-123', quantity: 2 }])
    for (const item of createCall?.data?.items ?? []) {
      expect(item).not.toHaveProperty('id')
    }
  })

  it('should throw error if currency is missing', async () => {
    const handler = initiatePayment({})
    const dataWithoutCurrency = { ...baseData, currency: '' }

    await expect(
      handler({
        data: dataWithoutCurrency,
        req: mockReq,
        transactionsSlug: 'transactions',
      }),
    ).rejects.toThrow('Currency is required.')
  })

  it('should throw error if cart is empty', async () => {
    const handler = initiatePayment({})
    const dataWithEmptyCart = { ...baseData, cart: { ...baseData.cart, items: [] } }

    await expect(
      handler({
        data: dataWithEmptyCart,
        req: mockReq,
        transactionsSlug: 'transactions',
      }),
    ).rejects.toThrow('Cart is empty or not provided.')
  })

  it('should throw error if customer email is invalid', async () => {
    const handler = initiatePayment({})
    const dataWithInvalidEmail = { ...baseData, customerEmail: '' }

    await expect(
      handler({
        data: dataWithInvalidEmail,
        req: mockReq,
        transactionsSlug: 'transactions',
      }),
    ).rejects.toThrow('A valid customer email is required to make a purchase.')
  })

  it('should throw error if amount is invalid', async () => {
    const handler = initiatePayment({})
    const dataWithInvalidAmount = { ...baseData, cart: { ...baseData.cart, subtotal: 0 } }

    await expect(
      handler({
        data: dataWithInvalidAmount,
        req: mockReq,
        transactionsSlug: 'transactions',
      }),
    ).rejects.toThrow('A valid amount is required to initiate a payment.')
  })

  it('should reject unsupported currencies', async () => {
    const handler = initiatePayment({ supportedCurrencies: ['USD', 'INR'] })
    const dataWithUnsupportedCurrency = { ...baseData, currency: 'EUR' }

    await expect(
      handler({
        data: dataWithUnsupportedCurrency,
        req: mockReq,
        transactionsSlug: 'transactions',
      }),
    ).rejects.toThrow('COD is not available for EUR')
  })

  it('should enforce minimum order amount', async () => {
    const handler = initiatePayment({ minimumOrder: 10000 })

    await expect(
      handler({
        data: baseData,
        req: mockReq,
        transactionsSlug: 'transactions',
      }),
    ).rejects.toThrow('Order amount must be at least')
  })

  it('should enforce maximum order amount', async () => {
    const handler = initiatePayment({ maximumOrder: 1000 })

    await expect(
      handler({
        data: baseData,
        req: mockReq,
        transactionsSlug: 'transactions',
      }),
    ).rejects.toThrow('Order amount must not exceed')
  })

  it('should reject orders from disallowed regions', async () => {
    const handler = initiatePayment({ allowedRegions: ['IN', 'CA'] })

    await expect(
      handler({
        data: baseData,
        req: mockReq,
        transactionsSlug: 'transactions',
      }),
    ).rejects.toThrow('COD is not available in US')
  })

  it('should calculate percentage service charge', async () => {
    const handler = initiatePayment({ serviceChargePercentage: 10 })
    const result = await handler({
      data: baseData,
      req: mockReq,
      transactionsSlug: 'transactions',
    })

    expect(result).toHaveProperty('serviceCharge', 500)
    expect(mockPayload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amount: 5500,
        }),
      }),
    )
  })

  it('should calculate fixed service charge', async () => {
    const handler = initiatePayment({ fixedServiceCharge: 100 })
    const result = await handler({
      data: baseData,
      req: mockReq,
      transactionsSlug: 'transactions',
    })

    expect(result).toHaveProperty('serviceCharge', 100)
    expect(mockPayload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amount: 5100,
        }),
      }),
    )
  })

  it('should calculate combined service charges', async () => {
    const handler = initiatePayment({
      serviceChargePercentage: 2,
      fixedServiceCharge: 50,
    })
    const result = await handler({
      data: baseData,
      req: mockReq,
      transactionsSlug: 'transactions',
    })

    expect(result).toHaveProperty('serviceCharge', 150)
    expect(mockPayload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amount: 5150,
        }),
      }),
    )
  })
})
