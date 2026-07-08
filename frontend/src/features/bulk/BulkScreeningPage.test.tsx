import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { BulkScreeningPage } from "./BulkScreeningPage";
import { renderWithProviders } from "@/test/renderWithProviders";

vi.mock("@/services/api", () => ({
  api: {
    bulkScreen: vi.fn().mockResolvedValue({
      runId: 1,
      elapsedSeconds: 1,
      summary: { flagged: 1, reviewNeeded: 0, clear: 1, total: 2 },
      results: [
        { queriedName: "Acme", status: "flagged", matchScore: 90, ofacSource: "OFAC", ofacProgram: null, remarks: null, timestamp: "2026-06-20" },
        { queriedName: "Globex", status: "clear", matchScore: null, ofacSource: "OFAC", ofacProgram: null, remarks: null, timestamp: "2026-06-20" },
      ],
    }),
  },
}));

describe("BulkScreeningPage", () => {
  it("loads csv file and starts bulk screening", async () => {
    renderWithProviders(<BulkScreeningPage />);
    const input = screen.getByLabelText(/upload csv/i).closest("label")!.querySelector("input[type='file']") as HTMLInputElement;

    const csv = "companyName,country,identifier\nAcme,US,1\nGlobex,IN,2";
    const file = new File([csv], "entities.csv", { type: "text/csv" });
    await userEvent.upload(input, file);

    expect(await screen.findByText(/records: 2/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /screen all uploaded entities/i }));
    await waitFor(() => expect(screen.getByText(/matches found: 1/i)).toBeInTheDocument());
    expect(screen.getByText(/screening outcomes/i)).toBeInTheDocument();
    expect(screen.getByText(/match found/i)).toBeInTheDocument();
  });

  it("accepts BOM and spaced header variants", async () => {
    renderWithProviders(<BulkScreeningPage />);
    const input = screen.getByLabelText(/upload csv/i).closest("label")!.querySelector("input[type='file']") as HTMLInputElement;

    const csv = "\uFEFFCompany/Vendor Name,Country,Identifier\nAcme LLC,US,US-123\nGlobex Ltd,IN,IN-456";
    const file = new File([csv], "entities-variant.csv", { type: "text/csv" });
    await userEvent.upload(input, file);

    expect(await screen.findByText(/records: 2/i)).toBeInTheDocument();
    expect(screen.getByText(/valid: 2/i)).toBeInTheDocument();
  });

  it("maps headerless CSV rows by column position", async () => {
    renderWithProviders(<BulkScreeningPage />);
    const input = screen.getByLabelText(/upload csv/i).closest("label")!.querySelector("input[type='file']") as HTMLInputElement;

    const csv = "36,ACME CORP,-0-,US,-0-\n173,GLOBEX LTD,-0-,IN,-0-";
    const file = new File([csv], "headerless.csv", { type: "text/csv" });
    await userEvent.upload(input, file);

    expect(await screen.findByText(/records: 2/i)).toBeInTheDocument();
    expect(screen.getByText(/valid: 2/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /screen all uploaded entities/i })).toBeEnabled();
  });
});
