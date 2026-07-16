import { getSession } from '../_lib/session.js';

export async function onRequest({ request, env, data, next }) {
  data.session = await getSession(request, env);
  return next();
}
