import { createContext, useContext } from "react";

interface StartupSplashHandoffValue {
  headerMascotReady: boolean;
  sharedTransitionActive: boolean;
}

const StartupSplashHandoffContext =
  createContext<StartupSplashHandoffValue>({
    headerMascotReady: true,
    sharedTransitionActive: false,
  });

export const StartupSplashHandoffProvider =
  StartupSplashHandoffContext.Provider;

export function useStartupSplashHandoff(): StartupSplashHandoffValue {
  return useContext(StartupSplashHandoffContext);
}
