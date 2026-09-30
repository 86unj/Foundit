import { redirect } from 'next/navigation';

/** @deprecated Prefer /verify-email?token=… from the signup email. */
export default function EmailVerifiedPage() {
  redirect('/login');
}
