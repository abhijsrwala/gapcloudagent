import { createLogger } from '@/lib/logs/console-logger'
import { refreshOAuthToken } from '@/lib/oauth'
import { db } from '@/db'
import { account } from '@/db/schema'
import { and, eq } from 'drizzle-orm'
import { Dynamics365Error, parseDynamics365Error, formatErrorDetails } from './errors'

const logger = createLogger('Dynamics365Utils')

interface TokenInfo {
  accessToken: string
  refreshToken?: string
  expiresAt?: Date
}

/**
 * Get and validate Dynamics 365 token, refreshing if necessary
 */
export async function getDynamics365Token(userId: string): Promise<string | null> {
  try {
    // Get the current token from the database
    const credentials = await db
      .select({
        id: account.id,
        accessToken: account.accessToken,
        refreshToken: account.refreshToken,
        accessTokenExpiresAt: account.accessTokenExpiresAt,
      })
      .from(account)
      .where(
        and(
          eq(account.userId, userId),
          eq(account.providerId, 'dynamics365')
        )
      )
      .limit(1)

    if (!credentials.length || !credentials[0].accessToken) {
      logger.warn('No Dynamics 365 credentials found for user', { 
        userId,
        context: 'token_retrieval',
        credentialsFound: credentials.length > 0,
        hasAccessToken: Boolean(credentials[0]?.accessToken)
      })
      return null
    }

    const credential = credentials[0]
    const now = new Date()

    // Check if token is expired or will expire in the next 5 minutes
    const isExpired = credential.accessTokenExpiresAt && 
      (credential.accessTokenExpiresAt <= new Date(now.getTime() + 5 * 60 * 1000))

    // Log token status
    logger.info('Token status check', {
      userId,
      context: 'token_validation',
      isExpired,
      expiresAt: credential.accessTokenExpiresAt,
      hasRefreshToken: Boolean(credential.refreshToken)
    })

    // If token is still valid, return it
    if (!isExpired) {
      return credential.accessToken
    }

    // If no refresh token, can't refresh
    if (!credential.refreshToken) {
      logger.error('No refresh token available for expired token', { 
        userId,
        context: 'token_refresh',
        credentialId: credential.id,
        expiresAt: credential.accessTokenExpiresAt
      })
      return null
    }

    // Attempt to refresh the token
    const refreshResult = await refreshOAuthToken('dynamics365', credential.refreshToken)
    if (!refreshResult) {
      logger.error('Failed to refresh Dynamics 365 token', { 
        userId,
        context: 'token_refresh',
        credentialId: credential.id,
        refreshAttemptTime: new Date().toISOString()
      })
      return null
    }

    // Update the database with new tokens
    try {
      await db.update(account)
        .set({
          accessToken: refreshResult.accessToken,
          accessTokenExpiresAt: new Date(Date.now() + refreshResult.expiresIn * 1000),
          refreshToken: refreshResult.refreshToken || credential.refreshToken,
          updatedAt: new Date(),
        })
        .where(eq(account.id, credential.id))

      logger.info('Successfully refreshed and updated token', {
        userId,
        context: 'token_refresh',
        credentialId: credential.id,
        newExpiresAt: new Date(Date.now() + refreshResult.expiresIn * 1000),
        refreshedAt: new Date().toISOString()
      })
    } catch (dbError) {
      logger.error('Failed to update token in database', {
        userId,
        context: 'token_refresh',
        credentialId: credential.id,
        error: formatErrorDetails(dbError)
      })
      return null
    }

    return refreshResult.accessToken
  } catch (error) {
    logger.error('Error managing Dynamics 365 token:', {
      userId,
      context: 'token_management',
      error: formatErrorDetails(error)
    })
    return null
  }
}

/**
 * Validate Dynamics 365 API response
 */
export async function validateDynamics365Response(response: Response): Promise<any> {
  if (!response.ok) {
    const errorText = await response.text()
    const error = parseDynamics365Error(response, errorText)
    
    logger.error('Dynamics 365 API error', {
      context: 'api_response',
      ...formatErrorDetails(error)
    })
    
    throw error
  }
  return response.json()
}

/**
 * Format request details for logging
 */
export function formatRequestDetails(endpoint: string, method: string, data?: any): Record<string, any> {
  return {
    endpoint,
    method,
    hasData: Boolean(data),
    dataKeys: data ? Object.keys(data) : undefined,
    timestamp: new Date().toISOString()
  }
} 