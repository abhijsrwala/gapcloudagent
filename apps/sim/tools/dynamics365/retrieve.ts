import { ToolConfig } from '../types'
import { Dynamics365RetrieveParams, Dynamics365ToolResponse } from './types'

export const dynamics365RetrieveTool: ToolConfig<Dynamics365RetrieveParams, Dynamics365ToolResponse> = {
  id: 'dynamics365_retrieve',
  name: 'Dynamics 365 Retrieve',
  description: 'Retrieve records from Dynamics 365 CRM',
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
      description: 'The entity type to retrieve (e.g., accounts, contacts, leads)',
    },
    id: {
      type: 'string',
      required: false,
      description: 'Specific record ID to retrieve',
    },
    select: {
      type: 'array',
      required: false,
      description: 'Fields to select in the response',
    },
    filter: {
      type: 'string',
      required: false,
      description: 'OData filter query',
    },
    maxResults: {
      type: 'number',
      required: false,
      description: 'Maximum number of records to retrieve',
    },
  },

  request: {
    url: (params) => {
      let url = `${params.organizationUrl}/api/data/v9.2/${params.entityType}`
      
      // If ID is provided, retrieve specific record
      if (params.id) {
        url += `(${params.id})`
      }

      const queryParams = new URLSearchParams()

      // Add select fields if provided
      if (params.select?.length) {
        queryParams.append('$select', params.select.join(','))
      }

      // Add filter if provided
      if (params.filter) {
        queryParams.append('$filter', params.filter)
      }

      // Add top if maxResults is provided
      if (params.maxResults) {
        queryParams.append('$top', params.maxResults.toString())
      }

      // Add query parameters if any exist
      const queryString = queryParams.toString()
      if (queryString) {
        url += `?${queryString}`
      }

      return url
    },
    method: 'GET',
    headers: (params) => ({
      Authorization: `Bearer ${params.accessToken}`,
      'Content-Type': 'application/json',
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0',
    }),
  },

  transformResponse: async (response) => {
    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error?.message || 'Failed to retrieve records')
    }

    // Handle single record response
    if (!data.value) {
      return {
        success: true,
        output: {
          content: `Successfully retrieved ${data['@odata.type']} record`,
          metadata: {
            id: data.id,
            type: data['@odata.type'],
            createdOn: data.createdon,
            modifiedOn: data.modifiedon,
            ...data,
          },
        },
      }
    }

    // Handle multiple records response
    return {
      success: true,
      output: {
        content: `Successfully retrieved ${data.value.length} records`,
        metadata: data.value.map((record: any) => ({
          id: record.id,
          type: record['@odata.type'],
          createdOn: record.createdon,
          modifiedOn: record.modifiedon,
          ...record,
        })),
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
    return error.message || 'An unexpected error occurred while retrieving records'
  },
} 