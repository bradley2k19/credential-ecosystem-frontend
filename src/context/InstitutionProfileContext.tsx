"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { getInstitutionProfile, type InstitutionProfileDetails } from "@/lib/api";

interface InstitutionProfileContextValue {
  profile: InstitutionProfileDetails | null;
  error: string;
  /** Replaces the shared profile, e.g. with the response of a save, so the sidebar updates at once. */
  setProfile: (profile: InstitutionProfileDetails) => void;
  refreshProfile: () => Promise<void>;
}

const InstitutionProfileContext = createContext<InstitutionProfileContextValue | undefined>(undefined);

/** Shares the institution profile between the sidebar (logo) and the profile page. */
export function InstitutionProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<InstitutionProfileDetails | null>(null);
  const [error, setError] = useState("");

  const refreshProfile = useCallback(async () => {
    try {
      setProfile(await getInstitutionProfile());
      setError("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The institution profile could not be loaded.");
    }
  }, []);

  useEffect(() => {
    let active = true;
    void getInstitutionProfile()
      .then((response) => { if (active) setProfile(response); })
      .catch((requestError: unknown) => {
        if (active) setError(requestError instanceof Error ? requestError.message : "The institution profile could not be loaded.");
      });
    return () => { active = false; };
  }, []);

  return <InstitutionProfileContext.Provider value={{ profile, error, setProfile, refreshProfile }}>{children}</InstitutionProfileContext.Provider>;
}

export function useInstitutionProfile() {
  const context = useContext(InstitutionProfileContext);
  if (!context) throw new Error("useInstitutionProfile must be used within an InstitutionProfileProvider");
  return context;
}
