import type { Pool, PoolClient } from 'pg';

// Pass a transaction client so the audit row commits or rolls back with the change itself.
export async function audit(
  db: Pool | PoolClient,
  actorId: string | null,
  action: string,
  entityType: string,
  entityId: string | null,
  details: unknown = null
) {
  await db.query(
    `INSERT INTO audit_log (actor_user_id, action, entity_type, entity_id, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [actorId, action, entityType, entityId, details ? JSON.stringify(details) : null]
  );
}
