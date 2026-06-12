import Link from "next/link";
import type { Metadata } from "next";
import { signUpAction } from "@/lib/actions";
import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = { title: "Create your Family" };

export default function SignUpPage() {
  return (
    <main className="shell" style={{ maxWidth: 440, paddingTop: "8vh" }}>
      <div className="card">
        <p className="eyebrow">A story is waiting</p>
        <h1>Create your Family</h1>
        <p className="subtle">
          You&apos;ll be the Guardian — the grown-up in charge of personas,
          members, and privacy.
        </p>
        <AuthForm action={signUpAction} submitLabel="Create account" showJurisdiction />
        <hr className="divider" />
        <p className="subtle">
          Already have an account? <Link href="/sign-in">Sign in</Link>
        </p>
      </div>
    </main>
  );
}
