import { loadAppContext, renderAppContext } from './app-context.js';
const LEGACY_EMAIL = 'alquilerentcar@gmail.com';
function clearSearchAutofill() {
  document.querySelectorAll('input[type="search"]').forEach((input) => {
    input.setAttribute('autocomplete', 'new-password');
    input.setAttribute('data-lpignore', 'true');
    input.setAttribute('data-form-type', 'other');
    input.name = `filtro_${input.id || 'busca'}`;
    if (input.value.trim().toLowerCase() === LEGACY_EMAIL) {
      input.value = '';
    }
  });
}
export async function requireAuth(client) {
  clearSearchAutofill();
  [400, 1200, 2500, 5000].forEach(delay => setTimeout(clearSearchAutofill, delay));
  setInterval(clearSearchAutofill, 750);
  const { data, error } = await client.auth.getSession();
  const session = data?.session;
  const {error:userError}=session ? await client.auth.getUser() : {error:null};
  if (error || userError || !session) {
    if (session) await client.auth.signOut();
    const next = encodeURIComponent(location.pathname.split('/').pop() || 'clientes.html');
    location.replace(`login.html?next=${next}`);
    await new Promise(() => {});
  }
  const context = await loadAppContext(client, session);
  renderAppContext(context);
  window.alquilerContext = context;
  return session;
}
export function bindLogout(client) {
  document.querySelectorAll('.global-logout').forEach(button => button.addEventListener('click', async () => {
    button.disabled = true; await client.auth.signOut(); location.replace('login.html');
  }));
}
