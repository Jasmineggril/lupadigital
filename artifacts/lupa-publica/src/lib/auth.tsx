import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

export type ProfileType = "estudante" | "concurseiro" | "pesquisador" | "cidadao";

export interface AuthUser {
  name: string;
  email: string;
  profileType: ProfileType;
  verified: boolean;
  plan: "gratuito" | "estudante" | "concurseiro" | "premium";
}

interface AuthContextValue {
  user: AuthUser | null;
  login: (email: string, password: string) => { ok: boolean; error?: string };
  register: (data: RegisterData) => { ok: boolean; error?: string };
  logout: () => void;
  isLoading: boolean;
}

interface RegisterData {
  name: string;
  email: string;
  password: string;
  profileType: ProfileType;
}

interface StoredUser extends AuthUser {
  passwordHash: string;
}

const KEY_USERS = "lupa_users";
const KEY_SESSION = "lupa_session";

function simpleHash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = Math.imul(31, h) + s.charCodeAt(i) | 0;
  return String(h);
}

function getUsers(): StoredUser[] {
  try { return JSON.parse(localStorage.getItem(KEY_USERS) ?? "[]"); } catch { return []; }
}

function saveUsers(users: StoredUser[]) {
  localStorage.setItem(KEY_USERS, JSON.stringify(users));
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY_SESSION);
      if (raw) setUser(JSON.parse(raw));
    } catch {}
    setIsLoading(false);
  }, []);

  const login = (email: string, password: string) => {
    const users = getUsers();
    const found = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!found) return { ok: false, error: "E-mail não cadastrado." };
    if (found.passwordHash !== simpleHash(password)) return { ok: false, error: "Senha incorreta." };
    const { passwordHash: _, ...sessionUser } = found;
    setUser(sessionUser);
    localStorage.setItem(KEY_SESSION, JSON.stringify(sessionUser));
    return { ok: true };
  };

  const register = (data: RegisterData) => {
    const users = getUsers();
    if (users.find(u => u.email.toLowerCase() === data.email.toLowerCase())) {
      return { ok: false, error: "Este e-mail já está cadastrado." };
    }
    const newUser: StoredUser = {
      name: data.name,
      email: data.email,
      profileType: data.profileType,
      verified: false,
      plan: "gratuito",
      passwordHash: simpleHash(data.password),
    };
    saveUsers([...users, newUser]);
    const { passwordHash: _, ...sessionUser } = newUser;
    setUser(sessionUser);
    localStorage.setItem(KEY_SESSION, JSON.stringify(sessionUser));
    return { ok: true };
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem(KEY_SESSION);
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
