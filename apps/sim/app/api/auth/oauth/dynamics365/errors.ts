export class Dynamics365Error extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly statusCode?: number,
    public readonly details?: any
  ) {
    super(message)
    this.name = 'Dynamics365Error'
  }
}

export interface Dynamics365ErrorResponse {
  error?: {
    code?: string
    message?: string
    details?: any[]
    innererror?: {
      message?: string
      type?: string
      stacktrace?: string
    }
  }
}

/**
 * Parse Dynamics 365 error response into a structured error object
 */
export function parseDynamics365Error(response: Response, errorText: string): Dynamics365Error {
  try {
    const errorData = JSON.parse(errorText) as Dynamics365ErrorResponse
    const error = errorData.error || {}
    
    // Extract the most relevant error message
    const message = error.message || 
      error.innererror?.message || 
      `Dynamics 365 API error: ${response.status} ${response.statusText}`

    return new Dynamics365Error(
      message,
      error.code,
      response.status,
      {
        details: error.details,
        innerError: error.innererror,
        raw: errorData
      }
    )
  } catch (e) {
    // If parsing fails, return a generic error with the raw text
    return new Dynamics365Error(
      errorText || `Dynamics 365 API error: ${response.status} ${response.statusText}`,
      undefined,
      response.status,
      { raw: errorText }
    )
  }
}

/**
 * Format error details for logging
 */
export function formatErrorDetails(error: any): Record<string, any> {
  if (error instanceof Dynamics365Error) {
    return {
      name: error.name,
      message: error.message,
      code: error.code,
      statusCode: error.statusCode,
      details: error.details,
    }
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    }
  }

  return { error }
} 