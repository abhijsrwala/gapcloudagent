import { NextRequest } from 'next/server'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { GET, POST } from './route'
import * as auth from '@/lib/auth'
import * as utils from './utils'

// Mock the auth and utils modules
vi.mock('@/lib/auth')
vi.mock('./utils')
vi.mock('@/lib/logs/console-logger', () => ({
  createLogger: () => ({
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
}))

describe('Dynamics 365 API Routes', () => {
  const mockSession = {
    user: { id: 'test-user-id' },
  }

  const mockAccessToken = 'test-access-token'

  beforeEach(() => {
    // Reset all mocks before each test
    vi.resetAllMocks()

    // Setup default mock implementations
    vi.mocked(auth.getSession).mockResolvedValue(mockSession as any)
    vi.mocked(utils.getDynamics365Token).mockResolvedValue(mockAccessToken)
    vi.mocked(utils.validateDynamics365Response).mockImplementation((response) => response.json())

    // Mock fetch globally
    global.fetch = vi.fn()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('GET handler', () => {
    it('should return 401 if no session', async () => {
      vi.mocked(auth.getSession).mockResolvedValueOnce(null)

      const request = new NextRequest(
        new URL('http://localhost/api/auth/oauth/dynamics365?endpoint=/accounts')
      )
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Unauthorized')
    })

    it('should return 401 if no valid token', async () => {
      vi.mocked(utils.getDynamics365Token).mockResolvedValueOnce(null)

      const request = new NextRequest(
        new URL('http://localhost/api/auth/oauth/dynamics365?endpoint=/accounts')
      )
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('No valid Dynamics 365 credentials found')
    })

    it('should return 400 if no endpoint provided', async () => {
      const request = new NextRequest(new URL('http://localhost/api/auth/oauth/dynamics365'))
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Endpoint is required')
    })

    it('should successfully forward GET request to Dynamics 365', async () => {
      const mockResponse = { value: [{ id: 1, name: 'Test Account' }] }
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      } as Response)

      const request = new NextRequest(
        new URL('http://localhost/api/auth/oauth/dynamics365?endpoint=/accounts')
      )
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toEqual(mockResponse)
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/accounts'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${mockAccessToken}`,
            'OData-MaxVersion': '4.0',
            'OData-Version': '4.0',
          }),
        })
      )
    })
  })

  describe('POST handler', () => {
    it('should return 401 if no session', async () => {
      vi.mocked(auth.getSession).mockResolvedValueOnce(null)

      const request = new NextRequest('http://localhost/api/auth/oauth/dynamics365', {
        method: 'POST',
        body: JSON.stringify({ endpoint: '/accounts' }),
      })
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Unauthorized')
    })

    it('should return 400 if no endpoint provided', async () => {
      const request = new NextRequest('http://localhost/api/auth/oauth/dynamics365', {
        method: 'POST',
        body: JSON.stringify({}),
      })
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Endpoint is required')
    })

    it('should successfully forward POST request to Dynamics 365', async () => {
      const mockRequestBody = {
        endpoint: '/accounts',
        method: 'POST',
        data: { name: 'New Account' },
      }
      const mockResponse = { id: 'new-account-id', name: 'New Account' }
      
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      } as Response)

      const request = new NextRequest('http://localhost/api/auth/oauth/dynamics365', {
        method: 'POST',
        body: JSON.stringify(mockRequestBody),
      })
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toEqual(mockResponse)
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/accounts'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: `Bearer ${mockAccessToken}`,
            'Content-Type': 'application/json',
            'OData-MaxVersion': '4.0',
            'OData-Version': '4.0',
          }),
          body: JSON.stringify(mockRequestBody.data),
        })
      )
    })

    it('should handle API errors correctly', async () => {
      const mockError = { error: { message: 'API Error' } }
      vi.mocked(utils.validateDynamics365Response).mockRejectedValueOnce(
        new Error(mockError.error.message)
      )

      const request = new NextRequest('http://localhost/api/auth/oauth/dynamics365', {
        method: 'POST',
        body: JSON.stringify({ endpoint: '/accounts', method: 'GET' }),
      })
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('API Error')
    })
  })
}) 