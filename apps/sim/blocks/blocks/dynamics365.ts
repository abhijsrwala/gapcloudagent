import { Dynamics365Icon } from '@/components/icons'
import { Dynamics365ToolResponse } from '@/tools/dynamics365/types'
import { BlockConfig } from '../types'

export const Dynamics365Block: BlockConfig<Dynamics365ToolResponse> = {
  type: 'dynamics365',
  name: 'Dynamics 365',
  description: 'Manage Dynamics 365 CRM records',
  longDescription:
    'Integrate with Microsoft Dynamics 365 CRM to manage records like accounts, contacts, leads, and more. Create, retrieve, update, and delete records using OAuth authentication.',
  category: 'tools',
  bgColor: '#0078D4', // Microsoft blue color
  icon: Dynamics365Icon,
  subBlocks: [
    // Operation selector
    {
      id: 'operation',
      title: 'Operation',
      type: 'dropdown',
      layout: 'full',
      options: [
        { label: 'Create Record', id: 'create' },
        { label: 'Retrieve Records', id: 'retrieve' },
        { label: 'Update Record', id: 'update' },
        { label: 'Delete Record', id: 'delete' },
        { label: 'Manage Leads', id: 'leads' },
        { label: 'Sales Data', id: 'sales' },
      ],
    },
    // Dynamics 365 Credentials
    {
      id: 'credential',
      title: 'Dynamics 365 Account',
      type: 'oauth-input',
      layout: 'full',
      provider: 'dynamics365',
      serviceId: 'dynamics365',
      requiredScopes: [
        'https://org589a2042.crm8.dynamics.com/.default',
        'offline_access',
      ],
      placeholder: 'Select Dynamics 365 account',
    },
    // Organization URL
    {
      id: 'organizationUrl',
      title: 'Organization URL',
      type: 'short-input',
      layout: 'full',
      placeholder: 'https://your-org.crm.dynamics.com',
    },
    // Entity Type
    {
      id: 'entityType',
      title: 'Entity Type',
      type: 'short-input',
      layout: 'full',
      placeholder: 'accounts, contacts, leads, opportunities, etc.',
      condition: { field: 'operation', value: ['create', 'retrieve', 'update', 'delete'] },
    },
    // Record ID (for update/delete/retrieve single)
    {
      id: 'id',
      title: 'Record ID',
      type: 'short-input',
      layout: 'full',
      placeholder: 'Record ID',
      condition: { field: 'operation', value: ['update', 'delete'] },
    },
    // Lead Management Options
    {
      id: 'leadOperation',
      title: 'Lead Operation',
      type: 'dropdown',
      layout: 'full',
      options: [
        { label: 'Get All Leads', id: 'get_all' },
        { label: 'Get Lead Details', id: 'get_details' },
        { label: 'Create Lead', id: 'create' },
        { label: 'Update Lead Status', id: 'update_status' },
        { label: 'Convert Lead', id: 'convert' },
        { label: 'Qualify Lead', id: 'qualify' },
      ],
      condition: { field: 'operation', value: 'leads' },
    },
    // Lead Status
    {
      id: 'leadStatus',
      title: 'Lead Status',
      type: 'dropdown',
      layout: 'full',
      options: [
        { label: 'New', id: 'new' },
        { label: 'Contacted', id: 'contacted' },
        { label: 'Qualified', id: 'qualified' },
        { label: 'Disqualified', id: 'disqualified' },
      ],
      condition: { 
        field: 'operation', 
        value: 'leads',
        and: {
          field: 'leadOperation',
          value: 'update_status'
        }
      },
    },
    // Sales Operation Options
    {
      id: 'salesOperation',
      title: 'Sales Operation',
      type: 'dropdown',
      layout: 'full',
      options: [
        { label: 'Sales Summary', id: 'sales_summary' },
        { label: 'Payment Status', id: 'payment_status' },
        { label: 'Pipeline Status', id: 'pipeline_status' },
      ],
      condition: { field: 'operation', value: 'sales' },
      value: () => 'sales_summary'
    },
    // Date Range
    {
      id: 'startDate',
      title: 'Start Date',
      type: 'date-input',
      layout: 'half',
      condition: { field: 'operation', value: 'sales' },
    },
    {
      id: 'endDate',
      title: 'End Date',
      type: 'date-input',
      layout: 'half',
      condition: { field: 'operation', value: 'sales' },
    },
    // Data (for create/update)
    {
      id: 'data',
      title: 'Record Data',
      type: 'code',
      layout: 'full',
      language: 'json',
      placeholder: '{\n  "firstname": "John",\n  "lastname": "Doe",\n  "email": "john.doe@example.com"\n}',
      condition: { field: 'operation', value: ['create', 'update'] },
    },
    // Query options (for retrieve)
    {
      id: 'select',
      title: 'Select Fields',
      type: 'long-input',
      layout: 'full',
      placeholder: 'Field names to select',
      condition: { field: 'operation', value: 'retrieve' },
    },
    {
      id: 'filter',
      title: 'Filter Query',
      type: 'short-input',
      layout: 'full',
      placeholder: 'OData filter query',
      condition: { field: 'operation', value: 'retrieve' },
    },
    {
      id: 'maxResults',
      title: 'Max Results',
      type: 'short-input',
      layout: 'full',
      placeholder: 'Maximum number of records',
      condition: { field: 'operation', value: 'retrieve' },
    },
  ],
  tools: {
    access: [
      'dynamics365_create',
      'dynamics365_retrieve',
      'dynamics365_update',
      'dynamics365_delete',
      'dynamics365_sales',
    ],
    config: {
      tool: (params) => {
        console.log('Dynamics365Block - Received params in tool config:', JSON.stringify(params, null, 2))
        const { operation, salesOperation } = params
        
        // For sales operations, validate salesOperation is present
        if (operation === 'sales' && !salesOperation) {
          throw new Error('Sales operation type is required when operation is "sales"')
        }

        switch (operation) {
          case 'create':
            return 'dynamics365_create'
          case 'retrieve':
            return 'dynamics365_retrieve'
          case 'update':
            return 'dynamics365_update'
          case 'delete':
            return 'dynamics365_delete'
          case 'leads':
            return 'dynamics365_leads'
          case 'sales':
            return 'dynamics365_sales'
          default:
            throw new Error(`Invalid Dynamics 365 operation: ${operation}`)
        }
      },
      params: (params) => {
        console.log('Dynamics365Block - Processing params:', JSON.stringify(params, null, 2))
        
        const { credential, operation, leadOperation, salesOperation, organizationUrl, ...rest } = params
        
        if (!organizationUrl) {
          throw new Error('Organization URL is required')
        }

        if (!credential) {
          throw new Error('Credentials are required')
        }

        // Handle leads operations
        if (operation === 'leads') {
          if (!leadOperation) {
            throw new Error('Lead operation is required when operation is "leads"')
          }
          return {
            accessToken: credential,
            organizationUrl,
            operation: leadOperation,
            entityType: 'leads',
            ...rest
          }
        }
        
        // Handle sales operations
        if (operation === 'sales') {
          const validSalesOperations = ['sales_summary', 'payment_status', 'pipeline_status']
          if (!salesOperation) {
            throw new Error('Sales operation is required when operation is "sales"')
          }
          if (!validSalesOperations.includes(salesOperation)) {
            throw new Error(`Invalid sales operation. Must be one of: ${validSalesOperations.join(', ')}`)
          }
          
          // Remove any null or undefined values
          const salesParams = {
            accessToken: credential,
            organizationUrl,
            operation: salesOperation, // Use salesOperation instead of operation
            ...(rest.startDate && { startDate: rest.startDate }),
            ...(rest.endDate && { endDate: rest.endDate }),
            ...(rest.salesPersonId && { salesPersonId: rest.salesPersonId })
          }
          
          console.log('Dynamics365Block - Generated sales params:', JSON.stringify(salesParams, null, 2))
          return salesParams
        }

        // Handle other operations
        const cleanParams = Object.entries(rest).reduce((acc, [key, value]) => {
          if (value != null) {
            acc[key] = value
          }
          return acc
        }, {} as Record<string, any>)

        return {
          accessToken: credential,
          organizationUrl,
          ...cleanParams
        }
      },
    },
  },
  inputs: {
    operation: { type: 'string', required: true },
    credential: { type: 'string', required: true },
    organizationUrl: { type: 'string', required: true },
    entityType: { type: 'string', required: false },
    id: { type: 'string', required: false },
    data: { type: 'json', required: false },
    select: { type: 'string', required: false },
    filter: { type: 'string', required: false },
    maxResults: { type: 'number', required: false },
    leadOperation: { type: 'string', required: false },
    leadStatus: { type: 'string', required: false },
    salesOperation: { type: 'string', required: true },
    startDate: { type: 'string', required: false },
    endDate: { type: 'string', required: false },
  },
  outputs: {
    response: {
      type: {
        content: 'string',
        metadata: 'json',
      },
    },
  },
} 