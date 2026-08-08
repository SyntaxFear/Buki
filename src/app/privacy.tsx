import { privacyPolicy } from "@/marketing/content";
import { LegalDocumentScreen } from "@/screens/public-site/legal-document";

export default function PrivacyRoute() {
  return (
    <LegalDocumentScreen
      document={privacyPolicy}
      path="/privacy"
      metaDescription="How Buki handles adult accounts, child profiles, artwork, purchases, private cloud backup, and deletion."
    />
  );
}
