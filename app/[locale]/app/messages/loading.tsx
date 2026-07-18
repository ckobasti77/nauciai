import { Loader2 } from "lucide-react";

export default function MessagesLoading() {
  return <div className="grid min-h-[60vh] place-items-center"><Loader2 className="size-8 animate-spin text-ink motion-reduce:animate-none" aria-label="Učitavanje / Loading" /></div>;
}
