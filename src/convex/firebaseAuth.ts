/** Verify a Firebase Web SDK ID token without trusting a client-supplied uid. */
export async function verifyFirebaseIdToken(token: string): Promise<{ uid: string }> {
  const apiKey = process.env.FIREBASE_WEB_API_KEY;
  if (!apiKey) throw new Error("Missing server secret: FIREBASE_WEB_API_KEY");
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: token }),
    },
  );
  if (!response.ok) throw new Error("Invalid Firebase ID token.");
  const data = (await response.json()) as { users?: Array<{ localId?: unknown }> };
  const uid = data.users?.[0]?.localId;
  if (typeof uid !== "string" || uid.length < 5 || uid.length > 128) {
    throw new Error("Firebase ID token has no valid user identity.");
  }
  return { uid };
}

export async function requireFirebaseUser(request: Request): Promise<{ uid: string }> {
  const header = request.headers.get("Authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) throw new Error("Authentication required.");
  return verifyFirebaseIdToken(match[1]);
}
