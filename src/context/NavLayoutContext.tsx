import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type NavLayoutContextValue = {
  navOpen: boolean;
  openNav: () => void;
  closeNav: () => void;
  toggleNav: () => void;
};

const NavLayoutContext = createContext<NavLayoutContextValue | null>(null);

export function NavLayoutProvider({ children }: { children: ReactNode }) {
  const [navOpen, setNavOpen] = useState(false);

  const openNav = useCallback(() => setNavOpen(true), []);
  const closeNav = useCallback(() => setNavOpen(false), []);
  const toggleNav = useCallback(() => setNavOpen((v) => !v), []);

  const value = useMemo(
    () => ({ navOpen, openNav, closeNav, toggleNav }),
    [navOpen, openNav, closeNav, toggleNav],
  );

  return <NavLayoutContext.Provider value={value}>{children}</NavLayoutContext.Provider>;
}

export function useNavLayout(): NavLayoutContextValue {
  const ctx = useContext(NavLayoutContext);
  if (!ctx) {
    throw new Error("useNavLayout must be used within NavLayoutProvider");
  }
  return ctx;
}
