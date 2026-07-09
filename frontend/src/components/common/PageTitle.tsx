import { Box, Typography } from "@mui/material";
import { motion } from "framer-motion";
import { ReactNode } from "react";

export function PageTitle({ title, subtitle, action }: { title: string; subtitle: string; action?: ReactNode }) {
  return (
    <Box
      component={motion.header}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      sx={{
        mb: 3,
        display: "flex",
        justifyContent: "space-between",
        alignItems: { xs: "flex-start", sm: "flex-end" },
        flexWrap: "wrap",
        gap: 2,
      }}
    >
      <Box sx={{ minWidth: 0, maxWidth: 820 }}>
        <Typography variant="h4" sx={{ mb: 0.75, lineHeight: 1.05 }}>
          {title}
        </Typography>
        <Typography color="text.secondary" sx={{ maxWidth: 760 }}>
          {subtitle}
        </Typography>
      </Box>
      {action}
    </Box>
  );
}
