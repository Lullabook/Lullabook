import Link from "next/link";
import type { Metadata } from "next";
import { signInAction } from "@/lib/actions";
import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <main className="shell" style={{ maxWidth: 440, paddingTop: "8vh" }}>
      <div className="card">
        <p className="eyebrow">Welcome back</p>
        <h1>Sign in</h1>
        <AuthForm action={signInAction} submitLabel="Sign in" />
        <hr className="divider" />
        <p className="subtle">
          New here? <Link href="/sign-up">Create your Family</Link>
        </p>
      </div>
    </main>
  );
}
