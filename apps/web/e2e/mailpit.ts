/**
 * Reads the development mail sink (Mailpit, D-021).
 *
 * The e2e test needs the verification link, and there is deliberately no other
 * way to get it: the database stores only a SHA-256 hash of the token, and there
 * is no test-only endpoint that would hand one out. Reading the inbox is what a
 * real user does, so the test follows the same path.
 */
const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://localhost:8025';

interface MailpitSummary {
  ID: string;
  Subject: string;
  To: Array<{ Address: string }>;
}

/**
 * Waits for a message addressed to `recipient` and returns its id.
 *
 * Polls rather than assuming immediate delivery: the API returns before SMTP
 * completes, so a single check would race.
 */
export async function waitForMessage(
  recipient: string,
  options: { timeoutMs?: number; subjectContains?: string } = {},
): Promise<string> {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const response = await fetch(`${MAILPIT_URL}/api/v1/messages?limit=50`);

    if (response.ok) {
      const body = (await response.json()) as { messages: MailpitSummary[] };

      const match = body.messages.find(
        (message) =>
          message.To.some((to) => to.Address.toLowerCase() === recipient.toLowerCase()) &&
          (!options.subjectContains || message.Subject.includes(options.subjectContains)),
      );

      if (match) {
        return match.ID;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  throw new Error(`No message for ${recipient} within ${timeoutMs}ms`);
}

export async function getMessageBody(messageId: string): Promise<string> {
  const response = await fetch(`${MAILPIT_URL}/api/v1/message/${messageId}`);

  if (!response.ok) {
    throw new Error(`Could not read message ${messageId}`);
  }

  return JSON.stringify(await response.json());
}

/**
 * The link paths a token can arrive on.
 *
 * `verify-email` and `verify-email-change` are distinct on purpose: the regex
 * anchors on the `?` immediately after the path, so a change link can never be
 * mistaken for a verification one. They do different things to an account, and
 * a helper that conflated them would let a test prove the wrong flow.
 */
export type TokenPath = 'verify-email' | 'verify-email-change' | 'reset-password';

/** Extracts a `?token=` value from a link in the email body. */
export function extractToken(body: string, path: TokenPath): string {
  const match = new RegExp(`${path}\\?token=([A-Za-z0-9_-]+)`).exec(body);

  if (!match?.[1]) {
    throw new Error(`No ${path} token found in the email body`);
  }

  return match[1];
}

export async function tokenFromEmail(recipient: string, path: TokenPath): Promise<string> {
  const messageId = await waitForMessage(recipient);

  return extractToken(await getMessageBody(messageId), path);
}

/** Confirms Mailpit is reachable before a suite depends on it. */
export async function assertMailpitReachable(): Promise<void> {
  try {
    const response = await fetch(`${MAILPIT_URL}/api/v1/messages?limit=1`);
    if (!response.ok) {
      throw new Error(String(response.status));
    }
  } catch {
    throw new Error(
      `Mailpit is not reachable at ${MAILPIT_URL}. Run \`npm run db:up\` before the e2e tests.`,
    );
  }
}
