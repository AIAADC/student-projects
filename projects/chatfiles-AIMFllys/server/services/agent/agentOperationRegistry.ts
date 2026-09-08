import { AGENT_OPERATION_NAMES, type OperationName } from '../../../shared/contracts/operations.js'
import { OperationExecutionError } from '../../application/operationExecutor.js'
import { AGENT_TOOL_SCHEMAS, type AgentToolName } from './toolSchemas.js'
import { ToolExecutionError } from './toolRegistry.js'

type OperationExecutor = { execute: (name: string, input: unknown) => Promise<unknown> }

function isAgentToolName(name: string): name is AgentToolName {
  return (AGENT_OPERATION_NAMES as readonly OperationName[]).includes(name as OperationName)
}

function toolError(error: unknown) {
  if (!(error instanceof OperationExecutionError)) return new ToolExecutionError('tool_failed')
  if (error.code === 'unknown_operation') return new ToolExecutionError('unknown_tool')
  if (error.code === 'invalid_input') return new ToolExecutionError('invalid_arguments')
  if (error.code === 'not_found') return new ToolExecutionError('not_found')
  if (error.code === 'unavailable') return new ToolExecutionError('unavailable')
  return new ToolExecutionError('tool_failed')
}

export function createAgentOperationRegistry(operations: OperationExecutor) {
  return {
    schemas: AGENT_TOOL_SCHEMAS,
    async execute(name: string, input: unknown) {
      if (!isAgentToolName(name)) throw new ToolExecutionError('unknown_tool')
      try {
        return await operations.execute(name, input)
      } catch (error) {
        throw toolError(error)
      }
    },
  }
}
