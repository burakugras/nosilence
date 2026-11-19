// SPDX-License-Identifier: AGPL-3.0-only

const GOOGLE_ERRORS: Record<string, string> = {
  google: 'Signing in with Google did not work. Please try again.',
  google_denied: 'Google sign-in was cancelled.',
  google_email: 'Your Google account email is not verified, so we cannot use it.',
}

/** Message for the ?error= value the server adds after a failed Google sign-in. */
export const googleErrorMessage = (code: string | null) => (code ? GOOGLE_ERRORS[code] : undefined)
