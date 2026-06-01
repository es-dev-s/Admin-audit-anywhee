import { redirect } from "next/navigation";

/** Live multi-screen grid was removed; keep route for old links. */
export default function MultiScreenRedirect() {
  redirect("/audit");
}
