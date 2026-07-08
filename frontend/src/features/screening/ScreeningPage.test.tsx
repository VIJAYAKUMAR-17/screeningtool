import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { ScreeningPage } from "./ScreeningPage";
import { renderWithProviders } from "@/test/renderWithProviders";

vi.mock("@/services/api", () => ({
  api: {
    screenEntities: vi.fn(),
    downloadReport: vi.fn(),
  },
}));

import { api } from "@/services/api";

describe("ScreeningPage", () => {
  it("validates required fields", async () => {
    renderWithProviders(<ScreeningPage />);
    await userEvent.click(screen.getByRole("button", { name: /screen all/i }));
    expect(await screen.findByText(/customer name is required/i)).toBeInTheDocument();
  });

  it("runs screening and renders result details", async () => {
    vi.mocked(api.screenEntities).mockResolvedValueOnce({
      runId: 11,
      elapsedSeconds: 0.7,
      summary: { flagged: 1, reviewNeeded: 0, clear: 0, total: 1 },
      results: [
        {
          queriedName: "AERO ENGINE CORPORATION OF CHINA",
          status: "flagged",
          matchScore: 100,
          ofacSource: "OFAC",
          ofacProgram: "NS-CMIC",
          remarks: "Matched entity",
          timestamp: "2026-06-20T12:00:00Z",
          matchedName: "AERO ENGINE CORPORATION OF CHINA",
          matchType: "exact",
          rawMatchData: { key: "value" },
        },
      ],
    });

    renderWithProviders(<ScreeningPage />);
    await userEvent.type(screen.getByLabelText(/customer name/i), "Demo Co");
    await userEvent.type(screen.getByLabelText(/company\/vendor 1/i), "AERO ENGINE CORPORATION OF CHINA");
    await userEvent.click(screen.getByRole("button", { name: /screen all/i }));

    await waitFor(() => expect(api.screenEntities).toHaveBeenCalled());
    expect(await screen.findByText(/run 11 completed/i)).toBeInTheDocument();
    expect(screen.getAllByText(/AERO ENGINE CORPORATION OF CHINA/).length).toBeGreaterThan(0);
  });

  it("adds another entry row", async () => {
    renderWithProviders(<ScreeningPage />);
    await userEvent.click(screen.getByRole("button", { name: /add another name/i }));
    expect(screen.getByLabelText(/company\/vendor 2/i)).toBeInTheDocument();
  });
});
