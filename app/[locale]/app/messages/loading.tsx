import { Spinner } from "@/components/ui/spinner";

export default function MessagesLoading() {
  return <div className="grid min-h-[60vh] place-items-center"><Spinner size="xl" className="text-ink" label="Učitavanje / Loading" /></div>;
}
