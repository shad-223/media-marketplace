import { Logo } from "./Header";
import { Card } from "./ui";

export function AuthCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="hero-mesh flex min-h-[calc(100vh-6rem)] items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md p-7 sm:p-8">
        <Logo className="mb-6" />
        <h1 className="text-2xl font-bold text-ink">{title}</h1>
        <p className="mb-6 mt-1 text-sm text-ink-soft">{subtitle}</p>
        {children}
      </Card>
    </div>
  );
}
