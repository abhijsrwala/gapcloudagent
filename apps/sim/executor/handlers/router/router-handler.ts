import { createLogger } from '@/lib/logs/console-logger'
import { generateRouterPrompt } from '@/blocks/blocks/router'
import { BlockOutput } from '@/blocks/types'
import { getProviderFromModel } from '@/providers/utils'
import { SerializedBlock } from '@/serializer/types'
import { PathTracker } from '../../path'
import { BlockHandler, ExecutionContext } from '../../types'

const logger = createLogger('RouterBlockHandler')

interface TargetBlock {
  id: string
  type: string
  title: string
  description?: string
  subBlocks: {
    systemPrompt: string
    [key: string]: any
  }
  currentState?: any
}

/**
 * Handler for Router blocks that dynamically select execution paths.
 */
export class RouterBlockHandler implements BlockHandler {
  /**
   * @param pathTracker - Utility for tracking execution paths
   */
  constructor(private pathTracker: PathTracker) {}

  canHandle(block: SerializedBlock): boolean {
    return block.metadata?.id === 'router'
  }

  private validateRouterConfiguration(block: SerializedBlock, context: ExecutionContext): void {
    // Check if the router has any outgoing connections
    const outgoingConnections = context.workflow?.connections.filter(conn => conn.source === block.id);
    if (!outgoingConnections || outgoingConnections.length === 0) {
      throw new Error(`Router block ${block.id} has no outgoing connections`);
    }

    // Validate that all target blocks exist and are enabled
    outgoingConnections.forEach(conn => {
      const targetBlock = context.workflow?.blocks.find(b => b.id === conn.target);
      if (!targetBlock) {
        throw new Error(`Target block ${conn.target} not found for router ${block.id}`);
      }
      if (!targetBlock.enabled) {
        throw new Error(`Target block ${conn.target} is disabled for router ${block.id}`);
      }
    });
  }

  async execute(
    block: SerializedBlock,
    inputs: Record<string, any>,
    context: ExecutionContext
  ): Promise<BlockOutput> {
    try {
      // Validate router configuration before execution
      this.validateRouterConfiguration(block, context);

      const targetBlocks = this.getTargetBlocks(block, context)
      if (!targetBlocks || targetBlocks.length === 0) {
        throw new Error(`Router block ${block.id} has no valid target blocks`);
      }

      const routerConfig = {
        prompt: inputs.prompt,
        model: inputs.model || 'gpt-4o',
        apiKey: inputs.apiKey,
        temperature: inputs.temperature || 0,
      }

      if (!routerConfig.prompt) {
        throw new Error('Router prompt is required');
      }

      const providerId = getProviderFromModel(routerConfig.model)

      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || ''
      const url = new URL('/api/providers', baseUrl)

      // Create the provider request with proper message formatting
      const messages = [{ role: 'user', content: routerConfig.prompt }]
      const systemPrompt = generateRouterPrompt(routerConfig.prompt, targetBlocks)
      const providerRequest = {
        provider: providerId,
        model: routerConfig.model,
        systemPrompt: systemPrompt,
        context: JSON.stringify(messages),
        temperature: routerConfig.temperature,
        apiKey: routerConfig.apiKey,
        workflowId: context.workflowId,
      }

      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(providerRequest),
      })

      if (!response.ok) {
        let errorMessage = `Provider API request failed with status ${response.status}`
        try {
          const errorData = await response.json()
          if (errorData.error) {
            errorMessage = errorData.error
          }
        } catch (e) {
          // If JSON parsing fails, use the original error message
        }
        throw new Error(errorMessage)
      }

      const result = await response.json()

      const chosenBlockId = result.content.trim().toLowerCase()
      const chosenBlock = targetBlocks.find((b) => b.id === chosenBlockId)

      if (!chosenBlock) {
        logger.error(
          `Invalid routing decision. Response content: "${result.content}", available blocks:`,
          targetBlocks.map((b) => ({ id: b.id, title: b.title }))
        )
        throw new Error(`Invalid routing decision: ${chosenBlockId}`)
      }

      const tokens = result.tokens || { prompt: 0, completion: 0, total: 0 }

      return {
        response: {
          content: inputs.prompt,
          model: result.model,
          tokens: {
            prompt: tokens.prompt || 0,
            completion: tokens.completion || 0,
            total: tokens.total || 0,
          },
          selectedPath: {
            blockId: chosenBlock.id,
            blockType: chosenBlock.type || 'unknown',
            blockTitle: chosenBlock.title || 'Untitled Block',
          },
        },
      }
    } catch (error) {
      logger.error('Router execution failed:', error)
      throw error
    }
  }

  /**
   * Gets all potential target blocks for this router.
   *
   * @param block - Router block
   * @param context - Current execution context
   * @returns Array of potential target blocks with metadata
   */
  private getTargetBlocks(block: SerializedBlock, context: ExecutionContext): TargetBlock[] {
    const connections = context.workflow?.connections.filter((conn) => conn.source === block.id);
    if (!connections || connections.length === 0) {
      logger.error(`Router block ${block.id} has no outgoing connections`);
      return [];
    }

    return connections
      .map((conn) => {
        const targetBlock = context.workflow?.blocks.find((b) => b.id === conn.target)
        if (!targetBlock) {
          logger.warn(`Target block ${conn.target} not found for router ${block.id}`);
          return null;
        }

        if (!targetBlock.enabled) {
          logger.warn(`Target block ${conn.target} is disabled for router ${block.id}`);
          return null;
        }

        // Extract system prompt for agent blocks
        let systemPrompt = ''
        if (targetBlock.metadata?.id === 'agent') {
          systemPrompt =
            targetBlock.config?.params?.systemPrompt || targetBlock.inputs?.systemPrompt || ''

          if (!systemPrompt && targetBlock.inputs) {
            systemPrompt = targetBlock.inputs.systemPrompt || ''
          }
        }

        return {
          id: targetBlock.id,
          type: targetBlock.metadata?.id || 'unknown',
          title: targetBlock.metadata?.name || 'Untitled Block',
          description: targetBlock.metadata?.description,
          subBlocks: {
            ...targetBlock.config?.params,
            systemPrompt: systemPrompt,
          },
          currentState: context.blockStates.get(targetBlock.id)?.output,
        } as TargetBlock;
      })
      .filter((block): block is TargetBlock => block !== null)
  }
}
