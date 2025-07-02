import { ToolConfig } from '../types'
import { Dynamics365ToolResponse } from './types'
import { createLogger } from '@/lib/logs/console-logger'

const logger = createLogger('Dynamics365SalesTool')

interface Dynamics365SalesParams {
  accessToken: string
  organizationUrl: string
  salesOperation: 'sales_summary' | 'payment_status' | 'pipeline_status'
  startDate?: string
  endDate?: string
  salesPersonId?: string
}

interface DynamicsOpportunity {
  opportunityid: string;
  name: string;
  actualvalue?: number;
  estimatedvalue?: number;
  statuscode: number;
  statecode: number;
  createdon: string;
  modifiedon: string;
  _ownerid_value: string;
  stepname?: string;
  probability?: number;
  estimatedclosedate?: string;
  owninguser?: {
    firstname?: string;
    lastname?: string;
  };
}

interface DynamicsInvoice {
  name: string;
  totalamount: number;
  statuscode: number;
  statecode: number;
  customerid_account?: {
    accountid: string;
    name: string;
    accountnumber: string;
  };
  owninguser?: {
    firstname?: string;
    lastname?: string;
  };
  _ownerid_value: string;
  createdon: string;
}

interface PipelineStage {
  name: string;
  opportunities: DynamicsOpportunity[];
}

// Helper function to format date for OData
function formatODataDate(date: Date): string {
  // Dynamics 365 expects strict ISO 8601 format with milliseconds and 'Z' for UTC
  const isoString = date.toISOString();
  
  // Ensure we have exactly 3 decimal places for milliseconds
  const parts = isoString.split('.');
  if (parts.length === 2) {
    const millis = parts[1].replace('Z', '');
    const paddedMillis = millis.padEnd(3, '0').substring(0, 3);
    return `${parts[0]}.${paddedMillis}Z`;
  }
  
  return isoString;
}

// Helper function to validate date
function validateDate(dateStr: string, fieldName: string): void {
  if (!dateStr) {
    throw new Error(`${fieldName} cannot be empty`);
  }

  // First check if it's a valid ISO date string
  if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?)?$/.test(dateStr)) {
    throw new Error(`Invalid ${fieldName} format: ${dateStr}. Expected format: YYYY-MM-DD or ISO 8601`);
  }

  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid ${fieldName}: ${dateStr} could not be parsed as a valid date`);
  }

  // Additional validation for date ranges if needed
  const minDate = new Date('2000-01-01');
  const maxDate = new Date('2100-01-01');
  if (date < minDate || date > maxDate) {
    throw new Error(`${fieldName} must be between ${minDate.toISOString()} and ${maxDate.toISOString()}`);
  }
}


export const dynamics365SalesTool: ToolConfig<Dynamics365SalesParams, Dynamics365ToolResponse> = {
  id: 'dynamics365_sales',
  name: 'Dynamics 365 Sales',
  description: 'Retrieve sales, payment, and pipeline information from Dynamics 365',
  version: '1.0.0',

  oauth: {
    required: true,
    provider: 'dynamics365',
    additionalScopes: [
      'https://org.crm.dynamics.com/user_impersonation',
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
      description: 'Type of sales operation to perform (sales_summary, payment_status, or pipeline_status)',
    },
    startDate: {
      type: 'string',
      required: false,
      description: 'Start date for sales data (YYYY-MM-DD)',
    },
    endDate: {
      type: 'string',
      required: false,
      description: 'End date for sales data (YYYY-MM-DD)',
    },
    salesPersonId: {
      type: 'string',
      required: false,
      description: 'ID of specific salesperson to filter by',
    },
  },

  request: {
    url: (params) => {
  
      // Validate required parameters
      if (!params.organizationUrl) {
        const error = 'Organization URL is required'
        logger.error(error)
        throw new Error(error)
      }
  
      if (!params.accessToken) {
        const error = 'Access token is required'
        logger.error(error)
        throw new Error(error)
      }
  
      const validOperations = ['sales_summary', 'payment_status', 'pipeline_status']
      const salesOperation = params.salesOperation
      
      logger.debug('Validating Dynamics 365 sales operation', {
        salesOperation,
        isValidOperation: validOperations.includes(salesOperation)
      })
  
      // Validate operation with more detailed error message
      if (!validOperations.includes(salesOperation)) {
        const error = `Invalid operation: "${salesOperation}". Must be one of: ${validOperations.join(', ')}`
        logger.error('Invalid operation specified', { 
          salesOperation,
          validOperations,
          error
        })
        throw new Error(error)
      }
  
      let url = `${params.organizationUrl}/api/data/v9.2/`
      const queryParams = []
      const filters = []
  
      // Validate dates if provided
      if (params.startDate) {
        validateDate(params.startDate, 'start date')
      }
      if (params.endDate) {
        validateDate(params.endDate, 'end date')
      }
  
      logger.debug('Building Dynamics 365 sales request URL', {
        salesOperation,
        organizationUrl: params.organizationUrl,
        hasStartDate: !!params.startDate,
        hasEndDate: !!params.endDate,
        hasSalesPersonId: !!params.salesPersonId,
        startDate: params.startDate,
        endDate: params.endDate
      })
  
      switch (salesOperation) {
        case 'sales_summary':
          url += 'opportunities'
          queryParams.push('$select=name,estimatedvalue,actualvalue,statuscode,createdon,modifiedon,statecode,opportunityid,_ownerid_value')
          queryParams.push('$expand=owninguser($select=firstname,lastname)')
          
          if (params.startDate) {
            const startDate = new Date(params.startDate)
            startDate.setHours(0, 0, 0, 0)
            filters.push(`createdon ge ${formatODataDate(startDate)}`)
          }
          if (params.endDate) {
            const endDate = new Date(params.endDate)
            endDate.setHours(23, 59, 59, 999)
            filters.push(`createdon le ${formatODataDate(endDate)}`)
          }
          break
  
        case 'payment_status':
            url += 'invoices'
            // Removed customerid from $select since we're getting it through expand
            queryParams.push('$select=name,totalamount,statuscode,statecode,createdon,_ownerid_value')
            // Correct expanded relationships
            queryParams.push('$expand=customerid_account($select=name,accountnumber),customerid_contact($select=fullname),owninguser($select=firstname,lastname)')
            
            if (params.startDate) {
              const startDate = new Date(params.startDate)
              startDate.setHours(0, 0, 0, 0)
              filters.push(`createdon ge ${formatODataDate(startDate)}`)
            }
            if (params.endDate) {
              const endDate = new Date(params.endDate)
              endDate.setHours(23, 59, 59, 999)
              filters.push(`createdon le ${formatODataDate(endDate)}`)
            }
            break
  
        case 'pipeline_status':
          url += 'opportunities'
          queryParams.push('$select=name,estimatedvalue,stepname,probability,statuscode,statecode,estimatedclosedate,_ownerid_value')
          queryParams.push('$expand=owninguser($select=firstname,lastname)')
          queryParams.push('$orderby=estimatedclosedate asc')
        
          if (params.startDate) {
            const startDate = new Date(params.startDate)
            startDate.setHours(0, 0, 0, 0)
            filters.push(`estimatedclosedate ge ${formatODataDate(startDate)}`)
          }
          if (params.endDate) {
            const endDate = new Date(params.endDate)
            endDate.setHours(23, 59, 59, 999)
            filters.push(`estimatedclosedate le ${formatODataDate(endDate)}`)
          }
          break
      }
  
      // Add salesperson filter if provided
      if (params.salesPersonId) {
        filters.push(`_ownerid_value eq ${params.salesPersonId}`)
      }
  
      // Combine all filters
      if (filters.length > 0) {
        const filterString = filters.join(' and ')
        queryParams.push(`$filter=${encodeURIComponent(filterString)}`)
      }
  
      const queryString = queryParams.join('&')
      const finalUrl = queryString ? `${url}?${queryString}` : url
  
      logger.debug('Final request URL constructed', { url: finalUrl })
      return finalUrl
    },
    method: 'GET',
    headers: (params) => {
      
      return {
        Authorization: `Bearer ${params.accessToken}`,
        'Content-Type': 'application/json',
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        'Prefer': 'odata.include-annotations="*"'
      }
    },
  },

  transformResponse: async (response, params?: Dynamics365SalesParams) => {

    const data = await response.json()

    if (!response.ok) {
      const errorMessage = data.error?.message || 
        data.error?.description ||
        data['odata.error']?.message?.value ||
        'Failed to retrieve sales data'
      logger.error('Response error', {
        status: response.status,
        error: errorMessage,
        rawError: data.error
      })
      throw new Error(errorMessage)
    }

    // Validate response data structure
    if (!data.value || !Array.isArray(data.value)) {
      logger.error('Invalid response data structure', {
        hasValue: !!data.value,
        valueType: typeof data.value,
        response: data
      })
      throw new Error('Invalid response data structure from Dynamics 365')
    }

    if (!params?.salesOperation) {
      throw new Error('Operation parameter is required')
    }

    const salesOperation = params.salesOperation
    const formattedValue = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    })

    let responseContent = ''
    let responseMetadata: any = {}

    switch (salesOperation) {
      case 'sales_summary': {
        const totalSales = data.value.reduce((sum: number, opp: DynamicsOpportunity) => 
          sum + (opp.actualvalue || opp.estimatedvalue || 0), 0)
        const activeOpportunities = data.value.filter((opp: DynamicsOpportunity) => opp.statecode === 0)
        const topOpportunities = data.value
          .sort((a: DynamicsOpportunity, b: DynamicsOpportunity) => 
            (b.actualvalue || b.estimatedvalue || 0) - (a.actualvalue || a.estimatedvalue || 0))
          .slice(0, 5)

        responseContent = [
          'Sales Summary Report',
          '==================',
          '',
          `Total Sales: ${formattedValue.format(totalSales)}`,
          `Active Opportunities: ${activeOpportunities.length}`,
          `Total Opportunities: ${data.value.length}`,
          '',
          'Top 5 Opportunities by Value',
          '-------------------------',
          ...topOpportunities.map((opp: DynamicsOpportunity) => {
            const value = opp.actualvalue || opp.estimatedvalue || 0
            const ownerName = opp.owninguser 
              ? `${opp.owninguser.firstname || ''} ${opp.owninguser.lastname || ''}`.trim()
              : 'Unassigned'
            return `${opp.name}\n  Value: ${formattedValue.format(value)}\n  Owner: ${ownerName}`
          }),
          '',
          'Date Range',
          '----------',
          `From: ${params.startDate || 'Not specified'}`,
          `To: ${params.endDate || 'Not specified'}`
        ].join('\n')

        responseMetadata = {
          summary: {
            totalSales,
            activeOpportunities: activeOpportunities.length,
            totalOpportunities: data.value.length,
            dateRange: {
              start: params.startDate,
              end: params.endDate
            }
          },
          opportunities: data.value.map((opp: DynamicsOpportunity) => ({
            id: opp.opportunityid,
            name: opp.name,
            value: opp.actualvalue || opp.estimatedvalue || 0,
            status: opp.statuscode,
            state: opp.statecode,
            owner: opp.owninguser ? {
              id: opp._ownerid_value,
              name: `${opp.owninguser.firstname || ''} ${opp.owninguser.lastname || ''}`.trim()
            } : undefined,
            created: opp.createdon,
            modified: opp.modifiedon
          })),
          raw: data
        }
        break
      }
      case 'payment_status': {
        const paid = data.value.filter((inv: DynamicsInvoice) => inv.statecode === 2)
        const unpaid = data.value.filter((inv: DynamicsInvoice) => inv.statecode === 1)
        const totalAmount = data.value.reduce((sum: number, inv: DynamicsInvoice) => 
          sum + (inv.totalamount || 0), 0)
        
        responseContent = [
          'Payment Status Report',
          '====================',
          '',
          `Total Amount: ${formattedValue.format(totalAmount)}`,
          `Paid Invoices: ${paid.length}`,
          `Unpaid Invoices: ${unpaid.length}`,
          '',
          'Date Range',
          '----------',
          `From: ${params.startDate || 'Not specified'}`,
          `To: ${params.endDate || 'Not specified'}`
        ].join('\n')

        responseMetadata = {
          summary: {
            totalAmount,
            paidCount: paid.length,
            unpaidCount: unpaid.length,
            dateRange: {
              start: params.startDate,
              end: params.endDate
            }
          },
          invoices: data.value.map((inv: DynamicsInvoice) => ({
            name: inv.name,
            amount: inv.totalamount,
            status: inv.statuscode,
            state: inv.statecode,
            customer: inv.customerid_account ? {
              id: inv.customerid_account.accountid,
              name: inv.customerid_account.name,
              number: inv.customerid_account.accountnumber
            } : undefined,
            owner: inv.owninguser ? {
              id: inv._ownerid_value,
              name: `${inv.owninguser.firstname || ''} ${inv.owninguser.lastname || ''}`.trim()
            } : undefined,
            created: inv.createdon
          }))
        }
        break
      }
      case 'pipeline_status': {
        const stagesMap = data.value.reduce((acc: Record<string, DynamicsOpportunity[]>, opp: DynamicsOpportunity) => {
          const stage = opp.stepname || 'Unknown'
          if (!acc[stage]) acc[stage] = []
          acc[stage].push(opp)
          return acc
        }, {} as Record<string, DynamicsOpportunity[]>)
        
        const totalValue = data.value.reduce((sum: number, opp: DynamicsOpportunity) => 
          sum + (opp.estimatedvalue || 0), 0)

        responseContent = [
          'Pipeline Status Report',
          '=====================',
          '',
          `Total Pipeline Value: ${formattedValue.format(totalValue)}`,
          `Total Opportunities: ${data.value.length}`,
          `Number of Stages: ${Object.keys(stagesMap).length}`,
          '',
          'Pipeline Stages',
          '---------------',
          ...Object.entries(stagesMap).map(([stageName, stageOpps]) => {
            const opportunities = stageOpps as DynamicsOpportunity[]
            const stageValue = opportunities.reduce((sum: number, opp: DynamicsOpportunity) => 
              sum + (opp.estimatedvalue || 0), 0)
            return [
              `${stageName}:`,
              `  Opportunities: ${opportunities.length}`,
              `  Total Value: ${formattedValue.format(stageValue)}`
            ].join('\n')
          }),
          '',
          'Date Range',
          '----------',
          `From: ${params.startDate || 'Not specified'}`,
          `To: ${params.endDate || 'Not specified'}`
        ].join('\n')

        responseMetadata = {
          summary: {
            totalPipelineValue: totalValue,
            totalOpportunities: data.value.length,
            stageCount: Object.keys(stagesMap).length,
            dateRange: {
              start: params.startDate,
              end: params.endDate
            }
          },
          stages: Object.entries(stagesMap).map(([stageName, stageOpps]) => {
            const opportunities = stageOpps as DynamicsOpportunity[]
            return {
              name: stageName,
              opportunityCount: opportunities.length,
              totalValue: opportunities.reduce((sum: number, opp: DynamicsOpportunity) => 
                sum + (opp.estimatedvalue || 0), 0),
              opportunities: opportunities.map((opp: DynamicsOpportunity) => ({
                name: opp.name,
                value: opp.estimatedvalue || 0,
                probability: opp.probability,
                status: opp.statuscode,
                state: opp.statecode,
                closeDate: opp.estimatedclosedate,
                owner: opp.owninguser ? {
                  id: opp._ownerid_value,
                  name: `${opp.owninguser.firstname || ''} ${opp.owninguser.lastname || ''}`.trim()
                } : undefined
              }))
            }
          })
        }
        break
      }
      default:
        throw new Error(`Unsupported operation: ${salesOperation}`)
    }

    // Return in the format expected by the AI block
    return {
      success: true,
      output: {
        content: responseContent,
        metadata: responseMetadata,
        toolCalls: [{
          name: 'dynamics365_sales',
          status: 'success',
          duration: 0,
          startTime: new Date().toISOString(),
          endTime: new Date().toISOString(),
          input: params,
          output: responseMetadata
        }]
      }
    }
  },

  transformError: (error) => {
    logger.error('Error in Dynamics 365 sales tool', {
      error: error.message,
      details: error.error
    })

    if (error.error?.message) {
      if (error.error.message.includes('unauthorized')) {
        return 'Invalid or expired access token. Please reauthenticate.'
      }
      if (error.error.message.includes('Access is denied')) {
        return 'Access denied. Please check your permissions for this operation.'
      }
      return error.error.message
    }
    return error.message || 'An unexpected error occurred while retrieving sales data'
  }
} 