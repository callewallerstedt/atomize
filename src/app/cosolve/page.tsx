"use client";

import { useRouter } from "next/navigation";
import { CoSolve } from "@/components/CoSolve";

export default function CoSolvePage() {
  const router = useRouter();
  
  return <CoSolve isOpen={true} onClose={() => router.push("/")} />;
}
