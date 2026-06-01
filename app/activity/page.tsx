import { redirect } from "next/navigation";

/** Legacy route; activity log page removed. */
export default function ActivityRedirect() {
  redirect("/audit");
}
