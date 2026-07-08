import DashboardCustomizeOutlinedIcon from "@mui/icons-material/DashboardCustomizeOutlined";
import FactCheckOutlinedIcon from "@mui/icons-material/FactCheckOutlined";
import GavelOutlinedIcon from "@mui/icons-material/GavelOutlined";
import MenuIcon from "@mui/icons-material/Menu";
import NotificationsNoneOutlinedIcon from "@mui/icons-material/NotificationsNoneOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import UploadFileOutlinedIcon from "@mui/icons-material/UploadFileOutlined";
import {
  AppBar,
  Avatar,
  Box,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Toolbar,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { motion } from "framer-motion";
import { ReactNode, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { ThemeToggle } from "../common/ThemeToggle";

const drawerWidth = 260;

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

export function AppLayout() {
  const theme = useTheme();
  const location = useLocation();
  const mobile = useMediaQuery(theme.breakpoints.down("md"));
  const [mobileOpen, setMobileOpen] = useState(false);

  const currentLabel = useMemo(
    () => navItems.find((item) => location.pathname.startsWith(item.path))?.label ?? "Dashboard",
    [location.pathname],
  );

  const drawerContent = (
    <Box sx={{ px: 2, py: 2 }}>
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2.5 }}>
        <Avatar sx={{ bgcolor: "primary.main" }}>S</Avatar>
        <Box>
          <Typography variant="subtitle1" fontWeight={700}>
            Screening Tool
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Sanctions Screening Suite
          </Typography>
        </Box>
      </Stack>
      <List disablePadding>
        {navItems.map((item) => (
          <ListItemButton
            key={item.path}
            component={NavLink}
            to={item.path}
            onClick={() => setMobileOpen(false)}
            sx={{
              mb: 0.7,
              borderRadius: 2,
              "&.active": {
                bgcolor: "primary.main",
                color: "primary.contrastText",
                boxShadow: 2,
                "& .MuiListItemIcon-root": { color: "primary.contrastText" },
              },
            }}
          >
            <ListItemIcon sx={{ minWidth: 38 }}>{item.icon}</ListItemIcon>
            <ListItemText primary={item.label} />
          </ListItemButton>
        ))}
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: "background.default", width: "100%", overflowX: "hidden" }}>
      <AppBar
        color="transparent"
        elevation={0}
        sx={{
          borderBottom: 1,
          borderColor: "divider",
          backdropFilter: "blur(8px)",
          bgcolor: (theme) => theme.palette.glass.background,
          zIndex: (theme) => theme.zIndex.drawer + 1,
        }}
      >
        <Toolbar>
          {mobile && (
            <IconButton edge="start" color="inherit" onClick={() => setMobileOpen(true)} sx={{ mr: 1 }}>
              <MenuIcon />
            </IconButton>
          )}
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            {currentLabel}
          </Typography>
          <Box sx={{ ml: "auto" }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <ThemeToggle />
              <IconButton color="inherit" aria-label="notifications">
                <NotificationsNoneOutlinedIcon />
              </IconButton>
              <Avatar sx={{ width: 34, height: 34 }}>CU</Avatar>
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
              bgcolor: "background.paper",
            },
          }}
        >
          {drawerContent}
        </Drawer>
      </Box>

      <Box component="main" sx={{ flexGrow: 1, minWidth: 0, px: { xs: 2, md: 3 }, py: 2, mt: 8, overflowX: "hidden" }}>
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

