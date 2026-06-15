"use server";

import { redirect } from "next/navigation";
import { createAuthClient } from "@/lib/supabase";

function authFail(path: "/sign-in" | "/sign-up", message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

export async function signUpAction(formData: FormData): Promise<void> {
  const supabase = await createAuthClient();
  const { error } = await supabase.auth.signUp({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
    options: {
      data: { jurisdiction: String(formData.get("jurisdiction") ?? "US") },
    },
  });
  if (error) authFail("/sign-up", error.message);
  redirect("/library");
}

export async function signInAction(formData: FormData): Promise<void> {
  const supabase = await createAuthClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  });
  if (error) authFail("/sign-in", error.message);
  redirect("/library");
}

export async function signOutAction(): Promise<void> {
  const supabase = await createAuthClient();
  await supabase.auth.signOut();
  redirect("/sign-in");
}
