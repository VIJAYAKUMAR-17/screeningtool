import DarkModeOutlinedIcon from "@mui/icons-material/DarkModeOutlined";
import LightModeOutlinedIcon from "@mui/icons-material/LightModeOutlined";
import { IconButton } from "@mui/material";
import { motion } from "framer-motion";
import { useThemeMode } from "@/app/Providers";

export function ThemeToggle() {
  const { mode, toggleMode } = useThemeMode();
  return (
    <IconButton
      component={motion.button}
      whileTap={{ scale: 0.92 }}
      aria-label="toggle theme"
      onClick={toggleMode}
      color="inherit"
    >
      {mode === "light" ? <DarkModeOutlinedIcon /> : <LightModeOutlinedIcon />}
    </IconButton>
  );
}
