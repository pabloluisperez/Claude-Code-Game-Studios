import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { signupSchema } from '@smt/shared/schemas/auth';

export const load: PageServerLoad = ({ locals }) => {
  if (locals.user) redirect(302, '/');
  return {};
};

export const actions: Actions = {
  default: async ({ request, fetch }) => {
    const formData = await request.formData();
    const raw = {
      email: formData.get('email'),
      username: formData.get('username'),
      password: formData.get('password')
    };

    const parsed = signupSchema.safeParse(raw);
    if (!parsed.success) {
      return fail(400, { error: parsed.error.errors[0]?.message ?? 'Invalid input' });
    }

    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed.data)
    });

    if (!res.ok) {
      const body = (await res.json()) as { error?: string };
      return fail(res.status, { error: body.error ?? 'Signup failed' });
    }

    redirect(302, '/');
  }
};
