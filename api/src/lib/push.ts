import { readFileSync } from 'node:fs';
import { config } from '../config';

export interface PushPayload { title: string; body: string; data?: Record<string, unknown> }
export interface PushProvider { name: string; send(token: string, p: PushPayload): Promise<void> }

// Thrown when the device token is dead (app uninstalled, token rotated): we delete it
export class UnregisteredTokenError extends Error {}

// Development provider: prints instead of sending. The two test hooks let you try the failure paths.
class ConsolePush implements PushProvider {
  name = 'console';
  async send(token: string, p: PushPayload) {
    if (token.startsWith('gone-')) throw new UnregisteredTokenError();        // simulates an uninstalled app
    if (token.startsWith('fail-')) throw new Error('simulated push failure'); // simulates an outage
    console.log(`[PUSH -> ${token.slice(0, 12)}...] ${p.title} | ${p.body}`);
  }
}

// Firebase Cloud Messaging (Android and iOS). Needs: npm i google-auth-library, a Firebase project,
// a service-account JSON file (never commit it!), and for iOS an APNs key uploaded in the Firebase console.
// WRITTEN FROM THE DOCS BUT UNTESTED until you have a Firebase project and a real device.
class FcmPush implements PushProvider {
  name = 'fcm';
  private auth: any;
  private projectId: string;

  constructor(serviceAccountFile: string) {
    const creds = JSON.parse(readFileSync(serviceAccountFile, 'utf8'));
    this.projectId = creds.project_id;
    const { GoogleAuth } = require('google-auth-library');
    this.auth = new GoogleAuth({ credentials: creds, scopes: ['https://www.googleapis.com/auth/firebase.messaging'] });
  }

  async send(token: string, p: PushPayload) {
    const accessToken = await this.auth.getAccessToken();
    const data = Object.fromEntries(Object.entries(p.data ?? {}).map(([k, v]) => [k, String(v)])); // FCM data must be strings
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${this.projectId}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: { token, notification: { title: p.title, body: p.body }, data, android: { priority: 'HIGH' } },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return;
    const err: any = await res.json().catch(() => null);
    const code = err?.error?.details?.find((d: any) => d.errorCode)?.errorCode;
    if (res.status === 404 || code === 'UNREGISTERED') throw new UnregisteredTokenError();
    throw new Error(`FCM ${res.status} ${err?.error?.status ?? ''}`);
  }
}

let provider: PushProvider | null = null;
export function getPush(): PushProvider {
  if (!provider) {
    provider = config.push.provider === 'fcm' ? new FcmPush(config.push.fcmServiceAccountFile) : new ConsolePush();
  }
  return provider;
}