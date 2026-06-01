"use client";

import { motion } from "framer-motion";
import type { AuditLiveClient } from "@/lib/auditTypes";
import { MemberCard } from "@/components/members/MemberCard";

export function MemberGrid({ orgId, items }: { orgId: number; items: AuditLiveClient[] }) {
  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.04 } } }}
      className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[repeat(auto-fill,minmax(240px,1fr))]"
    >
      {items.map((c) => (
        <MemberCard key={c.id} client={c} orgId={orgId} />
      ))}
    </motion.div>
  );
}
