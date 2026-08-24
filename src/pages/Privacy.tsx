import { Link } from "react-router";

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background text-foreground p-6 md:p-12">
      <div className="max-w-2xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold mb-4">Privacy Policy</h1>
          <p className="text-muted-foreground text-sm">
            Last updated: August 24, 2026
          </p>
        </header>

        <main className="space-y-6 prose prose-invert max-w-none">
          <section>
            <h2 className="text-xl font-semibold mb-3">1. Introduction</h2>
            <p>
              Common Pot ("we", "us", "our") respects your privacy and is committed to protecting your personal data. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">2. Information We Collect</h2>
            <p>
              <strong>Personal Information:</strong> When you register for an account, we may collect your name, email address, and authentication credentials.
            </p>
            <p>
              <strong>Usage Data:</strong> We automatically collect information about your interactions with the Service, including IP address, browser type, pages visited, and timestamps.
            </p>
            <p>
              <strong>Ledger Data:</strong> We collect and store the expense data, group information, and transaction details you enter into the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">3. How We Use Your Information</h2>
            <p>
              We use the information we collect to:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>Provide, operate, and maintain the Service</li>
              <li>Improve, personalize, and expand the Service</li>
              <li>Understand and analyze how you use the Service</li>
              <li>Develop new products, services, features, and functionality</li>
              <li>Communicate with you for customer service, updates, and marketing</li>
              <li>Process transactions and manage premium subscriptions</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">4. Sharing of Information</h2>
            <p>
              We do not sell your personal information. We may share information in the following circumstances:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>With your consent</li>
              <li>To comply with legal obligations or respond to lawful requests</li>
              <li>To protect and defend our rights or property</li>
              <li>With service providers who assist us in operating the Service</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">5. Data Security</h2>
            <p>
              We implement appropriate technical and organizational measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction. However, no method of transmission over the Internet or electronic storage is 100% secure.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">6. Data Retention</h2>
            <p>
              We will retain your personal information for as long as necessary to fulfill the purposes outlined in this Privacy Policy, unless a longer retention period is required or permitted by law.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">7. Your Rights</h2>
            <p>
              Depending on your location, you may have the right to access, update, delete, or restrict the processing of your personal information. You may also have the right to object to processing or request data portability.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">8. Children's Privacy</h2>
            <p>
              The Service is not intended for use by children under the age of 13 (or 16 in the European Economic Area). We do not knowingly collect personal information from children under this age.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">9. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Last updated" date.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">10. Contact Us</h2>
            <p>
              For any questions or concerns regarding this Privacy Policy, please contact us at privacy@commonpot.app
            </p>
          </section>
        </main>

        <footer className="mt-12 pt-6 border-t border-border">
          <Link to="/" className="text-muted-foreground hover:text-foreground transition-colors">
            &larr; Back to Common Pot
          </Link>
        </footer>
      </div>
    </div>
  );
}