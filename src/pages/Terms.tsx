import { Link } from "react-router";

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-background text-foreground p-6 md:p-12">
      <div className="max-w-2xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold mb-4">Terms of Service</h1>
          <p className="text-muted-foreground text-sm">
            Last updated: August 24, 2026
          </p>
        </header>

        <main className="space-y-6 prose prose-invert max-w-none">
          <section>
            <h2 className="text-xl font-semibold mb-3">1. Acceptance of Terms</h2>
            <p>
              By accessing or using Common Pot ("Service", "we", "us", "our"), you agree to be bound by these Terms of Service ("Terms"), our Privacy Policy, and any additional terms applicable to certain Services.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">2. Description of Service</h2>
            <p>
              Common Pot provides a shared expense ledger service that allows users to track, split, and settle expenses with friends, family, or group members. The Service is provided "as is" and "as available".
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">3. User Responsibilities</h2>
            <p>
              You are responsible for all activity that occurs under your account. You agree to use the Service only for lawful purposes and in accordance with these Terms. You must not use the Service to store or transmit any data that violates applicable laws.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">4. Data Ownership</h2>
            <p>
              You retain ownership of all data you submit to the Service. By submitting data, you grant us a worldwide, non-exclusive, royalty-free license to use, copy, reproduce, process, adapt, modify, publish, transmit, display, and distribute such data solely for the purpose of providing and improving the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">5. Disclaimer of Warranties</h2>
            <p>
              THE SERVICE IS PROVIDED ON AN "AS IS" AND "AS AVAILABLE" BASIS. WE DISCLAIM ALL WARRANTIES OF ANY KIND, WHETHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">6. Limitation of Liability</h2>
            <p>
              IN NO EVENT SHALL WE BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES, INCLUDING LOSS OF PROFITS, REVENUE, DATA, OR USE, INCURRED BY YOU OR ANY THIRD PARTY, WHETHER IN AN ACTION IN CONTRACT OR TORT, ARISING FROM YOUR ACCESS TO OR USE OF THE SERVICE.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">7. Indemnification</h2>
            <p>
              You agree to defend, indemnify, and hold harmless us and our affiliates, and our and their respective directors, officers, employees, agents, partners, and licensors from and against any third-party claims, liabilities, damages (actual or consequential), losses, and expenses (including reasonable attorneys' fees) arising out of or in any way connected with your use of the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">8. Modifications</h2>
            <p>
              We reserve the right to modify or discontinue the Service at any time, with or without notice. We also reserve the right to modify these Terms at any time. Continued use of the Service after any such changes constitutes your acceptance of the new Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">9. Governing Law</h2>
            <p>
              These Terms shall be governed and construed in accordance with the laws of Kenya, without regard to its conflict of law provisions.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">10. Contact</h2>
            <p>
              For any questions regarding these Terms, please contact us at support@commonpot.app
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