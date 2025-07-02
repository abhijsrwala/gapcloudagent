import { ToolResponse } from '../types'

// Base parameters shared by all operations
interface BaseDynamics365Params {
  accessToken: string
  organizationUrl: string
}

// Parameters for creating/updating records
export interface Dynamics365CreateParams extends BaseDynamics365Params {
  entityType: string
  data: Record<string, any>
}

// Parameters for retrieving records
export interface Dynamics365RetrieveParams extends BaseDynamics365Params {
  entityType: string
  id?: string
  query?: string
  select?: string[]
  filter?: string
  maxResults?: number
}

// Parameters for updating records
export interface Dynamics365UpdateParams extends BaseDynamics365Params {
  entityType: string
  id: string
  data: Record<string, any>
}

// Parameters for deleting records
export interface Dynamics365DeleteParams extends BaseDynamics365Params {
  entityType: string
  id: string
}

// Parameters for sales operations
export interface Dynamics365SalesParams {
  accessToken: string
  organizationUrl: string
  operation: 'get_pipeline' | 'get_revenue' | 'get_payments' | 'get_opportunities'
  startDate?: string
  endDate?: string
  salesPersonId?: string
}

// Parameters for leads operations
export interface Dynamics365LeadsParams {
  accessToken: string
  organizationUrl: string
  operation: 'get_all' | 'get_details' | 'create' | 'update_status' | 'convert' | 'qualify'
  leadId?: string
  status?: string
  data?: Record<string, any>
}

// Union type for all Dynamics 365 tool parameters
export type Dynamics365ToolParams =
  | Dynamics365CreateParams
  | Dynamics365RetrieveParams
  | Dynamics365UpdateParams
  | Dynamics365DeleteParams
  | Dynamics365SalesParams
  | Dynamics365LeadsParams

// Metadata interface for responses
export interface Dynamics365Metadata {
  id?: string
  type?: string
  createdOn?: string
  modifiedOn?: string
  [key: string]: any
}

// Response format
export interface Dynamics365ToolResponse extends ToolResponse {
  output: {
    content: string
    metadata: Dynamics365Metadata | Dynamics365Metadata[]
    toolCalls?: Array<{
      name: string
      status: 'success' | 'error'
      duration: number
      startTime: string
      endTime: string
      input?: Record<string, any>
      output?: Record<string, any>
      error?: string
    }>
  }
} 