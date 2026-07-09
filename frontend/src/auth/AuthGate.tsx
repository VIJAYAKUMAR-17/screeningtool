import {
  OrganizationSwitcher,
  SignInButton,
  SignUpButton,
  useAuth,
} from "@clerk/react";
import { Box, Button, CircularProgress, Paper, Stack, Typography } from "@mui/material";
import { useQueryClient } from "@tanstack/react-query";
import { ReactNode, useEffect, useRef } from "react";
import { setAuthTokenProvider } from "./authToken";
import { resetTenantScopedClientState } from "./tenantState";

function AuthLoading() {
  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        bgcolor: "background.default",
      }}
    >
      <CircularProgress />
    </Box>
  );
}

function SignedOutScreen() {
  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        bgcolor: "background.default",
        px: 2,
      }}
    >
      <Paper
        elevation={0}
        sx={{
          width: "100%",
          maxWidth: 420,
          border: 1,
          borderColor: "divider",
          borderRadius: 2,
          p: { xs: 3, sm: 4 },
        }}
      >
        <Stack spacing={2.5}>
          <Box>
            <Typography variant="h4" fontWeight={800} gutterBottom>
              Screening Tool
            </Typography>
            <Typography color="text.secondary">
              Sign in with your organization account.
            </Typography>
          </Box>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <SignInButton mode="modal">
              <Button variant="contained" size="large" fullWidth>
                Sign In
              </Button>
            </SignInButton>
            <SignUpButton mode="modal">
              <Button variant="outlined" size="large" fullWidth>
                Create Account
              </Button>
            </SignUpButton>
          </Stack>
        </Stack>
      </Paper>
    </Box>
  );
}

function TenantRequiredScreen() {
  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        bgcolor: "background.default",
        px: 2,
      }}
    >
      <Paper
        elevation={0}
        sx={{
          width: "100%",
          maxWidth: 460,
          border: 1,
          borderColor: "divider",
          borderRadius: 2,
          p: { xs: 3, sm: 4 },
        }}
      >
        <Stack spacing={2.5}>
          <Box>
            <Typography variant="h5" fontWeight={800} gutterBottom>
              Select Organization
            </Typography>
            <Typography color="text.secondary">
              Choose or create a tenant before opening the workspace.
            </Typography>
          </Box>
          <Box>
            <OrganizationSwitcher hidePersonal />
          </Box>
        </Stack>
      </Paper>
    </Box>
  );
}

function AuthenticatedTenant({ children }: { children: ReactNode }) {
  const { getToken, isLoaded, orgId, userId } = useAuth();
  const queryClient = useQueryClient();
  const previousTenantKey = useRef<string | null>(null);

  useEffect(() => {
    setAuthTokenProvider(() => getToken());
    return () => setAuthTokenProvider(null);
  }, [getToken]);

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    const tenantKey = `${userId ?? "anonymous"}:${orgId ?? "no-org"}`;
    if (previousTenantKey.current && previousTenantKey.current !== tenantKey) {
      queryClient.clear();
      resetTenantScopedClientState();
    }
    previousTenantKey.current = tenantKey;
  }, [isLoaded, orgId, queryClient, userId]);

  if (!isLoaded) {
    return <AuthLoading />;
  }

  if (!orgId) {
    return <TenantRequiredScreen />;
  }

  return <>{children}</>;
}

export function AuthGate({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return <AuthLoading />;
  }

  if (!isSignedIn) {
    return <SignedOutScreen />;
  }

  return <AuthenticatedTenant>{children}</AuthenticatedTenant>;
}
