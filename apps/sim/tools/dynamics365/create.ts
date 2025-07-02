import { ToolConfig } from '../types'
import { Dynamics365CreateParams, Dynamics365ToolResponse } from './types'

export const dynamics365CreateTool: ToolConfig<Dynamics365CreateParams, Dynamics365ToolResponse> = {
  id: 'dynamics365_create',
  name: 'Dynamics 365 Create',
  description: 'Create a record in Dynamics 365 CRM',
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
      description: 'The entity type to create (e.g., accounts, contacts, leads)',
    },
    data: {
      type: 'object',
      required: true,
      description: 'The data for the new record',
    },
  },

  request: {
    url: (params) => `${params.organizationUrl}/api/data/v9.2/${params.entityType}`,
    method: 'POST',
    headers: (params) => ({
      Authorization: `Bearer ${params.accessToken}`,
      'Content-Type': 'application/json',
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0',
      Prefer: 'return=representation',
    }),
    body: (params) => params.data,
  },

  transformResponse: async (response) => {
    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error?.message || 'Failed to create record')
    }

    return {
      success: true,
      output: {
        content: `Successfully created ${data['@odata.type']} record`,
        metadata: {
          id: data.id,
          type: data['@odata.type'],
          createdOn: data.createdon,
          modifiedOn: data.modifiedon,
          ...data,
        },
      },
    }
  },

  transformError: (error) => {
    if (error.error?.message) {
      if (error.error.message.includes('unauthorized')) {
        return 'Invalid or expired access token. Please reauthenticate.'
      }
      return error.error.message
    }
    return error.message || 'An unexpected error occurred while creating the record'
  },
} 