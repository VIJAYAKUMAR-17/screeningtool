import ApartmentOutlinedIcon from "@mui/icons-material/ApartmentOutlined";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import CheckCircleOutlineRoundedIcon from "@mui/icons-material/CheckCircleOutlineRounded";
import FactCheckOutlinedIcon from "@mui/icons-material/FactCheckOutlined";
import PersonAddAlt1OutlinedIcon from "@mui/icons-material/PersonAddAlt1Outlined";
import QueryStatsOutlinedIcon from "@mui/icons-material/QueryStatsOutlined";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Paper,
  Stack,
  Typography,
  useTheme,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import {
  OrganizationSwitcher,
  SignInButton,
  SignUpButton,
  useAuth,
} from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import { ReactNode, useEffect, useRef } from "react";
import { setAuthTokenProvider } from "./authToken";
import { resetTenantScopedClientState } from "./tenantState";

const customerLogos = ["KSSL", "Technocraft", "ERP Ops", "Trade Desk", "Audit Hub", "RiskOps"];
const navItems = ["Products", "Solutions", "Resources", "Pricing"];

function BrandMark({ size = 28 }: { size?: number }) {
  const theme = useTheme();

  return (
    <Box
      sx={{
        width: size,
        height: size,
        flex: "0 0 auto",
        display: "grid",
        placeItems: "center",
        borderRadius: "50%",
        color: "#fff",
        bgcolor: theme.palette.primary.main,
        boxShadow: `0 10px 24px ${alpha(theme.palette.primary.main, 0.24)}`,
      }}
    >
      <ShieldOutlinedIcon sx={{ fontSize: Math.max(16, Math.round(size * 0.58)) }} />
    </Box>
  );
}

function WaveField() {
  const theme = useTheme();
  const primary = theme.palette.mode === "light" ? "#0bbf89" : "#8bd3c7";
  const lime = theme.palette.mode === "light" ? "#a8ed5f" : "#d8ff9a";
  const cyan = theme.palette.mode === "light" ? "#49d3d1" : "#9ae8e4";

  return (
    <Box
      component="svg"
      viewBox="0 0 1200 620"
      preserveAspectRatio="none"
      aria-hidden="true"
      sx={{
        position: "absolute",
        inset: { xs: "240px -520px auto -210px", md: "86px -190px auto 31%" },
        width: { xs: 980, md: 1120 },
        height: { xs: 620, md: 680 },
        opacity: theme.palette.mode === "light" ? 0.66 : 0.38,
        pointerEvents: "none",
        zIndex: 0,
      }}
    >
      {Array.from({ length: 18 }).map((_, index) => {
        const offset = index * 15;
        const stroke = index % 3 === 0 ? lime : index % 3 === 1 ? primary : cyan;
        return (
          <path
            key={index}
            d={`M -60 ${490 - offset} C 230 ${360 - offset * 0.15}, 420 ${420 + offset * 0.45}, 620 ${255 - offset * 0.35} S 920 ${85 + offset * 0.2}, 1260 ${18 + offset * 1.2}`}
            fill="none"
            stroke={stroke}
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </Box>
  );
}

function ProductPreview() {
  const theme = useTheme();
  const gridColor = alpha(theme.palette.primary.main, theme.palette.mode === "light" ? 0.06 : 0.1);

  return (
    <Paper
      elevation={0}
      sx={{
        width: "100%",
        minWidth: 0,
        border: 1,
        borderColor: "divider",
        borderRadius: "10px",
        overflow: "hidden",
        bgcolor: alpha(theme.palette.background.paper, theme.palette.mode === "light" ? 0.9 : 0.82),
        boxShadow:
          theme.palette.mode === "light"
            ? `0 38px 120px ${alpha("#31524a", 0.16)}`
            : `0 38px 110px ${alpha("#000", 0.36)}`,
        backdropFilter: "blur(18px)",
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 2, py: 1.35, borderBottom: 1, borderColor: "divider" }}>
        <BrandMark size={20} />
        <Typography variant="subtitle2" sx={{ fontWeight: 850 }}>
          Screening Tool
        </Typography>
        <Stack direction="row" spacing={0.75} sx={{ ml: "auto" }}>
          <Chip label="API Reference" size="small" color="primary" />
          <Chip label="Runs" size="small" variant="outlined" />
          <Chip label="Reports" size="small" variant="outlined" />
        </Stack>
      </Stack>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "172px 1fr" }, minHeight: { xs: 390, sm: 430 } }}>
        <Box
          sx={{
            display: { xs: "none", sm: "block" },
            p: 1.6,
            borderRight: 1,
            borderColor: "divider",
            bgcolor: alpha(theme.palette.primary.main, theme.palette.mode === "light" ? 0.04 : 0.08),
          }}
        >
          {["Ask Assistant", "Screening", "Bulk Screening", "Results", "Settings", "Audit Logs"].map((item, index) => (
            <Stack
              key={item}
              direction="row"
              spacing={0.9}
              alignItems="center"
              sx={{
                px: 1,
                py: 0.85,
                mb: 0.5,
                borderRadius: "8px",
                color: index === 1 ? "primary.main" : "text.secondary",
                bgcolor: index === 1 ? alpha(theme.palette.primary.main, 0.1) : "transparent",
                fontWeight: 800,
              }}
            >
              {index === 1 ? <ShieldOutlinedIcon fontSize="small" /> : <FactCheckOutlinedIcon fontSize="small" />}
              <Typography variant="caption" sx={{ fontWeight: 800 }}>
                {item}
              </Typography>
            </Stack>
          ))}
        </Box>

        <Box
          sx={{
            p: { xs: 1.7, sm: 2.1 },
            backgroundImage: [
              `linear-gradient(${gridColor} 1px, transparent 1px)`,
              `linear-gradient(90deg, ${gridColor} 1px, transparent 1px)`,
            ].join(","),
            backgroundSize: "22px 22px",
          }}
        >
          <Stack direction={{ xs: "column", sm: "row" }} alignItems={{ xs: "flex-start", sm: "center" }} spacing={1.2} sx={{ mb: 2 }}>
            <Box>
              <Typography variant="caption" color="primary" sx={{ fontWeight: 850 }}>
                Getting Started
              </Typography>
              <Typography variant="h5" sx={{ mt: 0.35 }}>
                Quickstart Guide
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Start a compliant entity review in under five minutes.
              </Typography>
            </Box>
            <Paper
              elevation={0}
              sx={{
                ml: { sm: "auto" },
                display: "flex",
                alignItems: "center",
                gap: 1,
                minWidth: { xs: "100%", sm: 170 },
                px: 1.3,
                py: 0.9,
                border: 1,
                borderColor: "divider",
                bgcolor: alpha(theme.palette.background.paper, 0.82),
              }}
            >
              <SearchRoundedIcon fontSize="small" color="disabled" />
              <Typography variant="caption" color="text.secondary" noWrap>
                Search or ask
              </Typography>
            </Paper>
          </Stack>

          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)" }, gap: 1.2 }}>
            {[
              { title: "Quickstart", subtitle: "Run a single screening check", icon: <ShieldOutlinedIcon /> },
              { title: "Bulk Screening", subtitle: "Upload vendor lists safely", icon: <QueryStatsOutlinedIcon /> },
              { title: "Tier 2 Review", subtitle: "Open investigation details", icon: <FactCheckOutlinedIcon /> },
              { title: "Audit Export", subtitle: "Download PDF and Excel reports", icon: <CheckCircleOutlineRoundedIcon /> },
            ].map((card) => (
              <Paper
                key={card.title}
                elevation={0}
                sx={{
                  minHeight: 126,
                  p: 1.6,
                  border: 1,
                  borderColor: "divider",
                  borderRadius: "8px",
                  bgcolor: alpha(theme.palette.background.paper, theme.palette.mode === "light" ? 0.72 : 0.58),
                }}
              >
                <Box
                  sx={{
                    width: 42,
                    height: 42,
                    display: "grid",
                    placeItems: "center",
                    mb: 1.4,
                    borderRadius: "8px",
                    color: "primary.main",
                    bgcolor: alpha(theme.palette.primary.main, 0.1),
                  }}
                >
                  {card.icon}
                </Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 850 }}>
                  {card.title}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {card.subtitle}
                </Typography>
              </Paper>
            ))}
          </Box>
        </Box>
      </Box>
    </Paper>
  );
}

function LandingNav() {
  return (
    <Box
      component="header"
      sx={{
        height: 64,
        borderBottom: 1,
        borderColor: "divider",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        px: { xs: 1.5, md: 3 },
        bgcolor: "rgba(255,255,255,0.74)",
        backdropFilter: "blur(18px)",
        position: "relative",
        zIndex: 4,
      }}
    >
      <Stack direction="row" alignItems="center" sx={{ width: "min(1180px, 100%)" }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <BrandMark />
          <Typography variant="subtitle1" sx={{ fontWeight: 900 }}>
            Screening Tool
          </Typography>
        </Stack>

        <Stack
          direction="row"
          spacing={3}
          sx={{
            mx: "auto",
            display: { xs: "none", md: "flex" },
          }}
        >
          {navItems.map((item) => (
            <Typography key={item} variant="body2" sx={{ fontWeight: 800, color: "text.secondary" }}>
              {item}
            </Typography>
          ))}
        </Stack>

        <Stack direction="row" spacing={1} alignItems="center" sx={{ ml: "auto" }}>
          <SignInButton mode="modal">
            <Button variant="outlined" size="small" sx={{ display: { xs: "none", sm: "inline-flex" } }}>
              Sign in
            </Button>
          </SignInButton>
          <SignUpButton mode="modal">
            <Button variant="contained" size="small">
              Contact sales
            </Button>
          </SignUpButton>
        </Stack>
      </Stack>
    </Box>
  );
}

function LandingShell({ children }: { children: ReactNode }) {
  const theme = useTheme();

  return (
    <Box
      sx={{
        minHeight: "100vh",
        bgcolor: theme.palette.mode === "light" ? "#fbfcf8" : "background.default",
        color: "text.primary",
        overflow: "hidden",
      }}
    >
      <LandingNav />
      <Box sx={{ position: "relative" }}>
        <WaveField />
        {children}
      </Box>
    </Box>
  );
}

function LogoBand() {
  const theme = useTheme();

  return (
    <Box
      sx={{
        borderTop: 1,
        borderBottom: 1,
        borderColor: "divider",
        bgcolor: alpha(theme.palette.background.paper, 0.84),
        position: "relative",
        zIndex: 1,
      }}
    >
      <Box
        sx={{
          width: "min(1180px, 100%)",
          mx: "auto",
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "0.8fr 1.6fr" },
          borderLeft: { md: 1 },
          borderRight: { md: 1 },
          borderColor: "divider",
        }}
      >
        <Box sx={{ p: { xs: 3, md: 4 }, borderRight: { md: 1 }, borderColor: "divider" }}>
          <Typography variant="h5" sx={{ maxWidth: 310, lineHeight: 1.05 }}>
            Built for compliance teams moving fast.
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1.4, maxWidth: 300 }}>
            Screen vendors, export reports, and keep review evidence in one workspace.
          </Typography>
        </Box>
        <Box
          sx={{
            p: { xs: 2, md: 3 },
            display: "grid",
            gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(3, 1fr)" },
            gap: 1.2,
          }}
        >
          {customerLogos.map((logo) => (
            <Paper
              key={logo}
              elevation={0}
              sx={{
                minHeight: 82,
                display: "grid",
                placeItems: "center",
                border: 1,
                borderColor: "divider",
                borderRadius: "8px",
                bgcolor: alpha(theme.palette.background.paper, 0.7),
              }}
            >
              <Typography variant="subtitle2" sx={{ fontWeight: 900 }}>
                {logo}
              </Typography>
            </Paper>
          ))}
        </Box>
      </Box>
    </Box>
  );
}

function UpdateBand() {
  const updates = [
    {
      tag: "Screening",
      title: "Tier 1 and Tier 2 checks now run together",
      date: "Jul 2026",
      accent: "#0f5f55",
    },
    {
      tag: "Reports",
      title: "Audit-ready PDF and Excel exports",
      date: "Jul 2026",
      accent: "#101a18",
    },
    {
      tag: "Review",
      title: "Structured investigation details per entity",
      date: "Jul 2026",
      accent: "#0b6b4f",
    },
  ];

  return (
    <Box sx={{ width: "min(1180px, 100%)", mx: "auto", py: { xs: 5, md: 7 }, px: { xs: 1.5, md: 0 } }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2.5 }}>
        <Typography variant="h4">Latest updates</Typography>
        <Button variant="contained" size="small" endIcon={<ArrowForwardRoundedIcon />}>
          All posts
        </Button>
      </Stack>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" }, gap: 1.6 }}>
        {updates.map((update) => (
          <Box key={update.title}>
            <Paper
              elevation={0}
              sx={{
                height: 210,
                border: 1,
                borderColor: "divider",
                borderRadius: "10px",
                overflow: "hidden",
                position: "relative",
                bgcolor: update.accent,
                backgroundImage: [
                  `linear-gradient(${alpha("#ffffff", 0.08)} 1px, transparent 1px)`,
                  `linear-gradient(90deg, ${alpha("#ffffff", 0.08)} 1px, transparent 1px)`,
                ].join(","),
                backgroundSize: "22px 22px",
                "&:before": {
                  content: '""',
                  position: "absolute",
                  inset: 0,
                  background:
                    update.tag === "Reports"
                      ? "linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))"
                      : "linear-gradient(135deg, rgba(172,245,121,0.42), rgba(73,211,209,0.08))",
                },
              }}
            >
              <Typography
                sx={{
                  position: "absolute",
                  right: 20,
                  bottom: 18,
                  color: "#fff",
                  fontSize: update.tag === "Reports" ? 58 : 40,
                  fontWeight: 900,
                  lineHeight: 0.9,
                }}
              >
                {update.tag === "Reports" ? "PDF" : update.tag === "Review" ? "T2" : "T1"}
              </Typography>
            </Paper>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1.4, mb: 0.8 }}>
              <Chip label={update.tag} size="small" />
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800 }}>
                {update.date}
              </Typography>
            </Stack>
            <Typography variant="subtitle2" sx={{ fontWeight: 850, lineHeight: 1.35 }}>
              {update.title}
            </Typography>
          </Box>
        ))}
      </Box>
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={2}
        alignItems={{ xs: "flex-start", md: "center" }}
        justifyContent="space-between"
        sx={{
          mt: { xs: 6, md: 8 },
          py: 3,
          borderTop: 1,
          borderBottom: 1,
          borderColor: "divider",
          position: "relative",
        }}
      >
        <Typography variant="h4" sx={{ fontSize: { xs: "1.7rem", md: "2rem" } }}>
          The screening platform built for serious review teams
        </Typography>
        <Stack direction="row" spacing={1}>
          <SignUpButton mode="modal">
            <Button variant="outlined">Talk to sales</Button>
          </SignUpButton>
          <SignInButton mode="modal">
            <Button variant="contained" endIcon={<ArrowForwardRoundedIcon />}>
              Get started
            </Button>
          </SignInButton>
        </Stack>
      </Stack>
    </Box>
  );
}

function SignedOutScreen() {
  return (
    <LandingShell>
      <Box
        component="main"
        sx={{
          width: "min(1180px, 100%)",
          mx: "auto",
          position: "relative",
          zIndex: 1,
          display: "grid",
          gridTemplateColumns: { xs: "1fr", lg: "0.82fr 1.18fr" },
          gap: { xs: 4, lg: 5 },
          alignItems: "center",
          minHeight: { xs: "auto", lg: "700px" },
          px: { xs: 1.5, md: 0 },
          pt: { xs: 7, md: 9 },
          pb: { xs: 5, md: 8 },
        }}
      >
        <Stack spacing={2.4} sx={{ maxWidth: 520 }}>
          <Chip
            label="Entity risk - live review"
            size="small"
            color="primary"
            variant="outlined"
            sx={{ width: "fit-content", bgcolor: "background.paper" }}
          />
          <Typography
            component="h1"
            sx={{
              fontSize: { xs: "2.72rem", sm: "3.8rem", lg: "4.45rem" },
              lineHeight: 0.9,
              fontWeight: 900,
              letterSpacing: 0,
            }}
          >
            The sanctions screening infrastructure teams build on
          </Typography>
          <Typography variant="h6" color="text.secondary" sx={{ maxWidth: 430, fontWeight: 500, lineHeight: 1.35 }}>
            Self-updating vendor screening for startups, enterprises, and compliance analysts.
          </Typography>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2} sx={{ pt: 0.5 }}>
            <SignInButton mode="modal">
              <Button variant="contained" size="large" endIcon={<ArrowForwardRoundedIcon />}>
                Get started
              </Button>
            </SignInButton>
            <SignUpButton mode="modal">
              <Button variant="outlined" size="large" startIcon={<PersonAddAlt1OutlinedIcon />}>
                Create account
              </Button>
            </SignUpButton>
          </Stack>
        </Stack>

        <Box sx={{ position: "relative", minWidth: 0 }}>
          <ProductPreview />
        </Box>
      </Box>
      <LogoBand />
      <UpdateBand />
    </LandingShell>
  );
}

function TenantRequiredScreen() {
  const theme = useTheme();

  return (
    <LandingShell>
      <Box
        sx={{
          width: "min(980px, calc(100vw - 24px))",
          mx: "auto",
          minHeight: "calc(100vh - 64px)",
          display: "grid",
          placeItems: "center",
          position: "relative",
          zIndex: 1,
          py: 6,
        }}
      >
        <Paper
          elevation={0}
          sx={{
            width: "100%",
            p: { xs: 2.5, sm: 4 },
            border: 1,
            borderColor: "divider",
            borderRadius: "10px",
            bgcolor: alpha(theme.palette.background.paper, 0.9),
            backdropFilter: "blur(18px)",
            boxShadow: `0 34px 90px ${alpha(theme.palette.common.black, theme.palette.mode === "light" ? 0.1 : 0.32)}`,
          }}
        >
          <Stack direction={{ xs: "column", md: "row" }} spacing={3} alignItems={{ xs: "stretch", md: "center" }}>
            <Box sx={{ flex: 1 }}>
              <Chip label="Organization required" variant="outlined" color="primary" sx={{ mb: 2 }} />
              <Typography variant="h2" sx={{ fontSize: { xs: "2.4rem", md: "3.6rem" }, lineHeight: 0.95 }}>
                Select your workspace
              </Typography>
              <Typography color="text.secondary" sx={{ mt: 1.5, maxWidth: 520 }}>
                Choose a tenant before opening dashboards, screening tools, and historical reports.
              </Typography>
            </Box>
            <Paper
              elevation={0}
              sx={{
                flex: { md: "0 0 340px" },
                p: 2,
                border: 1,
                borderColor: "divider",
                bgcolor: "background.paper",
                "& .cl-organizationSwitcherTrigger": {
                  width: "100%",
                },
              }}
            >
              <OrganizationSwitcher hidePersonal />
              <Divider sx={{ my: 2 }} />
              <Stack direction="row" spacing={1.2} alignItems="flex-start">
                <ApartmentOutlinedIcon color="primary" fontSize="small" />
                <Typography variant="body2" color="text.secondary">
                  Switching tenants refreshes client state before loading the application workspace.
                </Typography>
              </Stack>
            </Paper>
          </Stack>
        </Paper>
      </Box>
    </LandingShell>
  );
}

function AuthBackdrop({ children }: { children: ReactNode }) {
  const theme = useTheme();

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        px: 2,
        bgcolor: theme.palette.mode === "light" ? "#fbfcf8" : "background.default",
        backgroundImage: [
          `linear-gradient(${alpha(theme.palette.text.primary, 0.045)} 1px, transparent 1px)`,
          `linear-gradient(90deg, ${alpha(theme.palette.text.primary, 0.045)} 1px, transparent 1px)`,
        ].join(","),
        backgroundSize: "32px 32px",
      }}
    >
      {children}
    </Box>
  );
}

function AuthLoading() {
  return (
    <AuthBackdrop>
      <Paper
        elevation={0}
        sx={{
          width: "min(360px, 100%)",
          p: 3,
          border: 1,
          borderColor: "divider",
          display: "grid",
          justifyItems: "center",
          gap: 2,
          bgcolor: "background.paper",
        }}
      >
        <BrandMark size={42} />
        <CircularProgress size={34} thickness={4} />
        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 800 }}>
          Opening secure workspace
        </Typography>
      </Paper>
    </AuthBackdrop>
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
