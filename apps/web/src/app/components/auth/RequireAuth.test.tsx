import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import RequireAuth, { RequireRole } from "./RequireAuth";
import type { Role } from "../../lib/roles";

// A tiny reactive stand-in for Clerk: like the real useAuth, components that
// read it re-render when the session state changes.
const authStore = vi.hoisted(() => {
  type State = { isLoaded: boolean; isSignedIn: boolean | undefined; userId: string | null };
  const initial: State = { isLoaded: true, isSignedIn: true, userId: "user_1" };
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(next: Partial<State>) {
      state = { ...state, ...next };
      listeners.forEach((l) => l());
    },
    reset: () => {
      state = initial;
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
});

vi.mock("@clerk/clerk-react", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    useAuth: () => useSyncExternalStore(authStore.subscribe, authStore.get),
  };
});

// Same object every render, like the real memoised client.
const api = vi.hoisted(() => ({ GET: vi.fn() }));
vi.mock("../../lib/apiClient", () => ({ useApiClient: () => api }));

const me = (role: Role) => ({
  data: { account: { role }, publisherIds: [], reviewerId: null },
  response: new Response(null, { status: 200 }),
});
const meFailed = (status: number) => ({ data: undefined, response: new Response(null, { status }) });

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: "/", element: <p>Login page</p> },
      {
        Component: RequireAuth,
        children: [
          {
            element: <RequireRole roles={["reader"]} />,
            children: [
              { path: "/user-portal", element: <p>User portal</p> },
              { path: "/saved-articles", element: <p>Saved articles</p> },
            ],
          },
          {
            element: <RequireRole roles={["publisher"]} />,
            children: [{ path: "/publisher-portal", element: <p>Publisher portal</p> }],
          },
          {
            element: <RequireRole roles={["admin"]} />,
            children: [{ path: "/admin-portal", element: <p>Admin portal</p> }],
          },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

afterEach(() => {
  cleanup();
  authStore.reset();
  api.GET.mockReset();
});

describe("RequireAuth", () => {
  it("renders the page when signed in with an allowed role", async () => {
    api.GET.mockResolvedValue(me("reader"));
    renderAt("/user-portal");
    expect(await screen.findByText("User portal")).toBeTruthy();
  });

  it("shows a session check, not the page, while Clerk is loading", () => {
    authStore.set({ isLoaded: false, isSignedIn: undefined });
    renderAt("/user-portal");
    expect(screen.getByRole("status").textContent).toContain("Checking your session");
    expect(screen.queryByText("User portal")).toBeNull();
    expect(api.GET).not.toHaveBeenCalled();
  });

  it("shows a session check, not the page, while the account is being looked up", () => {
    api.GET.mockReturnValue(new Promise(() => {}));
    renderAt("/user-portal");
    expect(screen.getByRole("status").textContent).toContain("Checking your session");
    expect(screen.queryByText("User portal")).toBeNull();
  });

  it("sends a signed-out visitor to the login page", () => {
    authStore.set({ isSignedIn: false });
    const router = renderAt("/user-portal");
    expect(screen.getByText("Login page")).toBeTruthy();
    expect(router.state.location.pathname).toBe("/");
    expect(api.GET).not.toHaveBeenCalled();
  });

  it("sends the user back to login when their session expires on the page", async () => {
    api.GET.mockResolvedValue(me("reader"));
    const router = renderAt("/user-portal");
    expect(await screen.findByText("User portal")).toBeTruthy();

    // Clerk flips isSignedIn to false when the session expires.
    act(() => authStore.set({ isSignedIn: false }));

    expect(screen.getByText("Login page")).toBeTruthy();
    expect(router.state.location.pathname).toBe("/");
  });

  it("sends a user with the wrong role to their own portal", async () => {
    api.GET.mockResolvedValue(me("reader"));
    const router = renderAt("/publisher-portal");

    expect(await screen.findByText("User portal")).toBeTruthy();
    expect(screen.queryByText("Publisher portal")).toBeNull();
    expect(router.state.location.pathname).toBe("/user-portal");
  });

  it("sends a session with no SourceIt account to the login page", async () => {
    api.GET.mockResolvedValue(meFailed(401));
    const router = renderAt("/user-portal");

    expect(await screen.findByText("Login page")).toBeTruthy();
    expect(router.state.location.pathname).toBe("/");
  });

  it("shows an error with Try again when the account lookup fails", async () => {
    api.GET.mockResolvedValueOnce(meFailed(500)).mockResolvedValueOnce(me("reader"));
    renderAt("/user-portal");

    expect((await screen.findByRole("alert")).textContent).toContain("We couldn't check your account");
    expect(screen.queryByText("User portal")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("User portal")).toBeTruthy();
  });

  it("shows the error state when the account lookup can't connect", async () => {
    api.GET.mockRejectedValue(new TypeError("Failed to fetch"));
    renderAt("/user-portal");

    expect((await screen.findByRole("alert")).textContent).toContain("We couldn't check your account");
  });

  it("lets an admin open every portal", async () => {
    api.GET.mockResolvedValue(me("admin"));
    const router = renderAt("/publisher-portal");
    expect(await screen.findByText("Publisher portal")).toBeTruthy();

    await act(() => router.navigate("/user-portal"));
    expect(screen.getByText("User portal")).toBeTruthy();

    await act(() => router.navigate("/admin-portal"));
    expect(screen.getByText("Admin portal")).toBeTruthy();
  });

  it("keeps a non-admin out of the admin portal", async () => {
    api.GET.mockResolvedValue(me("publisher"));
    const router = renderAt("/admin-portal");

    expect(await screen.findByText("Publisher portal")).toBeTruthy();
    expect(router.state.location.pathname).toBe("/publisher-portal");
  });

  it("looks the role up once while moving between signed-in pages", async () => {
    api.GET.mockResolvedValue(me("admin"));
    const router = renderAt("/user-portal");
    expect(await screen.findByText("User portal")).toBeTruthy();

    // Within a role group and across groups.
    await act(() => router.navigate("/saved-articles"));
    expect(screen.getByText("Saved articles")).toBeTruthy();
    await act(() => router.navigate("/publisher-portal"));
    expect(screen.getByText("Publisher portal")).toBeTruthy();

    expect(api.GET).toHaveBeenCalledTimes(1);
  });

  it("looks the role up again when a different user signs in", async () => {
    api.GET.mockResolvedValueOnce(me("reader")).mockResolvedValueOnce(me("publisher"));
    const router = renderAt("/user-portal");
    expect(await screen.findByText("User portal")).toBeTruthy();

    act(() => authStore.set({ userId: "user_2" }));

    // The new user is a publisher, so the reader page sends them to their portal.
    expect(await screen.findByText("Publisher portal")).toBeTruthy();
    expect(router.state.location.pathname).toBe("/publisher-portal");
    expect(api.GET).toHaveBeenCalledTimes(2);
  });
});
