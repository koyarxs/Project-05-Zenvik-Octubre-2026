'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, Check, Eye, EyeOff, LoaderCircle, LockKeyhole, UserRound } from 'lucide-react';
import { registerSchema, registrationEmailSchema, loginSchema, type RegisterInput, type LoginInput } from '@/lib/schemas';
import { api } from '@/lib/http';
import { listBusinesses } from '@/lib/data';
// INE Censo 2024, capas de distritos, zonas censales y aldeas.
import chileLocations from '@/lib/chile-locations.json';
import type { User } from '@/lib/types';
import { useSession } from './session-provider';
import { useTurnstile } from '@/hooks/use-turnstile';
import { TurnstileChallenge } from './turnstile-challenge';
import { AuthHero } from './auth-hero';
import { BrandMark } from './brand-mark';
import './auth-access.css';
import { ErrorNotice, Field } from './feedback';
import { Input } from './ui/input';
import { Button } from './ui/button';
function PasswordInput({ registration, confirmation, error, 'aria-describedby': statusId, ...props }: React.ComponentProps<typeof Input> & {
  registration?: boolean;
  confirmation?: boolean;
  error?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const id = confirmation ? 'password-confirmation' : 'password';
  const description = [error && `${id}-error`, registration && !confirmation && 'password-hint', statusId].filter(Boolean).join(' ');
  return <div className="auth-field">
    <LockKeyhole aria-hidden="true" className="auth-field__icon" />
    <Input {...props} id={id} className="auth-input auth-input--icon pr-12" type={visible ? 'text' : 'password'}
      autoComplete={registration ? 'new-password' : 'current-password'} aria-invalid={error}
      aria-describedby={description || undefined} />
    <button type="button" aria-label={`${visible ? 'Ocultar' : 'Mostrar'} contraseña${confirmation ? ' repetida' : ''}`}
      aria-pressed={visible} className="auth-password-toggle" onClick={() => setVisible(!visible)}>
      {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
    </button>
  </div>;
}
export function LoginFields({ destination, recoveryHelp = false }: { destination?: string; recoveryHelp?: boolean }) {
  const router = useRouter(); const session = useSession(); const challenge = useTurnstile(); const [error, setError] = useState<string | null>(null);
  const [remember, setRemember] = useState(false);
  const { register, handleSubmit, resetField, setValue, formState: { errors, isSubmitting } } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });
  useEffect(() => {
    if (!recoveryHelp) return;
    try {
      const username = localStorage.getItem('zenvik:remembered-username');
      if (username) {
        setValue('username', username);
        queueMicrotask(() => setRemember(true));
      }
    } catch {}
  }, [recoveryHelp, setValue]);

  async function submit(data: LoginInput) {
    setError(null);
    try {
      const result = await api<{ user: User }>('/api/v1/auth/login/', { method: 'POST', body: { ...data, ...challenge.payload() } });
      if (recoveryHelp && remember) {
        try { localStorage.setItem('zenvik:remembered-username', data.username); } catch {}
      }
      resetField('password');
      session.accept(result.user);
      if (destination) router.replace(destination);
    } catch (e) {
      challenge.reset();
      resetField('password');
      setError(e instanceof Error ? e.message : 'No pudimos iniciar sesión.');
    }
  }
  return <form onSubmit={handleSubmit(submit)} className="space-y-5" noValidate>{error && <ErrorNotice message={error} />}<Field id="username" label="Nombre de usuario" error={errors.username?.message}><div className="auth-field"><UserRound aria-hidden="true" className="auth-field__icon" /><Input className="auth-input auth-input--icon" id="username" autoComplete="username" {...register('username')} placeholder={recoveryHelp ? "Nombre de usuario" : "Tu nombre de usuario"} aria-invalid={!!errors.username} aria-describedby={errors.username ? 'username-error' : undefined} /></div></Field><Field id="password" label="Contraseña" error={errors.password?.message}><PasswordInput {...register('password')} placeholder={recoveryHelp ? 'Contraseña' : undefined} error={!!errors.password} /></Field><TurnstileChallenge key={challenge.version} action="login" config={challenge.config} error={challenge.error} retry={challenge.retry} onToken={challenge.receiveToken} />{recoveryHelp && <div className="login-options"><label className="login-remember"><input type="checkbox" checked={remember} onChange={event => {
    setRemember(event.target.checked);
    if (!event.target.checked) {
      try { localStorage.removeItem('zenvik:remembered-username'); } catch {}
    }
  }} />Recordar usuario</label><details className="login-help"><summary>¿Olvidaste tu contraseña?</summary><p>Contacta al administrador de tu cuenta para recuperar el acceso.</p></details></div>}<Button className="auth-submit" disabled={isSubmitting || !challenge.ready} aria-busy={isSubmitting}><span>{isSubmitting ? 'Iniciando sesión…' : 'Iniciar sesión'}</span><span className="auth-submit__icon" aria-hidden="true">{isSubmitting ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}</span></Button></form>;
}
function RegisterFields() {
  const challenge = useTurnstile();
  const [verification, setVerification] = useState<string | null>(null);
  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get('verificar');
    if (token) {
      window.history.replaceState(window.history.state, '', window.location.pathname);
      queueMicrotask(() => setVerification(token));
    }
  }, []);

  return challenge.registrationEmailRequired && !verification
    ? <RegistrationEmailFields challenge={challenge} />
    : <CreateAccountFields challenge={challenge} verification={verification} />;
}

type RegistrationChallenge = ReturnType<typeof useTurnstile>;

function RegistrationEmailFields({ challenge }: { challenge: RegistrationChallenge }) {
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<{ email: string }>({
    resolver: zodResolver(registrationEmailSchema),
  });
  const submit = handleSubmit(async data => {
    setError(null);
    try {
      await api('/api/v1/auth/registration-email/', {
        method: 'POST', body: { ...data, ...challenge.payload() },
      });
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos enviar el correo.');
    } finally {
      challenge.reset();
    }
  });

  if (sent) return <div className="space-y-4">
    <p role="status">Revisa tu correo y abre el enlace para continuar. Caduca en 30 minutos.</p>
    <Button type="button" variant="outline" onClick={() => setSent(false)}>Enviar otro enlace</Button>
  </div>;

  return <form onSubmit={submit} noValidate>
    {error && <ErrorNotice message={error} />}
    <Field id="email" label="Correo electrónico" hint="Te enviaremos un enlace para confirmar tu dirección." error={errors.email?.message}>
      <Input id="email" className="auth-input" type="email" autoComplete="email" {...register('email')}
        aria-invalid={!!errors.email} aria-describedby={errors.email ? 'email-hint email-error' : 'email-hint'} />
    </Field>
    <TurnstileChallenge key={challenge.version} action="register" config={challenge.config} error={challenge.error} retry={challenge.retry} onToken={challenge.receiveToken} />
    <Button className="auth-submit" disabled={isSubmitting || !challenge.ready} aria-busy={isSubmitting}>
      {isSubmitting ? 'Enviando…' : 'Enviar enlace de confirmación'}
    </Button>
  </form>;
}

const registrationSteps = ['Tu cuenta', 'Tu negocio', 'Tu espacio de trabajo'] as const;

const businessFields = [
  { key: 'name', label: 'Nombre comercial', limit: 255, required: true },
  { key: 'legal_name', label: 'Razón social', limit: 255 },
  { key: 'rut', label: 'RUT del negocio', limit: 12 },
  { key: 'industry', label: 'Rubro', limit: 120 },
  { key: 'team_size', label: 'Cantidad aproximada de trabajadores', type: 'number' },
  { key: 'address', label: 'Dirección comercial', limit: 255 },
  { key: 'contact_email', label: 'Correo comercial', limit: 254, type: 'email' },
  { key: 'contact_phone', label: 'Teléfono comercial', limit: 30, type: 'tel' },
] as const satisfies ReadonlyArray<{ key: string; label: string; limit?: number; type?: string; required?: boolean }>;

type BusinessDraft = Partial<Record<(typeof businessFields)[number]['key'] | 'primary_location' | 'region' | 'commune' | 'locality', string>>;

function validRut(value: string) {
  const rut = value.trim().toUpperCase();
  if (!/^(?:[0-9]{1,8}|[0-9]{1,2}(?:\.[0-9]{3}){1,2})-?[0-9K]$/.test(rut)) return false;
  const compact = rut.replace(/[.-]/g, '');
  const number = compact.slice(0, -1);
  if (number.length > 8 || !Number(number)) return false;
  const sum = [...number].reverse().reduce((total, digit, index) => total + Number(digit) * (2 + index % 6), 0);
  return compact.at(-1) === '0123456789K'[(11 - sum % 11) % 11];
}

function FieldCheck({ id, message, invalid = false }: { id: string; message: string; invalid?: boolean }) {
  return <p id={`${id}-check`} className={`registration-check ${invalid ? 'is-invalid' : ''}`} aria-live="polite">
    {!invalid && <Check aria-hidden="true" className="size-4" />}{message}
  </p>;
}

function LocationSelect({ id, label, value, options, disabled, placeholder, onChange }: {
  id: string; label: string; value?: string; options: string[];
  disabled?: boolean; placeholder: string; onChange: (value: string) => void;
}) {
  return <Field id={id} label={label}>
    <select className="auth-input w-full" id={id} value={value ?? ''} disabled={disabled}
      aria-describedby={value ? `${id}-check` : undefined} onChange={event => onChange(event.target.value)}>
      <option value="">{placeholder}</option>
      {options.map(option => <option key={option} value={option}>{option}</option>)}
    </select>
    {value && <FieldCheck id={id} message={`${label} seleccionada`} />}
  </Field>;
}

function CreateAccountFields({ challenge, verification }: { challenge: RegistrationChallenge; verification: string | null }) {
  const [step, setStep] = useState(0);
  const [business, setBusiness] = useState<BusinessDraft>({});
  const [skipBusiness, setSkipBusiness] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ business_id?: string } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const { control, register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { first_name: '', last_name: '', phone: '', username: '', email: '', password: '', passwordConfirmation: '' },
  });
  const account = useWatch({ control });
  const region = chileLocations.find(item => item.name === business.region);
  const commune = region?.communes.find(item => item.name === business.commune);
  const rutInvalid = !!business.rut?.trim() && !validRut(business.rut);
  const passwordLength = Array.from(account.password ?? '').length;
  const passwordValid = passwordLength >= 15 && passwordLength <= 128;
  const passwordsMatch = !!account.passwordConfirmation && account.password === account.passwordConfirmation;

  function goToStep(next: number) {
    setError(null);
    setStep(next);
    requestAnimationFrame(() => heading.current?.focus());
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    return handleSubmit(async data => {
      if (step === 0) {
        goToStep(1);
        return;
      }
      setError(null);
      try {
        const businessData = { ...business, team_size: business.team_size ? Number(business.team_size) : null };
        const created = await api<{ business_id?: string }>('/api/v1/auth/register/', {
          method: 'POST',
          body: {
            first_name: data.first_name, last_name: data.last_name, phone: data.phone,
            username: data.username, email: data.email, password: data.password,
            ...challenge.payload(),
            ...(verification ? { email_verification: verification } : {}),
            ...(skipBusiness ? {} : { business: businessData, start_session: true }),
          },
        });
        reset();
        if (created.business_id) {
          window.location.replace(`/app/${encodeURIComponent(created.business_id)}`);
          return;
        }
        setResult(created);
      } catch (e) {
        challenge.reset();
        setError(e instanceof Error ? e.message : 'No pudimos crear tu cuenta.');
        requestAnimationFrame(() => heading.current?.focus());
      }
    })(event);
  }

  if (result) return <div role="status" className="space-y-5">
    <span className="grid size-12 place-items-center rounded-xl bg-orange-100 text-orange-800"><Check /></span>
    <h2 className="text-2xl font-bold">Tu cuenta está lista</h2>
    <p className="text-muted-foreground">{result.business_id
      ? 'Tu negocio ya está creado. Inicia sesión para abrirlo y agregar a tu equipo.'
      : 'Inicia sesión para configurar tu negocio cuando quieras.'}</p>
    <Button asChild><Link href="/iniciar-sesion">Ir a iniciar sesión<ArrowRight /></Link></Button>
  </div>;

  return <>
    <ol className="registration-steps" aria-label="Progreso del registro">
      {registrationSteps.map((label, index) => (
        <li key={label} aria-current={step === index ? 'step' : undefined} data-complete={step > index}>
          <span aria-hidden="true">{step > index ? <Check className="size-4" /> : index + 1}</span>{label}
        </li>
      ))}
    </ol>
    <h2 className="mb-2 text-2xl font-bold tracking-tight" tabIndex={-1} ref={heading}>{registrationSteps[step]}</h2>
    {error && <ErrorNotice message={error} />}
    {step === 0 && <form className="registration-form" onSubmit={submit} noValidate>
      <div className="registration-fields">
        {([
          ['first_name', 'Nombres', 'given-name'],
          ['last_name', 'Apellidos', 'family-name'],
          ['username', 'Nombre de usuario', 'username'],
          ['email', 'Correo electrónico', 'email'],
          ['phone', 'Teléfono (opcional)', 'tel'],
        ] as const).map(([key, label, autoComplete]) => {
          const value = account[key] ?? '';
          const validation = registerSchema.shape[key].safeParse(value);
          const showCheck = !errors[key] && !!value.trim();
          const message = validation.success
            ? (key === 'email' ? 'Formato de correo válido' : 'Campo completo')
            : validation.error.issues[0].message;
          return (
          <Field key={key} id={key} label={label} error={errors[key]?.message}
            hint={key === 'email' && verification ? 'Usa el correo donde recibiste el enlace.' : undefined}>
            <Input className="auth-input" id={key} autoComplete={autoComplete} type={key === 'email' ? 'email' : key === 'phone' ? 'tel' : 'text'}
              {...register(key)} aria-invalid={!!errors[key] || (showCheck && !validation.success)} aria-describedby={[
                key === 'email' && verification && 'email-hint', errors[key] && key + '-error', showCheck && key + '-check',
              ].filter(Boolean).join(' ') || undefined} />
            {showCheck && <FieldCheck id={key} message={message} invalid={!validation.success} />}
          </Field>
          );
        })}
        <Field id="password" label="Contraseña" hint="Usa entre 15 y 128 caracteres. Puedes usar una frase larga." error={errors.password?.message}>
          <PasswordInput registration {...register('password')} error={!!errors.password}
            aria-describedby={account.password && !errors.password ? 'password-check' : undefined} />
          {account.password && !errors.password && <FieldCheck id="password" invalid={!passwordValid}
            message={passwordValid ? 'Longitud válida' : `${passwordLength} caracteres. Usa entre 15 y 128.`} />}
        </Field>
        <Field id="password-confirmation" label="Repetir contraseña" error={errors.passwordConfirmation?.message}>
          <PasswordInput registration confirmation {...register('passwordConfirmation')} error={!!errors.passwordConfirmation}
            aria-describedby={account.passwordConfirmation && !errors.passwordConfirmation ? 'password-confirmation-check' : undefined} />
          {account.passwordConfirmation && !errors.passwordConfirmation && <FieldCheck id="password-confirmation" invalid={!passwordsMatch}
            message={passwordsMatch ? 'Las contraseñas coinciden' : 'La repetición debe coincidir con tu contraseña.'} />}
        </Field>
      </div>
      <div className="registration-actions">
        {verification && <Button type="button" variant="outline" onClick={() => window.location.reload()}>Solicitar otro enlace</Button>}
        <Button>Continuar<ArrowRight /></Button>
      </div>
    </form>}
    {step === 1 && <form className="registration-form" onSubmit={event => {
      event.preventDefault();
      if (rutInvalid) {
        event.currentTarget.querySelector<HTMLInputElement>('#rut')?.focus();
        return;
      }
      setSkipBusiness(false);
      goToStep(2);
    }}>
      <p className="text-sm text-muted-foreground">Solo el nombre comercial es obligatorio si creas un negocio ahora.</p>
      <div className="registration-fields">
        {businessFields.map(({ key, label, ...options }) => {
          const value = business[key] ?? '';
          const invalid = key === 'rut' ? rutInvalid
            : key === 'contact_email' ? !registrationEmailSchema.safeParse({ email: value }).success
            : key === 'team_size' ? !Number.isInteger(Number(value)) || Number(value) < 1 || Number(value) > 100000
            : false;
          const checkMessage = key === 'rut' ? (invalid ? 'Revisa el formato y dígito verificador del RUT.' : 'Dígito verificador correcto')
            : key === 'contact_email' ? (invalid ? 'Ingresa un correo válido.' : 'Formato de correo válido')
            : invalid ? 'Ingresa un número entero entre 1 y 100.000.' : 'Campo completo';
          return (
          <Field id={key} key={key} label={label}>
            <Input className="auth-input" id={key}
              type={'type' in options ? options.type : 'text'}
              maxLength={'limit' in options ? options.limit : undefined}
              required={'required' in options && options.required}
              min={key === 'team_size' ? 1 : undefined}
              max={key === 'team_size' ? 100000 : undefined}
              pattern={key === 'name' ? '.*\\S.*' : undefined}
              value={value} aria-invalid={!!value.trim() && invalid} aria-describedby={value.trim() ? key + '-check' : undefined}
              onChange={event => setBusiness({ ...business, [key]: event.target.value })} />
            {value.trim() && <FieldCheck id={key} message={checkMessage} invalid={invalid} />}
          </Field>
          );
        })}
        <LocationSelect id="region" label="Región" value={business.region} placeholder="Selecciona una región"
          options={chileLocations.map(item => item.name)}
          onChange={value => setBusiness({ ...business, region: value, commune: '', locality: '' })} />
        <LocationSelect id="commune" label="Comuna" value={business.commune} disabled={!region}
          placeholder={region ? 'Selecciona una comuna' : 'Selecciona primero la región'}
          options={region?.communes.map(item => item.name) ?? []}
          onChange={value => setBusiness({ ...business, commune: value, locality: '' })} />
        {commune && !commune.places.length ? (
          <Field id="locality" label="Ciudad o localidad" hint="Escríbela si corresponde.">
            <Input className="auth-input" id="locality" maxLength={120} value={business.locality ?? ''}
              aria-describedby={business.locality?.trim() ? 'locality-hint locality-check' : 'locality-hint'}
              onChange={event => setBusiness({ ...business, locality: event.target.value })} />
            {business.locality?.trim() && <FieldCheck id="locality" message="Campo completo" />}
          </Field>
        ) : (
          <LocationSelect id="locality" label="Ciudad o localidad" value={business.locality} disabled={!commune}
            placeholder={commune ? 'Selecciona una ciudad o localidad' : 'Selecciona primero la comuna'}
            options={commune?.places ?? []} onChange={value => setBusiness({ ...business, locality: value })} />
        )}
      </div>
      <div className="registration-actions">
        <Button type="button" variant="outline" onClick={() => goToStep(0)}>Atrás</Button>
        <Button type="button" variant="ghost" onClick={() => { setSkipBusiness(true); goToStep(2); }}>Configurar más tarde</Button>
        <Button>Continuar<ArrowRight /></Button>
      </div>
    </form>}
    {step === 2 && <form className="registration-form" onSubmit={submit} noValidate>
      {skipBusiness ? <p className="text-sm text-muted-foreground">Podrás crear tu negocio desde Zenvik después de iniciar sesión.</p> : <>
        <div className="registration-fields">
          <Field id="primary_location" label="Nombre de la primera sucursal (opcional)">
            <Input className="auth-input" id="primary_location" maxLength={120} placeholder="Casa matriz"
              value={business.primary_location ?? ''} aria-describedby={business.primary_location?.trim() ? 'primary_location-check' : undefined}
              onChange={event => setBusiness({ ...business, primary_location: event.target.value })} />
            {business.primary_location?.trim() && <FieldCheck id="primary_location" message="Campo completo" />}
          </Field>
          <Field id="planning_timezone" label="Zona horaria">
            <Input className="auth-input" id="planning_timezone" value="Santiago de Chile" readOnly />
          </Field>
        </div>
        <p className="text-sm text-muted-foreground">Podrás agregar a tu equipo desde Trabajadores después de iniciar sesión.</p>
      </>}
      <TurnstileChallenge key={challenge.version} action="register" config={challenge.config} error={challenge.error} retry={challenge.retry} onToken={challenge.receiveToken} />
      <div className="registration-actions">
        <Button type="button" variant="outline" disabled={isSubmitting} onClick={() => { challenge.reset(); goToStep(1); }}>Atrás</Button>
        <Button disabled={isSubmitting || !challenge.ready} aria-busy={isSubmitting}>
          {isSubmitting ? 'Creando cuenta…' : 'Crear mi cuenta'}<ArrowRight />
        </Button>
      </div>
    </form>}
  </>;
}
export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const session = useSession(); const router = useRouter(); const login = mode === 'login';
  const userId = session.user?.id;
  const isPlatformAdmin = session.user?.is_platform_admin;
  useEffect(() => {
    if (!userId) return;
    if (isPlatformAdmin) {
      router.replace('/app');
      return;
    }
    const controller = new AbortController();
    void listBusinesses(controller.signal).then(businesses => {
      if (controller.signal.aborted) return;
      router.replace(businesses.length === 1 ? `/app/${encodeURIComponent(businesses[0].id)}` : '/app');
    }).catch(() => {
      if (!controller.signal.aborted) router.replace('/app');
    });
    return () => controller.abort();
  }, [userId, isPlatformAdmin, router]);
  if (!login) return <main className="auth-screen access-screen registration-screen">
    <header className="registration-header">
      <span className="registration-brand" role="img" aria-label="Zenvik"><BrandMark tone="orange" className="size-8" /><span aria-hidden="true">envik</span></span>
      <Link href="/iniciar-sesion" className="text-sm font-semibold">Iniciar sesión</Link>
    </header>
    <section className="registration-card" aria-labelledby="registration-title">
      <h1 id="registration-title">Crea tu cuenta</h1>
      <p className="registration-intro">Configura tu acceso y prepara el espacio de trabajo de tu negocio.</p>
      <RegisterFields />
    </section>
  </main>;
  return <main className="auth-screen access-screen">
    <AuthHero />
    <section className="auth-panel" aria-labelledby="access-title">
      <div className="auth-content">
        <nav className="auth-switch" aria-label="Acceso a Zenvik">
          <Link href="/iniciar-sesion" aria-current="page" className="auth-switch__item">Iniciar sesión</Link>
          <Link href="/registrarse" className="auth-switch__item">Crear cuenta</Link>
        </nav>
        <header className="auth-intro">
          <h1 id="access-title">Iniciar sesión</h1>
          <p>Ingresa a tu espacio de trabajo.</p>
        </header>
        <LoginFields recoveryHelp />
      </div>
    </section>
  </main>;
}
