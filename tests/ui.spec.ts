import { expect, test, type Page } from '@playwright/test';

// Fixtures belong only to browser tests. No real customer or operation is created.
const client = {
  id: 9001,
  nombre: 'Mariana Torres',
  telefono: '5551234567',
  email: 'test@example.com',
  identificacion: 'PRUEBA',
  direccion: 'Domicilio de prueba',
  notas: '',
  fechaAlta: '2026-09-09',
  empenosActivos: 1,
};
const categories = [
  { id: 1, nombre: 'Oro y joyería', icono: 'gem', porcentajePrestamo: 65 },
  { id: 2, nombre: 'Electrónica', icono: 'laptop', porcentajePrestamo: 60 },
];
const config = {
  nombreNegocio: 'Integra Cash',
  tasaMensual: 10,
  plazoDias: 30,
  porcentajePrestamo: 65,
  diasGracia: 7,
};
const article = {
  id: 8001,
  descripcion: 'Anillo de oro amarillo 14k',
  categoria: 'Oro y joyería',
  marca: '',
  modelo: '',
  serie: 'QA-001',
  condicion: 'Excelente',
  peso: 8.5,
  quilataje: '14k',
  avaluo: 12500,
  ubicacion: 'Bóveda A · Charola 03',
  status: 'resguardo',
  folio: 'IC-2026-000421',
  cliente: client.nombre,
};
const loan = {
  id: 421,
  folio: article.folio,
  clienteId: client.id,
  cliente: client.nombre,
  telefono: client.telefono,
  articuloId: article.id,
  articulo: article.descripcion,
  categoria: article.categoria,
  capital: 8000,
  saldoCapital: 8000,
  tasaInteres: 10,
  plazoDias: 30,
  fechaAlta: '2026-09-09T10:00:00-06:00',
  fechaVencimiento: '2026-10-09',
  status: 'vigente',
  diasRestantes: 30,
  interes: 800,
  totalDesempeno: 8800,
  refrendos: 0,
  ubicacion: article.ubicacion,
  notas: '',
};
const loans = [
  loan,
  {
    ...loan,
    id: 420,
    folio: 'IC-2026-000420',
    cliente: 'Carlos Mendoza',
    articulo: 'MacBook Air M2 · 256 GB',
    categoria: 'Electrónica',
    saldoCapital: 12500,
    status: 'por_vencer',
    diasRestantes: 3,
  },
  {
    ...loan,
    id: 419,
    folio: 'IC-2026-000419',
    cliente: 'Alejandra Ruiz',
    articulo: 'Cadena de oro 18k · 12 g',
    saldoCapital: 9600,
    status: 'vigente',
  },
  {
    ...loan,
    id: 418,
    folio: 'IC-2026-000418',
    cliente: 'Roberto Martínez',
    articulo: 'Reloj de acero inoxidable',
    categoria: 'Relojería',
    saldoCapital: 4500,
    status: 'vencido',
    diasRestantes: -4,
  },
];
const cash = {
  id: 10,
  fechaApertura: '2026-09-09T09:00:00-06:00',
  fechaCierre: null,
  fondoInicial: 100000,
  saldoEsperado: 84750,
  efectivoContado: null,
  diferencia: null,
  status: 'abierta',
};
const activity = [
  {
    id: 1,
    tipo: 'entrada',
    concepto: 'Refrendo · IC-2026-000415',
    importe: 650,
    referencia: 'QA',
    fecha: '2026-09-09T12:30:00-06:00',
  },
  {
    id: 2,
    tipo: 'salida',
    concepto: 'Préstamo · IC-2026-000421',
    importe: 8000,
    referencia: 'QA',
    fecha: '2026-09-09T12:10:00-06:00',
  },
  {
    id: 3,
    tipo: 'entrada',
    concepto: 'Desempeño · IC-2026-000395',
    importe: 4400,
    referencia: 'QA',
    fecha: '2026-09-09T11:45:00-06:00',
  },
];
const chart = ['jue', 'vie', 'sáb', 'dom', 'lun', 'mar', 'mié'].map((label, i) => ({
  label,
  prestado: [12500, 19000, 15500, 6000, 22000, 17000, 25500][i],
  recuperado: [9000, 12000, 11000, 5000, 16500, 14500, 19500][i],
}));
const categoryValues = [
  { name: 'Oro y joyería', value: 195650 },
  { name: 'Electrónica', value: 96000 },
  { name: 'Relojería', value: 57000 },
];
async function fixtures(page: Page) {
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/', '');
    const payloads: Record<string, unknown> = {
      'auth/session': { user: { id: 1, name: 'Valeria López', role: 'admin' }, needsSetup: false },
      dashboard: {
        metrics: {
          capitalActivo: 348650,
          empenosActivos: 47,
          porVencer: 8,
          cajaDisponible: cash.saldoEsperado,
          interesesMes: 28500,
          clientesTotal: 128,
        },
        recent: loans,
        dueSoon: loans.slice(1),
        activity,
        chart,
        categories: categoryValues,
        cash,
      },
      clientes: [client],
      categorias: categories,
      empenos: loans,
      inventario: [
        article,
        {
          ...article,
          id: 8002,
          descripcion: 'MacBook Air M2 · 256 GB',
          categoria: 'Electrónica',
          ubicacion: 'Estante B · 12',
        },
      ],
      caja: { caja: cash, movimientos: activity, historial: [] },
      configuracion: config,
      reportes: {
        prestado: 520000,
        recuperado: 171350,
        intereses: 28500,
        ventas: 12000,
        cartera: 348650,
        porVencer: 8,
        vencidos: 3,
        empenos: 76,
        desempenados: 29,
        chart,
        categories: categoryValues,
      },
      'empenos/421': { ...loan, articuloDetalle: article, clienteDetalle: client, pagos: [] },
      'empenos/421/pago': { loan, pagoId: 1 },
    };
    if (path === 'empenos' && route.request().method() === 'POST')
      await route.fulfill({ json: loan });
    else
      await route.fulfill({
        json: payloads[path] ?? { error: `Missing fixture ${path}` },
        status: path in payloads ? 200 : 404,
      });
  });
}

test('login renders without mutating the live database', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.auth-form')).toBeVisible({ timeout: 25_000 });
  await expect(page.getByLabel('Usuario', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'artifacts/qa/login-desktop.png', fullPage: true });
});

test('dashboard, navigation and financial forms work on isolated fixtures', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await fixtures(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Todo bajo control.' })).toBeVisible();
  await page.screenshot({ path: 'artifacts/qa/dashboard-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Nuevo empeño', exact: true }).click();
  await page.getByRole('button', { name: /Mariana Torres/ }).click();
  await page.getByRole('button', { name: 'Continuar con la garantía' }).click();
  await page.getByRole('combobox', { name: 'Categoría', exact: true }).selectOption('1');
  await page.getByLabel('Descripción de la garantía').fill('Anillo de prueba');
  await page.getByLabel('Ubicación en bóveda').fill('A-02');
  await page.getByLabel('Valor del avalúo (MXN)').fill('1000');
  await page.getByRole('button', { name: 'Definir préstamo' }).click();
  await expect(page.getByLabel('Monto a prestar (MXN)')).toHaveValue('650');
  await page.screenshot({ path: 'artifacts/qa/new-loan-desktop.png', fullPage: true });
  const created = page.waitForRequest(
    (r) => r.url().endsWith('/api/empenos') && r.method() === 'POST',
  );
  await page.getByRole('button', { name: 'Confirmar y entregar préstamo' }).click();
  expect((await created).postDataJSON()).toMatchObject({
    clienteId: 9001,
    capital: 650,
    tasaInteres: 10,
    plazoDias: 30,
  });
  await expect(page.getByRole('heading', { name: loan.folio, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Refrendar', exact: true }).click();
  const payment = page.waitForRequest((r) => r.url().endsWith('/pago') && r.method() === 'POST');
  await page.getByRole('button', { name: 'Confirmar cobro' }).click();
  expect((await payment).postDataJSON()).toMatchObject({
    tipo: 'refrendo',
    importe: 800,
    saldoCapitalEsperado: 8000,
    fechaVencimientoEsperada: '2026-10-09',
  });
  await expect(page.getByText('Pago registrado.')).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar ventana' }).click();
  for (const [button, heading] of [
    ['Clientes', 'Conoce a tus clientes.'],
    ['Empeños', 'Tu cartera de empeños.'],
    ['Vencimientos', 'Anticípate al vencimiento.'],
    ['Bóveda e inventario', 'Dentro de tu bóveda.'],
    ['Control de caja', 'Control de caja.'],
    ['Reportes', 'La historia en números.'],
    ['Configuración', 'Tu negocio, tus reglas.'],
  ]) {
    await page
      .locator('.sidebar')
      .getByRole('button', { name: button, exact: button !== 'Vencimientos' })
      .click();
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test('mobile layout and keyboard-accessible modal remain usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixtures(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Todo bajo control.' })).toBeVisible();
  const overflow = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
    elements: [...document.querySelectorAll('main *')]
      .filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1)
      .slice(0, 12)
      .map((e) => ({ tag: e.tagName, class: e.className, right: e.getBoundingClientRect().right })),
  }));
  expect(overflow.width, JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.viewport);
  await page.screenshot({ path: 'artifacts/qa/dashboard-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Abrir navegación' }).click();
  await page.locator('.sidebar').getByRole('button', { name: 'Clientes', exact: true }).click();
  await page.getByRole('button', { name: 'Nuevo cliente', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.screenshot({ path: 'artifacts/qa/client-mobile.png', fullPage: true });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
});
