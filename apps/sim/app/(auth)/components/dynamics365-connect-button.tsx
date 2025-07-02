'use client'

import { useState } from 'react'
import { Dynamics365Icon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useNotificationStore } from '@/stores/notifications/store'

interface Dynamics365ConnectButtonProps {
  dynamics365Available: boolean
  missingCredentials?: {
    required: string[]
    optional: string[]
  } | null
}

export function Dynamics365ConnectButton({
  dynamics365Available,
  missingCredentials,
}: Dynamics365ConnectButtonProps) {
  const [isLoading, setIsLoading] = useState(false)
  const { addNotification } = useNotificationStore()

  async function connectToDynamics365() {
    // Initial validation
    if (!dynamics365Available) {
      addNotification(
        'error',
        'Dynamics 365 credentials not configured',
        'Please configure the required environment variables.'
      )
      return
    }

    const providerId = 'dynamics365'
    const callbackUrl = `${window.location.origin}/api/auth/oauth2/callback/dynamics365`

    // Validate required parameters
    if (!providerId || !callbackUrl) {
      addNotification(
        'error',
        'Configuration error',
        'Missing required OAuth configuration parameters'
      )
      return
    }

    setIsLoading(true)
    try {
      // Prepare request body
      const requestBody = {
        providerId,
        callbackUrl, // Changed from redirect_uri to redirectUri
      }

      console.log('Initiating Dynamics 365 OAuth flow', {
        providerId,
        callbackURL: callbackUrl
      })

      // Make the request to start OAuth flow
      const response = await fetch('/api/auth/oauth2/link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) {
        const data = await response.json()
        console.error('OAuth error response:', data)
        throw new Error(data.error || `Failed to start OAuth flow: ${response.status}`)
      }

      const { url } = await response.json()
      
      console.log('Redirecting to Microsoft login', {
        hasUrl: !!url
      })

      if (!url) {
        throw new Error('No authorization URL received from server')
      }

      // Redirect to Microsoft login
      window.location.href = url
    } catch (err: any) {
      console.error('Connection error:', err)
      let errorMessage = 'Failed to connect to Dynamics 365'

      if (err.message?.includes('configuration')) {
        errorMessage = 'Dynamics 365 is not properly configured. Please check your environment variables.'
      } else if (err.message?.includes('network')) {
        errorMessage = 'Network error. Please check your connection and try again.'
      } else if (err.message?.includes('authorization URL')) {
        errorMessage = 'Failed to get authorization URL from server.'
      }

      addNotification('error', errorMessage, err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const connectButton = (
    <Button
      variant="outline"
      className="w-full"
      disabled={!dynamics365Available || isLoading}
      onClick={connectToDynamics365}
    >
      <Dynamics365Icon className="mr-2 h-4 w-4" />
      {isLoading ? 'Connecting...' : 'Connect Dynamics 365'}
    </Button>
  )

  if (dynamics365Available) return connectButton

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div>{connectButton}</div>
        </TooltipTrigger>
        <TooltipContent>
          <p>
            Dynamics 365 integration requires OAuth credentials to be configured. Add the following
            environment variables:
          </p>
          {missingCredentials && (
            <>
              <div className="mt-2 text-xs space-y-1">
                <p className="font-semibold">Required:</p>
                {missingCredentials.required.map((cred) => (
                  <div key={cred}>• {cred}</div>
                ))}
              </div>
              {missingCredentials.optional.length > 0 && (
                <div className="mt-2 text-xs space-y-1">
                  <p className="font-semibold">Optional:</p>
                  {missingCredentials.optional.map((cred) => (
                    <div key={cred}>• {cred}</div>
                  ))}
                </div>
              )}
            </>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}