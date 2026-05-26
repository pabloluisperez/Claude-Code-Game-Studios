<!--
  Deterministic SVG club shield.
  Pablo 2026-05-26: 'genera escudos como las caras de los jugadores'.

  Layout variants picked by hash(name). All variants use the club's
  primary + secondary colors (already user-selectable at game creation).
-->
<script lang="ts">
  interface Props {
    name: string;
    primaryColor: string;
    secondaryColor?: string;
    size?: number;
  }
  let { name, primaryColor, secondaryColor = '#f8fafc', size = 48 }: Props = $props();

  // Simple djb2 hash for deterministic variant selection.
  function hashString(s: string): number {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) & 0xffffffff;
    return Math.abs(h);
  }

  // Pick 1-3 letter initials.
  function initials(n: string): string {
    const words = n
      .replace(/[^a-záéíóúñ\s]/gi, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 0 && !['CF', 'FC', 'AD', 'CD', 'UD', 'SD'].includes(w.toUpperCase()))
      .filter((w) => !/^(real|atlético|deportivo|sporting|racing|club|union)$/i.test(w));
    if (words.length === 0) {
      // Fallback: first 2-3 chars of first non-empty word
      const w = n.replace(/\s+/g, '');
      return w.slice(0, 3).toUpperCase();
    }
    if (words.length === 1) return words[0]!.slice(0, 3).toUpperCase();
    return (words[0]![0]! + words[1]![0]!).toUpperCase();
  }

  const h = $derived(hashString(name));
  const variant = $derived(h % 6); // 0..5
  const ini = $derived(initials(name));
</script>

<svg
  viewBox="0 0 100 120"
  width={size}
  height={(size * 120) / 100}
  xmlns="http://www.w3.org/2000/svg"
  aria-label="Escudo de {name}"
  role="img"
>
  <!-- Shield silhouette path: classic football crest -->
  <defs>
    <clipPath id={`shield-clip-${h}`}>
      <path d="M 50 5 L 95 15 L 95 60 Q 95 100 50 117 Q 5 100 5 60 L 5 15 Z" />
    </clipPath>
  </defs>

  <!-- Outer outline + primary fill -->
  <path
    d="M 50 5 L 95 15 L 95 60 Q 95 100 50 117 Q 5 100 5 60 L 5 15 Z"
    fill={primaryColor}
    stroke="#0f172a"
    stroke-width="2"
  />

  <!-- Variant patterns (all clipped to the shield) -->
  <g clip-path={`url(#shield-clip-${h})`}>
    {#if variant === 0}
      <!-- Diagonal stripe top-left → bottom-right -->
      <polygon points="5,15 95,60 95,80 5,40" fill={secondaryColor} opacity="0.85" />
    {:else if variant === 1}
      <!-- Horizontal bar middle -->
      <rect x="5" y="50" width="90" height="18" fill={secondaryColor} opacity="0.9" />
    {:else if variant === 2}
      <!-- Vertical stripes -->
      <rect x="20" y="5" width="14" height="115" fill={secondaryColor} opacity="0.85" />
      <rect x="66" y="5" width="14" height="115" fill={secondaryColor} opacity="0.85" />
    {:else if variant === 3}
      <!-- Top third secondary -->
      <path d="M 5 15 L 95 15 L 95 50 Q 50 60 5 50 Z" fill={secondaryColor} opacity="0.85" />
    {:else if variant === 4}
      <!-- Cross -->
      <rect x="5" y="50" width="90" height="14" fill={secondaryColor} opacity="0.9" />
      <rect x="43" y="5" width="14" height="115" fill={secondaryColor} opacity="0.9" />
    {:else}
      <!-- Half-half vertical -->
      <rect x="50" y="5" width="50" height="115" fill={secondaryColor} opacity="0.85" />
    {/if}
  </g>

  <!-- Inner outline -->
  <path
    d="M 50 5 L 95 15 L 95 60 Q 95 100 50 117 Q 5 100 5 60 L 5 15 Z"
    fill="none"
    stroke="#0f172a"
    stroke-width="2"
  />

  <!-- Initials -->
  <text
    x="50"
    y={size > 32 ? '70' : '74'}
    text-anchor="middle"
    font-family="ui-sans-serif, system-ui, sans-serif"
    font-weight="900"
    font-size={ini.length === 3 ? '24' : '32'}
    fill={secondaryColor}
    stroke="#0f172a"
    stroke-width="1.5"
    paint-order="stroke"
  >
    {ini}
  </text>
</svg>
