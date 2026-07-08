import { createTheme, ThemeOptions } from "@mui/material/styles";

declare module "@mui/material/styles" {
  interface Palette {
    glass: {
      background: string;
      border: string;
    };
  }
  interface PaletteOptions {
    glass?: {
      background: string;
      border: string;
    };
  }
}

const base: ThemeOptions = {
  shape: {
    borderRadius: 14,
  },
  typography: {
    fontFamily: "'Inter', 'Segoe UI', 'Roboto', sans-serif",
    h4: { fontWeight: 700 },
    h5: { fontWeight: 700 },
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 16,
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          textTransform: "none",
          fontWeight: 600,
        },
      },
    },
  },
};

export const getAppTheme = (mode: "light" | "dark") =>
  createTheme({
    ...base,
    palette: {
      mode,
      primary: {
        main: mode === "light" ? "#0b5ed7" : "#70a2ff",
      },
      secondary: {
        main: mode === "light" ? "#1b7f6b" : "#58d8bd",
      },
      background: {
        default: mode === "light" ? "#f2f6fb" : "#0d1520",
        paper: mode === "light" ? "#ffffff" : "#111e2d",
      },
      glass: {
        background: mode === "light" ? "rgba(255,255,255,0.6)" : "rgba(17,30,45,0.65)",
        border: mode === "light" ? "rgba(18,42,66,0.14)" : "rgba(148,179,255,0.2)",
      },
      success: { main: "#22a06b" },
      warning: { main: "#c77700" },
      error: { main: "#d14343" },
    },
  });
