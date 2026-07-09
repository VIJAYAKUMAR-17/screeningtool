import axios from "axios";
import { getAuthToken } from "@/auth/authToken";

const resolveBaseUrl = (): string => {
  const raw = import.meta.env.VITE_API_BASE_URL;
  const value = typeof raw === "string" ? raw.trim() : "";

  if (!value) {
    return "/api";
  }

  if (value.startsWith("/")) {
    return value;
  }

  try {
    const parsed = new URL(value);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return value;
    }
  } catch {
    // Fall back to local API path when env value is malformed.
  }

  return "/api";
};

export const http = axios.create({
  baseURL: resolveBaseUrl(),
  timeout: 30000,
});

http.interceptors.request.use(async (config) => {
  const token = await getAuthToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

http.interceptors.response.use(
  (response) => response,
  (error) => {
    if (!error?.response) {
      const baseUrl = typeof http.defaults.baseURL === "string" ? http.defaults.baseURL : "/api";
      return Promise.reject(
        new Error(
          `Cannot reach backend API at ${baseUrl}. Start backend and retry.`,
        ),
      );
    }

    const message =
      error?.response?.data?.detail ??
      error?.response?.data?.message ??
      error?.message ??
      "Unexpected API error";
    return Promise.reject(new Error(message));
  },
);
