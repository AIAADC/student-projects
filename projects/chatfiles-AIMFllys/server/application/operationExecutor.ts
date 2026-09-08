import {
  isOperationName,
  operationCatalog,
  type OperationDependency,
  type OperationName,
} from '../../shared/contracts/operations.js'

export class OperationExecutionError extends Error {
  constructor(
    public readonly code: 'unknown_operation' | 'invalid_input' | 'not_found' | 'unavailable' | 'operation_failed',
    public readonly operation?: string,
    public readonly dependency?: OperationDependency,
  ) {
    super(code)
    this.name = 'OperationExecutionError'
  }
}

export type OperationResourceLease<Resources> = {
  resources: Resources
  close: () => void | Promise<void>
}

export type OperationExecutorOptions<Resources> = {
  openResources: (
    name: OperationName,
    dependencies: readonly OperationDependency[],
  ) => Promise<OperationResourceLease<Resources>>
  executeOperation: (name: OperationName, input: unknown, resources: Resources) => Promise<unknown>
}

export function createOperationExecutor<Resources>(options: OperationExecutorOptions<Resources>) {
  return {
    async execute(name: string, input: unknown): Promise<unknown> {
      if (!isOperationName(name)) throw new OperationExecutionError('unknown_operation', name)
      const definition = operationCatalog[name]
      const parsed = definition.inputSchema.safeParse(input)
      if (!parsed.success) throw new OperationExecutionError('invalid_input', name)
      let lease: OperationResourceLease<Resources>
      try {
        lease = await options.openResources(name, definition.dependencies)
      } catch (error) {
        if (error instanceof OperationExecutionError) throw error
        throw new OperationExecutionError('unavailable', name)
      }
      try {
        const result = await options.executeOperation(name, parsed.data, lease.resources)
        const output = definition.outputSchema.safeParse(result)
        if (!output.success) throw new OperationExecutionError('operation_failed', name)
        return output.data
      } catch (error) {
        if (error instanceof OperationExecutionError) throw error
        throw new OperationExecutionError('operation_failed', name)
      } finally {
        await lease.close()
      }
    },
  }
}
