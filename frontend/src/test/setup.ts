import "@testing-library/jest-dom/vitest";
import React from "react";
import { vi } from "vitest";

vi.mock("@clerk/react", () => {
  const passthrough = ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children);

  return {
    ClerkProvider: passthrough,
    SignedIn: passthrough,
    SignedOut: () => null,
    SignInButton: passthrough,
    SignUpButton: passthrough,
    OrganizationSwitcher: () => React.createElement("div", { "data-testid": "organization-switcher" }),
    UserButton: () => React.createElement("div", { "data-testid": "user-button" }),
    useAuth: () => ({
      getToken: async () => "test-token",
      has: () => true,
      isLoaded: true,
      isSignedIn: true,
      orgId: "org_test",
      orgPermissions: [],
      orgRole: "org:admin",
      userId: "user_test",
    }),
    useOrganization: () => ({
      isLoaded: true,
      organization: { id: "org_test", name: "Test Org" },
    }),
  };
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// @ts-expect-error jsdom polyfill
window.ResizeObserver = ResizeObserverMock;
