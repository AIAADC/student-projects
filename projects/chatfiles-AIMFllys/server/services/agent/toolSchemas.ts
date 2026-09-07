import { toJSONSchema } from 'zod/v4'

import {
  AGENT_OPERATION_NAMES,
  operationCatalog,
  type OperationName,
} from '../../../shared/contracts/operations.js'

type AgentToolName = Exclude<OperationName, 'status'>
type JsonSchema = {
  type: 'object'
  properties: Record<string, unknown>
  required?: string[]
  additionalProperties: false
  [key: string]: unknown
}

function parameters(name: AgentToolName) {
  const schema = toJSONSchema(
    operationCatalog[name].inputSchema,
    { target: 'draft-07', io: 'input' },
  )
  delete schema.$schema
  return schema as unknown as JsonSchema
}

export const AGENT_TOOL_SCHEMAS = AGENT_OPERATION_NAMES.map((name) => ({
  type: 'function' as const,
  function: {
    name,
    description: operationCatalog[name].description,
    parameters: parameters(name),
  },
}))

export type { AgentToolName }
