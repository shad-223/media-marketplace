// Template privacy policy — review with a lawyer before relying on it.
import type { Metadata } from "next";

import { LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Privacy Policy" };

const SECTIONS = [
  { h: "What we collect", p: ["Account details (email, username, mobile number, optional photo and bio); identity documents you upload for verification; listings, offers, messages and escrow-room chats; payment details you give for deposits and withdrawals (wallet or bank numbers, transaction IDs); and technical data such as IP address and device type for security."] },
  { h: "How we use it", p: ["To run the marketplace and escrow, verify identities, prevent fraud and money laundering, resolve disputes, process payments and payouts, send security codes and notifications, and improve the service. We do not sell your personal data."] },
  { h: "Identity documents", p: ["KYC documents and ownership proofs are encrypted (AES-256) as soon as they are uploaded and can only be opened by authorised Media reviewers. We keep them only as long as needed for verification and legal record-keeping."] },
  { h: "Who we share it with", p: ["Your trading partner sees your username, rating and what you write in the escrow room. Payment providers (bKash, Nagad, Rocket, banks, card processors) receive what they need to move money. We may disclose information to law enforcement when the law requires it or to protect users from fraud."] },
  { h: "Retention", p: ["We keep account data while your account is active. When an account is deleted, personal details are erased, but completed orders and the financial ledger are kept for as long as financial and tax laws require."] },
  { h: "Your choices", p: ["You can update your profile in Settings, ask support for a copy of your data, or request account deletion from Settings. Contact us through Support with any privacy question."] },
  { h: "Cookies and storage", p: ["We use your browser's local storage to keep you logged in and remember small preferences. We do not use advertising trackers."] },
];

export default function Privacy() {
  return <LegalPage title="Privacy Policy" updated="8 October 2026" intro="This policy explains what personal data Media collects, why, and the choices you have." sections={SECTIONS} />;
}
