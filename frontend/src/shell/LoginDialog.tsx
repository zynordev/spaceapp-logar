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
  CREW_MEDICAL_OFFICER: 'Uçuş cerrahı / Sağlık sorumlusu',
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
    toast.success(`Oturum açıldı: ${t.user_id} (${roleLabel(t.role)})`);
    onClose?.();
  };

  const demoLogin = async (role: string) => {
    setDemoBusy(role);
    setError(null);
    try {
      const t = await api<TokenRead>('POST', '/v1/auth/demo-login', { role });
      await finish(t);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setError('Demo girişi bu sunucuda kapalı.');
      else if (err instanceof ApiError && err.status === 503) setError('Sunucuda kimlik doğrulama yapılandırılmamış.');
      else setError(describeError(err).title);
    } finally {
      setDemoBusy(null);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!userId.trim() || !passcode) {
      setError('Kullanıcı kimliği ve parola gerekli.');
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
      if (err instanceof ApiError && err.status === 401) setError('Kullanıcı kimliği veya parola hatalı.');
      else if (err instanceof ApiError && err.status === 503) setError('Sunucuda kimlik doğrulama yapılandırılmamış.');
      else if (err instanceof ApiError && err.status === 422) setError('Girilen değerler geçersiz.');
      else setError(describeError(err).title);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Oturum aç"
      footer={
        <>
          {onClose && (
            <Button variant="ghost" onClick={onClose}>
              Vazgeç
            </Button>
          )}
          <Button variant="primary" type="submit" form="shell-login" loading={busy} icon="lock">
            Giriş yap
          </Button>
        </>
      }
    >
      <p className="text-muted text-sm">
        {onClose
          ? 'Rolünüze göre işlem yapabilmek için oturum açın (Astronot, Ekip sağlık sorumlusu veya Yer ekibi).'
          : 'Bu sunucu oturum açmayı zorunlu tutuyor. Devam etmek için kimliğinizi girin.'}
      </p>
      {demoRoles.length > 0 && (
        <div className="shell-demo-login" role="group" aria-labelledby="shell-demo-login-t">
          <p id="shell-demo-login-t" className="shell-demo-login__title">
            Demo girişi <span className="text-muted">· tek tıkla, parola gerekmez</span>
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
                title={`${r.user_id} olarak oturum aç`}
              >
                {DEMO_ROLE_LABEL[r.role] ?? r.label_tr ?? roleLabel(r.role)}
              </Button>
            ))}
          </div>
          <p className="shell-demo-login__note text-muted">Demo kullanıcıları yalnız bu sunucuda demo girişi açıkken vardır.</p>
        </div>
      )}
      <form id="shell-login" className="shell-login" onSubmit={submit} noValidate>
        <Field label="Kullanıcı kimliği">
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
        <Field label="Parola" error={error ?? undefined}>
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
