import { createBrowserRouter, type RouteObject } from "react-router";
import AuthPage from "./pages/AuthPage";
import SimpleAuth from "./pages/SimpleAuth";
import ReaderPortal from "./pages/ReaderPortal";
import PublisherPortal from "./pages/PublisherPortal";
import ReviewerPortal from "./pages/ReviewerPortal";
import ArticleEditHistory from "./pages/ArticleEditHistory";
import UserPortal from "./pages/UserPortal";
import VerificationResult from "./pages/VerificationResult";
import SavedArticles from "./pages/SavedArticles";
import AdminPortal from "./pages/AdminPortal";
import RequireAuth, { RequireRole } from "./components/auth/RequireAuth";

export const routes: RouteObject[] = [
  {
    path: "/",
    Component: AuthPage,
  },
  {
    path: "/simple-login",
    Component: SimpleAuth,
  },
  {
    path: "/reader-portal",
    Component: ReaderPortal,
  },
  {
    // Kept param-less for the existing mock entry points (VerificationHero's
    // search/scan tabs, RecentlyVerified, SavedArticles) — none of them have a
    // real article id to navigate with, since there's no backend search
    // endpoint yet (only exact-id lookup). VerificationResult renders the
    // static mock when no id is present, and real fetched data when one is.
    path: "/verification-result",
    Component: VerificationResult,
  },
  {
    path: "/verification-result/:articleId",
    Component: VerificationResult,
  },
  // Signed-in-only pages. RequireAuth sends the user back to "/" when there is
  // no session (including when one expires while they're on the page) and
  // looks their role up once for every page below. Each RequireRole group is
  // open to its own role plus admins; anyone else goes to their own portal.
  {
    Component: RequireAuth,
    children: [
      {
        element: <RequireRole roles={["reader"]} />,
        children: [
          {
            path: "/user-portal",
            Component: UserPortal,
          },
          {
            path: "/saved-articles",
            Component: SavedArticles,
          },
        ],
      },
      {
        element: <RequireRole roles={["publisher"]} />,
        children: [
          {
            path: "/publisher-portal",
            Component: PublisherPortal,
          },
          {
            path: "/article-edit-history",
            Component: ArticleEditHistory,
          },
        ],
      },
      {
        element: <RequireRole roles={["reviewer"]} />,
        children: [
          {
            path: "/reviewer-portal",
            Component: ReviewerPortal,
          },
        ],
      },
      {
        element: <RequireRole roles={["admin"]} />,
        children: [
          {
            path: "/admin-portal",
            Component: AdminPortal,
          },
        ],
      },
    ],
  },
];

export const router = createBrowserRouter(routes);
