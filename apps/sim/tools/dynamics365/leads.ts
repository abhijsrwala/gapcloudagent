import { ToolConfig } from '../types'
import { Dynamics365LeadsParams, Dynamics365ToolResponse } from './types'

export const dynamics365LeadsTool: ToolConfig<Dynamics365LeadsParams, Dynamics365ToolResponse> = {
  id: 'dynamics365_leads',
  name: 'Dynamics 365 Leads',
  description: 'Manage leads in Dynamics 365 CRM',
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
    operation: {
      type: 'string',
      required: true,
      description: 'Type of lead operation to perform (get_all, get_details, create, update_status, convert, qualify)',
    },
    leadId: {
      type: 'string',
      required: false,
      description: 'ID of the lead to operate on',
    },
    status: {
      type: 'string',
      required: false,
      description: 'New status for the lead',
    },
    data: {
      type: 'object',
      required: false,
      description: 'Lead data for create/update operations',
    },
  },

  request: {
    url: (params) => {
      let url = `${params.organizationUrl}/api/data/v9.2/leads`
      
      switch (params.operation) {
        case 'get_all':
          return `${url}?$select=leadid,firstname,lastname,emailaddress1,telephone1,companyname,leadsourcecode,statuscode`
        case 'get_details':
          return params.leadId ? `${url}(${params.leadId})?$select=*` : url
        case 'create':
          return url
        case 'update_status':
          return params.leadId ? `${url}(${params.leadId})` : url
        case 'convert':
        case 'qualify':
          return params.leadId ? `${url}(${params.leadId})/Microsoft.Dynamics.CRM.QualifyLead` : url
        default:
          return url
      }
    },
    method: 'POST',
    headers: (params) => {
      const baseHeaders = {
        Authorization: `Bearer ${params.accessToken}`,
        'Content-Type': 'application/json',
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
      }

      if (params.operation === 'get_all' || params.operation === 'get_details') {
        return {
          ...baseHeaders,
          'X-HTTP-Method': 'GET',
        }
      }

      if (params.operation === 'update_status') {
        return {
          ...baseHeaders,
          'X-HTTP-Method': 'PATCH',
        }
      }

      return baseHeaders
    },
    body: (params) => {
      switch (params.operation) {
        case 'get_all':
        case 'get_details':
          return {}
        case 'create':
          return params.data || {}
        case 'update_status':
          return {
            statuscode: params.status,
          }
        case 'convert':
        case 'qualify':
          return {
            CreateAccount: true,
            CreateContact: true,
            CreateOpportunity: true,
            Status: 'Qualified',
          }
        default:
          return {}
      }
    },
  },

  transformResponse: async (response) => {
    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error?.message || 'Failed to perform lead operation')
    }

    return {
      success: true,
      output: {
        content: `Successfully performed ${data['@odata.type'] || 'lead'} operation`,
        metadata: {
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
    return error.message || 'An unexpected error occurred while performing the lead operation'
  },
} 