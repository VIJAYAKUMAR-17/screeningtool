import DarkModeOutlinedIcon from "@mui/icons-material/DarkModeOutlined";
import LightModeOutlinedIcon from "@mui/icons-material/LightModeOutlined";
import { IconButton, Tooltip, useTheme } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { motion } from "framer-motion";
import { useThemeMode } from "@/app/Providers";

export function ThemeToggle() {
  const theme = useTheme();
  const { mode, toggleMode } = useThemeMode();
  return (
    <Tooltip title={mode === "light" ? "Dark mode" : "Light mode"}>
      <IconButton
        component={motion.button}
        whileTap={{ scale: 0.92 }}
        aria-label="toggle theme"
        onClick={toggleMode}
        color="inherit"
        sx={{
          width: 38,
          height: 38,
          border: 1,
          borderColor: "divider",
          bgcolor: alpha(theme.palette.background.paper, theme.palette.mode === "light" ? 0.55 : 0.3),
        }}
      >
        {mode === "light" ? <DarkModeOutlinedIcon fontSize="small" /> : <LightModeOutlinedIcon fontSize="small" />}
      </IconButton>
    </Tooltip>
  );
}
