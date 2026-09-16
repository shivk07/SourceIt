import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { ShieldCheck, ArrowLeft, Check, X } from "lucide-react";
import { toast } from "sonner";
import { useApiClient } from "../lib/apiClient";
import type { components } from "@sourceit/shared/client";

type Publisher = components["schemas"]["Publisher"];
type Reviewer = components["schemas"]["Reviewer"];

export default function AdminPortal() {
  const navigate = useNavigate();
  const api = useApiClient();
  const [meError, setMeError] = useState<string | null>(null);
  const [publishers, setPublishers] = useState<Publisher[] | null>(null);
  const [reviewers, setReviewers] = useState<Reviewer[] | null>(null);

  useEffect(() => {
    api.GET("/me").then(({ data, error }) => {
      if (error || !data) {
        setMeError("Signed in, but no SourceIt account exists for this session yet");
        return;
      }
      if (data.account.role !== "admin") {
        setMeError("This account doesn't have admin access");
      }
    });
  }, [api]);

  useEffect(() => {
    api.GET("/publishers/pending-verification").then(({ data }) => {
      if (data) setPublishers(data.items);
    });
    api.GET("/reviewers/pending").then(({ data }) => {
      if (data) setReviewers(data.items);
    });
  }, [api]);

  async function decidePublisher(publisherId: string, decision: "verified" | "rejected") {
    const { data, error } = await api.POST("/publishers/{publisherId}/verification", {
      params: { path: { publisherId } },
      body: { decision },
    });
    if (error || !data) {
      toast.error("Could not record that decision");
      return;
    }
    toast.success(decision === "verified" ? "Publisher verified" : "Publisher rejected");
    setPublishers((prev) => prev?.filter((p) => p.id !== publisherId) ?? null);
  }

  async function decideReviewer(reviewerId: string, decision: "approved" | "rejected") {
    const { data, error } = await api.POST("/reviewers/{reviewerId}/decision", {
      params: { path: { reviewerId } },
      body: { decision },
    });
    if (error || !data) {
      toast.error("Could not record that decision");
      return;
    }
    toast.success(decision === "approved" ? "Reviewer approved" : "Reviewer rejected");
    setReviewers((prev) => prev?.filter((r) => r.id !== reviewerId) ?? null);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50 to-blue-50 p-4 sm:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <Button variant="outline" onClick={() => navigate("/")} className="mb-2">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Login
        </Button>

        <Card className="shadow-xl">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-3 bg-indigo-100 rounded-lg">
                <ShieldCheck className="w-6 h-6 text-indigo-600" />
              </div>
              <div>
                <CardTitle className="text-2xl">Admin</CardTitle>
                <CardDescription>Publisher verification and reviewer approval queues</CardDescription>
              </div>
            </div>
          </CardHeader>
          {meError && (
            <CardContent>
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {meError}
              </div>
            </CardContent>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Publisher Verification Queue</CardTitle>
          </CardHeader>
          <CardContent>
            {publishers === null ? (
              <p className="text-sm text-slate-500 py-6 text-center">Loading…</p>
            ) : publishers.length === 0 ? (
              <p className="text-sm text-slate-500 py-6 text-center">No publishers awaiting a decision.</p>
            ) : (
              <div className="space-y-3">
                {publishers.map((publisher) => (
                  <div
                    key={publisher.id}
                    className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 p-4"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-slate-900 text-sm truncate">{publisher.displayName}</p>
                        <Badge variant="outline" className="text-xs">
                          {publisher.verificationStatus}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-500 truncate">{publisher.website}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button size="sm" onClick={() => void decidePublisher(publisher.id, "verified")}>
                        <Check className="w-4 h-4 mr-1" />
                        Verify
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void decidePublisher(publisher.id, "rejected")}
                      >
                        <X className="w-4 h-4 mr-1" />
                        Reject
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Reviewer Approval Queue</CardTitle>
          </CardHeader>
          <CardContent>
            {reviewers === null ? (
              <p className="text-sm text-slate-500 py-6 text-center">Loading…</p>
            ) : reviewers.length === 0 ? (
              <p className="text-sm text-slate-500 py-6 text-center">No reviewers awaiting a decision.</p>
            ) : (
              <div className="space-y-3">
                {reviewers.map((reviewer) => (
                  <div
                    key={reviewer.id}
                    className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 p-4"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900 text-sm truncate">{reviewer.affiliation}</p>
                      <p className="text-xs text-slate-500 truncate">{reviewer.expertise}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button size="sm" onClick={() => void decideReviewer(reviewer.id, "approved")}>
                        <Check className="w-4 h-4 mr-1" />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void decideReviewer(reviewer.id, "rejected")}
                      >
                        <X className="w-4 h-4 mr-1" />
                        Reject
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
