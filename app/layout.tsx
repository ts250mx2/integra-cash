import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Integra Cash · Casa de empeños',
  description: 'Tu operación, bajo control. Empeños, clientes, resguardo y caja en un solo lugar.',
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-MX">
      <body>{children}</body>
    </html>
  );
}
