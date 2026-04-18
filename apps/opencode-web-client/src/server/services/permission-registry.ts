import type { PermissionRequest } from '../../shared/types.js'
import type { OpenCodeClientFactory } from './opencode-client-factory.js'

export class PermissionRegistry {
  private pending = new Map<string, PermissionRequest>()
  private clientFactory: OpenCodeClientFactory

  constructor(clientFactory: OpenCodeClientFactory) {
    this.clientFactory = clientFactory
  }

  /**
   * Register a pending permission request (called when upstream emits a permission event).
   */
  addPending(workspaceId: string, permission: PermissionRequest): void {
    const key = `${workspaceId}:${permission.id}`
    this.pending.set(key, permission)
    // Auto-expire after 5 minutes
    setTimeout(() => this.pending.delete(key), 5 * 60 * 1000)
  }

  /**
   * Get all pending permissions for a workspace/session.
   */
  getPending(workspaceId: string, sessionId: string): PermissionRequest[] {
    const results: PermissionRequest[] = []
    for (const [key, perm] of this.pending) {
      if (key.startsWith(`${workspaceId}:`) && perm.sessionId === sessionId && perm.status === 'pending') {
        results.push(perm)
      }
    }
    return results
  }

  /**
   * Resolve a permission: forward to upstream and update local state.
   */
  async resolve(
    workspaceId: string,
    permissionId: string,
    decision: 'allow' | 'allow_remember' | 'deny'
  ): Promise<PermissionRequest | null> {
    const key = `${workspaceId}:${permissionId}`
    const perm = this.pending.get(key)

    // Forward resolution to upstream
    try {
      const client = this.clientFactory.forWorkspace(workspaceId)
      // Upstream permission resolution endpoint
      await (client as any).resolvePermission?.(permissionId, decision)
    } catch {
      // Best effort
    }

    if (perm) {
      perm.status = decision === 'deny' ? 'denied' : 'approved'
      this.pending.delete(key)
      return perm
    }

    return null
  }

  /**
   * List all pending permissions for a workspace (across all sessions).
   */
  listAll(workspaceId: string): PermissionRequest[] {
    const results: PermissionRequest[] = []
    for (const [key, perm] of this.pending) {
      if (key.startsWith(`${workspaceId}:`)) {
        results.push(perm)
      }
    }
    return results
  }

  /**
   * Clean up all permissions for a workspace.
   */
  cleanup(workspaceId: string): void {
    for (const key of this.pending.keys()) {
      if (key.startsWith(`${workspaceId}:`)) {
        this.pending.delete(key)
      }
    }
  }
}
