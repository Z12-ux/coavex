/**
 * Role-based access control. The matrix is the single source of truth and is
 * enforced SERVER-SIDE (server actions, route handlers, layouts). The UI only
 * uses it to hide affordances.
 */

import type { Role } from "@/domain/types";

export type Permission =
  | "clients:read"
  | "clients:write"
  | "clients:delete"
  | "programs:read"
  | "programs:write"
  | "checkins:review"
  | "messages:send"
  | "notes:write"
  | "intelligence:run"
  | "review:run"
  | "business:read"
  | "business:write"
  | "org:manage"
  | "users:manage"
  | "client:self";

const MATRIX: Record<Role, Set<Permission>> = {
  OWNER: new Set<Permission>(["clients:read", "clients:write", "clients:delete", "programs:read", "programs:write", "checkins:review", "messages:send", "notes:write", "intelligence:run", "review:run", "business:read", "business:write", "org:manage", "users:manage"]),
  ADMIN: new Set<Permission>(["clients:read", "clients:write", "clients:delete", "programs:read", "programs:write", "checkins:review", "messages:send", "notes:write", "intelligence:run", "review:run", "business:read", "business:write", "org:manage", "users:manage"]),
  COACH: new Set<Permission>(["clients:read", "clients:write", "programs:read", "programs:write", "checkins:review", "messages:send", "notes:write", "intelligence:run", "review:run", "business:read"]),
  ASSISTANT: new Set<Permission>(["clients:read", "programs:read", "messages:send", "notes:write"]),
  CLIENT: new Set<Permission>(["client:self"]),
};

export function can(role: Role, permission: Permission): boolean {
  return MATRIX[role]?.has(permission) ?? false;
}

export function isStaff(role: Role): boolean {
  return role !== "CLIENT";
}

export function isRole(x: string): x is Role {
  return x in MATRIX;
}
