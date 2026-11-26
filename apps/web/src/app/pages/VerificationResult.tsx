import { useEffect, useState } from "react";
import { ArrowLeft, Bookmark, Share2, AlertCircle, Menu, SearchX } from "lucide-react";
import { Button } from "../components/ui/button";
import { Skeleton } from "../components/ui/skeleton";
import UserSidebar from "../components/user/UserSidebar";
import TrustSummaryCard from "../components/verification/TrustSummaryCard";
import VersionHistory from "../components/verification/VersionHistory";
import ComparisonSection from "../components/verification/ComparisonSection";
import EvidenceSection from "../components/verification/EvidenceSection";
import PublisherCredibility from "../components/verification/PublisherCredibility";
import ReviewerNotes from "../components/verification/ReviewerNotes";
import IntegrityRecord from "../components/verification/IntegrityRecord";
import { useNavigate, useParams } from "react-router";
import { publicApiClient } from "../lib/apiClient";
import type { components } from "@sourceit/shared/client";

type VerificationResultData = components["schemas"]["VerificationResult"];

type LoadState =
  | { status: "loading" }
  | { status: "loaded"; result: VerificationResultData }
  | { status: "notfound" }
  | { status: "error" };

// One composed call — GET /articles/{id}/verification returns the article, its
// current version + full history, evidence, reviewer notes, the publisher (with
// the derived credibility score / transparency level), the anchor record, any
// redaction tombstone, the 6-value TrustStatus, and the "why this result" facts.
// Every panel below is fed from it; with no articleId in the URL each panel
// falls back to its own mock.
export default function VerificationResult() {
  const navigate = useNavigate();
  const { articleId } = useParams();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  // Bumped by the error state's "Try again" button to re-run the fetch.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!articleId) return;
    // Aborting on cleanup cancels the in-flight request when the id changes
    // (or the page unmounts), so a slow earlier response can never overwrite
    // the article the user is now looking at.
    const controller = new AbortController();
    setLoad({ status: "loading" });

    publicApiClient
      .GET("/articles/{articleId}/verification", {
        params: { path: { articleId } },
        signal: controller.signal,
      })
      .then(({ data, response }) => {
        if (controller.signal.aborted) return;
        if (data) setLoad({ status: "loaded", result: data });
        else if (response.status === 404) setLoad({ status: "notfound" });
        else setLoad({ status: "error" });
      })
      .catch(() => {
        // A cancelled request rejects too; that's expected, not a failure.
        if (!controller.signal.aborted) setLoad({ status: "error" });
      });

    return () => controller.abort();
  }, [articleId, attempt]);

  const result = articleId && load.status === "loaded" ? load.result : null;

  const subtitle = !articleId
    ? "Climate Change Impact on Global Agriculture"
    : load.status === "loaded"
      ? load.result.currentVersion.headline
      : load.status === "loading"
        ? "Loading…"
        : load.status === "notfound"
          ? "Article not found"
          : "Couldn't load verification";

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Sidebar */}
      <UserSidebar
        activeTab="verify"
        isCollapsed={isSidebarCollapsed}
        onToggle={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        isMobileOpen={isMobileMenuOpen}
        onMobileToggle={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-screen w-full lg:w-auto">
        {/* Top Bar */}
        <header className="bg-white border-b border-slate-200 px-4 sm:px-6 lg:px-8 py-4 sticky top-0 z-30">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
              {/* Mobile Menu Button */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="lg:hidden flex-shrink-0"
              >
                <Menu className="w-6 h-6" />
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/user-portal")}
                className="flex-shrink-0"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div className="min-w-0 flex-1">
                <h2 className="text-base sm:text-lg lg:text-xl font-bold text-slate-900 truncate">
                  Verification Result
                </h2>
                <p className="text-xs sm:text-sm text-slate-600 truncate">
                  {subtitle}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button variant="outline" size="sm" className="hidden sm:flex">
                <Bookmark className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Save</span>
              </Button>
              <Button variant="outline" size="sm" className="hidden sm:flex">
                <Share2 className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Share</span>
              </Button>
              {/* Mobile action buttons */}
              <Button variant="outline" size="sm" className="sm:hidden">
                <Bookmark className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm" className="sm:hidden">
                <Share2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6">
          {articleId && load.status === "loading" ? (
            <div role="status" aria-label="Loading verification" className="space-y-6">
              <Skeleton className="h-48 w-full" />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Skeleton className="h-64 w-full" />
                <Skeleton className="h-64 w-full" />
              </div>
              <Skeleton className="h-40 w-full" />
            </div>
          ) : articleId && load.status === "notfound" ? (
            <div className="rounded-lg border-2 border-dashed border-slate-300 bg-white p-12 text-center">
              <SearchX className="w-10 h-10 text-slate-400 mx-auto mb-3" />
              <p className="text-slate-900 font-medium">
                This article is not registered in SourceIt's verification system
              </p>
              <p className="text-sm text-slate-600 mt-1">Check the link or article ID and try again.</p>
            </div>
          ) : articleId && load.status === "error" ? (
            <div role="alert" className="rounded-lg border-2 border-dashed border-red-200 bg-white p-12 text-center">
              <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
              <p className="text-slate-900 font-medium">We couldn't load this verification</p>
              <p className="text-sm text-slate-600 mt-1">Something went wrong on our side or with your connection.</p>
              <Button variant="outline" className="mt-4" onClick={() => setAttempt((n) => n + 1)}>
                Try again
              </Button>
            </div>
          ) : (
            <>
              {/* Trust Summary */}
              <TrustSummaryCard result={articleId ? result : null} />

              {/* Publisher Credibility & Evidence - Responsive Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <PublisherCredibility publisher={articleId ? result?.publisher ?? null : null} />
                <EvidenceSection evidence={articleId ? result?.evidence ?? null : null} />
              </div>

              {/* Version History */}
              <VersionHistory versions={articleId ? (result?.versionHistory ?? []) : null} />

              {/* Comparison Section */}
              <ComparisonSection />

              {/* Reviewer Notes */}
              <ReviewerNotes reviews={articleId ? result?.reviews ?? null : null} />

              {/* Blockchain Integrity Record */}
              <IntegrityRecord
                anchor={articleId ? result?.anchorRecord ?? null : null}
                versionCount={result?.versionHistory.length ?? 0}
                previousHash={result?.currentVersion.previousHash ?? null}
              />
            </>
          )}
        </main>
      </div>
    </div>
  );
}
