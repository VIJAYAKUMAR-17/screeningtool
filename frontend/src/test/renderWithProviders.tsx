import { ReactElement } from "react";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Providers } from "@/app/Providers";

export function renderWithProviders(ui: ReactElement) {
  return render(
    <MemoryRouter>
      <Providers>{ui}</Providers>
    </MemoryRouter>,
  );
}
