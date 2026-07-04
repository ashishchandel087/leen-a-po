import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

// In dev (HTTP over LAN) we need plain non-secure cookies so the browser
// actually stores them. In production over HTTPS, NextAuth's defaults are correct.
const isProd = process.env.NODE_ENV === "production";

// Best-effort login throttle. Keyed by email, kept in-process (and on
// globalThis so it survives dev hot-reloads). On a multi-instance serverless
// deployment each instance tracks independently — imperfect, but it still
// blunts credential-stuffing against this tiny two-account app.
const MAX_ATTEMPTS = 8;
const LOCKOUT_MS = 15 * 60_000; // 15 minutes
type Attempt = { count: number; firstAt: number };
const g = globalThis as unknown as { loginAttempts?: Map<string, Attempt> };
const attempts: Map<string, Attempt> = g.loginAttempts ?? new Map();
if (!g.loginAttempts) g.loginAttempts = attempts;

function isLockedOut(key: string): boolean {
  const a = attempts.get(key);
  if (!a) return false;
  if (Date.now() - a.firstAt > LOCKOUT_MS) {
    attempts.delete(key); // window expired — reset
    return false;
  }
  return a.count >= MAX_ATTEMPTS;
}

// Well-formed bcrypt hash (of a throwaway string) compared against when the
// user doesn't exist, so unknown-email and wrong-password take similar time.
const DUMMY_HASH = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

function recordFailure(key: string) {
  const a = attempts.get(key);
  if (!a || Date.now() - a.firstAt > LOCKOUT_MS) {
    attempts.set(key, { count: 1, firstAt: Date.now() });
  } else {
    a.count += 1;
  }
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  cookies: {
    sessionToken: {
      name: isProd ? "__Secure-next-auth.session-token" : "next-auth.session-token",
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: isProd },
    },
    callbackUrl: {
      name: isProd ? "__Secure-next-auth.callback-url" : "next-auth.callback-url",
      options: { sameSite: "lax", path: "/", secure: isProd },
    },
    csrfToken: {
      name: isProd ? "__Host-next-auth.csrf-token" : "next-auth.csrf-token",
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: isProd },
    },
  },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        // Normalize once — the lockout key and the DB lookup must agree,
        // otherwise case variants dodge the throttle and `Leena@x.com`
        // fails to log in.
        const email = credentials.email.toLowerCase().trim();
        if (isLockedOut(email)) {
          throw new Error("Too many attempts. Try again later.");
        }

        const user = await prisma.user.findUnique({
          where: { email },
        });

        if (!user) {
          await bcrypt.compare(credentials.password, DUMMY_HASH);
          recordFailure(email);
          return null;
        }

        const valid = await bcrypt.compare(credentials.password, user.password);
        if (!valid) {
          recordFailure(email);
          return null;
        }

        attempts.delete(email); // success — clear the counter
        return { id: user.id, email: user.email, name: user.name, role: user.role };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
      }
      return session;
    },
  },
};
