import React from "react";
import ReactDOM from "react-dom/client";
import { ClerkProvider } from "@clerk/react";
import App from "./App";
import { Providers } from "@/app/Providers";
import "./styles.css";

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

function MissingClerkConfig() {
  return (
    <div className="auth-config-error">
      <h1>Authentication is not configured</h1>
      <p>Set VITE_CLERK_PUBLISHABLE_KEY in frontend/.env and restart the dev server.</p>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {clerkPublishableKey ? (
      <ClerkProvider publishableKey={clerkPublishableKey}>
        <Providers>
          <App />
        </Providers>
      </ClerkProvider>
    ) : (
      <MissingClerkConfig />
    )}
  </React.StrictMode>,
);
