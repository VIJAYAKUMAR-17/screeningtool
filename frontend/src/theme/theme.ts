import { alpha, createTheme, ThemeOptions } from "@mui/material/styles";
import type {} from "@mui/x-data-grid/themeAugmentation";

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
    borderRadius: 8,
  },
  typography: {
    fontFamily: "'Aptos', 'IBM Plex Sans', 'Segoe UI', sans-serif",
    h1: { fontWeight: 850, letterSpacing: 0 },
    h2: { fontWeight: 850, letterSpacing: 0 },
    h3: { fontWeight: 850, letterSpacing: 0 },
    h4: { fontWeight: 850, letterSpacing: 0 },
    h5: { fontWeight: 800, letterSpacing: 0 },
    h6: { fontWeight: 800, letterSpacing: 0 },
    button: { letterSpacing: 0 },
    overline: { fontWeight: 850, letterSpacing: 0 },
  },
};

const getComponents = (mode: "light" | "dark"): ThemeOptions["components"] => {
  const light = mode === "light";
  const paper = light ? "#fbfcf8" : "#101a18";
  const ink = light ? "#10211e" : "#eef7f2";
  const mutedInk = light ? "#5b6a65" : "#9fb3ad";
  const divider = light ? "rgba(16,33,30,0.13)" : "rgba(215,239,231,0.14)";
  const primary = light ? "#0f5f55" : "#8bd3c7";
  const primaryStrong = light ? "#08453d" : "#c8f3eb";
  const panel = light ? alpha("#ffffff", 0.74) : alpha("#111f1c", 0.72);

  return {
    MuiCssBaseline: {
      styleOverrides: {
        "html, body, #root": {
          minHeight: "100%",
        },
        body: {
          color: ink,
          backgroundColor: light ? "#edf3ee" : "#08110f",
          backgroundImage: light
            ? [
                "linear-gradient(rgba(16, 33, 30, 0.055) 1px, transparent 1px)",
                "linear-gradient(90deg, rgba(16, 33, 30, 0.055) 1px, transparent 1px)",
                "linear-gradient(135deg, #f7faf5 0%, #e9f0ec 48%, #dfe8e5 100%)",
              ].join(",")
            : [
                "linear-gradient(rgba(200, 243, 235, 0.045) 1px, transparent 1px)",
                "linear-gradient(90deg, rgba(200, 243, 235, 0.045) 1px, transparent 1px)",
                "linear-gradient(135deg, #08110f 0%, #101a18 50%, #171713 100%)",
              ].join(","),
          backgroundSize: "32px 32px, 32px 32px, auto",
          backgroundAttachment: "fixed",
          textRendering: "optimizeLegibility",
        },
        "::selection": {
          backgroundColor: alpha(primary, light ? 0.2 : 0.35),
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          borderRadius: 8,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          border: `1px solid ${divider}`,
          borderRadius: 8,
          backgroundColor: panel,
          backgroundImage: "none",
          boxShadow: light
            ? `0 18px 48px ${alpha("#31413c", 0.09)}`
            : `0 22px 58px ${alpha("#000000", 0.32)}`,
          backdropFilter: "blur(18px)",
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          minHeight: 38,
          borderRadius: 8,
          boxShadow: "none",
          fontWeight: 800,
          textTransform: "none",
          ":hover": {
            boxShadow: "none",
          },
        },
        containedPrimary: {
          color: light ? "#ffffff" : "#07100f",
          background: light
            ? "linear-gradient(135deg, #0f5f55 0%, #0a3d38 100%)"
            : "linear-gradient(135deg, #9be2d6 0%, #64b9ad 100%)",
          ":hover": {
            background: light
              ? "linear-gradient(135deg, #0b5148 0%, #072f2b 100%)"
              : "linear-gradient(135deg, #b5eee5 0%, #78c8bd 100%)",
          },
        },
        outlined: {
          borderColor: divider,
          color: ink,
          backgroundColor: alpha(paper, light ? 0.5 : 0.36),
          ":hover": {
            borderColor: alpha(primary, 0.48),
            backgroundColor: alpha(primary, light ? 0.08 : 0.13),
          },
        },
        text: {
          color: primaryStrong,
          ":hover": {
            backgroundColor: alpha(primary, light ? 0.08 : 0.14),
          },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          fontWeight: 800,
        },
        sizeSmall: {
          height: 26,
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          backgroundColor: light ? alpha("#ffffff", 0.72) : alpha("#0b1513", 0.55),
          transition: "border-color 160ms ease, background-color 160ms ease, box-shadow 160ms ease",
          "& .MuiOutlinedInput-notchedOutline": {
            borderColor: divider,
          },
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: alpha(primary, 0.45),
          },
          "&.Mui-focused": {
            boxShadow: `0 0 0 3px ${alpha(primary, light ? 0.12 : 0.18)}`,
          },
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
            borderColor: primary,
            borderWidth: 1,
          },
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          color: mutedInk,
          fontWeight: 700,
          "&.Mui-focused": {
            color: primaryStrong,
          },
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundImage: "none",
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          borderRadius: 6,
          fontWeight: 700,
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          border: `1px solid ${divider}`,
          borderRadius: 8,
          backgroundColor: light ? alpha("#fbfcf8", 0.96) : alpha("#101a18", 0.96),
          backdropFilter: "blur(20px)",
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          border: `1px solid ${divider}`,
          borderRadius: 8,
        },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          fontWeight: 800,
          textTransform: "none",
        },
      },
    },
    MuiDataGrid: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          borderColor: divider,
          backgroundColor: light ? alpha("#ffffff", 0.64) : alpha("#0b1513", 0.5),
          overflow: "hidden",
          "--DataGrid-rowBorderColor": divider,
        },
        columnHeaders: {
          backgroundColor: light ? alpha("#e9f0ec", 0.92) : alpha("#13231f", 0.95),
          borderBottom: `1px solid ${divider}`,
        },
        columnHeaderTitle: {
          color: mutedInk,
          fontWeight: 850,
        },
        cell: {
          borderColor: divider,
        },
        row: {
          "&:hover": {
            backgroundColor: alpha(primary, light ? 0.06 : 0.11),
          },
        },
        footerContainer: {
          borderTop: `1px solid ${divider}`,
          backgroundColor: light ? alpha("#f5f8f5", 0.72) : alpha("#0e1916", 0.72),
        },
      },
    },
  };
};

export const getAppTheme = (mode: "light" | "dark") =>
  createTheme({
    ...base,
    components: getComponents(mode),
    palette: {
      mode,
      primary: {
        main: mode === "light" ? "#0f5f55" : "#8bd3c7",
        dark: mode === "light" ? "#08453d" : "#64b9ad",
        light: mode === "light" ? "#d6ece7" : "#c8f3eb",
      },
      secondary: {
        main: mode === "light" ? "#8a6424" : "#dfbb73",
        dark: mode === "light" ? "#624612" : "#b58f46",
        light: mode === "light" ? "#f2dfb9" : "#f3dca9",
      },
      info: {
        main: mode === "light" ? "#245e9d" : "#8bbcf0",
      },
      background: {
        default: mode === "light" ? "#edf3ee" : "#08110f",
        paper: mode === "light" ? "#fbfcf8" : "#101a18",
      },
      text: {
        primary: mode === "light" ? "#10211e" : "#eef7f2",
        secondary: mode === "light" ? "#5b6a65" : "#9fb3ad",
      },
      divider: mode === "light" ? "rgba(16,33,30,0.13)" : "rgba(215,239,231,0.14)",
      glass: {
        background: mode === "light" ? "rgba(251,252,248,0.72)" : "rgba(16,26,24,0.72)",
        border: mode === "light" ? "rgba(16,33,30,0.13)" : "rgba(215,239,231,0.14)",
      },
      success: { main: mode === "light" ? "#1f7a5a" : "#65d19e" },
      warning: { main: mode === "light" ? "#b86b00" : "#f0b45d" },
      error: { main: mode === "light" ? "#c83f4f" : "#ff8d98" },
    },
  });
