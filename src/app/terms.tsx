import { termsOfUse } from "@/marketing/content";
import { LegalDocumentScreen } from "@/screens/public-site/legal-document";

export default function TermsRoute() {
  return (
    <LegalDocumentScreen
      document={termsOfUse}
      path="/terms"
      metaDescription="Terms for Buki accounts, Free and Pro access, Apple purchases, cloud retention, exports, and deletion."
    />
  );
}
