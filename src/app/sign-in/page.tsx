import Link from "next/link";
import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#FBF4E7",
        fontFamily: "var(--v2-font-body)",
        color: "#2E2438",
        display: "flex",
        justifyContent: "center",
        padding: "8vh 24px",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 440,
          background: "#FFFDF9",
          border: "1px solid #ECE1CE",
          borderRadius: 22,
          padding: 28,
          boxShadow: "0 8px 24px rgba(58,40,80,0.06)",
          height: "fit-content",
        }}
      >
        <p style={{ textTransform: "uppercase", letterSpacing: "0.16em", fontSize: "0.74rem", fontWeight: 800, color: "#8B6DF0", margin: "0 0 6px" }}>
          Welcome back
        </p>
        <h1 style={{ fontFamily: "var(--v2-font-display)", fontWeight: 800, fontSize: "2rem", color: "#2E2438", margin: "0 0 18px" }}>
          Sign in
        </h1>
        <AuthForm mode="sign-in" submitLabel="Sign in" error={error} />
        <hr style={{ border: "none", borderTop: "1px solid #ECE1CE", margin: "20px 0" }} />
        <p style={{ fontSize: "0.9rem", color: "#6E6076" }}>
          New here? <Link href="/sign-up" style={{ color: "#6A55C9", fontWeight: 700 }}>Create your Family</Link>
        </p>
      </div>
    </main>
  );
}
