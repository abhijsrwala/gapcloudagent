'use server'

import { isProd } from '@/lib/environment'

export async function getOAuthProviderStatus() {
  const githubAvailable = !!(
    process.env.GITHUB_CLIENT_ID &&
    process.env.GITHUB_CLIENT_SECRET &&
    process.env.GITHUB_CLIENT_ID !== 'placeholder' &&
    process.env.GITHUB_CLIENT_SECRET !== 'placeholder'
  )

  const googleAvailable = !!(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_CLIENT_ID !== 'placeholder' &&
    process.env.GOOGLE_CLIENT_SECRET !== 'placeholder'
  )

  const dynamics365Available = !!(
    process.env.DYNAMICS_CLIENT_ID &&
    process.env.DYNAMICS_CLIENT_SECRET &&
    process.env.DYNAMICS_CLIENT_ID !== 'placeholder' &&
    process.env.DYNAMICS_CLIENT_SECRET !== 'placeholder'
  )

  return { 
    githubAvailable, 
    googleAvailable, 
    dynamics365Available,
    isProduction: isProd,
    missingCredentials: {
      dynamics365: !dynamics365Available ? {
        required: ['DYNAMICS_CLIENT_ID', 'DYNAMICS_CLIENT_SECRET'],
        optional: ['DYNAMICS_TENANT_ID']
      } : null
    }
  }
}
