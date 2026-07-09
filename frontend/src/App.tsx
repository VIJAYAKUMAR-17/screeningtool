import { RouterProvider } from "react-router-dom";
import { router } from "@/app/router";
import { AuthGate } from "@/auth/AuthGate";

export default function App() {
  return (
    <AuthGate>
      <RouterProvider router={router} />
    </AuthGate>
  );
}
