'use client';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { ArrowRight, Box, Eye, EyeOff, LockKeyhole, ShieldCheck, Sparkles } from 'lucide-react';
import { Notice, send } from './ui';
export interface User {
  id: number;
  name: string;
  role: string;
}
export default function AuthScreen({
  setup,
  onLogin,
}: {
  setup: boolean;
  onLogin: (user: User) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [visible, setVisible] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    const values = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const data = await send<{ user: User }>(`auth/${setup ? 'setup' : 'login'}`, values);
      onLogin(data.user);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <section className="auth-story">
        <Link className="brand light" href="/">
          <span className="brand-mark">
            <Box size={29} />
          </span>
          <span>
            integra<span className="brand-cash">cash</span>
          </span>
        </Link>
        <div className="auth-message">
          <span className="eyebrow">
            <span className="live-dot" /> EL VALOR DE ESTAR EN CONTROL
          </span>
          <h1>
            Grandes oportunidades.
            <br />
            <em>Todo en tus manos.</em>
          </h1>
          <p>
            Tu casa de empeños, conectada de principio a fin. Menos pasos, más claridad en cada
            operación.
          </p>
          <div className="vault-art" aria-hidden="true">
            <div className="vault-ring ring-one" />
            <div className="vault-ring ring-two" />
            <div className="vault-ring ring-three" />
            <div className="vault-center">
              <Box size={64} strokeWidth={1} />
            </div>
            <span className="vault-label">
              <ShieldCheck size={16} /> Cada garantía, bajo control
            </span>
          </div>
        </div>
        <div className="auth-bottom">
          <span>Empeños · Clientes · Inventario · Caja</span>
          <span>INTEGRA / 01</span>
        </div>
      </section>
      <section className="auth-form-side">
        <div className="auth-form">
          <span className="login-symbol">
            {setup ? <Sparkles size={24} /> : <LockKeyhole size={24} />}
          </span>
          <span className="eyebrow">TU NUEVO CENTRO DE OPERACIONES</span>
          <h2>{setup ? 'Todo comienza contigo.' : 'Qué bueno verte de nuevo.'}</h2>
          <p>
            {setup
              ? 'Crea tu cuenta de administrador para abrir las puertas de Integra Cash.'
              : 'Ingresa a tu espacio de trabajo.'}
          </p>
          <form onSubmit={submit}>
            {setup && (
              <label>
                Tu nombre
                <input
                  name="name"
                  required
                  minLength={2}
                  autoComplete="name"
                  placeholder="Nombre y apellido"
                  maxLength={100}
                />
              </label>
            )}
            <label>
              Usuario
              <input
                name="username"
                required
                autoComplete="username"
                placeholder="Tu usuario"
                minLength={3}
                maxLength={80}
                pattern={setup ? '[a-zA-Z0-9._@\\-]+' : undefined}
                title={setup ? 'Letras, números, punto, guion o @' : undefined}
              />
            </label>
            <label>
              Contraseña
              <div className="password-field">
                <input
                  name="password"
                  type={visible ? 'text' : 'password'}
                  required
                  maxLength={200}
                  pattern={setup ? '(?=.*[a-zA-Z])(?=.*[0-9]).{10,200}' : undefined}
                  title={setup ? 'Al menos 10 caracteres con letras y números' : undefined}
                  minLength={setup ? 10 : 1}
                  autoComplete={setup ? 'new-password' : 'current-password'}
                  placeholder={setup ? 'Al menos 10 caracteres' : 'Ingresa tu contraseña'}
                />
                <button
                  type="button"
                  className="icon-button"
                  aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  onClick={() => setVisible(!visible)}
                >
                  {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>
            {error && <Notice error>{error}</Notice>}
            <button className="button primary full" disabled={busy}>
              {busy ? 'Conectando…' : setup ? 'Crear mi espacio de trabajo' : 'Entrar a mi espacio'}
              <ArrowRight size={18} />
            </button>
          </form>
          <div className="login-foot">
            <ShieldCheck size={16} />
            <span>Acceso protegido · Tus operaciones en un solo lugar</span>
          </div>
        </div>
        <span className="auth-copyright">INTEGRA CASH · HECHO PARA HACERLO FÁCIL</span>
      </section>
    </div>
  );
}
