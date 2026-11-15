// Login: user id + passcode -> POST /v1/auth/token -> GET /v1/auth/me.
// The passcode lives only in this component's state and is cleared after
// every attempt; only the short-lived token is kept (sessionStorage).
import { useState, type FormEvent } from 'react';
import { ApiError, api } from '../lib/api';
import { useApp } from '../lib/store';
import { Button, Dialog, Field, Input, describeError, roleLabel, toast } from '../ui';
import type { AuthMeRead, TokenRead } from './types';

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
