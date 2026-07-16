"use client";

import { onAuthStateChanged } from "firebase/auth";
import type { User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  createContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import db, { auth } from "@/lib/firebase";
import {
  cacheAccountRole,
  clearCachedAccountRole,
  readCachedAccountRole,
} from "@/lib/auth-role-cache";
import type { AccountRole } from "@/lib/server";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  role: AccountRole | null;
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  role: null,
});

export function AuthProvider({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<AccountRole | null>(null);
  const router = useRouter();

  useEffect(() => {
    let active = true;

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!active) return;
      setUser(currentUser);

      if (!currentUser) {
        setRole(null);
        setLoading(false);
        router.replace("/login");
        return;
      }

      const cachedRole = readCachedAccountRole(currentUser.uid);

      // The login form already verified this role. Paint the dashboard now,
      // then revalidate Firestore in the background instead of blocking it.
      if (cachedRole) {
        setRole(cachedRole);
        setLoading(false);
      }

      try {
        if (!currentUser.displayName) {
          clearCachedAccountRole(currentUser.uid);
          if (active) setRole(null);
          return;
        }

        let profile = await getDoc(doc(db, "profiles", currentUser.uid));
        if (!profile.exists()) {
          profile = await getDoc(doc(db, "users", currentUser.displayName));
        }
        const storedRole = profile.data()?.role;
        const verifiedRole =
          storedRole === "student" || storedRole === "administrator" || storedRole === "parent"
            ? storedRole
            : null;

        if (!active) return;
        setRole(verifiedRole);
        if (verifiedRole) cacheAccountRole(currentUser.uid, verifiedRole);
        else clearCachedAccountRole(currentUser.uid);
      } catch {
        // Server actions independently verify authorization. A temporary
        // Firestore failure should not trap a previously verified session on
        // a full-screen spinner.
        if (active && !cachedRole) setRole(null);
      } finally {
        if (active) setLoading(false);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [router]);

  if (loading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Loader2
          aria-label="Checking authentication"
          className="animate-spin"
        />
      </main>
    );
  }

  return (
    <AuthContext.Provider value={{ loading, role, user }}>
      {children}
    </AuthContext.Provider>
  );
}

export default AuthContext;
