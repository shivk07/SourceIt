import { describe, expect, it, vi } from "vitest";
import { isValidElement } from "react";
import RequireAuth, { RequireRole } from "./components/auth/RequireAuth";

// Pages use Clerk hooks at render time only; importing them needs no real Clerk.
vi.mock("@clerk/clerk-react", () => ({}));

const { routes } = await import("./routes");

// path → roles allowed by the RequireRole group wrapping it, for every page
// under the RequireAuth layout route.
function guardedPaths() {
  const guarded: Record<string, string[]> = {};
  const auth = routes.find((r) => r.Component === RequireAuth);
  for (const group of auth?.children ?? []) {
    const el = group.element;
    if (!isValidElement<{ roles: string[] }>(el) || el.type !== RequireRole) continue;
    for (const page of group.children ?? []) guarded[page.path!] = el.props.roles;
  }
  return guarded;
}

describe("routes", () => {
  it("puts every signed-in page behind RequireAuth with its role", () => {
    expect(guardedPaths()).toEqual({
      "/user-portal": ["reader"],
      "/saved-articles": ["reader"],
      "/publisher-portal": ["publisher"],
      "/article-edit-history": ["publisher"],
      "/reviewer-portal": ["reviewer"],
      "/admin-portal": ["admin"],
    });
  });

  it("keeps the login and public verification pages open", () => {
    const open = routes.filter((r) => r.path).map((r) => r.path);
    expect(open).toEqual(expect.arrayContaining(["/", "/verification-result", "/verification-result/:articleId"]));
  });
});
