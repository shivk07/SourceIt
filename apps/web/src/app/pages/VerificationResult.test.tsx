import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import type { components } from "@sourceit/shared/client";
import VerificationResult from "./VerificationResult";

type VerificationResultData = components["schemas"]["VerificationResult"];

const get = vi.hoisted(() => vi.fn());

vi.mock("../lib/apiClient", () => ({ publicApiClient: { GET: get } }));
// The sidebar needs Clerk; it isn't what's under test here.
vi.mock("../components/user/UserSidebar", () => ({ default: () => null }));
// Stand-in panel that shows which data it was given, so the test can tell
// real fetched data apart from the panels' built-in mock fallback.
vi.mock("../components/verification/TrustSummaryCard", () => ({
  default: ({ result }: { result: VerificationResultData | null }) => (
    <p>{result ? `Summary for ${result.currentVersion.headline}` : "Mock summary"}</p>
  ),
}));

function article(headline: string) {
  // Only the fields the page itself reads; the panels are stubbed or tolerate nulls.
  return {
    currentVersion: { headline, previousHash: null },
    versionHistory: [],
    evidence: [],
    reviews: [],
    publisher: null,
    anchorRecord: null,
  } as unknown as VerificationResultData;
}

const ok = (data: VerificationResultData) => ({ data, error: undefined, response: new Response(null, { status: 200 }) });
const failed = (status: number) => ({
  data: undefined,
  error: { trustStatus: "notfound" },
  response: new Response(null, { status }),
});

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: "/verification-result", Component: VerificationResult },
      { path: "/verification-result/:articleId", Component: VerificationResult },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

afterEach(() => {
  cleanup();
  get.mockReset();
});

describe("VerificationResult", () => {
  it("shows a loading state, not the mock article, while the request is in flight", () => {
    get.mockReturnValue(new Promise(() => {}));
    renderAt("/verification-result/a1");

    expect(screen.getByRole("status", { name: "Loading verification" })).toBeTruthy();
    expect(screen.getByText("Loading…")).toBeTruthy();
    expect(screen.queryByText("Mock summary")).toBeNull();
  });

  it("shows the fetched article once it loads", async () => {
    get.mockResolvedValue(ok(article("Real headline")));
    renderAt("/verification-result/a1");

    expect(await screen.findByText("Summary for Real headline")).toBeTruthy();
    expect(get).toHaveBeenCalledWith(
      "/articles/{articleId}/verification",
      expect.objectContaining({ params: { path: { articleId: "a1" } } }),
    );
  });

  it("shows a not-found state for a 404", async () => {
    get.mockResolvedValue(failed(404));
    renderAt("/verification-result/missing");

    expect(await screen.findByText("This article is not registered in SourceIt's verification system")).toBeTruthy();
    expect(screen.getByText("Article not found")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("shows an error state for a server error, and Try again refetches", async () => {
    get.mockResolvedValueOnce(failed(500)).mockResolvedValueOnce(ok(article("Second try")));
    renderAt("/verification-result/a1");

    expect((await screen.findByRole("alert")).textContent).toContain("We couldn't load this verification");

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("Summary for Second try")).toBeTruthy();
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("shows the error state when the request fails outright (e.g. offline)", async () => {
    get.mockRejectedValue(new TypeError("Failed to fetch"));
    renderAt("/verification-result/a1");

    expect((await screen.findByRole("alert")).textContent).toContain("We couldn't load this verification");
  });

  it("cancels the old request when the article changes, and ignores its late response", async () => {
    const first = deferred<ReturnType<typeof ok>>();
    const second = deferred<ReturnType<typeof ok>>();
    get.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    const router = renderAt("/verification-result/a1");
    await act(() => router.navigate("/verification-result/a2"));

    const firstSignal: AbortSignal = get.mock.calls[0]![1].signal;
    const secondSignal: AbortSignal = get.mock.calls[1]![1].signal;
    expect(firstSignal.aborted).toBe(true);
    expect(secondSignal.aborted).toBe(false);

    // The second article arrives, then the stale first response lands late.
    await act(async () => second.resolve(ok(article("Article two"))));
    await act(async () => first.resolve(ok(article("Article one"))));

    expect(screen.getByText("Summary for Article two")).toBeTruthy();
    expect(screen.queryByText("Summary for Article one")).toBeNull();
  });

  it("cancels the request when the page is left", () => {
    get.mockReturnValue(new Promise(() => {}));
    renderAt("/verification-result/a1");
    const signal: AbortSignal = get.mock.calls[0]![1].signal;

    cleanup();

    expect(signal.aborted).toBe(true);
  });

  it("does not fetch, and shows the mock, without an article id", () => {
    renderAt("/verification-result");

    expect(get).not.toHaveBeenCalled();
    expect(screen.getByText("Mock summary")).toBeTruthy();
  });
});
