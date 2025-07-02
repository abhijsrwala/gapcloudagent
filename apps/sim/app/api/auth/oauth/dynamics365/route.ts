import { NextRequest, NextResponse } from 'next/server'
import { createLogger } from '@/lib/logs/console-logger'
import { getSession } from '@/lib/auth'
import { getDynamics365Token, validateDynamics365Response, formatRequestDetails } from './utils'
import { Dynamics365Error, formatErrorDetails } from './errors'

const logger = createLogger('Dynamics365API')

/**
 * Handler for Dynamics 365 API requests
 * This route handles authentication and forwards requests to Dynamics 365
 */
export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID()
  
  try {
    logger.info('Processing POST request', {
      requestId,
      context: 'request_start',
      url: request.url
    })

    const session = await getSession()
    if (!session?.user?.id) {
      logger.warn('Unauthorized request', {
        requestId,
        context: 'authentication',
        hasSession: Boolean(session),
        hasUser: Boolean(session?.user)
      })
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get the access token for Dynamics 365 with automatic refresh
    const accessToken = await getDynamics365Token(session.user.id)
    if (!accessToken) {
      logger.error('Failed to get valid token', {
        requestId,
        context: 'authentication',
        userId: session.user.id
      })
      return NextResponse.json({ error: 'No valid Dynamics 365 credentials found' }, { status: 401 })
    }

    // Parse the request body
    const body = await request.json()
    const { endpoint, method = 'GET', data } = body

    if (!endpoint) {
      logger.warn('Missing endpoint in request', {
        requestId,
        context: 'request_validation',
        body: formatRequestDetails('', method, data)
      })
      return NextResponse.json({ error: 'Endpoint is required' }, { status: 400 })
    }

    logger.info('Making Dynamics 365 API request', {
      requestId,
      context: 'api_request',
      ...formatRequestDetails(endpoint, method, data)
    })

    // Construct the Dynamics 365 API URL
    const baseUrl = process.env.DYNAMICS_API_URL || 'https://org.api.crm.dynamics.com/api/data/v9.2'
    const url = `${baseUrl}${endpoint}`

    // Make the request to Dynamics 365
    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        'Prefer': 'odata.include-annotations="*"',
      },
      ...(data && { body: JSON.stringify(data) }),
    })

    const responseData = await validateDynamics365Response(response)
    
    logger.info('Successfully processed request', {
      requestId,
      context: 'request_complete',
      statusCode: response.status,
      endpoint,
      method
    })

    return NextResponse.json(responseData)
  } catch (error) {
    logger.error('Error in Dynamics 365 route:', {
      requestId,
      context: 'request_error',
      error: formatErrorDetails(error)
    })

    if (error instanceof Dynamics365Error) {
      return NextResponse.json(
        { 
          error: error.message,
          code: error.code,
          details: error.details
        }, 
        { status: error.statusCode || 500 }
      )
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * GET handler for Dynamics 365 API requests
 * Supports simple GET requests with query parameters
 */
export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID()

  try {
    logger.info('Processing GET request', {
      requestId,
      context: 'request_start',
      url: request.url
    })

    const session = await getSession()
    if (!session?.user?.id) {
      logger.warn('Unauthorized request', {
        requestId,
        context: 'authentication',
        hasSession: Boolean(session),
        hasUser: Boolean(session?.user)
      })
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get the access token for Dynamics 365 with automatic refresh
    const accessToken = await getDynamics365Token(session.user.id)
    if (!accessToken) {
      logger.error('Failed to get valid token', {
        requestId,
        context: 'authentication',
        userId: session.user.id
      })
      return NextResponse.json({ error: 'No valid Dynamics 365 credentials found' }, { status: 401 })
    }

    // Get the endpoint from query parameters
    const { searchParams } = new URL(request.url)
    const endpoint = searchParams.get('endpoint')

    if (!endpoint) {
      logger.warn('Missing endpoint in request', {
        requestId,
        context: 'request_validation',
        searchParams: Object.fromEntries(searchParams.entries())
      })
      return NextResponse.json({ error: 'Endpoint is required' }, { status: 400 })
    }

    logger.info('Making Dynamics 365 API request', {
      requestId,
      context: 'api_request',
      ...formatRequestDetails(endpoint, 'GET')
    })

    // Construct the Dynamics 365 API URL
    const baseUrl = process.env.DYNAMICS_API_URL || 'https://org.api.crm.dynamics.com/api/data/v9.2'
    const url = `${baseUrl}${endpoint}`

    // Make the request to Dynamics 365
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        'Prefer': 'odata.include-annotations="*"',
      },
    })

    const data = await validateDynamics365Response(response)

    logger.info('Successfully processed request', {
      requestId,
      context: 'request_complete',
      statusCode: response.status,
      endpoint
    })

    return NextResponse.json(data)
  } catch (error) {
    logger.error('Error in Dynamics 365 route:', {
      requestId,
      context: 'request_error',
      error: formatErrorDetails(error)
    })

    if (error instanceof Dynamics365Error) {
      return NextResponse.json(
        { 
          error: error.message,
          code: error.code,
          details: error.details
        }, 
        { status: error.statusCode || 500 }
      )
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
} 