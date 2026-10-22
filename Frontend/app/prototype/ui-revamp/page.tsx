"use client";
// PROTOTYPE — throwaway. Three structurally different variants of the new THOS shell + employer Home + Pipeline,
// switchable via ?variant=A|B|C (and ?screen=home|pipeline). Read-only against the real API. Delete after ticket 02.

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { RequireAuth } from "@/components/auth/require-auth";
import type { PipelineCard } from "@/lib/types";
import "./proto.css";
import { CommandPalette, PrototypeSwitcher, ToastHost, useCommandPalette, useProtoData, useProtoTheme } from "./shared";
import { VariantA, nameA } from "./variant-a";
import { VariantB, nameB } from "./variant-b";
import { VariantC, nameC } from "./variant-c";
import { VariantD, nameD } from "./variant-d";

const VARIANTS = [
  { key: "A", name: nameA },
  { key: "B", name: nameB },
  { key: "C", name: nameC },
  { key: "D", name: nameD },
];

function Prototype() {
  const params = useSearchParams();
  const router = useRouter();
  const variant = (params.get("variant") ?? "A").toUpperCase();
  const screen = params.get("screen") === "pipeline" ? "pipeline" : "home";
  const data = useProtoData();
  const { theme, toggle } = useProtoTheme();
  const palette = useCommandPalette();
  const [preview, setPreview] = useState<PipelineCard | null>(null);

  const setScreen = (s: string) => {
    const p = new URLSearchParams(params.toString());
    p.set("screen", s);
    router.replace(`?${p.toString()}`);
  };
  const props = { data, theme, onTheme: toggle, screen, setScreen, openPalette: () => palette.setOpen(true), preview, setPreview };

  return (
    <div className="proto" data-theme={theme}>
      {data.loading ? <p className="p-pad p-muted">Loading prototype data…</p>
        : data.error ? <p className="p-pad">Couldn&apos;t load data: {data.error}</p>
          : variant === "B" ? <VariantB {...props} /> : variant === "C" ? <VariantC {...props} /> : variant === "D" ? <VariantD {...props} /> : <VariantA {...props} />}
      {palette.open && <CommandPalette data={data} onClose={() => palette.setOpen(false)} onOpenCandidate={(c) => { setScreen("pipeline"); setPreview(c); }} />}
      <ToastHost />
      <PrototypeSwitcher variants={VARIANTS} current={variant} />
    </div>
  );
}

export default function PrototypePage() {
  return (
    <RequireAuth employerOnly>
      <Suspense fallback={null}>
        <Prototype />
      </Suspense>
    </RequireAuth>
  );
}
