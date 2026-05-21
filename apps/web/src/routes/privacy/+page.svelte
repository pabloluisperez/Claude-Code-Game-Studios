<!--
  Política de Privacidad — Cascada FC / Total Soccer Manager.

  Story: 14-2 (Sprint 14 Release prep).
  Accesible sin autenticación. Cumple los mínimos de transparencia GDPR/LOPD
  para un MVP sin tracking externo ni monetización de datos.
-->
<svelte:head>
  <title>Política de Privacidad · Total Soccer Manager</title>
  <meta
    name="description"
    content="Política de Privacidad de Total Soccer Manager. Qué datos almacenamos y por qué."
  />
</svelte:head>

<article class="prose max-w-3xl mx-auto py-6">
  <h1>Política de Privacidad</h1>

  <p class="opacity-70 text-sm">Última actualización: 2026-11-04 (Sprint 14, MVP v1.0)</p>

  <h2>1. Resumen rápido</h2>
  <ul>
    <li>Solo almacenamos lo imprescindible para que puedas jugar.</li>
    <li>No vendemos ni cedemos tus datos a terceros.</li>
    <li>No usamos píxeles de rastreo publicitario ni redes sociales.</li>
    <li>No usamos cookies de terceros.</li>
  </ul>

  <h2>2. Qué datos almacenamos</h2>
  <p>Para que puedas crear cuenta y jugar, guardamos:</p>
  <ul>
    <li>
      <strong>Email</strong>: usado como identificador único y para
      comunicaciones esenciales (recuperación de cuenta).
    </li>
    <li>
      <strong>Nombre de usuario</strong>: visible en tu perfil del juego.
    </li>
    <li>
      <strong>Contraseña</strong>: cifrada con argon2 (jamás en texto plano,
      jamás recuperable, solo verificable contra el hash almacenado).
    </li>
    <li>
      <strong>Estado del juego</strong> (playthrough): club, plantilla, finanzas,
      decisiones, historial de partidos. Necesario para que tu carrera persista.
    </li>
    <li>
      <strong>Cookie de sesión</strong>: cookie HTTP-only firmada que identifica
      tu navegador durante 30 días. No contiene información personal en texto plano.
    </li>
  </ul>

  <h2>3. Qué NO almacenamos</h2>
  <ul>
    <li>Tu dirección IP no se persiste más allá del log de operación inmediata.</li>
    <li>No usamos cookies de seguimiento publicitario.</li>
    <li>No integramos Google Analytics, Meta Pixel ni servicios similares en MVP.</li>
    <li>No almacenamos historial de navegación fuera del Servicio.</li>
    <li>No recopilamos información sobre tu dispositivo más allá del User-Agent
      necesario para servir la versión correcta de la app.</li>
  </ul>

  <h2>4. Errores y observabilidad</h2>
  <p>
    Para corregir errores usamos un sistema de seguimiento de excepciones
    (Sentry). Los errores se envían con metadatos técnicos (versión, ruta) y
    NUNCA con tu contraseña, email o token de sesión. Si en algún momento un
    error técnico captura un email accidentalmente, lo eliminamos al detectarlo.
  </p>

  <h2>5. Base legal</h2>
  <p>
    El tratamiento de tus datos se basa en la <em>ejecución del contrato</em>
    (proporcionarte el Servicio que solicitaste al registrarte) y en el
    <em>interés legítimo</em> (mantener la seguridad y prevenir abusos).
  </p>

  <h2>6. Conservación de datos</h2>
  <p>
    Mantenemos tus datos mientras tu cuenta esté activa. Si eliminas tu cuenta,
    todos los datos asociados (incluyendo playthroughs) se eliminan en un plazo
    máximo de 30 días.
  </p>

  <h2>7. Tus derechos (GDPR / LOPD)</h2>
  <p>Tienes derecho a:</p>
  <ul>
    <li><strong>Acceder</strong> a los datos que tenemos sobre ti.</li>
    <li><strong>Rectificar</strong> datos incorrectos.</li>
    <li><strong>Eliminar</strong> tu cuenta y todos los datos asociados.</li>
    <li><strong>Portabilidad</strong>: exportar tu estado de juego en formato JSON.</li>
    <li><strong>Oposición</strong>: oponerte a tratamientos que no sean
      estrictamente necesarios.</li>
  </ul>
  <p>Para ejercerlos, contacta con el responsable del Servicio.</p>

  <h2>8. Cookies</h2>
  <p>Solo usamos UNA cookie técnica:</p>
  <ul>
    <li>
      <code>session</code> — HTTP-only, SameSite=Lax, Secure en producción.
      Vigencia 30 días. Identifica tu sesión iniciada. Sin esta cookie no
      puedes jugar.
    </li>
  </ul>
  <p>
    No usamos cookies de marketing, publicidad ni analítica externa. Por eso
    no mostramos banner de consentimiento GDPR: no hay nada que aceptar más allá
    de lo estrictamente necesario para el funcionamiento del Servicio.
  </p>

  <h2>9. Menores</h2>
  <p>
    El Servicio está recomendado para mayores de 13 años. No recopilamos
    intencionadamente datos de menores de esa edad. Si tienes constancia de
    que un menor de 13 años ha creado una cuenta, contáctanos para eliminarla.
  </p>

  <h2>10. Cambios en esta Política</h2>
  <p>
    Si cambiamos esta Política, actualizaremos la fecha de "última actualización"
    en lo alto del documento. Cambios significativos (e.g., introducción de
    analítica externa) se anunciarán en el changelog del juego antes de aplicarse.
  </p>

  <hr />
  <p class="text-sm opacity-70">
    Consulta también nuestros <a href="/terms">Términos de Servicio</a>.
  </p>
</article>
