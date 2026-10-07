import { Card } from "./ui";

/** Shared layout for Terms / Privacy: numbered sections of plain paragraphs. */
export function LegalPage({ title, updated, intro, sections }: { title: string; updated: string; intro: string; sections: { h: string; p: string[] }[] }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-extrabold tracking-tight text-ink">{title}</h1>
      <p className="mt-1 text-sm text-ink-mute">Last updated {updated}</p>
      <p className="mt-6 text-ink-soft">{intro}</p>
      <Card className="mt-8 space-y-8 p-6 sm:p-8">
        {sections.map((s, i) => (
          <section key={s.h}>
            <h2 className="font-bold text-ink">{i + 1}. {s.h}</h2>
            {s.p.map((t) => <p key={t.slice(0, 40)} className="mt-2 text-sm leading-relaxed text-ink-soft">{t}</p>)}
          </section>
        ))}
      </Card>
    </div>
  );
}
