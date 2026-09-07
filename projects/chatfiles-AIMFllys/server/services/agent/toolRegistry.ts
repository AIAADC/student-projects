import {
  AGENT_OPERATION_NAMES,
  operationCatalog,
  type OperationName,
} from '../../../shared/contracts/operations.js'
import {
  createOperationHandlers,
  OperationHandlerError,
  type OperationHandlerDependencies,
} from '../../application/operationHandlers.js'
import { AGENT_TOOL_SCHEMAS, type AgentToolName } from './toolSchemas.js'

export type ToolRegistryDependencies = OperationHandlerDependencies

export class ToolExecutionError extends Error {
  constructor(public readonly code: 'unknown_tool' | 'invalid_arguments' | 'not_found' | 'unavailable' | 'tool_failed') {
    super(code)
    this.name = 'ToolExecutionError'
  }
}

function isAgentToolName(name: string): name is AgentToolName {
  return (AGENT_OPERATION_NAMES as readonly OperationName[]).includes(name as OperationName)
}

function mapError(error: unknown) {
  if (!(error instanceof OperationHandlerError)) return new ToolExecutionError('tool_failed')
  if (error.code === 'not_found') return new ToolExecutionError('not_found')
  if (error.code === 'unavailable') return new ToolExecutionError('unavailable')
  return new ToolExecutionError('tool_failed')
}

export function createToolRegistry(dependencies: Partial<ToolRegistryDependencies>) {
  const handlers = createOperationHandlers(dependencies)
  return {
    schemas: AGENT_TOOL_SCHEMAS,
    async execute(name: string, input: unknown) {
      if (!isAgentToolName(name)) throw new ToolExecutionError('unknown_tool')
      const parsed = operationCatalog[name].inputSchema.safeParse(input)
      if (!parsed.success) throw new ToolExecutionError('invalid_arguments')
      try {
        return await handlers.execute(name, parsed.data)
      } catch (error) {
        throw mapError(error)
      }
    },
  }
}
