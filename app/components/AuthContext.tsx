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
  displayName: string;
  user: User | null;
  loading: boolean;
  role: AccountRole | null;
  username: string;
};

const AuthContext = createContext<AuthContextValue>({
  displayName: "",
  user: null,
  loading: true,
  role: null,
  username: "",
});

export function AuthProvider({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<AccountRole | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const router = useRouter();

  useEffect(() => {
    let active = true;

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!active) return;
      setUser(currentUser);

      if (!currentUser) {
        setRole(null);
        setDisplayName("");
        setUsername("");
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

        let profile;
        try {
          profile = await getDoc(doc(db, "profiles", currentUser.uid));
        } catch {
          profile = await getDoc(doc(db, "users", currentUser.displayName));
        }
        if (!profile.exists()) {
          profile = await getDoc(doc(db, "users", currentUser.displayName));
        }
        const profileData = profile.data();
        const storedRole = profileData?.role;
        const storedUsername =
          typeof profileData?.username === "string"
            ? profileData.username.trim().toLowerCase()
            : currentUser.displayName?.trim().toLowerCase() ?? "";
        const storedDisplayName =
          typeof profileData?.displayName === "string" &&
          profileData.displayName.trim()
            ? profileData.displayName.trim()
            : storedUsername;
        const verifiedRole =
          storedRole === "student" || storedRole === "administrator" || storedRole === "parent"
            ? storedRole
            : null;

        if (!active) return;
        setRole(verifiedRole);
        setUsername(storedUsername);
        setDisplayName(storedDisplayName);
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
    <AuthContext.Provider value={{ displayName, loading, role, user, username }}>
      {children}
    </AuthContext.Provider>
  );
}

export default AuthContext;
