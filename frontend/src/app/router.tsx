import { Navigate, createBrowserRouter } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { BulkScreeningPage } from "@/features/bulk/BulkScreeningPage";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { ResultsPage } from "@/features/results/ResultsPage";
import { ScreeningPage } from "@/features/screening/ScreeningPage";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { TermsOfServicePage } from "@/features/legal/TermsOfServicePage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: "/dashboard", element: <DashboardPage /> },
      { path: "/screening", element: <ScreeningPage /> },
      { path: "/bulk-screening", element: <BulkScreeningPage /> },
      { path: "/results", element: <ResultsPage /> },
      { path: "/settings", element: <SettingsPage /> },
      { path: "/terms", element: <TermsOfServicePage /> },
    ],
  },
]);
