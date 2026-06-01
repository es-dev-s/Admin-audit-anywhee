"use client";

import { useEffect, useState } from "react";
import { apiSignalingStreamAuth } from "@/lib/signalingStreamAuthClient";

export type StreamAuthState =
  | { status: "loading" }
  | { status: "authorized" }
  | { status: "denied"; message: string };

export function useSignalingStreamAuth(
  orgId: number,
  clientId: number
): StreamAuthState {
  const [state, setState] = useState<StreamAuthState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    if (
      !Number.isFinite(orgId) ||
      orgId <= 0 ||
      !Number.isFinite(clientId) ||
      clientId <= 0
    ) {
      setState({ status: "denied", message: "Invalid team or member." });
      return;
    }
    setState({ status: "loading" });
    apiSignalingStreamAuth(orgId, clientId)
      .then(() => {
        if (!cancelled) setState({ status: "authorized" });
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setState({
            status: "denied",
            message: e instanceof Error ? e.message : "Access denied",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [orgId, clientId]);

  return state;
}
