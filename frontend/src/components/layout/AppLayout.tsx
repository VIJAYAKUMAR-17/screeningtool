import DashboardCustomizeOutlinedIcon from "@mui/icons-material/DashboardCustomizeOutlined";
import FactCheckOutlinedIcon from "@mui/icons-material/FactCheckOutlined";
import GavelOutlinedIcon from "@mui/icons-material/GavelOutlined";
import MenuIcon from "@mui/icons-material/Menu";
import NotificationsNoneOutlinedIcon from "@mui/icons-material/NotificationsNoneOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import UploadFileOutlinedIcon from "@mui/icons-material/UploadFileOutlined";
import { OrganizationSwitcher, UserButton, useAuth, useOrganization } from "@clerk/react";
import {
  AppBar,
  Box,
  Chip,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Paper,
  Stack,
  Toolbar,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { motion } from "framer-motion";
import { ReactNode, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { ThemeToggle } from "../common/ThemeToggle";

const drawerWidth = 288;

interface NavItem {
  label: string;
  path: string;
  icon: ReactNode;
}

const navItems: NavItem[] = [
  { label: "Dashboard", path: "/dashboard", icon: <DashboardCustomizeOutlinedIcon /> },
  { label: "Screening", path: "/screening", icon: <ShieldOutlinedIcon /> },
  { label: "Bulk Screening", path: "/bulk-screening", icon: <UploadFileOutlinedIcon /> },
  { label: "Results", path: "/results", icon: <FactCheckOutlinedIcon /> },
  { label: "Settings", path: "/settings", icon: <SettingsOutlinedIcon /> },
  { label: "Terms", path: "/terms", icon: <GavelOutlinedIcon /> },
];

function LayoutBrandMark() {
  const theme = useTheme();

  return (
    <Box
      sx={{
        width: 42,
        height: 42,
        flex: "0 0 auto",
        display: "grid",
        placeItems: "center",
        border: 1,
        borderColor: alpha(theme.palette.primary.main, theme.palette.mode === "light" ? 0.36 : 0.54),
        borderRadius: "8px",
        color: "primary.main",
        bgcolor: alpha(theme.palette.primary.main, theme.palette.mode === "light" ? 0.1 : 0.16),
        position: "relative",
        overflow: "hidden",
        "&:before": {
          content: '""',
          position: "absolute",
          top: 8,
          left: 7,
          right: 7,
          height: 2,
          bgcolor: "currentColor",
          opacity: 0.72,
        },
        "&:after": {
          content: '""',
          position: "absolute",
          right: 7,
          bottom: 9,
          width: 22,
          height: 2,
          bgcolor: "secondary.main",
        },
      }}
    >
      <ShieldOutlinedIcon fontSize="small" />
    </Box>
  );
}

export function AppLayout() {
  const theme = useTheme();
  const location = useLocation();
  const mobile = useMediaQuery(theme.breakpoints.down("md"));
  const [mobileOpen, setMobileOpen] = useState(false);
  const { orgRole } = useAuth();
  const { organization } = useOrganization();

  const currentLabel = useMemo(
    () => navItems.find((item) => location.pathname.startsWith(item.path))?.label ?? "Dashboard",
    [location.pathname],
  );

  const roleLabel = useMemo(() => {
    const raw = orgRole?.replace(/^org:/, "").replace(/_/g, " ");
    return raw ? raw.replace(/\b\w/g, (char) => char.toUpperCase()) : "Member";
  }, [orgRole]);

  const drawerContent = (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        p: 1.5,
      }}
    >
      <Stack direction="row" spacing={1.25} alignItems="center" sx={{ p: 1, minHeight: 60 }}>
        <LayoutBrandMark />
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 850, lineHeight: 1.15 }}>
            Screening Tool
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800 }}>
            Sanctions Suite
          </Typography>
        </Box>
      </Stack>

      <Divider sx={{ my: 1 }} />

      {mobile && (
        <Paper
          elevation={0}
          sx={{
            p: 1.2,
            mb: 1.5,
            border: 1,
            borderColor: "divider",
            bgcolor: "glass.background",
            "& .cl-organizationSwitcherTrigger": { width: "100%" },
          }}
        >
          <OrganizationSwitcher hidePersonal />
        </Paper>
      )}

      <Typography variant="overline" color="text.secondary" sx={{ px: 1, mb: 0.5 }}>
        Workspace
      </Typography>

      <List disablePadding sx={{ flex: 1 }}>
        {navItems.map((item) => (
          <ListItemButton
            key={item.path}
            component={NavLink}
            to={item.path}
            onClick={() => setMobileOpen(false)}
            sx={{
              minHeight: 46,
              mb: 0.55,
              px: 1.2,
              borderRadius: "8px",
              color: "text.secondary",
              position: "relative",
              transition: "background-color 160ms ease, color 160ms ease, transform 160ms ease",
              "& .MuiListItemIcon-root": {
                minWidth: 36,
                color: "inherit",
              },
              "& .MuiListItemText-primary": {
                fontSize: 14,
                fontWeight: 800,
              },
              "&:hover": {
                color: "text.primary",
                bgcolor: alpha(theme.palette.primary.main, theme.palette.mode === "light" ? 0.07 : 0.12),
              },
              "&.active": {
                color: "text.primary",
                bgcolor: alpha(theme.palette.primary.main, theme.palette.mode === "light" ? 0.11 : 0.18),
                boxShadow: `inset 0 0 0 1px ${alpha(theme.palette.primary.main, theme.palette.mode === "light" ? 0.22 : 0.34)}`,
                "&:before": {
                  content: '""',
                  position: "absolute",
                  left: 0,
                  top: 9,
                  bottom: 9,
                  width: 3,
                  borderRadius: 999,
                  bgcolor: "primary.main",
                },
              },
            }}
          >
            <ListItemIcon>{item.icon}</ListItemIcon>
            <ListItemText primary={item.label} />
          </ListItemButton>
        ))}
      </List>

      <Paper
        elevation={0}
        sx={{
          p: 1.5,
          mt: 1.5,
          border: 1,
          borderColor: "divider",
          bgcolor: alpha(theme.palette.background.paper, theme.palette.mode === "light" ? 0.62 : 0.38),
        }}
      >
        <Stack spacing={1}>
          <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800 }}>
              Role
            </Typography>
            <Chip
              label={roleLabel}
              size="small"
              color={orgRole === "org:admin" ? "primary" : "default"}
              variant={orgRole === "org:admin" ? "filled" : "outlined"}
            />
          </Stack>
          <Typography variant="body2" sx={{ fontWeight: 800 }} noWrap title={organization?.name ?? "Organization"}>
            {organization?.name ?? "Organization"}
          </Typography>
        </Stack>
      </Paper>
    </Box>
  );

  return (
    <Box
      sx={{
        display: "flex",
        minHeight: "100vh",
        width: "100%",
        overflowX: "hidden",
        bgcolor: "transparent",
      }}
    >
      <AppBar
        color="transparent"
        elevation={0}
        sx={{
          ml: { md: `${drawerWidth}px` },
          width: { md: `calc(100% - ${drawerWidth}px)` },
          borderBottom: 1,
          borderColor: "divider",
          backdropFilter: "blur(20px)",
          bgcolor: alpha(theme.palette.background.paper, theme.palette.mode === "light" ? 0.72 : 0.68),
          zIndex: (appTheme) => appTheme.zIndex.drawer + 1,
        }}
      >
        <Toolbar sx={{ minHeight: { xs: 64, md: 72 }, px: { xs: 1.5, md: 3 } }}>
          {mobile && (
            <IconButton edge="start" color="inherit" onClick={() => setMobileOpen(true)} sx={{ mr: 1 }}>
              <MenuIcon />
            </IconButton>
          )}
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 850 }}>
              Workspace
            </Typography>
            <Typography variant="h6" sx={{ lineHeight: 1.1 }}>
              {currentLabel}
            </Typography>
          </Box>
          <Box sx={{ ml: "auto", minWidth: 0 }}>
            <Stack direction="row" spacing={1} alignItems="center">
              {!mobile && organization && (
                <Chip
                  label={roleLabel}
                  size="small"
                  color={orgRole === "org:admin" ? "primary" : "default"}
                  variant={orgRole === "org:admin" ? "filled" : "outlined"}
                />
              )}
              {!mobile && (
                <Box
                  sx={{
                    minWidth: 190,
                    "& .cl-organizationSwitcherTrigger": {
                      width: "100%",
                    },
                  }}
                >
                  <OrganizationSwitcher hidePersonal />
                </Box>
              )}
              <ThemeToggle />
              <IconButton
                color="inherit"
                aria-label="notifications"
                sx={{
                  width: 38,
                  height: 38,
                  border: 1,
                  borderColor: "divider",
                  bgcolor: alpha(theme.palette.background.paper, theme.palette.mode === "light" ? 0.55 : 0.3),
                }}
              >
                <NotificationsNoneOutlinedIcon fontSize="small" />
              </IconButton>
              <Box
                sx={{
                  display: "grid",
                  placeItems: "center",
                  width: 38,
                  height: 38,
                  border: 1,
                  borderColor: "divider",
                  borderRadius: "8px",
                  bgcolor: alpha(theme.palette.background.paper, theme.palette.mode === "light" ? 0.55 : 0.3),
                }}
              >
                <UserButton />
              </Box>
            </Stack>
          </Box>
        </Toolbar>
      </AppBar>

      <Box component="nav" sx={{ width: { md: drawerWidth }, flexShrink: { md: 0 } }}>
        <Drawer
          variant={mobile ? "temporary" : "permanent"}
          open={mobile ? mobileOpen : true}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            "& .MuiDrawer-paper": {
              width: drawerWidth,
              borderRight: 1,
              borderColor: "divider",
              bgcolor: alpha(theme.palette.background.paper, theme.palette.mode === "light" ? 0.76 : 0.72),
              backdropFilter: "blur(22px)",
              backgroundImage:
                theme.palette.mode === "light"
                  ? "linear-gradient(180deg, rgba(251,252,248,0.86), rgba(229,238,233,0.78))"
                  : "linear-gradient(180deg, rgba(16,26,24,0.88), rgba(8,17,15,0.82))",
            },
          }}
        >
          {drawerContent}
        </Drawer>
      </Box>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          minWidth: 0,
          px: { xs: 1.5, md: 3, xl: 4 },
          py: { xs: 1.5, md: 3 },
          mt: { xs: 8, md: 9 },
          overflowX: "hidden",
        }}
      >
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22 }}
        >
          <Outlet />
        </motion.div>
      </Box>
    </Box>
  );
}
