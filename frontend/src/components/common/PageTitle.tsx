import { Box, Typography } from "@mui/material";
import { motion } from "framer-motion";
import { ReactNode } from "react";

export function PageTitle({ title, subtitle, action }: { title: string; subtitle: string; action?: ReactNode }) {
  return (
    <Box
      component={motion.div}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      sx={{ mb: 2.5, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 2 }}
    >
      <Box>
        <Typography variant="h4" sx={{ mb: 0.5 }}>
          {title}
        </Typography>
        <Typography color="text.secondary">{subtitle}</Typography>
      </Box>
      {action}
    </Box>
  );
}
