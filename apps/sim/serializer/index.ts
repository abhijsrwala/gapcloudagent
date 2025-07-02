import { Edge } from 'reactflow'
import { createLogger } from '@/lib/logs/console-logger'
import { BlockState, Loop } from '@/stores/workflows/workflow/types'
import { getBlock } from '@/blocks'
import { SerializedBlock, SerializedWorkflow } from './types'

const logger = createLogger('Serializer')

export class Serializer {
  validateBlockBeforeSerialization(block: BlockState): boolean {
    if (!block) {
      logger.error('Block is undefined or null')
      return false
    }
    if (!block.type) {
      logger.error(`Block ${block.id} has no type defined`)
      return false
    }
    const blockConfig = getBlock(block.type)
    if (!blockConfig) {
      logger.error(`Invalid block type: ${block.type} for block ${block.id}`)
      return false
    }
    return true
  }

  serializeWorkflow(
    blocks: Record<string, BlockState>,
    edges: Edge[],
    loops: Record<string, Loop>
  ): SerializedWorkflow {
    // Validate blocks before serialization
    const validBlocks = Object.values(blocks).filter(block => {
      const isValid = this.validateBlockBeforeSerialization(block)
      if (!isValid) {
        logger.warn(`Skipping invalid block during serialization: ${block?.id}`)
      }
      return isValid
    })

    return {
      version: '1.0',
      blocks: validBlocks.map((block) => this.serializeBlock(block)),
      connections: edges.map((edge) => ({
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle || undefined,
        targetHandle: edge.targetHandle || undefined,
      })),
      loops,
    }
  }

  private serializeBlock(block: BlockState): SerializedBlock {
    try {
      const blockConfig = getBlock(block.type)
      if (!blockConfig) {
        throw new Error(`Invalid block type: ${block.type}`)
      }

      // Check if this is an agent block with custom tools
      const params = this.extractParams(block)
      let toolId = ''

      if (block.type === 'agent' && params.tools) {
        // Process the tools in the agent block
        try {
          const tools = Array.isArray(params.tools) ? params.tools : JSON.parse(params.tools)

          // If there are custom tools, we just keep them as is
          // They'll be handled by the executor during runtime

          // For non-custom tools, we determine the tool ID
          const nonCustomTools = tools.filter((tool: any) => tool.type !== 'custom-tool')
          if (nonCustomTools.length > 0) {
            toolId = blockConfig.tools.config?.tool
              ? blockConfig.tools.config.tool(params)
              : blockConfig.tools.access[0]
          }
        } catch (error) {
          logger.error('Error processing tools in agent block:', { error, blockId: block.id })
          // Default to the first tool if we can't process tools
          toolId = blockConfig.tools.access[0]
        }
      } else {
        // For non-agent blocks, get tool ID from block config as usual
        toolId = blockConfig.tools.config?.tool
          ? blockConfig.tools.config.tool(params)
          : blockConfig.tools.access[0]
      }

      // Get inputs from block config
      const inputs: Record<string, any> = {}
      if (blockConfig.inputs) {
        Object.entries(blockConfig.inputs).forEach(([key, config]) => {
          inputs[key] = config.type
        })
      }

      return {
        id: block.id,
        position: block.position,
        config: {
          tool: toolId,
          params,
        },
        inputs,
        outputs: {
          ...block.outputs,
          // Include response format fields if available
          ...(params.responseFormat
            ? {
                responseFormat: JSON.parse(params.responseFormat),
              }
            : {}),
        },
        metadata: {
          id: block.type,
          name: block.name,
          description: blockConfig.description,
          category: blockConfig.category,
          color: blockConfig.bgColor,
        },
        enabled: block.enabled,
      }
    } catch (error) {
      logger.error(`Error serializing block ${block.id}:`, error)
      throw error
    }
  }

  private extractParams(block: BlockState): Record<string, any> {
    try {
      const blockConfig = getBlock(block.type)
      if (!blockConfig) {
        throw new Error(`Invalid block type: ${block.type}`)
      }

      const params: Record<string, any> = {}

      // First collect all current values from subBlocks
      Object.entries(block.subBlocks).forEach(([id, subBlock]) => {
        params[id] = subBlock.value
      })

      // Then check for any subBlocks with default values
      blockConfig.subBlocks.forEach((subBlockConfig) => {
        const id = subBlockConfig.id
        if (params[id] === null && subBlockConfig.value) {
          // If the value is null and there's a default value function, use it
          params[id] = subBlockConfig.value(params)
        }
      })

      return params
    } catch (error) {
      logger.error(`Error extracting params for block ${block.id}:`, error)
      throw error
    }
  }

  validateSerializedBlock(serializedBlock: SerializedBlock): boolean {
    if (!serializedBlock) {
      logger.error('Serialized block is undefined or null')
      return false
    }
    if (!serializedBlock.metadata?.id) {
      logger.error(`Block ${serializedBlock.id} has no type defined in metadata`)
      return false
    }
    const blockConfig = getBlock(serializedBlock.metadata.id)
    if (!blockConfig) {
      logger.error(`Invalid block type in metadata: ${serializedBlock.metadata.id} for block ${serializedBlock.id}`)
      return false
    }
    return true
  }

  deserializeWorkflow(workflow: SerializedWorkflow): {
    blocks: Record<string, BlockState>
    edges: Edge[]
  } {
    const blocks: Record<string, BlockState> = {}
    const edges: Edge[] = []

    // Validate and deserialize blocks
    workflow.blocks.forEach((serializedBlock) => {
      try {
        if (this.validateSerializedBlock(serializedBlock)) {
          const block = this.deserializeBlock(serializedBlock)
          blocks[block.id] = block
        } else {
          logger.warn(`Skipping invalid block during deserialization: ${serializedBlock?.id}`)
        }
      } catch (error) {
        logger.error(`Error deserializing block ${serializedBlock?.id}:`, error)
        // Continue with other blocks
      }
    })

    // Deserialize only connections where both source and target blocks exist
    workflow.connections.forEach((connection) => {
      if (blocks[connection.source] && blocks[connection.target]) {
        edges.push({
          id: crypto.randomUUID(),
          source: connection.source,
          target: connection.target,
          sourceHandle: connection.sourceHandle,
          targetHandle: connection.targetHandle,
        })
      } else {
        logger.warn('Skipping connection with missing blocks:', connection)
      }
    })

    return { blocks, edges }
  }

  private deserializeBlock(serializedBlock: SerializedBlock): BlockState {
    try {
      const blockType = serializedBlock.metadata?.id
      if (!blockType) {
        throw new Error(`Invalid block type: ${serializedBlock.metadata?.id}`)
      }

      const blockConfig = getBlock(blockType)
      if (!blockConfig) {
        throw new Error(`Invalid block type: ${blockType}`)
      }

      const subBlocks: Record<string, any> = {}
      blockConfig.subBlocks.forEach((subBlock) => {
        subBlocks[subBlock.id] = {
          id: subBlock.id,
          type: subBlock.type,
          value: serializedBlock.config.params[subBlock.id] ?? null,
        }
      })

      return {
        id: serializedBlock.id,
        type: blockType,
        name: serializedBlock.metadata?.name || blockConfig.name,
        position: serializedBlock.position,
        subBlocks,
        outputs: serializedBlock.outputs,
        enabled: serializedBlock.enabled ?? true,
        horizontalHandles: true,
        isWide: false,
        height: 0,
      }
    } catch (error) {
      logger.error(`Error deserializing block ${serializedBlock?.id}:`, error)
      throw error
    }
  }
}
