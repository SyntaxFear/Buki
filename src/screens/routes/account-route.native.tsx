import { Redirect } from "expo-router";

import { AccountCenter } from "@/screens/account";
import { useAuth } from "@/store/auth";

export default function AccountRoute() {
  const signedIn = useAuth((state) => state.status === "signedIn");
  if (!signedIn) return <Redirect href="/" />;
  return <AccountCenter />;
}
