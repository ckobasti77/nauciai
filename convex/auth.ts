import Google from "@auth/core/providers/google";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      profile(params) {
        const email = String(params.email ?? "").trim().toLowerCase();
        const name = String(params.name ?? email.split("@")[0] ?? "Student").trim();

        return {
          email,
          name,
        };
      },
      validatePasswordRequirements(password) {
        if (password.length < 8) {
          throw new Error("Password must be at least 8 characters long.");
        }
      },
    }),
    Google,
  ],
});
