import { stripeClient } from '@better-auth/stripe/client'
import { emailOTPClient, genericOAuthClient } from 'better-auth/client/plugins'
import { organizationClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'
import { isProd, isDev } from '@/lib/environment'
import { createLogger } from '@/lib/logs/console-logger'

const logger = createLogger('auth-client')

export function getBaseURL() {
  let baseURL

  if (process.env.VERCEL_ENV === 'preview') {
    baseURL = `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
  } else if (process.env.VERCEL_ENV === 'development') {
    baseURL = `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
  } else if (process.env.VERCEL_ENV === 'production') {
    baseURL = process.env.BETTER_AUTH_URL
  } else if (process.env.NODE_ENV === 'development') {
    baseURL = process.env.BETTER_AUTH_URL
  }

  return baseURL
}

logger.info('Initializing BetterAuth client', {
  baseURL: getBaseURL(),
  isProd,
  isDev,
})

export const client = createAuthClient({
  baseURL: getBaseURL(),
  plugins: [
    emailOTPClient(),
    genericOAuthClient(),
    // Only include Stripe client in production
    ...(isProd
      ? [
          stripeClient({
            subscription: true, // Enable subscription management
          }),
        ]
      : []),
    organizationClient(),
  ],
})

logger.debug("Client initialized", {client })

export const { useSession, useActiveOrganization } = client

export const useSubscription = () => {
  // In development, provide mock implementations
  if (!isProd) {
    return {
      list: async () => ({ data: [] }),
      upgrade: async () => ({
        error: { message: 'Subscriptions are disabled in development mode' },
      }),
      cancel: async () => ({ data: null }),
      restore: async () => ({ data: null }),
    }
  }

  // In production, use the real implementation
  return {
    list: client.subscription?.list,
    upgrade: client.subscription?.upgrade,
    cancel: client.subscription?.cancel,
    restore: client.subscription?.restore,
  }
}

export const { signIn, signUp, signOut } = client
