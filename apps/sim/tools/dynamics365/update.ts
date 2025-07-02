import { ToolConfig } from '../types'
import { Dynamics365UpdateParams, Dynamics365ToolResponse } from './types'

export const dynamics365UpdateTool: ToolConfig<Dynamics365UpdateParams, Dynamics365ToolResponse> = {
  id: 'dynamics365_update',
  name: 'Dynamics 365 Update',
  description: 'Update a record in Dynamics 365 CRM',
  version: '1.0.0',

  oauth: {
    required: true,
    provider: 'dynamics365',
    additionalScopes: [
      'https://org589a2042.crm8.dynamics.com/.default',
      'offline_access'
    ],
  },

  params: {
    accessToken: {
      type: 'string',
      required: true,
      description: 'OAuth access token for Dynamics 365',
    },
    organizationUrl: {
      type: 'string',
      required: true,
      description: 'Your Dynamics 365 organization URL',
    },
    entityType: {
      type: 'string',
      required: true,
      description: 'The entity type to update (e.g., accounts, contacts, leads)',
    },
    id: {
      type: 'string',
      required: true,
      description: 'ID of the record to update',
    },
    data: {
      type: 'object',
      required: true,
      description: 'The data to update in the record',
    },
  },

  request: {
    url: (params) => `${params.organizationUrl}/api/data/v9.2/${params.entityType}(${params.id})`,
    method: 'PATCH',
    headers: (params) => ({
      Authorization: `Bearer ${params.accessToken}`,
      'Content-Type': 'application/json',
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0',
      'If-Match': '*', // Update regardless of version
    }),
    body: (params) => params.data,
  },

  transformResponse: async (response, params) => {
    // For PATCH requests, a successful response will be 204 No Content
    if (response.status === 204) {
      const entityId = response.headers.get('OData-EntityId') || params?.id
      return {
        success: true,
        output: {
          content: 'Record updated successfully',
          metadata: {
            id: entityId,
            type: params?.entityType,
            modifiedOn: new Date().toISOString(),
            status: 'updated',
          },
        },
      }
    }

    const data = await response.json()
    throw new Error(data.error?.message || 'Failed to update record')
  },

  transformError: (error) => {
    if (error.error?.message) {
      if (error.error.message.includes('unauthorized')) {
        return 'Invalid or expired access token. Please reauthenticate.'
      }
      if (error.error.message.includes('not found')) {
        return 'Record not found. Please check the record ID.'
      }
      return error.error.message
    }
    return error.message || 'An unexpected error occurred while updating the record'
  },
} 