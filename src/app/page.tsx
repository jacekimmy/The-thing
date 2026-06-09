import { redirect } from "next/navigation";
import { DEFAULT_SLUG } from "@/lib/creators";

// The demo is sent as a per-creator link (e.g. /parker). Root → default creator.
export default function Home() {
  redirect(`/${DEFAULT_SLUG}`);
}
