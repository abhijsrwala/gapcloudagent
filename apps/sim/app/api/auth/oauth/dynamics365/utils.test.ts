import { describe, expect, it, vi, beforeEach } from 'vitest'
import { getDynamics365Token, validateDynamics365Response } from './utils'
import { db } from '@/db'
import { refreshOAuthToken } from '@/lib/oauth'

// Mock dependencies
vi.mock('@/db')
vi.mock('@/lib/oauth')
vi.mock('@/lib/logs/console-logger', () => ({
  createLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
  }),
}))

describe('Dynamics 365 Utils', () => {
  const mockUserId = 'test-user-id'
  const mockAccessToken = 'test-access-token'
  const mockRefreshToken = 'test-refresh-token'

  beforeEach(() => {
    vi.resetAllMocks()
  })

  describe('getDynamics365Token', () => {
    it('should return null if no credentials found', async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as any)

      const result = await getDynamics365Token(mockUserId)
      expect(result).toBeNull()
    })

    it('should return valid token if not expired', async () => {
      const futureDate = new Date()
      futureDate.setHours(futureDate.getHours() + 1)

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                accessToken: mockAccessToken,
                refreshToken: mockRefreshToken,
                accessTokenExpiresAt: futureDate,
              },
            ]),
          }),
        }),
      } as any)

      const result = await getDynamics365Token(mockUserId)
      expect(result).toBe(mockAccessToken)
    })

    it('should refresh token if expired', async () => {
      const pastDate = new Date()
      pastDate.setHours(pastDate.getHours() - 1)

      const newAccessToken = 'new-access-token'
      const newRefreshToken = 'new-refresh-token'

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: 'credential-id',
                accessToken: mockAccessToken,
                refreshToken: mockRefreshToken,
                accessTokenExpiresAt: pastDate,
              },
            ]),
          }),
        }),
      } as any)

      vi.mocked(refreshOAuthToken).mockResolvedValue({
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        expiresIn: 3600,
      })

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ id: 'credential-id' }]),
        }),
      } as any)

      const result = await getDynamics365Token(mockUserId)
      expect(result).toBe(newAccessToken)
      expect(refreshOAuthToken).toHaveBeenCalledWith('dynamics365', mockRefreshToken)
      expect(db.update).toHaveBeenCalled()
    })

    it('should return null if refresh fails', async () => {
      const pastDate = new Date()
      pastDate.setHours(pastDate.getHours() - 1)

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                accessToken: mockAccessToken,
                refreshToken: mockRefreshToken,
                accessTokenExpiresAt: pastDate,
              },
            ]),
          }),
        }),
      } as any)

      vi.mocked(refreshOAuthToken).mockResolvedValue(null)

      const result = await getDynamics365Token(mockUserId)
      expect(result).toBeNull()
    })
  })

  describe('validateDynamics365Response', () => {
    it('should return JSON data for successful response', async () => {
      const mockData = { value: 'test' }
      const response = {
        ok: true,
        json: () => Promise.resolve(mockData),
      } as Response

      const result = await validateDynamics365Response(response)
      expect(result).toEqual(mockData)
    })

    it('should throw error with message for error response', async () => {
      const mockError = { error: { message: 'API Error' } }
      const response = {
        ok: false,
        text: () => Promise.resolve(JSON.stringify(mockError)),
      } as Response

      await expect(validateDynamics365Response(response)).rejects.toThrow('API Error')
    })

    it('should handle non-JSON error responses', async () => {
      const errorText = 'Plain text error'
      const response = {
        ok: false,
        text: () => Promise.resolve(errorText),
      } as Response

      await expect(validateDynamics365Response(response)).rejects.toThrow('Unknown Dynamics 365 API error')
    })
  })
}) 