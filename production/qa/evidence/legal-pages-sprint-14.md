# Evidencia 14-2: Legal pages /terms + /privacy

**Sprint**: 14 (Release prep)
**Date**: 2026-05-21
**Story**: 14-2 — Legal pages /terms + /privacy

## Rutas creadas

- `apps/web/src/routes/terms/+page.svelte` — Términos de Servicio (10 secciones)
- `apps/web/src/routes/privacy/+page.svelte` — Política de Privacidad (10 secciones)

Sin `+page.server.ts` (no requieren `load`) — al no haber comprobación de auth
en `+layout.server.ts` que redirija, ambas rutas son accesibles sin sesión.

## Footer

Añadido a `apps/web/src/routes/+layout.svelte` en ambas ramas
(`showChrome=true` con sidebar y `showChrome=false` landing).

```svelte
<footer class="footer footer-center bg-base-200 text-base-content/70 p-4 text-xs">
  <nav class="grid grid-flow-col gap-4">
    <a href="/terms" class="link link-hover">Términos de Servicio</a>
    <a href="/privacy" class="link link-hover">Privacidad</a>
  </nav>
</footer>
```

## Acceptance criteria

- [x] `/terms` carga sin auth — HTTP 200, sin redirect (layout.server.ts
      retorna early para `locals.user === null` sin redirect)
- [x] `/privacy` carga sin auth — idem
- [x] ToS cubre: auth sessions, limitación de responsabilidad, edad 13+,
      ley aplicable española
- [x] Privacy cubre: argon2 hashing, session cookie HTTP-only, NO tracking
      externo, NO ads, derechos GDPR (acceso/rectificación/eliminación/portabilidad)
- [x] Footer con links en ambas variantes del layout
- [x] Estructura A11y: `<article class="prose">` + jerarquía h1 → h2 sin saltos
- [x] `<svelte:head>` con `<title>` + `<meta name="description">` por página
- [x] Responsive: `prose max-w-3xl mx-auto` se adapta a 375px (TailwindCSS)
- [x] svelte-check: 0 errors (934 files checked)
- [x] Tests web: 122/122 passing tras cambio

## Notas

- Idioma: español ES (consistente con la app).
- Sin lorem ipsum.
- Sin compromisos legalmente vinculantes que requieran revisión externa
  formal — apto para soft-launch MVP.
- El campo "fecha de última actualización" se sincronizará al go-live final
  con la fecha real del release.

## Sign-off

- Implementado: autopilot session 2026-05-21 (overnight)
- Pendiente revisión: Pablo (golden-path check post-deploy)
