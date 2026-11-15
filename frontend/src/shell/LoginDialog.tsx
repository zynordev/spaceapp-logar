// Login: user id + passcode -> POST /v1/auth/token -> GET /v1/auth/me.
// The passcode lives only in this component's state and is cleared after
// every attempt; only the short-lived token is kept (sessionStorage).
import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, api } from '../lib/api';
import { useApp } from '../lib/store';
import { Button, Dialog, Field, Input, describeError, roleLabel, toast } from '../ui';
import type { AuthMeRead, DemoRoleRead, TokenRead } from './types';

const DEMO_ROLE_LABEL: Record<string, string> = {
  ASTRONAUT: 'Astronot',
  CREW_MEDICAL_OFFICER: 'Flight surgeon / Crew health officer',
  GROUND: 'Yer ekibi',
};

export interface LoginDialogProps {
  open: boolean;
  /** Absent when auth is required: the dialog can't be dismissed. */
  onClose?: () => void;
}

export function LoginDialog({ open, onClose }: LoginDialogProps) {
  const [userId, setUserId] = useState('');
  const [passcode, setPasscode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // One-click demo roles (contract "Demo login"): listed only when the server
  // enables SPACEAPP_DEMO_LOGIN; otherwise [] (or 404 on older servers).
  const [demoRoles, setDemoRoles] = useState<DemoRoleRead[]>([]);
  const [demoBusy, setDemoBusy] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    api<DemoRoleRead[]>('GET', '/v1/auth/demo-roles')
      .then((r) => alive && setDemoRoles(Array.isArray(r) ? r : []))
      .catch(() => alive && setDemoRoles([]));
    return () => {
      alive = false;
    };
  }, [open]);

  const finish = async (t: TokenRead) => {
    const { setToken, setUser } = useApp.getState();
    setToken(t.access_token, t.expires_at);
    setUser({ user_id: t.user_id, role: t.role, anonymous: false });
    try {
      const me = await api<AuthMeRead>('GET', '/v1/auth/me');
      setUser(me);
    } catch {
      /* older server without /v1/auth/me: keep the token's identity */
    }
    toast.success(`Signed in: ${t.user_id} (${roleLabel(t.role)})`);
    onClose?.();
  };

  const demoLogin = async (role: string) => {
    setDemoBusy(role);
    setError(null);
    try {
      const t = await api<TokenRead>('POST', '/v1/auth/demo-login', { role });
      await finish(t);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setError('Demo sign-in is disabled on this server.');
      else if (err instanceof ApiError && err.status === 503) setError('Authentication is not configured on the server.');
      else setError(describeError(err).title);
    } finally {
      setDemoBusy(null);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!userId.trim() || !passcode) {
      setError('User ID and password are required.');
      return;
    }
    setBusy(true);
    setError(null);
    const code = passcode;
    setPasscode('');
    try {
      const t = await api<TokenRead>('POST', '/v1/auth/token', { user_id: userId.trim(), passcode: code });
      await finish(t);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setError('Wrong user ID or password.');
      else if (err instanceof ApiError && err.status === 503) setError('Authentication is not configured on the server.');
      else if (err instanceof ApiError && err.status === 422) setError('The values entered are invalid.');
      else setError(describeError(err).title);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Sign in"
      footer={
        <>
          {onClose && (
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          )}
          <Button variant="primary" type="submit" form="shell-login" loading={busy} icon="lock">
            Sign in
          </Button>
        </>
      }
    >
      <p className="text-muted text-sm">
        {onClose
          ? 'Sign in to act according to your role (Crew member, Crew health officer or Ground team).'
          : 'This server requires sign-in. Enter your ID to continue.'}
      </p>
      {demoRoles.length > 0 && (
        <div className="shell-demo-login" role="group" aria-labelledby="shell-demo-login-t">
          <p id="shell-demo-login-t" className="shell-demo-login__title">
            Demo sign-in <span className="text-muted">· one click, no password needed</span>
          </p>
          <div className="shell-demo-login__btns">
            {demoRoles.map((r) => (
              <Button
                key={r.role}
                size="sm"
                variant="secondary"
                icon="user"
                loading={demoBusy === r.role}
                disabled={demoBusy !== null || busy}
                onClick={() => void demoLogin(r.role)}
                title={`Sign in as ${r.user_id}`}
              >
                {DEMO_ROLE_LABEL[r.role] ?? r.label_tr ?? roleLabel(r.role)}
              </Button>
            ))}
          </div>
          <p className="shell-demo-login__note text-muted">Demo users exist only while demo sign-in is enabled on this server.</p>
        </div>
      )}
      <form id="shell-login" className="shell-login" onSubmit={submit} noValidate>
        <Field label="User ID">
          <Input
            name="username"
            autoComplete="username"
            autoCapitalize="off"
            spellCheck={false}
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            required
            autoFocus
          />
        </Field>
        <Field label="Password" error={error ?? undefined}>
          <Input
            name="password"
            type="password"
            autoComplete="current-password"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            required
          />
        </Field>
      </form>
    </Dialog>
  );
}
