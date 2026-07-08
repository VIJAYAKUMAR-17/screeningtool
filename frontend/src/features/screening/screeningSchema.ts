import { z } from "zod";

export const screeningEntrySchema = z.object({
  companyName: z.string().min(2, "Company/vendor name is required"),
  country: z.string().max(60).optional().or(z.literal("")),
  identifier: z.string().max(120).optional().or(z.literal("")),
});

export const screeningFormSchema = z.object({
  customerName: z.string().min(2, "Customer name is required"),
  entries: z.array(screeningEntrySchema).min(1, "At least one entry is required"),
});

export type ScreeningFormValues = z.infer<typeof screeningFormSchema>;
