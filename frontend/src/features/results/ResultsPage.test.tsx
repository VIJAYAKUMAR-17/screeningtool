import { screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { ResultsPage } from "./ResultsPage";
import { renderWithProviders } from "@/test/renderWithProviders";

vi.mock("@/services/api", () => ({
  api: {
    getScreeningRuns: vi.fn(),
    getRunDetails: vi.fn(),
    downloadReport: vi.fn(),
  },
}));

import { api } from "@/services/api";

describe("ResultsPage", () => {
  beforeEach(() => {
    vi.mocked(api.getScreeningRuns).mockResolvedValue([
      {
        runId: 10,
        customerName: "Acme",
        status: "complete",
        vendorsScreened: 4,
        flagged: 1,
        reviewNeeded: 1,
        clear: 2,
        elapsedSeconds: 2.3,
        startedAt: "2026-06-20T00:00:00Z",
      },
    ]);
  });

  it("renders screening history section", async () => {
    renderWithProviders(<ResultsPage />);
    expect(await screen.findByText(/screening history/i)).toBeInTheDocument();
    await waitFor(() => expect(api.getScreeningRuns).toHaveBeenCalled());
    expect(screen.getByPlaceholderText(/search by customer name/i)).toBeInTheDocument();
  });
});
