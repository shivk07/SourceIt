import { useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Navigate, Outlet, useOutletContext } from "react-router";
import { Button } from "../ui/button";
import { useApiClient } from "../../lib/apiClient";
import { portalFor, type Role } from "../../lib/roles";

type AccountState =
  | { status: "checking" }
  | { status: "found"; role: Role }
  | { status: "noAccount" }
  | { status: "error" };

type AccountContext = { role: Role };

// Layout route wrapping every signed-in-only page. It looks the user's role
// up once and stays mounted while they move between those pages, so the role
// is effectively cached: it's only looked up again when the signed-in user
// changes or they return from a public page.
//
// Clerk re-renders this whenever the session changes, so when a session
// expires (or is signed out in another tab) `isSignedIn` flips to false and
// the user is sent back to the login page.
export default function RequireAuth() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const api = useApiClient();
  const [account, setAccount] = useState<AccountState>({ status: "checking" });
  // Bumped by the error state's "Try again" button to re-run the lookup.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!isSignedIn) return;
    const controller = new AbortController();
    setAccount({ status: "checking" });

    api
      .GET("/me", { signal: controller.signal })
      .then(({ data, response }) => {
        if (controller.signal.aborted) return;
        if (data) setAccount({ status: "found", role: data.account.role });
        // 401 with a live Clerk session: no SourceIt account for it yet.
        else if (response.status === 401) setAccount({ status: "noAccount" });
        else setAccount({ status: "error" });
      })
      .catch(() => {
        if (!controller.signal.aborted) setAccount({ status: "error" });
      });

    return () => controller.abort();
  }, [isSignedIn, userId, api, attempt]);

  if (!isLoaded) return <Checking />;

  if (!isSignedIn) return <Navigate to="/" replace />;

  switch (account.status) {
    case "checking":
      return <Checking />;
    case "noAccount":
      // The login page explains this case and offers to sign out.
      return <Navigate to="/" replace />;
    case "error":
      return (
        <div role="alert" className="min-h-screen flex flex-col items-center justify-center gap-4 text-slate-900">
          <p>We couldn't check your account. Please try again.</p>
          <Button variant="outline" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </Button>
        </div>
      );
    case "found":
      return <Outlet context={{ role: account.role } satisfies AccountContext} />;
  }
}

// Nested inside RequireAuth: limits a group of pages to the given roles, using
// the role RequireAuth already looked up. Admins can open every portal. Anyone
// else with the wrong role is sent to their own portal.
export function RequireRole({ roles }: { roles: Role[] }) {
  const { role } = useOutletContext<AccountContext>();

  if (role !== "admin" && !roles.includes(role)) return <Navigate to={portalFor[role]} replace />;

  return <Outlet />;
}

function Checking() {
  return (
    <div role="status" className="min-h-screen flex items-center justify-center text-slate-600">
      Checking your session…
    </div>
  );
}
