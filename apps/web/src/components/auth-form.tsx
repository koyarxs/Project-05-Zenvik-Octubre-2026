'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, Check, Eye, EyeOff, LoaderCircle, LockKeyhole, ShieldCheck, UserRound } from 'lucide-react';
import { registerSchema, loginSchema, type RegisterInput, type LoginInput } from '@/lib/schemas';
import { api } from '@/lib/http';
import type { User } from '@/lib/types';
import { useSession } from './session-provider';
import { useTurnstile } from '@/hooks/use-turnstile';
import { TurnstileChallenge } from './turnstile-challenge';
import { Brand } from './app-shell';
import { AuthHero } from './auth-hero';
import { ErrorNotice, Field } from './feedback';
import { Input } from './ui/input';
import { Button } from './ui/button';
function PasswordInput({ registration, error, ...props }: React.ComponentProps<typeof Input> & { registration?: boolean; error?: boolean }) {
  const [visible, setVisible] = useState(false);
  return <div className="auth-field"><LockKeyhole aria-hidden="true" className="auth-field__icon" /><Input {...props} id="password" className="auth-input auth-input--icon pr-12" type={visible ? 'text' : 'password'} autoComplete={registration ? 'new-password' : 'current-password'} aria-invalid={error} aria-describedby={registration ? error ? 'password-error password-hint' : 'password-hint' : error ? 'password-error' : undefined} /><button type="button" aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={visible} className="auth-password-toggle" onClick={() => setVisible(!visible)}>{visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div>;
}
function LoginFields() {
  const router = useRouter(); const session = useSession(); const challenge = useTurnstile(); const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, resetField, formState: { errors, isSubmitting } } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });
  async function submit(data: LoginInput) { setError(null); try { const result = await api<{ user: User }>('/api/v1/auth/login/', { method: 'POST', body: { ...data, ...challenge.payload() } }); resetField('password'); session.accept(result.user); router.replace('/app'); } catch (e) { challenge.reset(); resetField('password'); setError(e instanceof Error ? e.message : 'No pudimos iniciar sesión.'); } }
  return <form onSubmit={handleSubmit(submit)} className="space-y-5" noValidate>{error && <ErrorNotice message={error} />}<Field id="username" label="Nombre de usuario" error={errors.username?.message}><div className="auth-field"><UserRound aria-hidden="true" className="auth-field__icon" /><Input className="auth-input auth-input--icon" id="username" autoComplete="username" {...register('username')} placeholder="Tu nombre de usuario" aria-invalid={!!errors.username} aria-describedby={errors.username ? 'username-error' : undefined} /></div></Field><Field id="password" label="Contraseña" error={errors.password?.message}><PasswordInput {...register('password')} error={!!errors.password} /></Field><TurnstileChallenge key={challenge.version} action="login" config={challenge.config} error={challenge.error} retry={challenge.retry} onToken={challenge.receiveToken} /><Button className="auth-submit" disabled={isSubmitting || !challenge.ready} aria-busy={isSubmitting}><span>{isSubmitting ? 'Iniciando sesión…' : 'Iniciar sesión'}</span><span className="auth-submit__icon" aria-hidden="true">{isSubmitting ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}</span></Button></form>;
}
function RegisterFields() {
  const challenge = useTurnstile();
  const [error, setError] = useState<string | null>(null); const [done, setDone] = useState(false);
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<RegisterInput>({ resolver: zodResolver(registerSchema) });
  async function submit(data: RegisterInput) { setError(null); try { await api('/api/v1/auth/register/', { method: 'POST', body: { ...data, ...challenge.payload() } }); reset(); setDone(true); } catch (e) { challenge.reset(); reset({ ...data, password: '' }); setError(e instanceof Error ? e.message : 'No pudimos crear tu cuenta.'); } }
  if (done) return <div role="status" className="space-y-5 rounded-xl border border-[#cce7de] bg-[#f0f8f4] p-6"><span className="grid size-12 place-items-center rounded-xl bg-[#d9eee3] text-primary"><Check /></span><h2 className="text-xl font-bold">Tu cuenta está lista</h2><p className="text-sm leading-6 text-muted-foreground">Inicia sesión para registrar tu primer negocio.</p><Button asChild className="w-full"><Link href="/iniciar-sesion">Ir a iniciar sesión<ArrowRight /></Link></Button></div>;
  return <form onSubmit={handleSubmit(submit)} className="space-y-5" noValidate>{error && <ErrorNotice message={error} />}<Field id="username" label="Nombre de usuario" error={errors.username?.message}><div className="auth-field"><UserRound aria-hidden="true" className="auth-field__icon" /><Input className="auth-input auth-input--icon" id="username" autoComplete="username" {...register('username')} aria-invalid={!!errors.username} aria-describedby={errors.username ? 'username-error' : undefined} /></div></Field><Field id="email" label="Correo electrónico" error={errors.email?.message}><Input className="auth-input" id="email" type="email" autoComplete="email" {...register('email')} aria-invalid={!!errors.email} aria-describedby={errors.email ? 'email-error' : undefined} /></Field><Field id="password" label="Contraseña" hint="Usa al menos 8 caracteres y evita contraseñas comunes." error={errors.password?.message}><PasswordInput registration {...register('password')} error={!!errors.password} /></Field><TurnstileChallenge key={challenge.version} action="register" config={challenge.config} error={challenge.error} retry={challenge.retry} onToken={challenge.receiveToken} /><Button className="auth-submit" disabled={isSubmitting || !challenge.ready} aria-busy={isSubmitting}><span>{isSubmitting ? 'Creando cuenta…' : 'Crear mi cuenta'}</span><span className="auth-submit__icon" aria-hidden="true">{isSubmitting ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}</span></Button></form>;
}
export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const session = useSession(); const router = useRouter(); const login = mode === 'login';
  useEffect(() => { if (session.user) router.replace('/app'); }, [session.user, router]);
  return <div className="auth-screen grid min-h-screen bg-white lg:grid-cols-[1fr_1fr] xl:grid-cols-[1.08fr_1fr]">
    <AuthHero />
    <section className="auth-panel"><div className="lg:invisible"><Brand /></div><div className="auth-content"><nav className="auth-switch" aria-label="Acceso a Zenvik"><Link href="/iniciar-sesion" aria-current={login ? 'page' : undefined} className="auth-switch__item">Iniciar sesión</Link><Link href="/registrarse" aria-current={!login ? 'page' : undefined} className="auth-switch__item">Crear cuenta</Link></nav><div className="auth-intro"><h1>{login ? 'Bienvenido a Zenvik' : 'Crea tu cuenta'}</h1><p>{login ? 'Ingresa tus datos para acceder a tu espacio de trabajo.' : 'Comienza a organizar tu negocio en un solo lugar.'}</p></div>{login ? <LoginFields /> : <RegisterFields />}<div className="auth-assurance"><ShieldCheck aria-hidden="true" className="size-3.5" /><span>Tu cuenta. Tu espacio de trabajo.</span></div></div></section>
  </div>;
}
