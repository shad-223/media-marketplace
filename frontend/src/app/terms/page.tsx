// Template terms — review with a lawyer before relying on them.
import type { Metadata } from "next";

import { LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Terms of Service" };

const SECTIONS = [
  { h: "Who we are", p: ["Media is an online marketplace operated from Bangladesh where users buy and sell digital assets — social media channels and accounts, websites, apps, domains, gaming accounts, SaaS products and online stores. Media is not the owner of any listed asset; we provide the marketplace, escrow and dispute service."] },
  { h: "Your account", p: ["You must be at least 18 years old and give accurate information. One person may hold one account. You are responsible for everything done with your login, so keep your password and verification codes private — Media staff will never ask for them.", "We may ask you to verify your identity (KYC) with a National ID, passport or driving licence. Unverified accounts have a per-trade limit."] },
  { h: "Listing an asset", p: ["You may only list assets you own or are authorised to sell. Metrics, revenue and descriptions must be true and not misleading. Every listing is reviewed before it is published, and we may refuse, pause or remove any listing.", "Prohibited: hacked or stolen accounts, assets obtained by fraud, accounts banned or under a strike you did not disclose, content that is illegal in Bangladesh, and anything that breaks the platform's own terms where that transfer is forbidden."] },
  { h: "Escrow and payment", p: ["When a buyer pays, the money is held by Media in escrow. The seller transfers full ownership; the buyer verifies it and confirms the handover with a one-time code. Funds are released to the seller after the buyer-protection window (72 hours by default) unless a dispute is opened.", "All trades must go through Media escrow. Paying or receiving money outside Media removes all our protection and may lead to account suspension.", "Media charges the seller a platform fee (shown before you list and on every order). Payment-gateway charges for deposits and withdrawals may apply."] },
  { h: "Disputes", p: ["Either party can open a dispute while an order is active. Funds are frozen until an escrow agent reviews the escrow-room chat and evidence. The agent may release the funds to the seller or refund the buyer; that decision is final on the platform. Keep all handover communication inside the escrow room so it can be used as evidence."] },
  { h: "Withdrawals", p: ["You can withdraw your available balance to bKash, Nagad, Rocket or a bank account in your own name. Withdrawals need a verification code and may be held for review to prevent fraud or money laundering."] },
  { h: "Suspension and termination", p: ["We may suspend or close accounts that break these terms, act fraudulently, or put other users at risk. Money owed to you that is not connected to fraud will be returned after any open disputes are settled. You may ask us to delete your account from Settings once your balance is zero and no trades are open."] },
  { h: "Liability", p: ["Digital assets depend on third-party platforms (YouTube, Facebook, app stores and others) that can change rules, demonetise or remove content at any time. Media does not guarantee future earnings, traffic or platform decisions after a completed transfer. Our liability for any trade is limited to the fees we earned from it, except where the law does not allow such a limit."] },
  { h: "Changes and governing law", p: ["We may update these terms and will notify users of material changes. These terms are governed by the laws of Bangladesh, and disputes will be handled by the courts of Dhaka."] },
];

export default function Terms() {
  return <LegalPage title="Terms of Service" updated="8 October 2026" intro="These terms govern your use of Media. By creating an account or trading on Media you agree to them." sections={SECTIONS} />;
}
