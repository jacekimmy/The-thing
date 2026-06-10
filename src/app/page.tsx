import { notFound } from "next/navigation";

// Each demo is shared via its own coded link (e.g. /parker-602). The root
// reveals nothing — no creator list, no default redirect to leak a code.
export default function Home() {
  notFound();
}
