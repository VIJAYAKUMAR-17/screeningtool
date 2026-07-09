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
      <ClerkProvider
        publishableKey={clerkPublishableKey}
        appearance={{
          variables: {
            colorPrimary: "#0f5f55",
            colorText: "#10211e",
            colorTextSecondary: "#5b6a65",
            colorBackground: "#fbfcf8",
            colorInputBackground: "#ffffff",
            colorInputText: "#10211e",
            borderRadius: "8px",
            fontFamily: "Aptos, IBM Plex Sans, Segoe UI, sans-serif",
          },
          elements: {
            card: {
              border: "1px solid rgba(16,33,30,0.13)",
              borderRadius: "8px",
              boxShadow: "0 30px 90px rgba(49,65,60,0.16)",
            },
            formButtonPrimary: {
              background: "linear-gradient(135deg, #0f5f55 0%, #0a3d38 100%)",
              boxShadow: "none",
              fontWeight: "800",
              textTransform: "none",
            },
            formFieldInput: {
              borderRadius: "8px",
            },
            footerActionLink: {
              color: "#0f5f55",
              fontWeight: "800",
            },
            headerTitle: {
              fontWeight: "850",
              letterSpacing: "0",
            },
            socialButtonsBlockButton: {
              borderRadius: "8px",
            },
          },
        }}
      >
        <Providers>
          <App />
        </Providers>
      </ClerkProvider>
    ) : (
      <MissingClerkConfig />
    )}
  </React.StrictMode>,
);
