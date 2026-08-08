export interface LegalSection {
  title: string;
  paragraphs?: readonly string[];
  bullets?: readonly string[];
}

export interface LegalDocument {
  title: string;
  summary: string;
  effectiveDate: string;
  sections: readonly LegalSection[];
  contactLead: string;
}

export const SUPPORT_EMAIL = "levani.parastashvili@gmail.com";

export const privacyPolicy: LegalDocument = {
  title: "Privacy Policy",
  summary:
    "Buki is a parent-facing children’s-art organizer. This policy explains what information we handle, why we need it, and how adults can control it.",
  effectiveDate: "Effective August 8, 2026",
  contactLead: "For privacy questions or requests, email:",
  sections: [
    {
      title: "1. Who this policy covers",
      paragraphs: [
        "Buki is designed for an adult parent or guardian to create and manage a private family art library. Children do not create separate login accounts. The adult account owner controls child profiles, artwork, backups, exports, and deletion.",
      ],
    },
    {
      title: "2. Information we collect",
      bullets: [
        "Adult account information, such as name, email address, optional avatar, authentication provider, and account identifiers.",
        "Child profile information entered by the adult: nickname or name, avatar or color, and optional birth month and year.",
        "Family content, including artwork images, optional original photos, titles, dates, notes, tags, favorites, sketchpad organization, and selected visual styling.",
        "Purchase and membership information from Apple and RevenueCat, including product type, entitlement status, trial, renewal, refund, and expiration information. We do not receive full payment-card details.",
        "Technical and service information needed to operate Buki, such as app version, device platform, sync status, storage usage, file checksums, error diagnostics, and privacy-safe feature events.",
        "Support communications you choose to send us.",
      ],
      paragraphs: [
        "Buki does not require precise location, contacts, microphone recordings, advertising identifiers, or public social profiles. We do not use children’s artwork, names, notes, or images for advertising analytics.",
      ],
    },
    {
      title: "3. How we use information",
      bullets: [
        "Create and secure the adult account and keep family libraries separated.",
        "Save, organize, display, search, export, back up, restore, and synchronize content at the adult’s request.",
        "Verify Free and Pro capabilities, purchases, trials, renewals, restorations, and refunds.",
        "Prevent abuse, enforce storage limits, diagnose failures, and maintain service reliability.",
        "Respond to support, privacy, and account-deletion requests.",
        "Meet legal, tax, fraud-prevention, and store-platform obligations.",
      ],
    },
    {
      title: "4. Local storage and optional cloud backup",
      paragraphs: [
        "Artwork is saved locally on the device first. Pro members may enable private cloud backup and cross-device synchronization. Cloud files are stored in private, account-scoped storage and are not published as a gallery. Buki may create optimized previews and compressed originals to improve backup performance and stay within the 2 GB Pro quota.",
        "Signing out does not make one account’s local library available to a different account. Restoring a purchase can transfer membership to the current Buki account, but it does not transfer artwork owned by another Buki account.",
      ],
    },
    {
      title: "5. When we share information",
      paragraphs: [
        "We do not sell personal information. We do not share children’s content with advertisers. We use service providers only to operate Buki, including Apple for distribution and purchases, RevenueCat for subscription status, Supabase for authentication, database, and private storage, Expo for app and website infrastructure, and authentication or email providers selected by the adult.",
        "We may disclose limited information when required by law, to protect users or the service, or as part of a business transfer where the recipient must continue to protect the information.",
      ],
    },
    {
      title: "6. Retention and deletion",
      paragraphs: [
        "Local content remains on the device until the adult deletes it, clears local data, removes the app without a recoverable backup, or deletes the Buki account.",
        "When Monthly or Yearly Pro access ends, cloud data becomes read-only for up to 90 days. We check membership again before scheduled deletion. Renewing during that period resumes synchronization.",
        "An adult can delete cloud copies at any time, even without an active Pro membership.",
        "Account deletion removes the Buki account and associated cloud content, subject to short-lived operational backups and records we must retain for security, fraud prevention, tax, or legal compliance.",
        "Deleting a Buki account does not automatically cancel an Apple subscription. Subscription management remains with Apple.",
      ],
    },
    {
      title: "7. Children’s privacy",
      paragraphs: [
        "Buki is intended for use by an adult parent or guardian, not for independent use by children. The adult decides what child information to enter and should use a nickname and minimal profile details where practical. If you believe a child’s information was added without appropriate adult authority, contact us so we can investigate and delete it.",
      ],
    },
    {
      title: "8. Security",
      paragraphs: [
        "We use access controls, encrypted network connections, private storage, account-scoped database rules, signed upload access, and other reasonable safeguards. No service can guarantee absolute security, so adults should also protect their device, email account, and Apple ID.",
      ],
    },
    {
      title: "9. Your choices and rights",
      paragraphs: [
        "Adults can review or edit profiles and artwork, control backup, export eligible content, delete individual records, remove cloud copies, sign out, and request account deletion inside Buki. Depending on where you live, you may also have rights to access, correct, delete, restrict, or receive a copy of personal information.",
      ],
    },
    {
      title: "10. International processing",
      paragraphs: [
        "Buki’s service providers may process information in countries other than your own. Where required, we rely on contractual and technical safeguards for these transfers.",
      ],
    },
    {
      title: "11. Changes and contact",
      paragraphs: [
        "We may update this policy as Buki changes. We will post the updated effective date and provide additional notice when a change materially affects how family information is handled.",
      ],
    },
  ],
};

export const termsOfUse: LegalDocument = {
  title: "Terms of Use",
  summary:
    "These terms govern use of the Buki app, website, account, cloud backup, exports, and Pro membership.",
  effectiveDate: "Effective August 8, 2026",
  contactLead: "Questions about these terms can be sent to:",
  sections: [
    {
      title: "1. Acceptance and eligibility",
      paragraphs: [
        "By creating an account or using Buki, you agree to these terms and the Privacy Policy. You must be legally able to enter this agreement and be the adult parent, guardian, or other authorized person responsible for any child profile and family content you add.",
        "Buki is not intended for children to create independent accounts or make purchases. Purchasing, external links, and destructive account actions may require a parental confirmation step.",
      ],
    },
    {
      title: "2. Your account",
      paragraphs: [
        "You are responsible for accurate account information, maintaining control of your email, Apple ID, device, and sign-in methods, and promptly notifying us of suspected unauthorized access. One adult account may manage multiple child profiles when Pro access allows it.",
      ],
    },
    {
      title: "3. Your content",
      paragraphs: [
        "You keep ownership of artwork, photos, notes, and other content you upload. You grant Buki a limited license to host, copy, resize, encrypt, synchronize, display, restore, export, and otherwise process that content only as needed to provide and protect the service.",
        "You confirm that you have the right to store the content and that doing so does not violate another person’s privacy, intellectual-property, or other rights. Buki does not claim ownership of a child’s artwork.",
      ],
    },
    {
      title: "4. Free and Pro access",
      paragraphs: [
        "Free access includes one child profile, one sketchpad, and up to 20 artworks, together with the core capture and viewing experience.",
        "Pro removes Buki’s local content-count limits and adds premium visuals, advanced organization, exports, cloud backup, and up to 2 GB of optimized cloud storage.",
        "“Unlimited” means Buki does not impose a content-count limit. Device capacity, technical safeguards, reasonable-use controls, and the 2 GB cloud quota still apply.",
        "All Monthly, Yearly, and Lifetime purchases unlock the same Pro capabilities while the applicable entitlement is active.",
      ],
    },
    {
      title: "5. Apple purchases, trials, and renewals",
      paragraphs: [
        "Purchases are processed by Apple and are subject to Apple’s payment terms. The Buki paywall displays the localized price provided by the App Store. The base U.S. prices are $2.99 monthly, $19.99 yearly, and $39.99 lifetime, but taxes and regional prices may differ.",
        "Monthly and Yearly plans automatically renew unless canceled through Apple before the renewal deadline shown by Apple.",
        "Eligible Yearly customers may receive a 7-day free trial. Unless canceled, the trial converts to the paid Yearly plan at the displayed price.",
        "You can manage or cancel a subscription in your Apple account settings. Deleting Buki or deleting your Buki account does not automatically cancel an Apple subscription.",
        "Refunds are controlled by Apple. If a purchase is refunded or revoked, the related Pro entitlement may end immediately.",
        "Lifetime is a one-time, non-transferable purchase for Pro access on the purchasing Buki account for as long as Buki continues to offer the applicable Pro service, unless refunded, revoked, or the account is deleted.",
      ],
    },
    {
      title: "6. Expiration and cloud retention",
      paragraphs: [
        "When a recurring Pro plan expires, Buki preserves existing local artwork, profiles, sketchpads, metadata, and already-applied visual styling. Viewing, basic metadata edits, deletion, and eligible cloud restoration remain available. New premium styling, advanced organization, exports, and cloud uploads are locked until Pro access resumes.",
        "Cloud content may remain read-only for up to 90 days after expiration. Buki checks membership again before scheduled deletion. Renewing during that period resumes synchronization. Retention does not grant export access, and cloud copies can be deleted at any time for privacy.",
      ],
    },
    {
      title: "7. Backup, restore, export, and import",
      paragraphs: [
        "Cloud backup and exports are convenience and preservation tools, not a guarantee against every form of loss. Keep copies of irreplaceable content outside Buki. Imports may reject unsupported, duplicate, incomplete, or corrupted archives and will not silently overwrite existing records.",
      ],
    },
    {
      title: "8. Acceptable use",
      paragraphs: ["You may not:"],
      bullets: [
        "Use Buki for unlawful, abusive, exploitative, or rights-infringing content.",
        "Attempt to access another account, bypass limits, defeat security controls, or interfere with the service.",
        "Upload malware, automated spam, or content that creates unreasonable technical or storage load.",
        "Reverse engineer or redistribute Buki except where applicable law expressly permits it.",
      ],
    },
    {
      title: "9. Service changes and availability",
      paragraphs: [
        "We may improve, replace, limit, or discontinue features to maintain security, comply with law or store rules, control abuse, or keep Buki sustainable. We aim to provide reasonable notice of material changes when practical. Temporary outages, device limitations, network failures, and third-party service interruptions can occur.",
      ],
    },
    {
      title: "10. Suspension and account deletion",
      paragraphs: [
        "We may suspend or terminate access for material violations, security threats, fraud, abuse, or legal requirements. You may initiate account deletion in Buki’s Account Center. Deletion is permanent after applicable recovery and legal-retention periods and does not cancel an Apple subscription.",
      ],
    },
    {
      title: "11. Disclaimers and liability",
      paragraphs: [
        "To the maximum extent permitted by law, Buki is provided “as is” and “as available.” We do not guarantee uninterrupted operation or that every image, export, backup, or restore will be error-free. Nothing in these terms excludes consumer rights or liability that cannot legally be excluded.",
        "To the maximum extent permitted by law, Buki is not liable for indirect, incidental, special, consequential, or lost-data damages. Any aggregate liability will not exceed the amount you paid for Buki during the 12 months before the event giving rise to the claim, unless applicable law requires otherwise.",
      ],
    },
    {
      title: "12. Changes, severability, and contact",
      paragraphs: [
        "We may update these terms and will post the new effective date. If one provision is unenforceable, the remaining provisions continue to apply. Applicable consumer-protection law remains unaffected.",
      ],
    },
  ],
};

export const supportQuestions = [
  {
    question: "How do I restore Pro?",
    answer:
      "Sign in to the Buki account that should own the membership, open Account Center → Membership, and choose Restore Purchases. Restoring can transfer membership to the current Buki account, but artwork from another account does not move.",
  },
  {
    question: "How do I cancel Monthly or Yearly?",
    answer:
      "Open Apple Settings → your name → Subscriptions → Buki. Apple controls billing, renewals, cancellations, and refund requests.",
  },
  {
    question: "What happens when Pro expires?",
    answer:
      "Existing local artwork and styling stay in place. Pro-only exports, new premium styling, advanced organization, and cloud uploads pause. Cloud content remains read-only for up to 90 days.",
  },
  {
    question: "Why did cloud backup pause?",
    answer:
      "Check internet access, Pro status, available cloud quota, and the last-sync message in Account Center. Local creation continues even when cloud uploads pause.",
  },
  {
    question: "How do I protect irreplaceable artwork?",
    answer:
      "Keep cloud backup enabled if you have Pro and periodically create an export or Buki archive stored outside the app. No single backup method should be the only copy of important memories.",
  },
  {
    question: "How do I delete my account or cloud data?",
    answer:
      "Use Account Center → Danger Zone inside Buki. You can remove cloud copies separately or delete the full Buki account. Deleting the account does not cancel an Apple subscription.",
  },
] as const;

export const deletionSteps = [
  "Open Buki and sign in to the adult account you want to delete.",
  "Open Account Center from the profile button.",
  "Choose Danger Zone → Delete Buki account.",
  "Complete the parental confirmation and review the deletion warning.",
  "Confirm permanent account deletion.",
] as const;
