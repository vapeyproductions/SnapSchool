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
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);

      if (!currentUser) {
        setRole(null);
        setLoading(false);
        router.replace("/login");
        return;
      }

      if (currentUser.displayName) {
        const profile = await getDoc(doc(db, "users", currentUser.displayName));
        const storedRole = profile.data()?.role;
        setRole(
          storedRole === "student" || storedRole === "administrator"
            ? storedRole
            : null,
        );
      }

      setLoading(false);
    });

    return unsubscribe;
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
