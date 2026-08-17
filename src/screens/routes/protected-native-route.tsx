import { Redirect } from "expo-router";
import type { PropsWithChildren } from "react";

import { useAuth } from "@/store/auth";
import { useProfiles } from "@/store/profiles";

export function ProtectedChildRoute({ children }: PropsWithChildren) {
  const signedIn = useAuth((state) => state.status === "signedIn");
  const onboardingComplete = useProfiles((state) => state.onboardingComplete);
  const activeChildId = useProfiles((state) => state.activeChildId);

  if (!signedIn || !onboardingComplete || !activeChildId)
    return <Redirect href="/" />;
  return <>{children}</>;
}
