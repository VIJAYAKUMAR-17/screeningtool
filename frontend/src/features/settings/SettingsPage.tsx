import { Card, CardContent, FormControlLabel, Stack, Switch, Typography } from "@mui/material";
import { PageTitle } from "@/components/common/PageTitle";
import { useThemeMode } from "@/app/Providers";

export function SettingsPage() {
  const { mode, toggleMode } = useThemeMode();

  return (
    <Stack spacing={2}>
      <PageTitle title="Settings" subtitle="Theme preferences and enterprise UI controls." />

      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 1 }}>
            Theme Preferences
          </Typography>
          <FormControlLabel
            control={<Switch checked={mode === "dark"} onChange={toggleMode} />}
            label={mode === "dark" ? "Dark Mode" : "Light Mode"}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 1 }}>
            UI Preferences
          </Typography>
          <Typography color="text.secondary">Future controls: density, default filters, export defaults, and locale formatting.</Typography>
        </CardContent>
      </Card>
    </Stack>
  );
}
