import { NextRequest, NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { jwtDecode } from 'jwt-decode'
import { getSession } from '@/lib/auth'
import { createLogger } from '@/lib/logs/console-logger'
import { parseProvider } from '@/lib/oauth'
import { OAuthService } from '@/lib/oauth'
import { db } from '@/db'
import { account, user } from '@/db/schema'

const logger = createLogger('OAuthCredentialsAPI')

interface GoogleIdToken {
  email?: string
  sub?: string
  name?: string
}

interface MicrosoftIdToken {
  email?: string
  name?: string
  preferred_username?: string
  upn?: string
  tid?: string
}

/**
 * Get credentials for a specific provider
 */
export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8)

  try {
    // Get the session
    const session = await getSession()

    // Check if the user is authenticated
    if (!session?.user?.id) {
      logger.warn(`[${requestId}] Unauthenticated credentials request rejected`)
      return NextResponse.json({ error: 'User not authenticated' }, { status: 401 })
    }

    // Get the provider from the query params
    const { searchParams } = new URL(request.url)
    const provider = searchParams.get('provider') as OAuthService | null

    if (!provider) {
      logger.warn(`[${requestId}] Missing provider parameter`)
      return NextResponse.json({ error: 'Provider is required' }, { status: 400 })
    }

    // Parse the provider to get base provider and feature type
    const { baseProvider } = parseProvider(provider)

    // Get all accounts for this user and provider
    const accounts = await db
      .select()
      .from(account)
      .where(and(eq(account.userId, session.user.id), eq(account.providerId, provider)))

    // Transform accounts into credentials
    const credentials = await Promise.all(
      accounts.map(async (acc) => {
        // Extract the feature type from providerId (e.g., 'google-default' -> 'default')
        const [_, featureType = 'default'] = acc.providerId.split('-')

        // Try multiple methods to get a user-friendly display name
        let displayName = ''

        // Method 1: Try to extract information from tokens based on provider
        if (acc.accessToken || acc.idToken) {
          try {
            if (baseProvider === 'dynamics365') {
              // Try to get user info from Microsoft token
              const token = acc.idToken || acc.accessToken
              if (!token) {
                logger.warn(`[${requestId}] No token available for Dynamics 365 account`, {
                  accountId: acc.id,
                })
                displayName = 'Dynamics 365 User (No Token)'
              } else {
                const decoded = jwtDecode<MicrosoftIdToken>(token)
                
                // Use the most specific identifier available
                displayName = decoded.name || 
                            decoded.email || 
                            decoded.preferred_username ||
                            decoded.upn ||
                            `Dynamics 365 User (${decoded.tid || 'Unknown Org'})`

                // If we couldn't get a display name from the token, try to get user info from Microsoft Graph
                if (!displayName && acc.accessToken) {
                  try {
                    const graphResponse = await fetch('https://org589a2042.crm8.dynamics.com/api/data/v9.0/WhoAmI', {
                      headers: {
                        'Authorization': `Bearer ${acc.accessToken}`,
                        'Accept': 'application/json',
                      },
                    })

                    if (graphResponse.ok) {
                      const userData = await graphResponse.json()
                      displayName = userData.displayName || 
                                  userData.userPrincipalName ||
                                  userData.mail ||
                                  'Dynamics 365 User'
                    }
                  } catch (graphError) {
                    logger.warn(`[${requestId}] Error fetching Microsoft Graph user info`, {
                      accountId: acc.id,
                      error: graphError,
                    })
                  }
                }
              }
            } else if (acc.idToken) {
              // Handle other providers with ID tokens
              try {
                const decoded = jwtDecode<GoogleIdToken>(acc.idToken)
                displayName = decoded.email || decoded.name || ''
              } catch (error) {
                logger.warn(`[${requestId}] Error decoding token for non-Dynamics provider`, {
                  accountId: acc.id,
                  provider: baseProvider,
                  error,
                })
              }
            }
          } catch (error) {
            logger.warn(`[${requestId}] Error decoding token`, {
              accountId: acc.id,
              provider: baseProvider,
            })
          }
        }

        // Method 2: For GitHub, the accountId might be the username
        if (!displayName && baseProvider === 'github') {
          displayName = `${acc.accountId} (GitHub)`
        }

        // Method 3: Try to get the user's email from our database
        if (!displayName) {
          try {
            const userRecord = await db
              .select({ email: user.email })
              .from(user)
              .where(eq(user.id, acc.userId))
              .limit(1)

            if (userRecord.length > 0) {
              displayName = userRecord[0].email
            }
          } catch (error) {
            logger.warn(`[${requestId}] Error fetching user email`, {
              userId: acc.userId,
            })
          }
        }

        // Fallback: Use accountId with provider type as context
        if (!displayName) {
          displayName = `${acc.accountId} (${baseProvider})`
        }

        return {
          id: acc.id,
          name: displayName,
          provider,
          lastUsed: acc.updatedAt.toISOString(),
          isDefault: featureType === 'default',
        }
      })
    )

    return NextResponse.json({ credentials }, { status: 200 })
  } catch (error) {
    logger.error(`[${requestId}] Error fetching OAuth credentials`, error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
