import { Inbox } from "lucide-react";

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.025] px-5 py-8 text-center">
      <div className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-white/[0.05] text-muted"><Inbox size={20} /></div>
      <p className="mt-3 text-sm font-extrabold">{title}</p>
      <p className="mx-auto mt-1 max-w-60 text-xs leading-relaxed text-muted">{description}</p>
    </div>
  );
}
