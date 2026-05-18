import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { loginSchema } from '@smt/shared/schemas/auth';

export const load: PageServerLoad = ({ locals }) => {
  if (locals.user) redirect(302, '/');
  return {};
};

export const actions: Actions = {
  default: async ({ request, fetch }) => {
    const formData = await request.formData();
    const raw = { email: formData.get('email'), password: formData.get('password') };

    const parsed = loginSchema.safeParse(raw);
    if (!parsed.success) {
      return fail(400, { error: 'Invalid input' });
    }

    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed.data)
    });

    if (!res.ok) {
      return fail(401, { error: 'Invalid email or password' });
    }

    redirect(302, '/');
  }
};
