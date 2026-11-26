import type { components } from "@sourceit/shared/client";

export type Role = components["schemas"]["Account"]["role"];

// Each role's home page: where login sends a user, and where the route guard
// sends someone who opens a page their role can't use.
export const portalFor: Record<Role, string> = {
  reader: "/user-portal",
  publisher: "/publisher-portal",
  reviewer: "/reviewer-portal",
  admin: "/admin-portal",
};
