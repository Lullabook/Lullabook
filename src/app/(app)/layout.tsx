import { Baloo_2, Nunito } from "next/font/google";
import { requireAuthedContext } from "@/lib/auth";
import { AppShell } from "@/components/v2/app-shell";

const baloo = Baloo_2({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-baloo",
});

const nunito = Nunito({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  variable: "--font-nunito",
});

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { ctx, member } = await requireAuthedContext();
  const illustrated = ctx.subscriptions.isActive(member.familyId);
  const userInitial = (member.email?.charAt(0) ?? "U").toUpperCase();

  return (
    <div className={`${baloo.variable} ${nunito.variable}`}>
      <AppShell userInitial={userInitial} illustrated={illustrated}>
        {children}
      </AppShell>
    </div>
  );
}
