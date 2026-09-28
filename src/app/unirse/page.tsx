import type { Metadata } from "next";
import { JoinFamily } from "@/features/family/join-family";
export const metadata: Metadata = {
  title: "Unirte a tu familia · Clara",
  robots: { index: false, follow: false },
};
export default function JoinPage() {
  return <JoinFamily />;
}
