import { redirect } from "next/navigation";

/**
 * TEMPORARY GATE (2026-10-08): the Question Bank is moving behind paid access.
 *
 * The directory at /question-bank stays browsable — every university is still
 * listed — but nothing below it renders. Gating here, in the layout, covers
 * every route under a university (course, semester, descriptive, single
 * question) and every deep link, since a layout runs before any of its pages.
 * The directory reads `?locked=1` and opens the paid-access popup.
 *
 * To reopen the bank, delete this file and restore the Link cards in
 * app/(member)/question-bank/page.tsx (see QuestionBankPaidGate).
 */
export default function QuestionBankInstitutionGate() {
  redirect("/question-bank?locked=1");
}
