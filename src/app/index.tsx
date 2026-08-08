import { Home } from "@/screens/home";
import { OnboardingScreen } from "@/screens/onboarding";
import { useAuth } from "@/store/auth";
import { useProfiles } from "@/store/profiles";

export default function HomeRoute() {
  const signedIn = useAuth((state) => state.status === "signedIn");
  const onboardingComplete = useProfiles((state) => state.onboardingComplete);
  if (!signedIn || !onboardingComplete) return <OnboardingScreen />;
  return <Home />;
}
