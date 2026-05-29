# Dev Seed — cuenta y carrera de desarrollo

Creado 2026-05-29 para desbloquear la **verificación visual** y los **e2e**
(condición de release v1.2, milestone review).

## Credenciales (entorno local)

| Campo | Valor |
|-------|-------|
| Email | `dev@tsm.local` |
| Username | `devmanager` |
| Password | `DevSeed123!` |
| Club | `Dev FC` (Madrid, Quinta División) |
| Mánager | `Pablo Pérez` |

> Solo para la base de datos local de desarrollo (Postgres :5433). No usar en
> producción. La password cumple el patrón del proyecto (mayús/minús/dígito/símbolo).

## Cómo se sembró

Vía el navegador (mismo flujo que un jugador real, sin tocar la BD a mano):
1. `/signup` con las credenciales de arriba.
2. `/game` → "Comenzar carrera" (Dev FC / Madrid).
3. Avanzadas ~7 semanas (3 jornadas jugadas) para poblar mensajes del staff,
   crónica de prensa y una decisión de patrocinio pendiente.

## Re-sembrar

- Si la carrera se borra o quieres una limpia: entra con las credenciales y crea
  otra carrera en `/game` (la lógica real construye toda la pirámide).
- Reset total de la BD: `pnpm --filter @smt/db exec tsx src/reset.ts` (¡borra todo!)
  y vuelve a sembrar.

## Verificación visual pendiente (Pablo)

Con esta cuenta logueada, revisar:
- **Dashboard** — mensajes del staff como cara (Avatar SVG) + icono de rol +
  nombre + burbuja; malas noticias en rojo+negrita; cabecera fina; columna a todo
  el ancho.
- **Empleados del club** (`/staff`) — mismas caras que el dashboard; mujeres con
  pelo largo (p.ej. Marta Aguilar).
- **Bandeja** (`/inbox`) — cuadro "Eventos actuales", menos ruido ambiental,
  pestaña "Rumores" (aparece cuando hay rumores).
